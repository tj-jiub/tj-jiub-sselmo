import { describe, expect, it } from "vitest";
import { clampTickerValue, digitsOf, tickerLabel } from "~/lib/ticker";

describe("digitsOf", () => {
  it("one slot per digit", () => {
    expect(digitsOf(0)).toEqual([{ kind: "digit", digit: 0 }]);
    expect(digitsOf(120)).toEqual([
      { kind: "digit", digit: 1 },
      { kind: "digit", digit: 2 },
      { kind: "digit", digit: 0 },
    ]);
  });
  it("adds static thousands separators", () => {
    expect(digitsOf(1234)).toEqual([
      { kind: "digit", digit: 1 },
      { kind: "sep" },
      { kind: "digit", digit: 2 },
      { kind: "digit", digit: 3 },
      { kind: "digit", digit: 4 },
    ]);
    expect(digitsOf(1234567).filter((s) => s.kind === "sep")).toHaveLength(2);
    expect(digitsOf(999).some((s) => s.kind === "sep")).toBe(false);
  });
  it("clamps bad input to a non-negative integer", () => {
    expect(digitsOf(-5)).toEqual([{ kind: "digit", digit: 0 }]);
    expect(digitsOf(Number.NaN)).toEqual([{ kind: "digit", digit: 0 }]);
    expect(digitsOf(12.9)).toEqual(digitsOf(12));
  });
});

describe("clampTickerValue", () => {
  it("floors and rejects non-finite or negative values", () => {
    expect(clampTickerValue(7.8)).toBe(7);
    expect(clampTickerValue(-1)).toBe(0);
    expect(clampTickerValue(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampTickerValue(Number.NaN)).toBe(0);
  });
});

describe("tickerLabel", () => {
  it("formats the screen-reader value with ko-KR grouping and the unit", () => {
    expect(tickerLabel(1234, "명")).toBe("1,234명");
    expect(tickerLabel(120)).toBe("120");
    expect(tickerLabel(5, "명의 후보")).toBe("5명의 후보");
    expect(tickerLabel(32, "/ 50명")).toBe("32 / 50명");
  });
});
