// 쓸모 트랙 consulting fee. TODO(legal): fee structure, relation to the owner
// presentation, 가맹사업법 applicability and the 중개 boundary need review before charging.
import type { ParseResult } from "./result.ts";

export const FEE_RATE = 0.01;

/** Loss and break-even months are free; a profit month pays FEE_RATE of revenue. */
export function consultingFee(revenueKrw: number, profitKrw: number): number {
  return profitKrw > 0 ? Math.round(revenueKrw * FEE_RATE) : 0;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MANWON = 1_000_000_000; // 10조원: just a sanity bound

function manwon(raw: FormDataEntryValue | null, allowNegative: boolean): number | null {
  const s = String(raw ?? "").trim();
  if (!(allowNegative ? /^-?\d+$/ : /^\d+$/).test(s)) return null;
  const n = Number(s);
  return Math.abs(n) > MAX_MANWON ? null : n;
}

export type ConsultingMonthInput = { month: string; revenueKrw: number; profitKrw: number; feeKrw: number };

export function parseConsultingMonth(form: FormData): ParseResult<ConsultingMonthInput> {
  const month = String(form.get("month") ?? "").trim();
  if (!MONTH.test(month)) return { ok: false, error: "월을 YYYY-MM 형식으로 적어 주세요." };
  const revenue = manwon(form.get("revenueManwon"), false);
  if (revenue === null) return { ok: false, error: "매출을 만원 단위 숫자로 적어 주세요." };
  const profit = manwon(form.get("profitManwon"), true);
  if (profit === null) return { ok: false, error: "손익을 만원 단위 숫자로 적어 주세요. (손해면 -40처럼)" };
  const revenueKrw = revenue * 10_000;
  const profitKrw = profit * 10_000;
  return { ok: true, value: { month, revenueKrw, profitKrw, feeKrw: consultingFee(revenueKrw, profitKrw) } };
}

export type EducatorLinkInput = { organization: string; educatorName: string; connectedOn: string };

export function parseEducatorLink(form: FormData): ParseResult<EducatorLinkInput> {
  const organization = String(form.get("organization") ?? "").trim();
  const educatorName = String(form.get("educatorName") ?? "").trim();
  const connectedOn = String(form.get("connectedOn") ?? "").trim();
  if (!organization || organization.length > 60 || !educatorName || educatorName.length > 40) {
    return { ok: false, error: "기관과 교육자 이름을 적어 주세요." };
  }
  if (!DATE.test(connectedOn)) return { ok: false, error: "연결한 날짜를 확인해 주세요." };
  return { ok: true, value: { organization, educatorName, connectedOn } };
}
