import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { createSpace } from "~/lib/spaces.server";
import { createApplication, getApplication, parseApplication } from "~/lib/applications.server";
import { buildEvalInput, runEvaluation } from "~/lib/evaluation.server";
import { fakeEvaluator, type Evaluator } from "~/lib/evaluator.server";
import { buildPrompt } from "~/lib/ai-prompt";
import type { Mailer } from "~/lib/mail.server";

const answers = (types: string[]) =>
  JSON.stringify({ businessTypes: types, businessTypeOther: null, visitFrequency: "weekly1", spendRange: "5to10k", visitTime: "lunch", respondentType: "resident" });

async function setup(opts: { type?: string; planFileKey?: string | null } = {}) {
  const db = createTestDb();
  const spaceId = await createSpace(db, { name: "성수 공실", district: "성동구", neighborhood: "성동구 성수동", slug: "ss-01", ownerConsent: true, consentFileKey: null });
  await db.prepare("UPDATE spaces SET location_notes = '역 도보 3분', margin_pct = 20, scale_factor = 2 WHERE id = ?").bind(spaceId).run();
  for (let i = 0; i < 10; i++) {
    await db.prepare("INSERT INTO survey_responses (space_id, answers, device_hash, created_at) VALUES (?, ?, ?, 1)").bind(spaceId, answers(["아이스크림·디저트"]), `d${i}`).run();
  }
  const f = new FormData();
  for (const [k, v] of Object.entries({
    businessType: opts.type ?? "젤라또 가게", planText: "소형 젤라또", estCostManwon: "4500", contactName: "김비밀", email: "secret@example.com",
    track: "ssulmo", consentPrivacy: "on", consentIntroTerms: "on", consentAi: "on", consentConsulting: "on",
  })) f.set(k, v);
  const parsed = parseApplication(f);
  if (!parsed.ok) throw new Error(parsed.error);
  const { id, token } = await createApplication(db, spaceId, parsed.value, opts.planFileKey ?? null, 5);
  return { db, spaceId, id, token };
}

const noPdf = { loadPdf: async () => null };

describe("buildEvalInput", () => {
  it("collects survey aggregates, space facts and the estimate; carries no personal data", async () => {
    const { db, id } = await setup();
    const input = await buildEvalInput(db, id, noPdf);
    expect(input.space).toMatchObject({ name: "성수 공실", locationNotes: "역 도보 3분" });
    expect(input.survey.total).toBe(10);
    expect(input.survey.byType[0]).toEqual({ type: "아이스크림·디저트", count: 10 });
    // "젤라또 가게" is matched to 아이스크림·디저트: 10 x 45,000 x scale 2 = 900,000
    expect(input.estimate).toMatchObject({ respondents: 10, marginPct: 20, scaleFactor: 2 });
    expect(input.application).toEqual({ businessType: "젤라또 가게", planText: "소형 젤라또", estCostManwon: 4500 });
    const { system, user } = buildPrompt(input);
    for (const t of [system, user, JSON.stringify(input)]) {
      expect(t).not.toContain("김비밀");
      expect(t).not.toContain("secret@example.com");
    }
  });
  it("sends a PDF attachment and notes other file types", async () => {
    const pdf = await setup({ planFileKey: "plans/x.pdf" });
    expect((await buildEvalInput(pdf.db, pdf.id, { loadPdf: async () => "QUJD" })).attachment).toEqual({ kind: "pdf", base64: "QUJD" });
    const hwp = await setup({ planFileKey: "plans/x.hwp" });
    expect((await buildEvalInput(hwp.db, hwp.id, noPdf)).attachment).toEqual({ kind: "ignored", filename: null });
  });
});

describe("runEvaluation", () => {
  const sender = () => {
    const sent: Array<{ to: string; text: string }> = [];
    const mailer: Mailer = { send: async (to, m) => void sent.push({ to, text: m.text }) };
    return { sent, mailer };
  };

  it("stores the report, fills the legacy verdict/summary and mails only the link", async () => {
    const { db, id, token } = await setup();
    const { sent, mailer } = sender();
    const out = await runEvaluation(db, id, { evaluator: fakeEvaluator, mailer, origin: "https://x.kr", pdf: noPdf, now: 99 });
    expect(out).toBe("done");
    const row = await getApplication(db, id);
    expect(row).toMatchObject({ ai_status: "done", ai_model: "fake", ai_evaluated_at: 99, ai_error: null, result_mailed_at: 99 });
    expect(row!.ai_score).toBe(JSON.parse(row!.ai_report!).score);
    expect(row!.result_verdict).toBe(JSON.parse(row!.ai_report!).verdict);
    expect(row!.result_summary).toBe(JSON.parse(row!.ai_report!).summary);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("secret@example.com");
    expect(sent[0].text).toContain(`https://x.kr/result/${token}`);
  });

  it("does not mail when no mailer is configured, and does not re-mail on re-evaluation", async () => {
    const { db, id } = await setup();
    await runEvaluation(db, id, { evaluator: fakeEvaluator, mailer: null, origin: "https://x.kr", pdf: noPdf });
    expect((await getApplication(db, id))!.result_mailed_at).toBeNull();
    const { sent, mailer } = sender();
    await runEvaluation(db, id, { evaluator: fakeEvaluator, mailer, origin: "https://x.kr", pdf: noPdf, now: 5 });
    await runEvaluation(db, id, { evaluator: fakeEvaluator, mailer, origin: "https://x.kr", pdf: noPdf, now: 6 });
    expect(sent).toHaveLength(1);
  });

  it("records a failure and keeps the application retryable", async () => {
    const { db, id } = await setup();
    const broken: Evaluator = { name: "broken", evaluate: async () => { throw new Error("upstream 500"); } };
    const { sent, mailer } = sender();
    expect(await runEvaluation(db, id, { evaluator: broken, mailer, origin: "o", pdf: noPdf })).toBe("failed");
    expect(await getApplication(db, id)).toMatchObject({ ai_status: "failed", ai_error: "upstream 500", ai_score: null });
    expect(sent).toHaveLength(0);
    expect(await runEvaluation(db, id, { evaluator: fakeEvaluator, mailer: null, origin: "o", pdf: noPdf })).toBe("done");
    expect(await getApplication(db, id)).toMatchObject({ ai_status: "done", ai_error: null });
  });

  it("a mail failure does not undo a finished evaluation", async () => {
    const { db, id } = await setup();
    const mailer: Mailer = { send: async () => { throw new Error("smtp down"); } };
    expect(await runEvaluation(db, id, { evaluator: fakeEvaluator, mailer, origin: "o", pdf: noPdf })).toBe("done");
    expect(await getApplication(db, id)).toMatchObject({ ai_status: "done", result_mailed_at: null });
  });
});
