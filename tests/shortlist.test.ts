import { describe, expect, it } from "vitest";
import { SHORTLIST_MAX, SHORTLIST_MIN_SCORE, shortlist } from "~/lib/shortlist";

const item = (id: number, score: number | null, createdAt: number, status: "pending" | "done" | "failed" = "done") => ({
  id,
  score,
  status,
  createdAt,
});

describe("shortlist", () => {
  it("uses 60 and 5 as defaults", () => {
    expect([SHORTLIST_MIN_SCORE, SHORTLIST_MAX]).toEqual([60, 5]);
  });
  it("keeps only done items with score >= 60, best first", () => {
    const out = shortlist([item(1, 59, 1), item(2, 60, 2), item(3, 90, 3), item(4, 95, 4, "failed"), item(5, null, 5, "pending")]);
    expect(out.map((x) => x.id)).toEqual([3, 2]);
  });
  it("breaks ties by earliest application", () => {
    const out = shortlist([item(1, 70, 30), item(2, 70, 10), item(3, 70, 20)]);
    expect(out.map((x) => x.id)).toEqual([2, 3, 1]);
  });
  it("returns at most 5", () => {
    const many = Array.from({ length: 8 }, (_, i) => item(i + 1, 80 + i, i));
    const out = shortlist(many);
    expect(out).toHaveLength(5);
    expect(out[0].id).toBe(8);
  });
  it("does not mutate the input", () => {
    const input = [item(1, 70, 2), item(2, 80, 1)];
    shortlist(input);
    expect(input.map((x) => x.id)).toEqual([1, 2]);
  });
});
