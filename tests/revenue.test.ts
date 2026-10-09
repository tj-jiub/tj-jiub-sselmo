import { describe, expect, it } from "vitest";
import { defaultMargin, estimateRevenue, spendMidpoint, visitsPerMonth } from "~/lib/revenue";
import type { SurveyAnswers } from "~/lib/survey";

const ans = (over: Partial<SurveyAnswers> = {}): SurveyAnswers => ({
  businessTypes: ["카페"],
  businessTypeOther: null,
  visitFrequency: "weekly1",
  spendRange: "5to10k",
  visitTime: "lunch",
  respondentType: "resident",
  ...over,
});

describe("constants", () => {
  it("maps frequency and spend to the spec table", () => {
    expect([visitsPerMonth("weekly3"), visitsPerMonth("weekly1"), visitsPerMonth("monthly"), visitsPerMonth("rarely")]).toEqual([13, 6, 2, 0.5]);
    expect([spendMidpoint("lt5k"), spendMidpoint("5to10k"), spendMidpoint("10to20k"), spendMidpoint("gt20k")]).toEqual([4000, 7500, 15000, 25000]);
    expect(visitsPerMonth("nope")).toBe(0);
  });
  it("has per-type default margins", () => {
    expect(defaultMargin("카페")).toBe(15);
    expect(defaultMargin("베이커리")).toBe(15);
    expect(defaultMargin("아이스크림·디저트")).toBe(18);
    expect(defaultMargin("분식")).toBe(12);
    expect(defaultMargin("반찬가게")).toBe(10);
    expect(defaultMargin("꽃집")).toBe(12);
    expect(defaultMargin("처음 보는 업종")).toBe(12);
  });
});

describe("estimateRevenue", () => {
  const ten = Array.from({ length: 10 }, () => ans());

  it("sums visits x spend over respondents who picked the type, range 0.7-1.3, rounded to 10만원", () => {
    // 10 x (6 x 7,500) = 450,000
    const e = estimateRevenue([...ten, ans({ businessTypes: ["분식"] })], "카페", { scaleFactor: 1, marginPct: null });
    expect(e.respondents).toBe(10);
    expect(e.baseRevenue).toBe(450_000);
    expect(e.revenue).toEqual({ low: 300_000, high: 600_000 });
    expect(e.marginPct).toBe(15);
    // 450,000 x 15% = 67,500 -> 0.7x = 47,250 -> 0, 1.3x = 87,750 -> 100,000
    expect(e.netProfit).toEqual({ low: 0, high: 100_000 });
  });

  it("applies scale factor and a space margin override", () => {
    const e = estimateRevenue(ten, "카페", { scaleFactor: 10, marginPct: 20 });
    expect(e.baseRevenue).toBe(4_500_000);
    expect(e.revenue).toEqual({ low: 3_200_000, high: 5_900_000 }); // 3.15M->3.2M, 5.85M->5.9M
    expect(e.marginPct).toBe(20);
    expect(e.scaleFactor).toBe(10);
    expect(e.netProfit.low).toBe(600_000); // 900,000 x 0.7 = 630,000
    expect(e.netProfit.high).toBe(1_200_000); // 1,170,000
  });

  it("returns zero respondents and zero revenue when nobody picked the type", () => {
    const e = estimateRevenue(ten, "꽃집", { scaleFactor: 1, marginPct: null });
    expect(e.respondents).toBe(0);
    expect(e.revenue).toEqual({ low: 0, high: 0 });
  });

  it("counts a respondent once even if the type is listed twice", () => {
    const e = estimateRevenue([ans({ businessTypes: ["카페", "카페"] })], "카페", { scaleFactor: 1, marginPct: null });
    expect(e.baseRevenue).toBe(45_000);
  });
});

import { matchBusinessType } from "~/lib/revenue";
describe("matchBusinessType", () => {
  it("maps free text to a surveyed type", () => {
    expect(matchBusinessType("카페")).toBe("카페");
    expect(matchBusinessType("젤라또 가게")).toBe("아이스크림·디저트");
    expect(matchBusinessType("수제 아이스크림집")).toBe("아이스크림·디저트");
    expect(matchBusinessType("베이커리 카페")).toBe("베이커리");
    expect(matchBusinessType("동네 반찬가게")).toBe("반찬가게");
    expect(matchBusinessType("무인 사진관")).toBeNull();
  });
});
