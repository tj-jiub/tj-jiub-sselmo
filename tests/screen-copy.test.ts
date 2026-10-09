import { describe, expect, it } from "vitest";
import { estimateBasis, recruitHeadline } from "../app/lib/screen-copy.ts";

describe("estimateBasis", () => {
  it("names the type, respondents, scale factor and margin", () => {
    expect(estimateBasis("아이스크림·디저트", { respondents: 100, scaleFactor: 1, marginPct: 18 })).toBe(
      "근거: 아이스크림·디저트를 고른 응답자 100명의 1회 지출과 방문 빈도, 환산 배수 1, 순이익률 18% 가정",
    );
  });
  it("uses the right object particle", () => {
    expect(estimateBasis("카페", { respondents: 3, scaleFactor: 1.5, marginPct: 15 })).toContain("카페를 고른");
    expect(estimateBasis("분식", { respondents: 3, scaleFactor: 1.5, marginPct: 12 })).toContain("분식을 고른");
  });
});

describe("recruitHeadline", () => {
  it("splits the headline around the highlighted word", () => {
    expect(recruitHeadline("아이스크림·디저트", 100)).toEqual({ before: "주민 100명이 ", word: "아이스크림", after: "을 원해요" });
    expect(recruitHeadline("카페", 7)).toEqual({ before: "주민 7명이 ", word: "카페", after: "를 원해요" });
  });
});
