import type { EvalInput } from "./ai-prompt.ts";
import type { Evaluator } from "./evaluator.server.ts";
import { resultMailBody, type Mailer } from "./mail.server.ts";
import { aggregate, distribution } from "./report.ts";
import { estimateRevenue, matchBusinessType } from "./revenue.ts";
import { RESPONDENT_TYPE, SPEND_RANGE, VISIT_FREQUENCY, VISIT_TIME, type SurveyAnswers } from "./survey.ts";

export type PdfLoader = { loadPdf(key: string): Promise<string | null> };

/** Reads a PDF from R2 as base64 (the model only gets PDFs). */
export function r2PdfLoader(bucket: R2Bucket): PdfLoader {
  return {
    async loadPdf(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      const bytes = new Uint8Array(await object.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    },
  };
}

type Row = {
  space_id: number;
  business_type: string;
  plan_text: string;
  est_cost_manwon: number;
  plan_file_key: string | null;
  name: string;
  neighborhood: string;
  district: string | null;
  location_notes: string | null;
  margin_pct: number | null;
  scale_factor: number;
};

/** Explicit column list: contact_name and email are never selected. */
export async function buildEvalInput(db: D1Database, applicationId: number, pdf: PdfLoader): Promise<EvalInput> {
  const row = await db
    .prepare(
      `SELECT a.space_id, a.business_type, a.plan_text, a.est_cost_manwon, a.plan_file_key,
              s.name, s.neighborhood, s.district, s.location_notes, s.margin_pct, s.scale_factor
       FROM applications a JOIN spaces s ON s.id = a.space_id WHERE a.id = ?`,
    )
    .bind(applicationId)
    .first<Row>();
  if (!row) throw new Error("application not found");
  const { results } = await db.prepare("SELECT answers FROM survey_responses WHERE space_id = ?").bind(row.space_id).all<{ answers: string }>();
  const answers = results.map((r) => JSON.parse(r.answers) as SurveyAnswers);
  const report = aggregate(answers);
  const type = matchBusinessType(row.business_type);
  const estimate = estimateRevenue(answers, type ?? "", { scaleFactor: row.scale_factor, marginPct: row.margin_pct });

  let attachment: EvalInput["attachment"] = null;
  if (row.plan_file_key) {
    const base64 = row.plan_file_key.toLowerCase().endsWith(".pdf") ? await pdf.loadPdf(row.plan_file_key) : null;
    attachment = base64 ? { kind: "pdf", base64 } : { kind: "ignored", filename: null };
  }
  return {
    space: { name: row.name, neighborhood: row.neighborhood, district: row.district, locationNotes: row.location_notes },
    survey: {
      total: report.total,
      byType: report.byType,
      spend: distribution(answers, "spendRange", SPEND_RANGE),
      visitTime: distribution(answers, "visitTime", VISIT_TIME),
      frequency: distribution(answers, "visitFrequency", VISIT_FREQUENCY),
      respondents: distribution(answers, "respondentType", RESPONDENT_TYPE),
    },
    estimate: {
      respondents: estimate.respondents,
      revenue: estimate.revenue,
      netProfit: estimate.netProfit,
      marginPct: estimate.marginPct,
      scaleFactor: estimate.scaleFactor,
    },
    application: { businessType: row.business_type, planText: row.plan_text, estCostManwon: row.est_cost_manwon },
    attachment,
  };
}

export type RunDeps = { evaluator: Evaluator; mailer: Mailer | null; origin: string; pdf: PdfLoader; now?: number };

/** Evaluate one application and store the outcome. Never throws: failures are stored. */
export async function runEvaluation(db: D1Database, applicationId: number, deps: RunDeps): Promise<"done" | "failed"> {
  const now = deps.now ?? Date.now();
  try {
    const input = await buildEvalInput(db, applicationId, deps.pdf);
    const { report, model } = await deps.evaluator.evaluate(input);
    await db
      .prepare(
        `UPDATE applications SET ai_status = 'done', ai_score = ?, ai_report = ?, ai_model = ?, ai_evaluated_at = ?, ai_error = NULL,
           result_verdict = ?, result_summary = ? WHERE id = ?`,
      )
      .bind(report.score, JSON.stringify(report), model, now, report.verdict, report.summary, applicationId)
      .run();
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await db.prepare("UPDATE applications SET ai_status = 'failed', ai_error = ? WHERE id = ?").bind(message, applicationId).run();
    return "failed";
  }
  await mailResult(db, applicationId, deps, now);
  return "done";
}

// Mail once: a re-evaluation must not send a second mail. A mail error is not an evaluation error.
async function mailResult(db: D1Database, id: number, deps: RunDeps, now: number): Promise<void> {
  if (!deps.mailer) return;
  const row = await db.prepare("SELECT email, result_token, result_mailed_at FROM applications WHERE id = ?").bind(id).first<{
    email: string;
    result_token: string;
    result_mailed_at: number | null;
  }>();
  if (!row || row.result_mailed_at !== null) return;
  try {
    await deps.mailer.send(row.email, resultMailBody(`${deps.origin}/result/${row.result_token}`));
    await db.prepare("UPDATE applications SET result_mailed_at = ? WHERE id = ?").bind(now, id).run();
  } catch (e) {
    console.error("result mail failed", e instanceof Error ? e.message : e);
  }
}

export async function markPending(db: D1Database, id: number): Promise<void> {
  await db.prepare("UPDATE applications SET ai_status = 'pending', ai_error = NULL WHERE id = ?").bind(id).run();
}
