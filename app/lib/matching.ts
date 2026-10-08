// Founder matching: pure logic only. No runtime imports except report.ts, which
// itself only has type imports, so Node scripts can load this file directly.
import { PUBLIC_THRESHOLD, formatIntent } from "./report.ts";
import { BUSINESS_TYPES } from "./survey.ts";

export const MATCH_THRESHOLD = PUBLIC_THRESHOLD;
export const ANY_DISTRICT = "any";

export type SpaceInfo = { slug: string; name: string; neighborhood: string; district: string | null };
export type SpaceTally = SpaceInfo & { total: number; counts: Record<string, number> };
// Pending spaces carry no numbers on purpose.
export type PendingSpace = SpaceInfo;

const byKo = (a: string, b: string) => a.localeCompare(b, "ko");

export function tallySpace(info: SpaceInfo, answers: Array<{ businessTypes: string[] }>): SpaceTally {
  const counts: Record<string, number> = {};
  for (const a of answers) for (const t of new Set(a.businessTypes)) counts[t] = (counts[t] ?? 0) + 1;
  return { ...info, total: answers.length, counts };
}

const isReady = (s: SpaceTally) => s.total >= MATCH_THRESHOLD;
const pendingOf = (s: SpaceTally): PendingSpace => ({
  slug: s.slug,
  name: s.name,
  neighborhood: s.neighborhood,
  district: s.district,
});
const typeRanking = (s: SpaceTally) =>
  Object.entries(s.counts)
    .map(([type, count]) => ({ type, count }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count || byKo(a.type, b.type));

export type TypeMatch = SpaceInfo & { rank: number; total: number; count: number; phrase: string };

export function recommendByType(spaces: SpaceTally[], type: string): { ranked: TypeMatch[]; pending: PendingSpace[] } {
  const wanting = spaces.filter((s) => (s.counts[type] ?? 0) > 0); // M = 0 is excluded
  const ranked = wanting
    .filter(isReady)
    .sort((a, b) => b.counts[type] - a.counts[type] || b.total - a.total || byKo(a.name, b.name))
    .map((s, i) => ({
      slug: s.slug,
      name: s.name,
      neighborhood: s.neighborhood,
      district: s.district,
      rank: i + 1,
      total: s.total,
      count: s.counts[type],
      phrase: formatIntent(s.total, s.counts[type]),
    }));
  const pending = wanting.filter((s) => !isReady(s)).sort((a, b) => byKo(a.name, b.name)).map(pendingOf);
  return { ranked, pending };
}

export function listDistricts(spaces: SpaceTally[]): Array<{ district: string; count: number }> {
  const counts = new Map<string, number>();
  for (const s of spaces) if (s.district) counts.set(s.district, (counts.get(s.district) ?? 0) + 1);
  return [...counts]
    .map(([district, count]) => ({ district, count }))
    .sort((a, b) => b.count - a.count || byKo(a.district, b.district));
}

export type DistrictMatch = SpaceInfo & {
  total: number;
  top: { type: string; count: number };
  runners: Array<{ type: string; count: number }>;
  phrase: string;
};

export function recommendByDistrict(
  spaces: SpaceTally[],
  district: string,
): { ranked: DistrictMatch[]; pending: PendingSpace[] } {
  const inScope = spaces.filter((s) => district === ANY_DISTRICT || s.district === district);
  const ranked = inScope
    .filter(isReady)
    .map((s) => ({ s, types: typeRanking(s) }))
    .filter((x) => x.types.length > 0)
    .sort((a, b) => b.types[0].count - a.types[0].count || b.s.total - a.s.total || byKo(a.s.name, b.s.name))
    .map(({ s, types }) => ({
      slug: s.slug,
      name: s.name,
      neighborhood: s.neighborhood,
      district: s.district,
      total: s.total,
      top: types[0],
      runners: types.slice(1, 3),
      phrase: formatIntent(s.total, types[0].count),
    }));
  const pending = inScope.filter((s) => !isReady(s)).sort((a, b) => byKo(a.name, b.name)).map(pendingOf);
  return { ranked, pending };
}

// "더 보기" without extra requests: every card is rendered and CSS hides the
// overflow. Mobile shows 1 card, PC (md+) shows 3, until the button is pressed.
export function pageLayout(count: number, expanded: boolean) {
  const itemClass = (i: number) => {
    if (expanded || i === 0) return "";
    return i < 3 ? "hidden md:block" : "hidden";
  };
  let moreClass: string | null = null;
  if (!expanded) {
    if (count > 3) moreClass = "";
    else if (count > 1) moreClass = "md:hidden";
  }
  return { itemClass, moreClass };
}

export type FindState =
  | { step: "start" }
  | { step: "pick-type" }
  | { step: "type-results"; type: string }
  | { step: "pick-district" }
  | { step: "district-results"; district: string };

export function parseFindParams(params: URLSearchParams): FindState {
  const item = params.get("item");
  if (item === "yes") {
    const type = params.get("type") ?? "";
    return (BUSINESS_TYPES as readonly string[]).includes(type) ? { step: "type-results", type } : { step: "pick-type" };
  }
  if (item === "no") {
    const district = (params.get("district") ?? "").trim();
    if (district && district.length <= 20) return { step: "district-results", district };
    return { step: "pick-district" };
  }
  return { step: "start" };
}

// "아이스크림·디저트" reads better as "아이스크림" inside a headline.
export function headlineWord(type: string): string {
  return type.split("·")[0];
}

export function objectParticle(word: string): "을" | "를" {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return "를";
  return code % 28 === 0 ? "를" : "을";
}

// ?type= on /apply/:slug. Cards link with known types, but the URL is user
// input: trim, drop control characters, ignore anything over 40 chars (the apply form limit).
export function parseTypePrefill(raw: string | null): string {
  const value = (raw ?? "").replace(/\p{Cc}/gu, "").trim();
  return value.length > 40 ? "" : value;
}
