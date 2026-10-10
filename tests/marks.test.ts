import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { upsertOwner } from "~/lib/owner-auth.server";
import { approveSpace, createOwnerSpace } from "~/lib/owner-spaces.server";
import { getMarkForApplication, listMarksForSpace, listOwnerCandidates, parseMarkForm, saveMark } from "~/lib/marks.server";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

async function world() {
  const db = createTestDb();
  const a = await upsertOwner(db, "a@x.kr", 1);
  const b = await upsertOwner(db, "b@x.kr", 1);
  const mk = async (o: number, name: string) => {
    const id = await createOwnerSpace(db, o, { name, district: "성동구", neighborhood: "성동구 성수동", locationNotes: null, photoKeys: [] }, 5);
    await approveSpace(db, id);
    return id;
  };
  const spaceA = await mk(a.id, "A 공실");
  const spaceB = await mk(b.id, "B 공실");
  let n = 0;
  const add = async (space: number, score: number | null, status = "done") => {
    n++;
    const report = score === null ? null : JSON.stringify({ score, verdict: "fit", summary: `요약${n}`, strengths: ["강점"], risks: ["위험"], sections: {} });
    const r = await db.prepare(
      `INSERT INTO applications (space_id, result_token, business_type, plan_text, plan_file_key, est_cost_manwon, contact_name, email, consent_privacy_at, consent_intro_terms_at,
        ai_status, ai_score, ai_report, created_at) VALUES (?, ?, ?, '비밀계획원문', 'plans/비밀파일.pdf', 3000, '김비밀${n}', 'secret${n}@example.com', 1, 1, ?, ?, ?, ?)`,
    ).bind(space, `tok${n}`, `업종${n}`, status, score, report, 10 + n).run();
    return r.meta.last_row_id;
  };
  return { db, a, b, spaceA, spaceB, add };
}

describe("parseMarkForm", () => {
  it("accepts starred and/or memo, trims, and caps the memo", () => {
    expect(parseMarkForm(fd({ starred: "1" }))).toEqual({ ok: true, value: { starred: true, memo: undefined } });
    expect(parseMarkForm(fd({ starred: "0", memo: " 메모 " }))).toEqual({ ok: true, value: { starred: false, memo: "메모" } });
    expect(parseMarkForm(fd({ memo: "" }))).toEqual({ ok: true, value: { starred: undefined, memo: "" } });
    expect(parseMarkForm(fd({ memo: "가".repeat(1001) })).ok).toBe(false);
    expect(parseMarkForm(fd({ starred: "yes" })).ok).toBe(false);
    expect(parseMarkForm(fd({})).ok).toBe(false);
  });
});

describe("listOwnerCandidates", () => {
  it("returns the shortlist with star + memo, and exactly the whitelisted keys (no PII, even in the loader data)", async () => {
    const { db, a, spaceA, add } = await world();
    const id1 = await add(spaceA, 90);
    await add(spaceA, 70);
    await saveMark(db, a.id, id1, { starred: true, memo: "다음 주 미팅" }, 100);
    const list = (await listOwnerCandidates(db, a.id, spaceA))!;
    expect(list.map((c) => c.score)).toEqual([90, 70]);
    expect(list[0]).toMatchObject({ id: id1, starred: true, memo: "다음 주 미팅", rank: 1 });
    expect(list[1]).toMatchObject({ starred: false, memo: "" });
    expect(Object.keys(list[0]).sort()).toEqual(
      ["businessType", "estCostManwon", "id", "memo", "rank", "risks", "score", "starred", "strengths", "summary", "track"],
    );
    const json = JSON.stringify(list);
    for (const secret of ["김비밀", "secret", "example.com", "비밀계획원문", "비밀파일", "tok", "plans/"]) expect(json).not.toContain(secret);
  });
  it("is null for a space the owner does not own", async () => {
    const { db, a, spaceB } = await world();
    expect(await listOwnerCandidates(db, a.id, spaceB)).toBeNull();
  });
  it("is empty while the space is not public (pending or consent withdrawn)", async () => {
    const { db, a, spaceA, add } = await world();
    await add(spaceA, 90);
    await db.prepare("UPDATE spaces SET owner_consent = 0 WHERE id = ?").bind(spaceA).run();
    expect(await listOwnerCandidates(db, a.id, spaceA)).toEqual([]);
  });
});

describe("saveMark", () => {
  it("upserts and merges: starring keeps the memo, writing a memo keeps the star", async () => {
    const { db, a, spaceA, add } = await world();
    const id = await add(spaceA, 90);
    expect(await saveMark(db, a.id, id, { memo: "첫 메모" }, 10)).toBe(true);
    expect(await saveMark(db, a.id, id, { starred: true }, 20)).toBe(true);
    expect(await saveMark(db, a.id, id, { memo: "수정" }, 30)).toBe(true);
    expect(await getMarkForApplication(db, id)).toMatchObject({ starred: true, memo: "수정" });
    expect(await saveMark(db, a.id, id, { starred: false }, 40)).toBe(true);
    expect(await getMarkForApplication(db, id)).toMatchObject({ starred: false, memo: "수정" });
    const count = await db.prepare("SELECT COUNT(*) AS n FROM candidate_marks").first<{ n: number }>();
    expect(count!.n).toBe(1);
  });
  it("refuses another owner's application, a non-shortlisted one, and unknown ids", async () => {
    const { db, a, b, spaceA, spaceB, add } = await world();
    const mine = await add(spaceA, 90);
    const low = await add(spaceA, 40);
    const pending = await add(spaceA, null, "pending");
    const theirs = await add(spaceB, 90);
    expect(await saveMark(db, a.id, theirs, { starred: true })).toBe(false);
    expect(await saveMark(db, b.id, mine, { memo: "x" })).toBe(false);
    expect(await saveMark(db, a.id, low, { starred: true })).toBe(false);
    expect(await saveMark(db, a.id, pending, { starred: true })).toBe(false);
    expect(await saveMark(db, a.id, 9999, { starred: true })).toBe(false);
    const count = await db.prepare("SELECT COUNT(*) AS n FROM candidate_marks").first<{ n: number }>();
    expect(count!.n).toBe(0);
  });
  it("owners never see each other's marks", async () => {
    const { db, a, spaceA, add } = await world();
    const id = await add(spaceA, 90);
    await saveMark(db, a.id, id, { starred: true, memo: "내 메모" });
    const b = await upsertOwner(db, "c@x.kr", 1);
    expect(await listOwnerCandidates(db, b.id, spaceA)).toBeNull();
  });
});

describe("admin visibility", () => {
  it("lists the owner's marks per application for a space, and for one application", async () => {
    const { db, a, spaceA, add } = await world();
    const id = await add(spaceA, 90);
    const other = await add(spaceA, 80);
    await saveMark(db, a.id, id, { starred: true, memo: "공유되는 메모" }, 5);
    const marks = await listMarksForSpace(db, spaceA);
    expect(marks.get(id)).toEqual({ starred: true, memo: "공유되는 메모", ownerName: null, updatedAt: 5 });
    expect(marks.has(other)).toBe(false);
    expect(await getMarkForApplication(db, other)).toBeNull();
  });
  it("ignores marks left by a previous owner of the space", async () => {
    const { db, a, spaceA, add } = await world();
    const id = await add(spaceA, 90);
    await saveMark(db, a.id, id, { starred: true, memo: "옛 주인" });
    const b = await upsertOwner(db, "new@x.kr", 1);
    await db.prepare("UPDATE spaces SET owner_id = ? WHERE id = ?").bind(b.id, spaceA).run();
    expect(await getMarkForApplication(db, id)).toBeNull();
  });
});
