import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { upsertOwner } from "~/lib/owner-auth.server";
import { createOwnerSpace } from "~/lib/owner-spaces.server";
import { moderateSpace, revenueMissingIds, spaceCoverKey } from "~/lib/admin-lists.server";
import { adminTodoCounts } from "~/lib/admin-todo.server";

const NOW = Date.UTC(2026, 9, 10, 12);

async function ssulmoApp(db: D1Database, spaceId: number, token: string, consulting: number | null) {
  const r = await db
    .prepare(
      `INSERT INTO applications (space_id, result_token, business_type, plan_text, est_cost_manwon, contact_name, email, consent_privacy_at, consent_intro_terms_at,
        track, consent_consulting_at, ai_status, created_at) VALUES (?,?,?,?,?,?,?,1,1,'ssulmo',?,'done',1)`,
    )
    .bind(spaceId, token, "카페", "plan", 100, "신청자", "a@x.kr", consulting)
    .run();
  return r.meta.last_row_id;
}

describe("revenueMissingIds", () => {
  it("matches the todo count and drops applications with a row for this KST month", async () => {
    const db = createTestDb();
    await db.prepare("INSERT INTO spaces (name, neighborhood, slug, owner_consent, created_at) VALUES ('s','성동구 성수동','sp-1',1,1)").run();
    const a = await ssulmoApp(db, 1, "t1", 5);
    const b = await ssulmoApp(db, 1, "t2", 5);
    await ssulmoApp(db, 1, "t3", null);
    await db.prepare("INSERT INTO consulting_months (application_id, month, revenue_krw, profit_krw, fee_krw, created_at) VALUES (?, '2026-10', 1, 1, 0, 1)").bind(a).run();
    const ids = await revenueMissingIds(db, NOW);
    expect([...ids]).toEqual([b]);
    expect(ids.size).toBe((await adminTodoCounts(db, NOW)).revenueMissing);
  });
});

describe("spaceCoverKey", () => {
  it("falls back to the first photo and tolerates bad JSON", () => {
    expect(spaceCoverKey({ photo_keys: '["a","b"]', cover_key: "b" })).toBe("b");
    expect(spaceCoverKey({ photo_keys: '["a","b"]', cover_key: "zzz" })).toBe("a");
    expect(spaceCoverKey({ photo_keys: "not json", cover_key: null })).toBeNull();
    expect(spaceCoverKey({ photo_keys: null, cover_key: null })).toBeNull();
  });
});

describe("moderateSpace", () => {
  const fd = (o: Record<string, string>) => new URLSearchParams(o) as unknown as FormData;
  it("approves, rejects and reports errors like the queue always did", async () => {
    const db = createTestDb();
    const owner = await upsertOwner(db, "o@x.kr");
    const id = await createOwnerSpace(db, owner.id, { name: "대기", district: "성동구", neighborhood: "성동구 성수동", locationNotes: null, photoKeys: [] });
    expect(await moderateSpace(db, fd({ intent: "approve", spaceId: "1abc" }))).toEqual({ error: "공실 번호가 올바르지 않아요.", status: 400 });
    expect(await moderateSpace(db, fd({ intent: "nope", spaceId: String(id) }))).toMatchObject({ status: 400 });
    expect(await moderateSpace(db, fd({ intent: "reject", spaceId: String(id), reason: " 흐려요 " }))).toBeNull();
    expect(await moderateSpace(db, fd({ intent: "reject", spaceId: String(id) }))).toMatchObject({ status: 409 });
    expect(await moderateSpace(db, fd({ intent: "approve", spaceId: String(id) }))).toBeNull();
    expect(await moderateSpace(db, fd({ intent: "approve", spaceId: String(id) }))).toMatchObject({ status: 409 });
  });
});
