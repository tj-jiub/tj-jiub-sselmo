import { toHex } from "./hex";
import type { ParseResult } from "./result";

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
