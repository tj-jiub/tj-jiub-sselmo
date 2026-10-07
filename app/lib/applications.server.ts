import { toHex } from "./hex";
import type { ParseResult } from "./result";
import { VERDICTS } from "./verdicts";

export type ApplicationForm = {
  businessType: string;
  planText: string;
  estCostManwon: number;
  contactName: string;
  email: string;
  consentBrokerIntro: boolean;
};

const REQUIRED_CONSENTS = ["consentPrivacy", "consentIntroTerms"] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseApplication(form: FormData): ParseResult<ApplicationForm> {
  const str = (k: string) => String(form.get(k) ?? "").trim();
  if (REQUIRED_CONSENTS.some((k) => form.get(k) !== "on")) {
    return { ok: false, error: "필수 동의 항목 2개에 모두 동의해 주세요." };
  }
  const businessType = str("businessType");
  if (!businessType || businessType.length > 40) return { ok: false, error: "희망 업종을 40자 이내로 적어 주세요." };
  const planText = str("planText");
  if (!planText || planText.length > 5000) return { ok: false, error: "사업계획을 5,000자 이내로 적어 주세요." };
  const cost = str("estCostManwon");
  const estCostManwon = Number(cost);
  if (!/^\d+$/.test(cost) || estCostManwon > 1_000_000) {
    return { ok: false, error: "예상 창업 비용을 만원 단위 숫자로 적어 주세요." };
  }
  const contactName = str("contactName");
  if (!contactName || contactName.length > 40) return { ok: false, error: "이름을 적어 주세요." };
  const email = str("email");
  if (!EMAIL_PATTERN.test(email) || email.length > 100) {
    return { ok: false, error: "결과를 받을 이메일 주소를 확인해 주세요." };
  }
  return {
    ok: true,
    value: { businessType, planText, estCostManwon, contactName, email, consentBrokerIntro: form.get("consentBrokerIntro") === "on" },
  };
}

