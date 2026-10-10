import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { hashPassword, login } from "~/lib/auth.server";
import { upsertOwner } from "~/lib/owner-auth.server";
import { createOwnerSpace } from "~/lib/owner-spaces.server";
import { spaceStatusLabel } from "~/lib/space-status";
import { action as indexAction } from "~/routes/admin-index";
import { action as loginAction } from "~/routes/admin-login";

let hash: string;
beforeAll(async () => {
  hash = await hashPassword("pw-test");
});

const envFor = (db: D1Database) => ({ DB: db, ADMIN_EMAIL: "a@x.kr", ADMIN_PASSWORD_HASH: hash, SESSION_SECRET: "s".repeat(32) });
const post = (url: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
  new Request(`http://t${url}`, { method: "POST", body: new URLSearchParams(body), headers });
// The route actions only read request + context.cloudflare.env.
const run = (fn: unknown, request: Request, env: unknown) =>
  (fn as (a: unknown) => Promise<unknown>)({ request, params: {}, context: { cloudflare: { env, ctx: {} } } });

async function adminCookie(env: ReturnType<typeof envFor>) {
  const res = (await login(new Request("http://t/admin/login"), env, "a@x.kr", "pw-test"))!;
  return res.headers.get("Set-Cookie")!.split(";")[0];
}

describe("spaceStatusLabel", () => {
  it("maps status + consent to the operator label", () => {
    expect(spaceStatusLabel({ status: "active", owner_consent: 1 })).toBe("공개");
    expect(spaceStatusLabel({ status: "active", owner_consent: 0 })).toBe("비공개");
    expect(spaceStatusLabel({ status: "pending", owner_consent: 1 })).toBe("확인 대기");
    expect(spaceStatusLabel({ status: "rejected", owner_consent: 1 })).toBe("반려");
  });
});

describe("admin-index action (approval queue)", () => {
  async function setup() {
    const db = createTestDb();
    const owner = await upsertOwner(db, "o@x.kr");
    const id = await createOwnerSpace(db, owner.id, { name: "대기", district: "성동구", neighborhood: "성동구 성수동", locationNotes: null, photoKeys: [] });
    const env = envFor(db);
    return { db, id, env, cookie: await adminCookie(env) };
  }
  const status = async (db: D1Database, id: number) =>
    db.prepare("SELECT status, reject_reason FROM spaces WHERE id = ?").bind(id).first<{ status: string; reject_reason: string | null }>();

  it("requires an admin session", async () => {
    const { db, id, env } = await setup();
    await expect(run(indexAction, post("/admin", { intent: "approve", spaceId: String(id) }), env)).rejects.toBeInstanceOf(Response);
    expect((await status(db, id))?.status).toBe("pending");
  });

  it("approves and rejects (with reason) pending spaces", async () => {
    const { db, id, env, cookie } = await setup();
    await run(indexAction, post("/admin", { intent: "reject", spaceId: String(id), reason: " 사진이 흐려요 " }, { Cookie: cookie }), env);
    expect(await status(db, id)).toEqual({ status: "rejected", reject_reason: "사진이 흐려요" });
    await run(indexAction, post("/admin", { intent: "approve", spaceId: String(id) }, { Cookie: cookie }), env);
    expect(await status(db, id)).toEqual({ status: "active", reject_reason: null });
  });

  it("rejects malformed ids and unknown intents", async () => {
    const { db, id, env, cookie } = await setup();
    for (const spaceId of ["1abc", "-1", "1.5", "", " 1", "99999999999999999999"]) {
      const res = (await run(indexAction, post("/admin", { intent: "approve", spaceId }, { Cookie: cookie }), env)) as { init?: { status?: number } };
      expect(res.init?.status, spaceId).toBe(400);
    }
    const unknown = (await run(indexAction, post("/admin", { intent: "nope", spaceId: String(id) }, { Cookie: cookie }), env)) as { init?: { status?: number } };
    expect(unknown.init?.status).toBe(400);
    expect((await status(db, id))?.status).toBe("pending");
  });
});

describe("admin-login action lock", () => {
  it("answers 429 from the sixth attempt, even with the right password", async () => {
    const env = envFor(createTestDb());
    const attempt = (password: string) =>
      run(loginAction, post("/admin/login", { email: "a@x.kr", password }, { "CF-Connecting-IP": "1.2.3.4" }), env) as Promise<Response | { init?: { status?: number } }>;
    for (let i = 0; i < 5; i++) expect(((await attempt("wrong")) as { init?: { status?: number } }).init?.status).toBe(401);
    expect(((await attempt("pw-test")) as { init?: { status?: number } }).init?.status).toBe(429);
  });
});
