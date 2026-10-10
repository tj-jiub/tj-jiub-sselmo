import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { upsertOwner } from "~/lib/owner-auth.server";
import { createOwnerSpace } from "~/lib/owner-spaces.server";
import { adminNavCounts, adminTodoCounts, kstMonth, listAdminApplications, listAdminSpaces } from "~/lib/admin-todo.server";

const NOW = Date.UTC(2026, 9, 10, 12); // 2026-10-10 21:00 KST

async function space(db: D1Database, slug: string, o: { name?: string; hood?: string; status?: string; consent?: number; photos?: string[]; ownerId?: number | null } = {}) {
  const r = await db
    .prepare("INSERT INTO spaces (name, neighborhood, slug, owner_consent, status, owner_id, photo_keys, cover_key, created_at) VALUES (?,?,?,?,?,?,?,?,1)")
    .bind(o.name ?? slug, o.hood ?? "성동구 성수동", slug, o.consent ?? 1, o.status ?? "active", o.ownerId ?? null, o.photos ? JSON.stringify(o.photos) : null, o.photos?.[0] ?? null)
    .run();
  return r.meta.last_row_id;
}
let n = 0;
async function app(db: D1Database, spaceId: number, o: { ai?: string; mailed?: number | null; track?: string; consulting?: number | null; score?: number | null; report?: boolean; name?: string } = {}) {
  n++;
  const report = o.report ? JSON.stringify({ verdict: "fit", summary: "s", strengths: [], risks: [], questions: [], breakdown: {} }) : null;
  const r = await db
    .prepare(
      `INSERT INTO applications (space_id, result_token, business_type, plan_text, est_cost_manwon, contact_name, email, consent_privacy_at, consent_intro_terms_at,
        track, consent_consulting_at, ai_status, ai_score, ai_report, result_mailed_at, created_at) VALUES (?,?,?,?,?,?,?,1,1,?,?,?,?,?,?,1)`,
    )
    .bind(spaceId, `tok${n}`, "카페", "plan", 100, o.name ?? "신청자", "a@x.kr", o.track ?? "general", o.consulting ?? null, o.ai ?? "done", o.score ?? 70, report, o.mailed ?? null)
    .run();
  return r.meta.last_row_id;
}

describe("kstMonth", () => {
  it("uses Korean time", () => {
    expect(kstMonth(Date.UTC(2026, 8, 30, 16))).toBe("2026-10");
    expect(kstMonth(Date.UTC(2026, 8, 30, 14))).toBe("2026-09");
  });
});

describe("adminTodoCounts / adminNavCounts", () => {
  it("counts each kind of work", async () => {
    const db = createTestDb();
    const s1 = await space(db, "a-one");
    await space(db, "p-one", { status: "pending", ownerId: null });
    await space(db, "p-two", { status: "pending" });
    await app(db, s1, { ai: "done", mailed: null });
    await app(db, s1, { ai: "done", mailed: 5 });
    await app(db, s1, { ai: "failed" });
    await app(db, s1, { ai: "pending" });
    const ss = await app(db, s1, { ai: "done", mailed: 5, track: "ssulmo", consulting: 2 });
    const ss2 = await app(db, s1, { ai: "done", mailed: 5, track: "ssulmo", consulting: 2 });
    await app(db, s1, { ai: "done", mailed: 5, track: "ssulmo", consulting: null });
    await db.prepare("INSERT INTO consulting_months (application_id, month, revenue_krw, profit_krw, fee_krw, created_at) VALUES (?, '2026-10', 1, 1, 0, 1)").bind(ss).run();
    await db.prepare("INSERT INTO consulting_months (application_id, month, revenue_krw, profit_krw, fee_krw, created_at) VALUES (?, '2026-09', 1, 1, 0, 1)").bind(ss2).run();
    expect(await adminTodoCounts(db, NOW)).toEqual({ pendingSpaces: 2, unmailed: 1, aiFailed: 1, revenueMissing: 1, total: 5 });
    await upsertOwner(db, "o@x.kr");
    expect(await adminNavCounts(db, NOW)).toEqual({ todo: 5, spaces: 3, applications: 7, owners: 1 });
  });
  it("is all zero on an empty database", async () => {
    expect(await adminTodoCounts(createTestDb(), NOW)).toEqual({ pendingSpaces: 0, unmailed: 0, aiFailed: 0, revenueMissing: 0, total: 0 });
  });
});

