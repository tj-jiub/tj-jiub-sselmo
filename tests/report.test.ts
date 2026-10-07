import { describe, expect, it } from "vitest";
import { aggregate, distribution, formatIntent, isPublicReady, PUBLIC_THRESHOLD } from "~/lib/report";
import { VISIT_TIME, type SurveyAnswers } from "~/lib/survey";

const a = (types: string[], other: string | null = null, visitTime = "lunch"): SurveyAnswers => ({
  businessTypes: types,
  businessTypeOther: other,
  visitFrequency: "weekly1",
  spendRange: "5to10k",
  visitTime,
  respondentType: "resident",
});

describe("report", () => {
  it("counts respondents per business type, most wanted first", () => {
    const r = aggregate([a(["카페", "분식"]), a(["카페"], "아이스크림집"), a(["분식", "카페"], null, "night")]);
    expect(r.total).toBe(3);
    expect(r.byType).toEqual([
      { type: "카페", count: 3 },
      { type: "분식", count: 2 },
    ]);
    expect(r.others).toEqual(["아이스크림집"]);
  });

  it("uses the exact required phrasing", () => {
    expect(formatIntent(60, 23)).toBe("응답자 60명 중 23명이 이용 의향");
  });

  it("opens the public summary at exactly 50 responses", () => {
    expect(PUBLIC_THRESHOLD).toBe(50);
    expect(isPublicReady(49)).toBe(false);
    expect(isPublicReady(50)).toBe(true);
  });

  it("tallies a question in option order, including zeros", () => {
    const d = distribution([a(["카페"]), a(["카페"], null, "night")], "visitTime", VISIT_TIME);
    expect(d).toEqual([
      { label: "오전", count: 0 },
      { label: "점심", count: 1 },
      { label: "오후", count: 0 },
      { label: "저녁", count: 0 },
      { label: "밤", count: 1 },
    ]);
  });
});
