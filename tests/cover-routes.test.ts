import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { startOwnerSession, upsertOwner } from "~/lib/owner-auth.server";
import { createOwnerSpace } from "~/lib/owner-spaces.server";
import { loader as publicCover } from "~/routes/space-cover";
import { loader as ownerCover } from "~/routes/owner-space-cover";
import { loader as photosLoader } from "~/routes/owner-space-photos";

const objects: Record<string, string> = { "owner-photos/a.png": "image/png" };
const uploads = { get: async (k: string) => (k in objects ? { body: new Blob(["i"]).stream(), httpMetadata: { contentType: objects[k] } } : null) } as unknown as R2Bucket;
const call = (fn: unknown, request: Request, params: Record<string, string>, env: unknown) =>
  (fn as (a: unknown) => Promise<unknown>)({ request, params, context: { cloudflare: { env, ctx: {} } } });

describe("space-cover route loader", () => {
  it("404s for pending then serves after approval", async () => {
    const db = createTestDb();
    const owner = await upsertOwner(db, "o@x.kr");
    const id = await createOwnerSpace(db, owner.id, { name: "n", district: "성동구", neighborhood: "성동구 성수동", locationNotes: null, photoKeys: ["owner-photos/a.png"] });
    const { slug } = (await db.prepare("SELECT slug FROM spaces WHERE id = ?").bind(id).first<{ slug: string }>())!;
    const env = { DB: db, UPLOADS: uploads };
    const req = new Request(`http://t/media/space/${slug}/cover`);
    expect(((await call(publicCover, req, { slug }, env)) as Response).status).toBe(404);
    await db.prepare("UPDATE spaces SET status = 'active' WHERE id = ?").bind(id).run();
    const ok = (await call(publicCover, req, { slug }, env)) as Response;
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });
});

describe("owner routes require an owner session", () => {
  it("redirects anonymous visitors", async () => {
    const db = createTestDb();
    const env = { DB: db, UPLOADS: uploads, SESSION_SECRET: "s".repeat(32) };
    for (const fn of [ownerCover, photosLoader]) {
      await expect(call(fn, new Request("http://t/owner/spaces/1/cover"), { id: "1" }, env)).rejects.toBeInstanceOf(Response);
    }
  });

  it("serves the owner's cover with a session and 404s for another owner's id", async () => {
    const db = createTestDb();
    const env = { DB: db, UPLOADS: uploads, SESSION_SECRET: "s".repeat(32) };
    const a = await upsertOwner(db, "a@x.kr");
    const b = await upsertOwner(db, "b@x.kr");
    const id = await createOwnerSpace(db, a.id, { name: "n", district: "성동구", neighborhood: "성동구 성수동", locationNotes: null, photoKeys: ["owner-photos/a.png"] });
    const cookieFor = async (ownerId: number) =>
      (await startOwnerSession(new Request("http://t/"), env, ownerId, "/owner/spaces")).headers.get("Set-Cookie")!.split(";")[0];
    const reqFor = async (ownerId: number, qs = "") => new Request(`http://t/owner/spaces/${id}/cover${qs}`, { headers: { Cookie: await cookieFor(ownerId) } });
    const mine = (await call(ownerCover, await reqFor(a.id), { id: String(id) }, env)) as Response;
    expect(mine.status).toBe(200);
    expect(mine.headers.get("Cache-Control")).toBe("private, no-store");
    expect(((await call(ownerCover, await reqFor(a.id, "?i=0"), { id: String(id) }, env)) as Response).status).toBe(200);
    expect(((await call(ownerCover, await reqFor(a.id, "?i=abc"), { id: String(id) }, env)) as Response).status).toBe(404);
    expect(((await call(ownerCover, await reqFor(b.id), { id: String(id) }, env)) as Response).status).toBe(404);
    await expect(call(photosLoader, await reqFor(b.id), { id: String(id) }, env)).rejects.toMatchObject({ status: 404 });
    const data = (await call(photosLoader, await reqFor(a.id), { id: String(id) }, env)) as { photos: unknown[]; room: number };
    expect(data.photos).toHaveLength(1);
    expect(data.room).toBe(4);
  });
});
