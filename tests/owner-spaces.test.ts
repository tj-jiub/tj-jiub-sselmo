import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { upsertOwner } from "~/lib/owner-auth.server";
import { createSpace, getPublicSpace, listPublicSpaces } from "~/lib/spaces.server";
import { loadPublicTallies } from "~/lib/matching.server";
import {
  approveSpace, createOwnerSpace, getOwnedSpace, getSpaceOwner, listOwnerSpaces, listPendingSpaces, parseOwnerSpaceForm,
  rejectSpace, updatePendingSpace,
} from "~/lib/owner-spaces.server";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const good = { name: "금호동 역세권 1층", district: "성동구", dong: "금호동", locationNotes: "역 2번 출구 앞", ownerConfirm: "on" };

async function answers(db: D1Database, spaceId: number, n: number) {
  const a = { businessTypes: ["카페"], businessTypeOther: null, visitFrequency: "weekly1", spendRange: "5to10k", visitTime: "lunch", respondentType: "resident" };
  for (let i = 0; i < n; i++) {
    await db.prepare("INSERT INTO survey_responses (space_id, answers, device_hash, created_at) VALUES (?, ?, ?, 1)").bind(spaceId, JSON.stringify(a), `d${spaceId}-${i}`).run();
  }
}

describe("parseOwnerSpaceForm", () => {
  it("builds the neighbourhood from district + dong and requires the ownership check", () => {
    expect(parseOwnerSpaceForm(fd(good))).toEqual({
      ok: true, value: { name: "금호동 역세권 1층", district: "성동구", neighborhood: "성동구 금호동", locationNotes: "역 2번 출구 앞" },
    });
    expect(parseOwnerSpaceForm(fd({ ...good, locationNotes: "" }))).toMatchObject({ ok: true, value: { locationNotes: null } });
  });
  it.each([
    ["name", ""], ["name", "가".repeat(61)], ["district", "성동"], ["dong", ""], ["dong", "가".repeat(41)],
    ["locationNotes", "가".repeat(501)], ["ownerConfirm", ""],
  ])("rejects bad %s", (k, v) => {
    expect(parseOwnerSpaceForm(fd({ ...good, [k]: v })).ok).toBe(false);
  });
  it("has no rent or deposit fields", () => {
    const parsed = parseOwnerSpaceForm(fd({ ...good, rent: "100", deposit: "1000" }));
    expect(JSON.stringify(parsed)).not.toMatch(/rent|deposit|100/);
  });
});