// 128 random bits: the result page has no login, so the token is the only key.
function newResultToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function createApplication(
  db: D1Database,
  spaceId: number,
  input: ApplicationForm,
  planFileKey: string | null,
  now = Date.now(),
): Promise<{ id: number; token: string }> {
  const token = newResultToken();
  const res = await db
    .prepare(
      `INSERT INTO applications (
        space_id, result_token, business_type, plan_text, plan_file_key, est_cost_manwon, contact_name, email,
        consent_privacy_at, consent_intro_terms_at, consent_broker_intro, consent_broker_intro_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      spaceId,
      token,
      input.businessType,
      input.planText,
      planFileKey,
      input.estCostManwon,
      input.contactName,
      input.email,
      now,
      now,
      input.consentBrokerIntro ? 1 : 0,
      input.consentBrokerIntro ? now : null,
      now,
    )
    .run();
  return { id: res.meta.last_row_id, token };
}

export type ResultView = {
  contactName: string;
  spaceName: string;
  verdict: string | null;
  summary: string | null;
  feedbackRequested: boolean;
  feedbackSent: boolean;
};

export async function getResultByToken(db: D1Database, token: string): Promise<ResultView | null> {
  const row = await db
    .prepare(
      `SELECT a.contact_name, s.name AS space_name, a.result_verdict, a.result_summary, a.feedback_requested_at, a.feedback_sent
       FROM applications a JOIN spaces s ON s.id = a.space_id WHERE a.result_token = ?`,
    )
    .bind(token)
    .first<{
      contact_name: string;
      space_name: string;
      result_verdict: string | null;
      result_summary: string | null;
      feedback_requested_at: number | null;
      feedback_sent: number;
    }>();
  if (!row) return null;
  return {
    contactName: row.contact_name,
    spaceName: row.space_name,
    verdict: row.result_verdict,
    summary: row.result_summary,
    feedbackRequested: row.feedback_requested_at !== null,
    feedbackSent: row.feedback_sent === 1,
  };
}

export async function requestFeedback(
  db: D1Database,
  token: string,
  consentFeeTerms: boolean,
  now = Date.now(),
): Promise<"requested" | "already" | "not-ready" | "no-consent" | "not-found"> {
  const row = await db
    .prepare("SELECT id, result_verdict, feedback_requested_at FROM applications WHERE result_token = ?")
    .bind(token)
    .first<{ id: number; result_verdict: string | null; feedback_requested_at: number | null }>();
  if (!row) return "not-found";
  if (row.feedback_requested_at !== null) return "already";
  if (!row.result_verdict) return "not-ready";
  if (!consentFeeTerms) return "no-consent";
  await db
    .prepare("UPDATE applications SET feedback_requested_at = ?, consent_fee_terms_at = ? WHERE id = ?")
    .bind(now, now, row.id)
    .run();
  return "requested";
}

export type Application = {
  id: number;
  space_id: number;
  result_token: string;
  business_type: string;
  plan_text: string;
  plan_file_key: string | null;
  est_cost_manwon: number;
  contact_name: string;
  email: string;
  consent_privacy_at: number;
  consent_intro_terms_at: number;
  consent_broker_intro: number;
  consent_broker_intro_at: number | null;
  result_verdict: string | null;
  result_summary: string | null;
  result_sent: number;
  reference_score: number | null;
  feedback_requested_at: number | null;
  consent_fee_terms_at: number | null;
  payment_confirmed: number;
  feedback: string | null;
  feedback_sent: number;
  created_at: number;
};
export type ApplicationListItem = Application & { space_name: string };

const SELECT_WITH_SPACE = "SELECT a.*, s.name AS space_name FROM applications a JOIN spaces s ON s.id = a.space_id";

export async function listApplications(db: D1Database): Promise<ApplicationListItem[]> {
  const { results } = await db.prepare(`${SELECT_WITH_SPACE} ORDER BY a.id DESC`).all<ApplicationListItem>();
  return results;
}

export async function getApplication(db: D1Database, id: number): Promise<ApplicationListItem | null> {
  return db.prepare(`${SELECT_WITH_SPACE} WHERE a.id = ?`).bind(id).first<ApplicationListItem>();
}

export type ResultForm = { verdict: string | null; summary: string | null; referenceScore: number | null; resultSent: boolean };

export function parseResultForm(form: FormData): ParseResult<ResultForm> {
  const verdict = String(form.get("verdict") ?? "");
  if (verdict && !VERDICTS.some((v) => v.value === verdict)) return { ok: false, error: "판정을 다시 골라 주세요." };
  const summary = String(form.get("summary") ?? "").trim();
  if (summary.length > 1000) return { ok: false, error: "요약은 1,000자 이내로 적어 주세요." };
  const score = String(form.get("referenceScore") ?? "").trim();
  if (score && (!/^\d+$/.test(score) || Number(score) > 100)) {
    return { ok: false, error: "참고 점수는 0~100 사이 숫자로 적어 주세요." };
  }
  const resultSent = form.get("resultSent") === "on";
  if (resultSent && (!verdict || !summary)) {
    return { ok: false, error: "판정과 요약을 먼저 작성해야 결과 메일을 보낼 수 있어요." };
  }
  return {
    ok: true,
    value: { verdict: verdict || null, summary: summary || null, referenceScore: score ? Number(score) : null, resultSent },
  };
}

export async function saveResult(db: D1Database, id: number, r: ResultForm): Promise<void> {
  await db
    .prepare("UPDATE applications SET result_verdict = ?, result_summary = ?, reference_score = ?, result_sent = ? WHERE id = ?")
    .bind(r.verdict, r.summary, r.referenceScore, r.resultSent ? 1 : 0, id)
    .run();
}

export type FeedbackForm = { paymentConfirmed: boolean; feedback: string | null; feedbackSent: boolean };

export function parseFeedbackForm(form: FormData): FeedbackForm {
  const feedback = String(form.get("feedback") ?? "").trim();
  return {
    paymentConfirmed: form.get("paymentConfirmed") === "on",
    feedback: feedback || null,
    feedbackSent: form.get("feedbackSent") === "on",
  };
}

// Paid feedback only exists once the applicant asked for it on the result page.
export async function saveFeedback(db: D1Database, id: number, f: FeedbackForm): Promise<"saved" | "not-requested"> {
  const res = await db
    .prepare(
      "UPDATE applications SET payment_confirmed = ?, feedback = ?, feedback_sent = ? WHERE id = ? AND feedback_requested_at IS NOT NULL",
    )
    .bind(f.paymentConfirmed ? 1 : 0, f.feedback, f.feedbackSent ? 1 : 0, id)
    .run();
  return res.meta.changes === 1 ? "saved" : "not-requested";
}

export async function createBrokerIntro(
  db: D1Database,
  applicationId: number,
  brokerName: string,
  introducedOn: string,
  now = Date.now(),
): Promise<"saved" | "no-consent" | "invalid"> {
  const name = brokerName.trim();
  if (!name || name.length > 60 || !/^\d{4}-\d{2}-\d{2}$/.test(introducedOn)) return "invalid";
  const app = await db
    .prepare("SELECT consent_broker_intro FROM applications WHERE id = ?")
    .bind(applicationId)
    .first<{ consent_broker_intro: number }>();
  // The broker_intros_require_consent trigger enforces the same rule in the DB.
  if (app?.consent_broker_intro !== 1) return "no-consent";
  await db
    .prepare("INSERT INTO broker_intros (application_id, broker_name, introduced_on, created_at) VALUES (?, ?, ?, ?)")
    .bind(applicationId, name, introducedOn, now)
    .run();
  return "saved";
}

export async function listBrokerIntros(
  db: D1Database,
  applicationId: number,
): Promise<Array<{ id: number; broker_name: string; introduced_on: string }>> {
  const { results } = await db
    .prepare("SELECT id, broker_name, introduced_on FROM broker_intros WHERE application_id = ? ORDER BY introduced_on DESC, id DESC")
    .bind(applicationId)
    .all<{ id: number; broker_name: string; introduced_on: string }>();
  return results;
}
