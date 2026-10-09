import { describe, expect, it } from "vitest";
import { consultingFee, FEE_RATE, parseConsultingMonth, parseEducatorLink } from "~/lib/consulting";

const f = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};

describe("consultingFee", () => {
  it("is 1% of revenue in a profit month", () => {
    expect(FEE_RATE).toBe(0.01);
    expect(consultingFee(10_000_000, 1_800_000)).toBe(100_000);
  });
  it("is 0 in a loss month and a break-even month", () => {
    expect(consultingFee(6_200_000, -400_000)).toBe(0);
    expect(consultingFee(6_200_000, 0)).toBe(0);
  });
  it("rounds to whole won", () => {
    expect(consultingFee(1_234_567, 1)).toBe(12_346);
  });
});

describe("parseConsultingMonth", () => {
  const ok = { month: "2026-12", revenueManwon: "1000", profitManwon: "180" };
  it("converts 만원 to won and computes the fee", () => {
    expect(parseConsultingMonth(f(ok))).toEqual({
      ok: true,
      value: { month: "2026-12", revenueKrw: 10_000_000, profitKrw: 1_800_000, feeKrw: 100_000 },
    });
  });
  it("accepts a negative profit and gives fee 0", () => {
    const r = parseConsultingMonth(f({ ...ok, profitManwon: "-40" }));
    expect(r).toEqual({ ok: true, value: { month: "2026-12", revenueKrw: 10_000_000, profitKrw: -400_000, feeKrw: 0 } });
  });
  it.each([
    ["bad month", { ...ok, month: "2026-13" }],
    ["month format", { ...ok, month: "202612" }],
    ["empty month", { ...ok, month: "" }],
    ["negative revenue", { ...ok, revenueManwon: "-5" }],
    ["fractional revenue", { ...ok, revenueManwon: "1.5" }],
    ["non numeric profit", { ...ok, profitManwon: "abc" }],
    ["empty profit", { ...ok, profitManwon: "" }],
    ["absurd revenue", { ...ok, revenueManwon: "99999999999" }],
  ])("rejects %s", (_n, o) => {
    expect(parseConsultingMonth(f(o)).ok).toBe(false);
  });
});

describe("parseEducatorLink", () => {
  it("parses a record", () => {
    expect(parseEducatorLink(f({ organization: "성동구 창업지원센터", educatorName: "박멘토", connectedOn: "2026-11-03" }))).toEqual({
      ok: true,
      value: { organization: "성동구 창업지원센터", educatorName: "박멘토", connectedOn: "2026-11-03" },
    });
  });
  it("rejects missing fields or bad dates", () => {
    expect(parseEducatorLink(f({ organization: "", educatorName: "박", connectedOn: "2026-11-03" })).ok).toBe(false);
    expect(parseEducatorLink(f({ organization: "x", educatorName: "박", connectedOn: "11/03" })).ok).toBe(false);
  });
});