describe("owner-registered spaces", () => {
  it("start pending with consent, a generated valid slug, and are invisible to every public gate", async () => {
    const db = createTestDb();
    const o = await upsertOwner(db, "o@x.kr", 1);
    const id = await createOwnerSpace(db, o.id, { name: "A", district: "성동구", neighborhood: "성동구 금호동", locationNotes: null, photoKeys: [] }, 5);
    const row = (await getOwnedSpace(db, o.id, id))!;
    expect(row).toMatchObject({ status: "pending", owner_consent: 1, owner_id: o.id });
    expect(row.slug).toMatch(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/);
    await answers(db, id, 60);
    expect(await getPublicSpace(db, row.slug)).toBeNull();
    expect((await listPublicSpaces(db)).map((s) => s.id)).not.toContain(id);
    expect((await loadPublicTallies(db)).map((t) => t.slug)).not.toContain(row.slug);
  });
  it("become public only after approval, and stay hidden if consent is withdrawn", async () => {
    const db = createTestDb();
    const o = await upsertOwner(db, "o@x.kr", 1);
    const id = await createOwnerSpace(db, o.id, { name: "A", district: "성동구", neighborhood: "성동구 금호동", locationNotes: null, photoKeys: ["owner-photos/a.jpg"] }, 5);
    const slug = (await getOwnedSpace(db, o.id, id))!.slug;
    expect(await approveSpace(db, id)).toBe(true);
    expect(await getPublicSpace(db, slug)).not.toBeNull();
    expect((await loadPublicTallies(db)).map((t) => t.slug)).toContain(slug);
    await db.prepare("UPDATE spaces SET owner_consent = 0 WHERE id = ?").bind(id).run();
    expect(await getPublicSpace(db, slug)).toBeNull();
    expect((await listPublicSpaces(db)).map((s) => s.id)).not.toContain(id);
    expect((await loadPublicTallies(db)).map((t) => t.slug)).not.toContain(slug);
  });
  it("rejection keeps it hidden and stores the reason; re-approval clears it", async () => {
    const db = createTestDb();
    const o = await upsertOwner(db, "o@x.kr", 1);
    const id = await createOwnerSpace(db, o.id, { name: "A", district: "성동구", neighborhood: "성동구 금호동", locationNotes: null, photoKeys: [] }, 5);
    expect(await rejectSpace(db, id, "  주소를 확인할 수 없어요  ")).toBe(true);
    expect(await getOwnedSpace(db, o.id, id)).toMatchObject({ status: "rejected", reject_reason: "주소를 확인할 수 없어요" });
    expect(await getPublicSpace(db, (await getOwnedSpace(db, o.id, id))!.slug)).toBeNull();
    expect(await approveSpace(db, id)).toBe(true);
    expect(await getOwnedSpace(db, o.id, id)).toMatchObject({ status: "active", reject_reason: null });
  });
  it("approve/reject only touch non-active owner spaces", async () => {
    const db = createTestDb();
    const admin = await createSpace(db, { name: "관리자 공실", district: "마포구", neighborhood: "마포구 망원동", slug: "admin-one", ownerConsent: true, consentFileKey: null });
    expect(await rejectSpace(db, admin, "x")).toBe(false);
    expect(await approveSpace(db, admin)).toBe(false);
    expect(await getPublicSpace(db, "admin-one")).not.toBeNull();
  });
});

describe("ownership guard", () => {
  it("getOwnedSpace is null for someone else's space and for admin-created spaces", async () => {
    const db = createTestDb();
    const a = await upsertOwner(db, "a@x.kr", 1);
    const b = await upsertOwner(db, "b@x.kr", 1);
    const id = await createOwnerSpace(db, a.id, { name: "A", district: "성동구", neighborhood: "성동구 금호동", locationNotes: null, photoKeys: [] }, 5);
    const admin = await createSpace(db, { name: "관리자 공실", district: "마포구", neighborhood: "n", slug: "admin-one", ownerConsent: true, consentFileKey: null });
    expect(await getOwnedSpace(db, a.id, id)).not.toBeNull();
    expect(await getOwnedSpace(db, b.id, id)).toBeNull();
    expect(await getOwnedSpace(db, a.id, admin)).toBeNull();
    expect(await getOwnedSpace(db, a.id, 9999)).toBeNull();
  });
  it("only a pending space can be edited, and only name + notes change", async () => {
    const db = createTestDb();
    const a = await upsertOwner(db, "a@x.kr", 1);
    const b = await upsertOwner(db, "b@x.kr", 1);
    const id = await createOwnerSpace(db, a.id, { name: "A", district: "성동구", neighborhood: "성동구 금호동", locationNotes: null, photoKeys: [] }, 5);
    expect(await updatePendingSpace(db, b.id, id, { name: "해킹", locationNotes: "x" })).toBe(false);
    expect(await updatePendingSpace(db, a.id, id, { name: "새 이름", locationNotes: "새 메모" })).toBe(true);
    expect(await getOwnedSpace(db, a.id, id)).toMatchObject({ name: "새 이름", location_notes: "새 메모", neighborhood: "성동구 금호동" });
    await approveSpace(db, id);
    expect(await updatePendingSpace(db, a.id, id, { name: "승인 후 수정", locationNotes: null })).toBe(false);
    expect((await getOwnedSpace(db, a.id, id))!.name).toBe("새 이름");
  });
});

