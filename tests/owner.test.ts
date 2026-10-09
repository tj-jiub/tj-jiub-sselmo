import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { createSpace, getSpace, parseSpaceSettings, saveSpaceSettings } from "~/lib/spaces.server";
import { ensureOwnerToken, getOwnerView, listShortlist, regenerateOwnerToken } from "~/lib/owner.server";

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
  const spaceId = await createSpace(db, { name: "성수 공실", district: "성동구", neighborhood: "성동구 성수동", slug: "ss-01", ownerConsent: true, consentFileKey: null });
  const other = await createSpace(db, { name: "다른 공실", district: "성동구", neighborhood: "성동구 금호동", slug: "gh-01", ownerConsent: true, consentFileKey: null });
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
  return { db, spaceId, other, add };
}

describe("owner token", () => {
  it("is created once, then regenerated; the old link stops working", async () => {
    const { db, spaceId } = await world();
    const t1 = await ensureOwnerToken(db, spaceId);
    expect(t1).toMatch(/^[0-9a-f]{32}$/);
    expect(await ensureOwnerToken(db, spaceId)).toBe(t1);
    expect(await getOwnerView(db, t1)).not.toBeNull();
    const t2 = await regenerateOwnerToken(db, spaceId);
    expect(t2).not.toBe(t1);
    expect(await getOwnerView(db, t1)).toBeNull();
    expect(await getOwnerView(db, t2)).not.toBeNull();
    expect(await getOwnerView(db, "")).toBeNull();
  });
});

describe("owner view", () => {
  it("shows at most 5 candidates scoring >= 60, best first, from this space only", async () => {
    const { db, spaceId, other, add } = await world();
    for (const s of [95, 90, 85, 80, 75, 70, 65]) await add(spaceId, s, "done");
    await add(spaceId, 59, "done");
    await add(spaceId, null, "pending");
    await add(spaceId, 99, "failed");
    await add(other, 100, "done");
    const view = (await getOwnerView(db, await ensureOwnerToken(db, spaceId)))!;
    expect(view.candidates.map((c) => c.score)).toEqual([95, 90, 85, 80, 75]);
    expect(view.candidates[0]).toMatchObject({ rank: 1, strengths: ["강점"], risks: ["위험"], track: "general", estCostManwon: 3000 });
    expect(view.space).toMatchObject({ name: "성수 공실", neighborhood: "성동구 성수동" });
  });

  it("never exposes name, email or plan text", async () => {
    const { db, spaceId, add } = await world();
    await add(spaceId, 90, "done", "ssulmo");
    const view = await getOwnerView(db, await ensureOwnerToken(db, spaceId));
    const json = JSON.stringify(view);
    for (const secret of ["김비밀", "secret", "example.com", "비밀계획원문", "tok1"]) expect(json).not.toContain(secret);
  });

  it("explains the demand with the fixed phrase only after 50 responses", async () => {
    const { db, spaceId, other, add } = await world();
    await add(spaceId, 90, "done");
    const ready = (await getOwnerView(db, await ensureOwnerToken(db, spaceId)))!;
    expect(ready.demand).toMatchObject({ ready: true, total: 60 });
    expect(ready.demand.top[0]).toEqual({ type: "카페", count: 40, phrase: "응답자 60명 중 40명이 이용 의향" });
    const pending = (await getOwnerView(db, await ensureOwnerToken(db, other)))!;
    expect(pending.demand).toEqual({ ready: false, total: 0, top: [] });
  });

  it("listShortlist is the admin preview (includes the track)", async () => {
    const { db, spaceId, add } = await world();
    await add(spaceId, 88, "done", "ssulmo");
    const list = await listShortlist(db, spaceId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 1, score: 88, track: "ssulmo", businessType: "업종1" });
  });
});
