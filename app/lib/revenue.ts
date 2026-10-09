// Monthly revenue / net profit estimate for a business type at a space.
// Pure: survey answers in, numbers out. Spec §6.
import { BUSINESS_TYPES, type SurveyAnswers } from "./survey.ts";

const VISITS_PER_MONTH: Record<string, number> = { weekly3: 13, weekly1: 6, monthly: 2, rarely: 0.5 };
const SPEND_MIDPOINT_KRW: Record<string, number> = { lt5k: 4000, "5to10k": 7500, "10to20k": 15000, gt20k: 25000 };

export function visitsPerMonth(frequency: string): number {
  return VISITS_PER_MONTH[frequency] ?? 0;
}
export function spendMidpoint(range: string): number {
  return SPEND_MIDPOINT_KRW[range] ?? 0;
}

const TYPE_MARGIN_PCT: Record<string, number> = {
  카페: 15,
  베이커리: 15,
  "아이스크림·디저트": 18,
  분식: 12,
  반찬가게: 10,
};
export const FALLBACK_MARGIN_PCT = 12;
export function defaultMargin(type: string): number {
  return TYPE_MARGIN_PCT[type] ?? FALLBACK_MARGIN_PCT;
}

export type Range = { low: number; high: number };
export type RevenueEstimate = {
  respondents: number;
  baseRevenue: number;
  revenue: Range;
  netProfit: Range;
  marginPct: number;
  scaleFactor: number;
};

const ROUND_TO_KRW = 100_000; // 10만원
const roundTo = (n: number) => Math.round(n / ROUND_TO_KRW) * ROUND_TO_KRW;

export function estimateRevenue(
  answers: SurveyAnswers[],
  type: string,
  opts: { scaleFactor: number; marginPct: number | null },
): RevenueEstimate {
  let respondents = 0;
  let sum = 0;
  for (const a of answers) {
    if (!a.businessTypes.includes(type)) continue;
    respondents += 1;
    sum += visitsPerMonth(a.visitFrequency) * spendMidpoint(a.spendRange);
  }
  const baseRevenue = sum * opts.scaleFactor;
  const marginPct = opts.marginPct ?? defaultMargin(type);
  // x7/10 and x13/10 (not x0.7) keep .5 boundaries exact before rounding.
  const range = (v: number): Range => ({ low: roundTo((v * 7) / 10), high: roundTo((v * 13) / 10) });
  return {
    respondents,
    baseRevenue,
    revenue: range(baseRevenue),
    netProfit: range((baseRevenue * marginPct) / 100),
    marginPct,
    scaleFactor: opts.scaleFactor,
  };
}

// Applicants write free text ("젤라또 가게"); the estimate needs a surveyed type.
const ALIASES: Array<[string, string]> = [
  ["젤라또", "아이스크림·디저트"],
  ["아이스크림", "아이스크림·디저트"],
  ["디저트", "아이스크림·디저트"],
  ["빙수", "아이스크림·디저트"],
  ["제과", "베이커리"],
  ["빵", "베이커리"],
  ["커피", "카페"],
  ["김밥", "분식"],
  ["떡볶이", "분식"],
  ["요가", "필라테스·요가"],
  ["필라테스", "필라테스·요가"],
];
export function matchBusinessType(text: string): string | null {
  const t = text.trim();
  const exact = BUSINESS_TYPES.find((b) => b === t);
  if (exact) return exact;
  // "베이커리 카페" names two types; the one written first is the main business.
  const contained = BUSINESS_TYPES.filter((b) => t.includes(b)).sort((a, b) => t.indexOf(a) - t.indexOf(b))[0];
  if (contained) return contained;
  return ALIASES.find(([k]) => t.includes(k))?.[1] ?? null;
}
