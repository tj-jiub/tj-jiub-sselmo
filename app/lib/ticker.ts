/** Pure helpers for the NumberTicker (no React, no browser APIs). */

export type TickerSlot = { kind: "digit"; digit: number } | { kind: "sep" };

/** Non-negative integer, anything else (NaN, Infinity, negative) becomes 0. */
export function clampTickerValue(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Slots left to right: a digit slot per digit and a static slot per thousands separator. */
export function digitsOf(n: number): TickerSlot[] {
  const text = String(clampTickerValue(n));
  const slots: TickerSlot[] = [];
  [...text].forEach((ch, i) => {
    if (i > 0 && (text.length - i) % 3 === 0) slots.push({ kind: "sep" });
    slots.push({ kind: "digit", digit: Number(ch) });
  });
  return slots;
}

/** What a screen reader hears: the real value (ko-KR grouping) followed by the unit. */
export function tickerLabel(n: number, unit = ""): string {
  const value = clampTickerValue(n).toLocaleString("ko-KR");
  return unit.startsWith("/") ? `${value} ${unit}` : `${value}${unit}`;
}
