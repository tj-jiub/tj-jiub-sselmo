// The AI evaluation output: type + strict validator. Invalid output means the
// evaluation failed (spec §5), so nothing here is lenient.
import type { ParseResult } from "./result.ts";

export type AiVerdict = "fit" | "improve" | "rethink";
export const SECTION_KEYS = ["demand_fit", "pricing", "hours", "cost_risk", "suggestions"] as const;
export const SECTION_LABELS: Record<(typeof SECTION_KEYS)[number], string> = {
  demand_fit: "수요 적합도",
  pricing: "가격·객단가",
  hours: "운영 시간대",
  cost_risk: "비용 대비 위험",
  suggestions: "개선 제안",
};

export type AiReport = {
  score: number;
  verdict: AiVerdict;
  summary: string;
  strengths: string[];
  risks: string[];
  sections: Record<(typeof SECTION_KEYS)[number], string>;
  notes?: string[];
};

const VERDICTS = ["fit", "improve", "rethink"];
const SUMMARY_MAX = 300;
const SECTION_MAX = 1500;
const LIST_MAX = 3;
const ITEM_MAX = 120;

const fail = (error: string): ParseResult<AiReport> => ({ ok: false, error });
const nonEmpty = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;

function stringList(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > LIST_MAX) return null;
  return v.every((x) => nonEmpty(x, ITEM_MAX)) ? (v as string[]).map((x) => x.trim()) : null;
}

export function validateAiReport(raw: unknown): ParseResult<AiReport> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fail("report is not an object");
  const o = raw as Record<string, unknown>;
  if (typeof o.score !== "number" || !Number.isInteger(o.score) || o.score < 0 || o.score > 100) return fail("score must be an integer 0-100");
  if (typeof o.verdict !== "string" || !VERDICTS.includes(o.verdict)) return fail("unknown verdict");
  if (!nonEmpty(o.summary, SUMMARY_MAX)) return fail("summary must be 1-300 chars");
  const strengths = stringList(o.strengths);
  if (!strengths) return fail("strengths must be at most 3 short strings");
  const risks = stringList(o.risks);
  if (!risks) return fail("risks must be at most 3 short strings");
  const s = o.sections as Record<string, unknown> | null | undefined;
  if (typeof s !== "object" || s === null) return fail("sections missing");
  const sections = {} as AiReport["sections"];
  for (const k of SECTION_KEYS) {
    if (!nonEmpty(s[k], SECTION_MAX)) return fail(`section ${k} missing or too long`);
    sections[k] = (s[k] as string).trim();
  }
  const report: AiReport = { score: o.score, verdict: o.verdict as AiVerdict, summary: o.summary.trim(), strengths, risks, sections };
  if (Array.isArray(o.notes)) {
    const notes = o.notes.filter((n): n is string => typeof n === "string" && n.length > 0 && n.length <= 200).slice(0, 5);
    if (notes.length) report.notes = notes;
  }
  return { ok: true, value: report };
}
