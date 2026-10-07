import type { Option, SurveyAnswers } from "./survey";

export const PUBLIC_THRESHOLD = 50;

export function aggregate(answers: SurveyAnswers[]) {
  const counts = new Map<string, number>();
  const others: string[] = [];
  for (const a of answers) {
    for (const t of a.businessTypes) counts.set(t, (counts.get(t) ?? 0) + 1);
    if (a.businessTypeOther) others.push(a.businessTypeOther);
  }
  const byType = [...counts]
    .map(([type, count]) => ({ type, count }))
    .sort((x, y) => y.count - x.count || x.type.localeCompare(y.type, "ko"));
  return { total: answers.length, byType, others };
}

// Fixed wording: never replace with visitor counts or other inflated claims.
export function formatIntent(total: number, count: number): string {
  return `응답자 ${total}명 중 ${count}명이 이용 의향`;
}

export function isPublicReady(total: number): boolean {
  return total >= PUBLIC_THRESHOLD;
}

export function distribution(
  answers: SurveyAnswers[],
  key: "visitFrequency" | "spendRange" | "visitTime" | "respondentType",
  options: Option[],
) {
  return options.map((o) => ({ label: o.label, count: answers.filter((a) => a[key] === o.value).length }));
}
