import { useEffect, useRef, useState, type CSSProperties } from "react";
import { clampTickerValue, digitsOf, tickerLabel } from "~/lib/ticker";

type Phase = "final" | "zero" | "roll";

/**
 * "final": server render / no JS / reduced motion, the end state is shown with no transition.
 * "zero": after hydration (motion allowed) reset without transition, waiting to enter the viewport.
 * "roll": entered the viewport once, transition to the end state.
 */
function useRollOnView<T extends Element>() {
  const ref = useRef<T>(null);
  const [phase, setPhase] = useState<Phase>("final");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setPhase("zero");
    let frame = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        // Two frames so the zero state is painted before the transition starts.
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => setPhase("roll"));
        });
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  return { ref, phase };
}

/**
 * Digits roll up from 0 once when scrolled into view. One fixed-width slot per digit so nothing
 * shakes while rolling. Screen readers get the real value and unit once; the reels are aria-hidden.
 */
export function NumberTicker({ value, unit, className }: { value: number; unit?: string; className?: string }) {
  const { ref, phase } = useRollOnView<HTMLSpanElement>();
  const v = clampTickerValue(value);
  let digitIndex = 0;
  return (
    <span ref={ref} className={`tk${className ? ` ${className}` : ""}`} data-phase={phase}>
      <span className="sr">{tickerLabel(v, unit)}</span>
      <span aria-hidden="true" className="tk-digits">
        {digitsOf(v).map((slot, i) => {
          if (slot.kind === "sep") {
            return (
              <span key={i} className="sep">
                ,
              </span>
            );
          }
          const style: CSSProperties = {
            transform: `translateY(-${phase === "zero" ? 0 : slot.digit}em)`,
            transitionDelay: phase === "roll" ? `${digitIndex * 90}ms` : undefined,
          };
          digitIndex += 1;
          return (
            <span key={i} className="slot">
              <span className="reel" style={style}>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
      {unit && (
        <span className="unit" aria-hidden="true">
          {unit}
        </span>
      )}
    </span>
  );
}

/** The `.prog` bar: grows 0 → value/max once when scrolled into view; final width without JS or with reduced motion. */
export function ProgressBar({ value, max, label, className }: { value: number; max: number; label: string; className?: string }) {
  const { ref, phase } = useRollOnView<HTMLDivElement>();
  const safeMax = max > 0 ? max : 1;
  const now = Math.min(Math.max(0, value), safeMax);
  const pct = (now / safeMax) * 100;
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuenow={now}
      aria-valuemax={safeMax}
      className={`prog${className ? ` ${className}` : ""}`}
      data-phase={phase}
    >
      <i style={{ width: phase === "zero" ? "0%" : `${pct}%` }} />
    </div>
  );
}
