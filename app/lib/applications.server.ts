import { toHex } from "./hex";
import type { ParseResult } from "./result";
import type { AiReport } from "./ai-report";

export type ApplicationForm = {
  businessType: string;
  planText: string;
  estCostManwon: number;
  contactName: string;
  email: string;
  consentBrokerIntro: boolean;
  track: Track;
  consentConsulting: boolean;
};

export type Track = "ssulmo" | "general";
// AI consent is required on both tracks; the consulting consent only on 쓸모 트랙.
const REQUIRED_CONSENTS = ["consentPrivacy", "consentIntroTerms", "consentAi"] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseApplication(form: FormData): ParseResult<ApplicationForm> {
  const str = (k: string) => String(form.get(k) ?? "").trim();
  if (REQUIRED_CONSENTS.some((k) => form.get(k) !== "on")) {
    return { ok: false, error: "필수 동의 항목에 모두 동의해 주세요." };
  }
  const track = str("track");
  if (track !== "ssulmo" && track !== "general") return { ok: false, error: "지원 방식을 골라 주세요." };
  if (track === "ssulmo" && form.get("consentConsulting") !== "on") {
    return { ok: false, error: "쓸모 트랙은 컨설팅 약관에 동의해야 해요. 일반 신청을 고를 수도 있어요." };
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
    value: {
      businessType,
      planText,
      estCostManwon,
      contactName,
      email,
      consentBrokerIntro: form.get("consentBrokerIntro") === "on",
      track,
      consentConsulting: track === "ssulmo",
    },
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
        consent_privacy_at, consent_intro_terms_at, consent_broker_intro, consent_broker_intro_at,
        track, consent_ai_at, consent_consulting_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      input.track,
      now,
      input.consentConsulting ? now : null,
      now,
    )
    .run();
  return { id: res.meta.last_row_id, token };
}

export type ResultView = {
  contactName: string;
  spaceName: string;
  track: Track;
  /** False while pending or failed: the applicant just sees "평가 중". */
  ready: boolean;
  verdict: string | null;
  summary: string | null;
  /** The score is deliberately not part of the applicant view. */
  report: AiReport | null;
};

export async function getResultByToken(db: D1Database, token: string): Promise<ResultView | null> {
  const row = await db
    .prepare(
      `SELECT a.contact_name, s.name AS space_name, a.track, a.result_verdict, a.result_summary, a.ai_status, a.ai_report
       FROM applications a JOIN spaces s ON s.id = a.space_id WHERE a.result_token = ?`,
    )
    .bind(token)
    .first<{
      contact_name: string;
      space_name: string;
      track: Track;
      result_verdict: string | null;
      result_summary: string | null;
      ai_status: string;
      ai_report: string | null;
    }>();
  if (!row) return null;
  // Rows written by the old manual flow have a verdict but no report; they stay readable.
  const ready = row.result_verdict !== null && (row.ai_status === "done" || row.ai_report === null);
  return {
    contactName: row.contact_name,
    spaceName: row.space_name,
    track: row.track,
    ready,
    verdict: ready ? row.result_verdict : null,
    summary: ready ? row.result_summary : null,
    report: ready && row.ai_report ? (JSON.parse(row.ai_report) as AiReport) : null,
  };
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
  track: Track;
  consent_ai_at: number | null;
  consent_consulting_at: number | null;
  ai_status: "pending" | "done" | "failed";
  ai_score: number | null;
  ai_report: string | null;
  ai_model: string | null;
  ai_evaluated_at: number | null;
  ai_error: string | null;
  result_mailed_at: number | null;
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

// Manual tick when no mail service is configured (or the operator sent it by hand).
export async function setResultMailed(db: D1Database, id: number, mailed: boolean, now = Date.now()): Promise<void> {
  await db.prepare("UPDATE applications SET result_mailed_at = ? WHERE id = ?").bind(mailed ? now : null, id).run();
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
