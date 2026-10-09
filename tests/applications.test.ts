import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { createSpace } from "~/lib/spaces.server";
import {
  createApplication,
  createBrokerIntro,
  getApplication,
  getResultByToken,
  listApplications,
  listBrokerIntros,
  parseApplication,
  setResultMailed,
} from "~/lib/applications.server";

const valid = {
  businessType: "아이스크림 가게",
  planText: "동네 아이들과 직장인을 위한 소형 젤라또 가게",
  estCostManwon: "4500",
  contactName: "김창업",
  email: "kim@example.com",
  track: "general",
  consentPrivacy: "on",
  consentIntroTerms: "on",
  consentAi: "on",
};

export function form(overrides: Record<string, string | null> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ ...valid, ...overrides })) if (v !== null) f.set(k, v);
  return f;
}

export async function seeded(opts: { consentBrokerIntro?: boolean } = {}) {
  const db = createTestDb();
  const spaceId = await createSpace(db, { name: "A", district: "마포구", neighborhood: "n", slug: "a-space", ownerConsent: true, consentFileKey: null });
  const r = parseApplication(form(opts.consentBrokerIntro ? { consentBrokerIntro: "on" } : {}));
  if (!r.ok) throw new Error(r.error);
  const { id, token } = await createApplication(db, spaceId, r.value, null, 123);
  return { db, id, token };
}

describe("parseApplication", () => {
  it("parses a free application; broker intro is opt-in", () => {
    expect(parseApplication(form())).toEqual({
      ok: true,
      value: {
        businessType: "아이스크림 가게",
        planText: valid.planText,
        estCostManwon: 4500,
        contactName: "김창업",
        email: "kim@example.com",
        consentBrokerIntro: false,
        track: "general",
        consentConsulting: false,
      },
    });
    const opted = parseApplication(form({ consentBrokerIntro: "on" }));
    expect(opted.ok && opted.value.consentBrokerIntro).toBe(true);
  });

  it("requires each of the three consents separately, on both tracks", () => {
    for (const track of ["general", "ssulmo"]) {
      const base = { track, consentConsulting: "on" };
      expect(parseApplication(form(base)).ok).toBe(true);
      expect(parseApplication(form({ ...base, consentPrivacy: null })).ok).toBe(false);
      expect(parseApplication(form({ ...base, consentIntroTerms: null })).ok).toBe(false);
      expect(parseApplication(form({ ...base, consentAi: null })).ok).toBe(false);
    }
  });

  it("requires the consulting consent only on the 쓸모 track", () => {
    expect(parseApplication(form({ track: "ssulmo" })).ok).toBe(false);
    const ok = parseApplication(form({ track: "ssulmo", consentConsulting: "on" }));
    expect(ok.ok && ok.value).toMatchObject({ track: "ssulmo", consentConsulting: true });
    // A stray consulting checkbox on the general track is ignored, not recorded.
    const general = parseApplication(form({ track: "general", consentConsulting: "on" }));
    expect(general.ok && general.value).toMatchObject({ track: "general", consentConsulting: false });
  });

  it("requires a known track", () => {
    expect(parseApplication(form({ track: null })).ok).toBe(false);
    expect(parseApplication(form({ track: "vip" })).ok).toBe(false);
  });

  it("rejects missing or malformed fields", () => {
    expect(parseApplication(form({ businessType: "" })).ok).toBe(false);
    expect(parseApplication(form({ planText: "" })).ok).toBe(false);
    expect(parseApplication(form({ estCostManwon: "" })).ok).toBe(false);
    expect(parseApplication(form({ estCostManwon: "사천만원" })).ok).toBe(false);
    expect(parseApplication(form({ estCostManwon: "-1" })).ok).toBe(false);
    expect(parseApplication(form({ email: "" })).ok).toBe(false);
    expect(parseApplication(form({ email: "010-1111-2222" })).ok).toBe(false);
  });
});