describe("listOwnerSpaces stages", () => {
  it("shows one stage per space with the owner's own response count, even below 50", async () => {
    const db = createTestDb();
    const a = await upsertOwner(db, "a@x.kr", 1);
    const other = await upsertOwner(db, "b@x.kr", 1);
    const mk = (o: number, name: string) => createOwnerSpace(db, o, { name, district: "성동구", neighborhood: "성동구 금호동", locationNotes: null, photoKeys: [] }, 5);
    const pending = await mk(a.id, "대기");
    const collecting = await mk(a.id, "수집");
    const rejected = await mk(a.id, "반려");
    const theirs = await mk(other.id, "남의 것");
    await approveSpace(db, collecting);
    await rejectSpace(db, rejected, "사유");
    await answers(db, collecting, 32);
    await answers(db, theirs, 5);
    const cards = await listOwnerSpaces(db, a.id);
    const by = Object.fromEntries(cards.map((c) => [c.name, c]));
    expect(cards).toHaveLength(3);
    expect(by["대기"]).toMatchObject({ id: pending, stage: "pending" });
    expect(by["수집"]).toMatchObject({ stage: "collecting", responseCount: 32, candidateCount: 0 });
    expect(by["반려"]).toMatchObject({ stage: "rejected", rejectReason: "사유" });
    expect(cards.map((c) => c.name)).not.toContain("남의 것");
  });
  it("is 'evaluated' once the shortlist has candidates, and 'paused' if consent is withdrawn", async () => {
    const db = createTestDb();
    const a = await upsertOwner(db, "a@x.kr", 1);
    const id = await createOwnerSpace(db, a.id, { name: "X", district: "성동구", neighborhood: "성동구 금호동", locationNotes: null, photoKeys: [] }, 5);
    await approveSpace(db, id);
    const report = JSON.stringify({ score: 80, verdict: "fit", summary: "s", strengths: [], risks: [], sections: {} });
    await db.prepare(
      `INSERT INTO applications (space_id, result_token, business_type, plan_text, est_cost_manwon, contact_name, email, consent_privacy_at, consent_intro_terms_at, ai_status, ai_score, ai_report, created_at)
       VALUES (?, 't1', '카페', 'p', 1, 'n', 'e@x.kr', 1, 1, 'done', 80, ?, 1)`,
    ).bind(id, report).run();
    expect((await listOwnerSpaces(db, a.id))[0]).toMatchObject({ stage: "evaluated", candidateCount: 1 });
    await db.prepare("UPDATE spaces SET owner_consent = 0 WHERE id = ?").bind(id).run();
    expect((await listOwnerSpaces(db, a.id))[0].stage).toBe("paused");
  });
});

describe("admin helpers", () => {
  it("lists pending spaces with their owner, and returns owner contact for a space", async () => {
    const db = createTestDb();
    const a = await upsertOwner(db, "a@x.kr", 1);
    await db.prepare("UPDATE owners SET name = '이건물', phone = '010-1111-2222' WHERE id = ?").bind(a.id).run();
    const id = await createOwnerSpace(db, a.id, { name: "A", district: "성동구", neighborhood: "성동구 금호동", locationNotes: "n", photoKeys: [] }, 5);
    const admin = await createSpace(db, { name: "관리자 공실", district: "마포구", neighborhood: "n", slug: "admin-one", ownerConsent: true, consentFileKey: null });
    const pending = await listPendingSpaces(db);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ id, ownerName: "이건물", ownerEmail: "a@x.kr", ownerPhone: "010-1111-2222" });
    expect(await getSpaceOwner(db, id)).toEqual({ id: a.id, name: "이건물", email: "a@x.kr", phone: "010-1111-2222" });
    expect(await getSpaceOwner(db, admin)).toBeNull();
  });
});
