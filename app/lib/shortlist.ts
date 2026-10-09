// Owner-page shortlist: pure ranking of evaluated applications. Spec §5.
export const SHORTLIST_MIN_SCORE = 60;
export const SHORTLIST_MAX = 5;

export type ShortlistItem = { id: number; score: number | null; status: "pending" | "done" | "failed"; createdAt: number };

export function shortlist<T extends ShortlistItem>(items: T[]): T[] {
  return items
    .filter((i) => i.status === "done" && i.score !== null && i.score >= SHORTLIST_MIN_SCORE)
    .sort((a, b) => (b.score as number) - (a.score as number) || a.createdAt - b.createdAt || a.id - b.id)
    .slice(0, SHORTLIST_MAX);
}