describe("application records", () => {
  it("stores consent timestamps and issues an unguessable result token", async () => {
    const { db, id, token } = await seeded({ consentBrokerIntro: true });
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    const row = await db.prepare("SELECT * FROM applications WHERE id = ?").bind(id).first<Record<string, unknown>>();
    expect(row).toMatchObject({
      result_token: token,
      consent_privacy_at: 123,
      consent_intro_terms_at: 123,
      consent_broker_intro: 1,
      consent_broker_intro_at: 123,
      consent_ai_at: 123,
      consent_consulting_at: null,
      track: "general",
      ai_status: "pending",
      consent_fee_terms_at: null,
      feedback_requested_at: null,
      payment_confirmed: 0,
    });
  });

  it("stores the consulting consent time for the 쓸모 track", async () => {
    const db = createTestDb();
    const spaceId = await createSpace(db, { name: "A", district: "마포구", neighborhood: "n", slug: "a-space", ownerConsent: true, consentFileKey: null });
    const r = parseApplication(form({ track: "ssulmo", consentConsulting: "on" }));
    if (!r.ok) throw new Error(r.error);
    const { id } = await createApplication(db, spaceId, r.value, null, 777);
    expect(await getApplication(db, id)).toMatchObject({ track: "ssulmo", consent_consulting_at: 777, consent_ai_at: 777 });
  });

  it("marks the result as mailed", async () => {
    const { db, id } = await seeded();
    await setResultMailed(db, id, true, 999);
    expect(await getApplication(db, id)).toMatchObject({ result_mailed_at: 999 });
    await setResultMailed(db, id, false);
    expect(await getApplication(db, id)).toMatchObject({ result_mailed_at: null });
  });

  it("result view: pending until evaluated, then verdict, summary and report without the score", async () => {
    const { db, id, token } = await seeded();
    expect(await getResultByToken(db, token)).toMatchObject({ ready: false, track: "general", report: null });
    const report = {
      score: 82, verdict: "fit", summary: "요약", strengths: ["a"], risks: ["b"],
      sections: { demand_fit: "1", pricing: "2", hours: "3", cost_risk: "4", suggestions: "5" },
    };
    await db
      .prepare("UPDATE applications SET ai_status='done', ai_score=82, ai_report=?, result_verdict='fit', result_summary='요약' WHERE id = ?")
      .bind(JSON.stringify(report), id)
      .run();
    const view = await getResultByToken(db, token);
    expect(view).toMatchObject({ ready: true, verdict: "fit", summary: "요약", report });
    expect(JSON.stringify(view)).not.toContain("ai_score");
    expect(view).not.toHaveProperty("score");
  });

  it("a failed evaluation still looks like 'in progress' to the applicant", async () => {
    const { db, id, token } = await seeded();
    await db.prepare("UPDATE applications SET ai_status='failed', ai_error='boom' WHERE id = ?").bind(id).run();
    expect(await getResultByToken(db, token)).toMatchObject({ ready: false });
  });

  it("shows nothing for an unknown token and a pending state before review", async () => {
    const { db, token } = await seeded();
    expect(await getResultByToken(db, "0".repeat(32))).toBeNull();
    expect(await getResultByToken(db, token)).toMatchObject({ contactName: "김창업", spaceName: "A", verdict: null, ready: false });
  });
});

describe("broker introduction log", () => {
  it("refuses to log an introduction without consent", async () => {
    const { db, id } = await seeded();
    expect(await createBrokerIntro(db, id, "망원공인중개사", "2026-10-07")).toBe("no-consent");
    expect(await listBrokerIntros(db, id)).toEqual([]);
  });

  it("database trigger blocks a direct insert without consent", async () => {
    const { db, id } = await seeded();
    await expect(
      db
        .prepare("INSERT INTO broker_intros (application_id, broker_name, introduced_on, created_at) VALUES (?, ?, ?, ?)")
        .bind(id, "x", "2026-10-07", 1)
        .run(),
    ).rejects.toThrow(/consent missing/);
  });

  it("logs an introduction when the founder consented", async () => {
    const { db, id } = await seeded({ consentBrokerIntro: true });
    expect(await createBrokerIntro(db, id, " ", "2026-10-07")).toBe("invalid");
    expect(await createBrokerIntro(db, id, "망원공인중개사", "10/07")).toBe("invalid");
    expect(await createBrokerIntro(db, id, "망원공인중개사", "2026-10-07")).toBe("saved");
    expect(await listBrokerIntros(db, id)).toMatchObject([{ broker_name: "망원공인중개사", introduced_on: "2026-10-07" }]);
  });
});

describe("paid feedback database guard", () => {
  it("database trigger blocks marking feedback paid or sent before it was requested", async () => {
    const { db, id } = await seeded();
    await expect(
      db.prepare("UPDATE applications SET payment_confirmed = 1, feedback_sent = 1 WHERE id = ?").bind(id).run(),
    ).rejects.toThrow(/feedback not requested/);
    await expect(
      db.prepare("UPDATE applications SET feedback = 'x' WHERE id = ?").bind(id).run(),
    ).rejects.toThrow(/feedback not requested/);
  });
});
