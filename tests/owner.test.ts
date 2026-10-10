import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { createSpace, getSpace, parseSpaceSettings, saveSpaceSettings } from "~/lib/spaces.server";
import { getSpaceDemand, listShortlist } from "~/lib/owner.server";
import { upsertOwner } from "~/lib/owner-auth.server";
import { listOwnerCandidates } from "~/lib/marks.server";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe("space settings", () => {
  it("parses notes, margin and scale factor", () => {
    expect(parseSpaceSettings(fd({ locationNotes: " 역 3분 ", marginPct: "18", scaleFactor: "1.5" }))).toEqual({
      ok: true, value: { locationNotes: "역 3분", marginPct: 18, scaleFactor: 1.5 },
    });
    expect(parseSpaceSettings(fd({ locationNotes: "", marginPct: "", scaleFactor: "1" }))).toEqual({
      ok: true, value: { locationNotes: null, marginPct: null, scaleFactor: 1 },
    });
  });
  it.each([["marginPct", "0"], ["marginPct", "91"], ["marginPct", "x"], ["scaleFactor", "0"], ["scaleFactor", "-1"], ["scaleFactor", "abc"], ["scaleFactor", "1001"], ["locationNotes", "가".repeat(501)]])(
    "rejects bad %s=%s",
    (k, v) => {
      expect(parseSpaceSettings(fd({ locationNotes: "", marginPct: "", scaleFactor: "1", [k]: v })).ok).toBe(false);
    },
  );
  it("saves them", async () => {
    const db = createTestDb();
    const id = await createSpace(db, { name: "A", district: "마포구", neighborhood: "n", slug: "a-space", ownerConsent: true, consentFileKey: null });
    await saveSpaceSettings(db, id, { locationNotes: "x", marginPct: 20, scaleFactor: 2 });
    expect(await getSpace(db, id)).toMatchObject({ location_notes: "x", margin_pct: 20, scale_factor: 2 });
  });
});

async function world() {
  const db = createTestDb();
  const owner = await upsertOwner(db, "owner@x.kr", 1);
  const mkSpace = async (name: string, hood: string, slug: string) => {
    const id = await createSpace(db, { name, district: "성동구", neighborhood: hood, slug, ownerConsent: true, consentFileKey: null });
    await db.prepare("UPDATE spaces SET owner_id = ? WHERE id = ?").bind(owner.id, id).run();
    return id;
  };
  const spaceId = await mkSpace("성수 공실", "성동구 성수동", "ss-01");
  const other = await mkSpace("다른 공실", "성동구 금호동", "gh-01");
  for (let i = 0; i < 60; i++) {
    const a = { businessTypes: i < 40 ? ["카페"] : ["베이커리"], businessTypeOther: null, visitFrequency: "weekly1", spendRange: "5to10k", visitTime: "lunch", respondentType: "resident" };
    await db.prepare("INSERT INTO survey_responses (space_id, answers, device_hash, created_at) VALUES (?, ?, ?, 1)").bind(spaceId, JSON.stringify(a), `d${i}`).run();
  }
  let n = 0;
  const add = async (sp: number, score: number | null, status: string, track = "general", at = 10 + n) => {
    n++;
    const report = score === null ? null : JSON.stringify({ score, verdict: "fit", summary: `요약${n}`, strengths: ["강점"], risks: ["위험"], sections: { demand_fit: "a", pricing: "b", hours: "c", cost_risk: "d", suggestions: "e" } });
    await db.prepare(
      `INSERT INTO applications (space_id, result_token, business_type, plan_text, est_cost_manwon, contact_name, email, consent_privacy_at, consent_intro_terms_at,
        track, ai_status, ai_score, ai_report, created_at) VALUES (?, ?, ?, '비밀계획원문', 3000, '김비밀${n}', 'secret${n}@example.com', 1, 1, ?, ?, ?, ?, ?)`,
    ).bind(sp, `tok${n}`, `업종${n}`, track, status, score, report, at).run();
  };
  return { db, owner, spaceId, other, add };
}

// These replace the privacy/limit assertions of the removed /o/:token page: the same rules now hold on the owner candidates page.
describe("owner candidates page data", () => {
  it("goes dark when the building-owner consent is withdrawn", async () => {
    const { db, owner, spaceId, add } = await world();
    await add(spaceId, 90, "done");
    expect(await listOwnerCandidates(db, owner.id, spaceId)).toHaveLength(1);
    await db.prepare("UPDATE spaces SET owner_consent = 0 WHERE id = ?").bind(spaceId).run();
    expect(await listOwnerCandidates(db, owner.id, spaceId)).toEqual([]);
  });

  it("shows at most 5 candidates scoring >= 60, best first, from this space only", async () => {
    const { db, owner, spaceId, other, add } = await world();
    for (const s of [95, 90, 85, 80, 75, 70, 65]) await add(spaceId, s, "done");
    await add(spaceId, 59, "done");
    await add(spaceId, null, "pending");
    await add(spaceId, 99, "failed");
    await add(other, 100, "done");
    const list = (await listOwnerCandidates(db, owner.id, spaceId))!;
    expect(list.map((c) => c.score)).toEqual([95, 90, 85, 80, 75]);
    expect(list[0]).toMatchObject({ rank: 1, strengths: ["강점"], risks: ["위험"], track: "general", estCostManwon: 3000 });
  });

  it("never exposes name, email or plan text", async () => {
    const { db, owner, spaceId, add } = await world();
    await add(spaceId, 90, "done", "ssulmo");
    const json = JSON.stringify(await listOwnerCandidates(db, owner.id, spaceId));
    expect(json).toContain("업종1");
    for (const secret of ["김비밀", "secret", "example.com", "비밀계획원문", "tok1"]) expect(json).not.toContain(secret);
  });

  it("explains the demand with the fixed phrase only after 50 responses", async () => {
    const { db, spaceId, other } = await world();
    const ready = await getSpaceDemand(db, spaceId);
    expect(ready).toMatchObject({ ready: true, total: 60 });
    expect(ready.top[0]).toEqual({ type: "카페", count: 40, phrase: "응답자 60명 중 40명이 이용 의향" });
    expect(await getSpaceDemand(db, other)).toEqual({ ready: false, total: 0, top: [] });
  });

  it("listShortlist is the admin preview (includes the track)", async () => {
    const { db, spaceId, add } = await world();
    await add(spaceId, 88, "done", "ssulmo");
    const list = await listShortlist(db, spaceId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 1, score: 88, track: "ssulmo", businessType: "업종1" });
  });
});
