import { describe, expect, it } from "vitest";
import { validateAiReport } from "~/lib/ai-report";

const good = {
  score: 82,
  verdict: "fit",
  summary: "주민이 원하는 업종이에요.",
  strengths: ["수요 일치"],
  risks: ["겨울 매출 감소"],
  sections: { demand_fit: "a", pricing: "b", hours: "c", cost_risk: "d", suggestions: "e" },
};

describe("validateAiReport", () => {
  it("accepts a valid report", () => {
    const r = validateAiReport(good);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.score).toBe(82);
  });
  it.each([
    ["score above 100", { ...good, score: 101 }],
    ["negative score", { ...good, score: -1 }],
    ["fractional score", { ...good, score: 80.5 }],
    ["string score", { ...good, score: "80" }],
    ["unknown verdict", { ...good, verdict: "great" }],
    ["summary over 300", { ...good, summary: "가".repeat(301) }],
    ["empty summary", { ...good, summary: "" }],
    ["4 strengths", { ...good, strengths: ["a", "b", "c", "d"] }],
    ["4 risks", { ...good, risks: ["a", "b", "c", "d"] }],
    ["non-string strength", { ...good, strengths: [1] }],
    ["missing section", { ...good, sections: { demand_fit: "a", pricing: "b", hours: "c", cost_risk: "d" } }],
    ["empty section", { ...good, sections: { ...good.sections, hours: "" } }],
    ["not an object", "hello"],
    ["null", null],
  ])("rejects %s", (_name, raw) => {
    expect(validateAiReport(raw).ok).toBe(false);
  });
  it("drops unknown keys and keeps notes if given", () => {
    const r = validateAiReport({ ...good, extra: 1, notes: ["첨부 제외"] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).not.toHaveProperty("extra");
      expect(r.value.notes).toEqual(["첨부 제외"]);
    }
  });
});