describe("listAdminSpaces", () => {
  async function setup() {
    const db = createTestDb();
    const owner = await upsertOwner(db, "o@x.kr");
    await db.prepare("UPDATE owners SET name = ? WHERE id = ?").bind("김건물", owner.id).run();
    const pend = await createOwnerSpace(db, owner.id, { name: "대기 공간", district: "성동구", neighborhood: "성동구 성수동", locationNotes: null, photoKeys: ["owner-photos/a.png"] });
    const coll = await space(db, "collecting", { name: "모으는 곳", hood: "마포구 망원동" });
    const ready = await space(db, "ready", { name: "준비된 곳", hood: "마포구 합정동", photos: ["p/1.png", "p/2.png"] });
    await space(db, "priv", { name: "비공개 곳", consent: 0 });
    await space(db, "rej", { name: "반려 곳", status: "rejected" });
    await db.prepare("INSERT INTO survey_responses (space_id, answers, device_hash, created_at) VALUES (?, '{}', 'h', 1)").bind(coll).run();
    await app(db, ready, { report: true, score: 80 });
    await app(db, pend, { report: true }); // pending space: never counts candidates
    return { db, pend, ready };
  }
  it("lists all with stage, owner name, cover and candidates (public only)", async () => {
    const { db, pend, ready } = await setup();
    const rows = await listAdminSpaces(db, {});
    expect(rows).toHaveLength(5);
    const by = (name: string) => rows.find((r) => r.name === name)!;
    expect(by("대기 공간")).toMatchObject({ id: pend, stage: { key: "pending" }, owner_name: "김건물", cover_key: "owner-photos/a.png", candidate_count: 0, response_count: 0 });
    expect(by("모으는 곳")).toMatchObject({ stage: { key: "collecting" }, response_count: 1, owner_name: null, cover_key: null });
    expect(by("준비된 곳")).toMatchObject({ id: ready, stage: { key: "ready", detail: "후보 1명" }, candidate_count: 1, cover_key: "p/1.png" });
    expect(by("비공개 곳").stage.key).toBe("private");
    expect(by("반려 곳").stage.key).toBe("rejected");
  });
  it("filters by stage key and by q (name or neighborhood, case-insensitive)", async () => {
    const { db } = await setup();
    expect((await listAdminSpaces(db, { status: "pending" })).map((r) => r.name)).toEqual(["대기 공간"]);
    expect((await listAdminSpaces(db, { status: "ready" })).map((r) => r.name)).toEqual(["준비된 곳"]);
    expect((await listAdminSpaces(db, { q: "망원" })).map((r) => r.name)).toEqual(["모으는 곳"]);
    expect((await listAdminSpaces(db, { q: "준비" })).map((r) => r.name)).toEqual(["준비된 곳"]);
    expect(await listAdminSpaces(db, { status: "pending", q: "망원" })).toEqual([]);
    expect(await listAdminSpaces(db, { status: "bogus" })).toHaveLength(5);
  });
  it("matches Latin names case-insensitively and treats LIKE wildcards literally", async () => {
    const db = createTestDb();
    await space(db, "latin", { name: "Cafe Alpha" });
    expect(await listAdminSpaces(db, { q: "cafe" })).toHaveLength(1);
    expect(await listAdminSpaces(db, { q: "%" })).toHaveLength(0);
  });
});

describe("listAdminApplications", () => {
  async function setup() {
    const db = createTestDb();
    const s = await space(db, "s1", { name: "공간1", photos: ["p/1.png"] });
    const a = {
      evaluating: await app(db, s, { ai: "pending" }),
      failed: await app(db, s, { ai: "failed" }),
      mail: await app(db, s, { ai: "done" }),
      review: await app(db, s, { ai: "done", mailed: 3 }),
    };
    return { db, a };
  }
  it("returns space info and stage for each row", async () => {
    const { db, a } = await setup();
    const rows = await listAdminApplications(db, {});
    expect(rows).toHaveLength(4);
    const r = rows.find((x) => x.id === a.mail)!;
    expect(r).toMatchObject({ space_name: "공간1", neighborhood: "성동구 성수동", cover_key: "p/1.png", stage: { key: "mail" }, track: "general", contact_name: "신청자" });
  });
  it("filters by stage key", async () => {
    const { db, a } = await setup();
    expect((await listAdminApplications(db, { status: "evaluating" })).map((r) => r.id)).toEqual([a.evaluating]);
    expect((await listAdminApplications(db, { status: "failed" })).map((r) => r.id)).toEqual([a.failed]);
    expect((await listAdminApplications(db, { status: "mail" })).map((r) => r.id)).toEqual([a.mail]);
    expect((await listAdminApplications(db, { status: "owner-review" })).map((r) => r.id)).toEqual([a.review]);
    expect(await listAdminApplications(db, { status: "bogus" })).toHaveLength(4);
  });
});
