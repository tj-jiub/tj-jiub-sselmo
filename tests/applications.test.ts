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
  parseFeedbackForm,
  parseResultForm,
  requestFeedback,
  saveFeedback,
  saveResult,
} from "~/lib/applications.server";

const valid = {
  businessType: "아이스크림 가게",
  planText: "동네 아이들과 직장인을 위한 소형 젤라또 가게",
  estCostManwon: "4500",
  contactName: "김창업",
  email: "kim@example.com",
  consentPrivacy: "on",
  consentIntroTerms: "on",
};

export function form(overrides: Record<string, string | null> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ ...valid, ...overrides })) if (v !== null) f.set(k, v);
  return f;
}

export async function seeded(opts: { consentBrokerIntro?: boolean } = {}) {
  const db = createTestDb();
  const spaceId = await createSpace(db, { name: "A", neighborhood: "n", slug: "a-space", ownerConsent: true, consentFileKey: null });
  const r = parseApplication(form(opts.consentBrokerIntro ? { consentBrokerIntro: "on" } : {}));
  if (!r.ok) throw new Error(r.error);
  const { id, token } = await createApplication(db, spaceId, r.value, null, 123);
  return { db, id, token };
}

const setResult = (db: D1Database, id: number) =>
  db.prepare("UPDATE applications SET result_verdict = 'improve', result_summary = '객단가를 다시 보세요.' WHERE id = ?").bind(id).run();

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
      },
    });
    const opted = parseApplication(form({ consentBrokerIntro: "on" }));
    expect(opted.ok && opted.value.consentBrokerIntro).toBe(true);
  });

  it("requires each of the two consents separately", () => {
    expect(parseApplication(form({ consentPrivacy: null })).ok).toBe(false);
    expect(parseApplication(form({ consentIntroTerms: null })).ok).toBe(false);
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
      consent_fee_terms_at: null,
      feedback_requested_at: null,
      payment_confirmed: 0,
    });
  });

  it("shows nothing for an unknown token and a pending state before review", async () => {
    const { db, token } = await seeded();
    expect(await getResultByToken(db, "0".repeat(32))).toBeNull();
    expect(await getResultByToken(db, token)).toMatchObject({ contactName: "김창업", spaceName: "A", verdict: null, feedbackRequested: false });
  });
});

describe("requestFeedback", () => {
  it("needs a written result and the fee-terms consent, and is idempotent", async () => {
    const { db, id, token } = await seeded();
    expect(await requestFeedback(db, "nope", true)).toBe("not-found");
    expect(await requestFeedback(db, token, true)).toBe("not-ready");
    await setResult(db, id);
    expect(await requestFeedback(db, token, false)).toBe("no-consent");
    expect(await requestFeedback(db, token, true, 500)).toBe("requested");
    expect(await requestFeedback(db, token, true, 600)).toBe("already");
    const row = await db.prepare("SELECT feedback_requested_at, consent_fee_terms_at FROM applications WHERE id = ?").bind(id).first();
    expect(row).toEqual({ feedback_requested_at: 500, consent_fee_terms_at: 500 });
    expect(await getResultByToken(db, token)).toMatchObject({ verdict: "improve", feedbackRequested: true, feedbackSent: false });
  });
});


const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("admin result", () => {
  it("parses and saves verdict, summary, score and the sent flag", async () => {
    const { db, id } = await seeded();
    const r = parseResultForm(fd({ verdict: "improve", summary: " 객단가를 다시 보세요. ", referenceScore: "72", resultSent: "on" }));
    expect(r).toEqual({ ok: true, value: { verdict: "improve", summary: "객단가를 다시 보세요.", referenceScore: 72, resultSent: true } });
    if (!r.ok) return;
    await saveResult(db, id, r.value);
    expect(await getApplication(db, id)).toMatchObject({ result_verdict: "improve", result_sent: 1, reference_score: 72 });
    expect((await listApplications(db))[0].space_name).toBe("A");
  });

  it("rejects unknown verdicts, bad scores, and 'sent' without a written result", () => {
    expect(parseResultForm(fd({ verdict: "great" })).ok).toBe(false);
    expect(parseResultForm(fd({ referenceScore: "101" })).ok).toBe(false);
    expect(parseResultForm(fd({ resultSent: "on" })).ok).toBe(false);
    expect(parseResultForm(fd({ verdict: "fit", resultSent: "on" })).ok).toBe(false);
    expect(parseResultForm(fd({}))).toEqual({ ok: true, value: { verdict: null, summary: null, referenceScore: null, resultSent: false } });
  });
});

describe("paid feedback", () => {
  it("cannot be marked paid or sent before the applicant requests it", async () => {
    const { db, id, token } = await seeded();
    const f = parseFeedbackForm(fd({ paymentConfirmed: "on", feedback: "피드백", feedbackSent: "on" }));
    expect(await saveFeedback(db, id, f)).toBe("not-requested");

    await db.prepare("UPDATE applications SET result_verdict = 'fit', result_summary = 's' WHERE id = ?").bind(id).run();
    const { requestFeedback } = await import("~/lib/applications.server");
    expect(await requestFeedback(db, token, true)).toBe("requested");
    expect(await saveFeedback(db, id, f)).toBe("saved");
    expect(await getApplication(db, id)).toMatchObject({ payment_confirmed: 1, feedback: "피드백", feedback_sent: 1 });
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
