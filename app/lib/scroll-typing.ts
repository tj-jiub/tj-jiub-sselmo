// Pure helpers behind the continuous pages (docs/mockup-v11.html): scroll-typed statement progress
// and the eased wheel step. DOM wiring lives in components/motion.tsx.

/** Typing runs while the block top travels from 85% to 35% of the viewport height (+60% of the block height). */
const START = 0.85;
const END = 0.35;

/** 0..1 progress of a block whose top edge is `top` px from the viewport top. */
export function scrollProgress(top: number, height: number, vh: number): number {
  const start = vh * START;
  const end = vh * END;
  const t = (start - top) / (start - end + height * 0.6);
  return Math.max(0, Math.min(1, t));
}

/** How many of `total` words are lit at progress `t`. */
export function litCount(t: number, total: number): number {
  return Math.max(0, Math.min(total, Math.round(t * total)));
}

/** Korean 어절 = whitespace-separated token. */
export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

export const WHEEL_LERP = 0.075;
export const WHEEL_DELTA = 0.7;

/** One animation frame of eased wheel scrolling. */
export function easedStep(current: number, target: number): number {
  const next = current + (target - current) * WHEEL_LERP;
  return Math.abs(target - next) < 0.5 ? target : next;
}

/** Wheel delta in pixels: Firefox/Windows report lines (mode 1) or pages (mode 2). */
export function wheelPixels(deltaY: number, deltaMode: number, vh: number): number {
  return deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * vh : deltaY;
}
