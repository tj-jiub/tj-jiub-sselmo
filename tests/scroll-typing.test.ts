import { describe, expect, it } from "vitest";
import { litCount, scrollProgress, splitWords, easedStep, wheelPixels } from "~/lib/scroll-typing";

describe("scrollProgress(top, height, vh)", () => {
  const vh = 1000; // typing starts when the block top is at 85% of vh, ends around 35%
  it("is 0 while the block is still below the 85% line", () => {
    expect(scrollProgress(900, 200, vh)).toBe(0);
    expect(scrollProgress(850, 200, vh)).toBe(0);
  });
  it("is 1 once the block has crossed the 35% line (plus 60% of its height)", () => {
    expect(scrollProgress(350 - 120, 200, vh)).toBe(1);
    expect(scrollProgress(-500, 200, vh)).toBe(1);
  });
  it("rises monotonically in between", () => {
    const xs = [800, 700, 600, 500, 400, 300].map((top) => scrollProgress(top, 200, vh));
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    expect(xs[0]).toBeGreaterThan(0);
    expect(xs.at(-1)!).toBeLessThanOrEqual(1);
  });
  it("matches the mockup formula at a sample point", () => {
    // (850 - 600) / (850 - 350 + 120) = 250 / 620
    expect(scrollProgress(600, 200, vh)).toBeCloseTo(250 / 620, 10);
  });
});

describe("litCount", () => {
  it("rounds progress onto the word count and clamps", () => {
    expect(litCount(0, 10)).toBe(0);
    expect(litCount(0.5, 10)).toBe(5);
    expect(litCount(0.26, 10)).toBe(3);
    expect(litCount(1, 10)).toBe(10);
    expect(litCount(2, 10)).toBe(10);
    expect(litCount(-1, 10)).toBe(0);
  });
});

describe("splitWords", () => {
  it("splits Korean text on whitespace (어절) and drops empties", () => {
    expect(splitWords("  가게 앞  QR로\n모은 ")).toEqual(["가게", "앞", "QR로", "모은"]);
    expect(splitWords("")).toEqual([]);
  });
});

describe("easedStep (wheel lerp)", () => {
  it("moves a fraction of the remaining distance and snaps when close", () => {
    expect(easedStep(0, 100)).toBeCloseTo(7.5, 10);
    expect(easedStep(99.7, 100)).toBe(100);
    expect(easedStep(100, 100)).toBe(100);
  });
});

describe("wheelPixels", () => {
  it("normalises line and page wheel modes to pixels", () => {
    expect(wheelPixels(100, 0, 800)).toBe(100);
    expect(wheelPixels(3, 1, 800)).toBe(48);
    expect(wheelPixels(1, 2, 800)).toBe(800);
  });
});
