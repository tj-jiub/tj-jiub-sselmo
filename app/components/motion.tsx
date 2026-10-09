// Shared layer for the continuous pages (docs/mockup-v11.html) and the one-question-per-screen
// steps (docs/mockup-v9-focus.html). Routes only assemble markup; all scroll behaviour lives in
// useContinuousPage / useFocusSteps and is driven by class names (.rv, .cp-row, .cp-card, [data-say]).
import { useEffect, useRef, type ElementType, type ReactNode } from "react";
import { Link } from "react-router";
import { easedStep, litCount, scrollProgress, splitWords, WHEEL_DELTA, wheelPixels } from "~/lib/scroll-typing";

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Reveal blocks once, slowly, when they enter the viewport. */
function setupReveal(root: HTMLElement): () => void {
  const els = [...root.querySelectorAll<HTMLElement>(".rv")];
  if (reducedMotion() || typeof IntersectionObserver === "undefined") {
    els.forEach((el) => el.classList.add("seen"));
    return () => {};
  }
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("seen");
          io.unobserve(e.target);
        }
      }),
    { threshold: 0.2 },
  );
  els.forEach((el) => io.observe(el));
  return () => io.disconnect();
}

/** Scroll-typed statement(s), focus rows and card dimming, all from one scroll listener. */
function setupScrollEffects(root: HTMLElement): () => void {
  const reduce = reducedMotion();
  const says = [...root.querySelectorAll<HTMLElement>("[data-say]")].map((el) => ({ el, words: [...el.querySelectorAll<HTMLElement>(".w")] }));
  const rows = [...root.querySelectorAll<HTMLElement>(".cp-row")];
  const cards = [...root.querySelectorAll<HTMLElement>(".cp-card")];
  function update() {
    const vh = innerHeight;
    for (const { el, words } of says) {
      const r = el.getBoundingClientRect();
      const lit = reduce ? words.length : litCount(scrollProgress(r.top, r.height, vh), words.length);
      words.forEach((w, i) => w.classList.toggle("lit", i < lit));
    }
    // Light the row nearest the middle of the screen.
    const mid = vh / 2;
    let best: HTMLElement | null = null;
    let bestD = Infinity;
    for (const r of rows) {
      const b = r.getBoundingClientRect();
      const d = Math.abs(b.top + b.height / 2 - mid);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    rows.forEach((r) => r.classList.toggle("focus", r === best && bestD < vh * 0.45));
    // Fade the lower part of cards that have another card stacked over them.
    cards.forEach((c, i) => {
      const next = cards[i + 1];
      c.classList.toggle("dim", !!next && next.getBoundingClientRect().top - c.getBoundingClientRect().top < 120);
    });
  }
  let frame = 0;
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(() => ((frame = 0), update()));
  };
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);
  update();
  return () => {
    cancelAnimationFrame(frame);
    removeEventListener("scroll", schedule);
    removeEventListener("resize", schedule);
  };
}

/** True when the wheel target sits inside an element that can scroll vertically by itself. */
function inScrollable(node: EventTarget | null): boolean {
  for (let el = node instanceof HTMLElement ? node : null; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) return true;
  }
  return false;
}

/** Eased wheel scrolling (touch and keyboard stay native). Only while the page is mounted. */
function setupSmoothWheel(): () => void {
  if (reducedMotion()) return () => {};
  let target = scrollY;
  let current = scrollY;
  let raf = 0;
  const max = () => document.documentElement.scrollHeight - innerHeight;
  const tick = () => {
    current = easedStep(current, target);
    scrollTo(0, current);
    raf = current === target ? 0 : requestAnimationFrame(tick);
  };
  const onWheel = (e: WheelEvent) => {
    // Leave pinch-zoom, horizontal gestures (macOS back/forward swipe) and nested scrollers alone.
    if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY) || inScrollable(e.target)) return;
    e.preventDefault();
    target = Math.max(0, Math.min(max(), target + wheelPixels(e.deltaY, e.deltaMode, innerHeight) * WHEEL_DELTA));
    if (!raf) raf = requestAnimationFrame(tick);
  };
  // Native scrolls (keyboard, touch, scrollbar drag, anchors) win: re-sync and stop the animation.
  const onScroll = () => {
    if (!raf || Math.abs(scrollY - current) > 2) {
      cancelAnimationFrame(raf);
      raf = 0;
      target = current = scrollY;
    }
  };
  addEventListener("wheel", onWheel, { passive: false });
  addEventListener("scroll", onScroll, { passive: true });
  return () => {
    cancelAnimationFrame(raf);
    removeEventListener("wheel", onWheel);
    removeEventListener("scroll", onScroll);
  };
}

export function useContinuousPage(ref: React.RefObject<HTMLElement | null>, opts: { smooth?: boolean } = {}) {
  const smooth = opts.smooth ?? true;
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    document.documentElement.dataset.ready = "1"; // tells the root fallback script that hydration worked
    const offs = [setupReveal(root), setupScrollEffects(root)];
    if (smooth) offs.push(setupSmoothWheel());
    return () => offs.forEach((off) => off());
  }, [ref, smooth]);
}

/** Wrapper for a continuous page: nav + sections. Pass `nav="minimal"` for outside viewers (owner). */
export function ContinuousPage({ children, nav = "full", smooth = true }: { children: ReactNode; nav?: "full" | "minimal"; smooth?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useContinuousPage(ref, { smooth });
  return (
    <div className="cp" ref={ref}>
      <header className="cp-nav">
        <div className="cp-wrap">
          <Link to="/" className="text-lg font-bold tracking-tight">
            쓸모
          </Link>
          {nav === "full" && (
            <nav>
              <Link to="/find">공실 찾기</Link>
              <Link to="/admin/login">관리자</Link>
            </nav>
          )}
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

/** Fade-up block; `delay` 0..3 staggers by 160ms. */
export function Reveal({ as, delay = 0, className = "", children, ...rest }: { as?: ElementType; delay?: 0 | 1 | 2 | 3; className?: string; children: ReactNode } & Record<string, unknown>) {
  const Tag = as ?? "div";
  return (
    <Tag className={`rv${delay ? ` d${delay}` : ""} ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}

/** Label with an optional mono number ("01" + "동네 수요"). Digits only are mono. */
export function Label({ n, children, className = "" }: { n?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`cp-label ${className}`.trim()}>
      {n && <span className="n">{n}</span>}
      {children}
    </div>
  );
}

/** Full-height hero whose bottom edge dissolves into the next block. */
export function Hero({ label, title, lead, meta }: { label: string; title: ReactNode; lead?: ReactNode; meta?: string[] }) {
  return (
    <section className="cp-hero">
      <div className="cp-wrap">
        <Reveal className="cp-label">{label}</Reveal>
        <Reveal as="h1" delay={1} style={{ marginTop: 16 }}>
          {title}
        </Reveal>
        {lead && (
          <Reveal as="p" delay={2} className="cp-p lead">
            {lead}
          </Reveal>
        )}
        {meta && meta.length > 0 && (
          <Reveal delay={3} className="meta">
            {meta.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </Reveal>
        )}
      </div>
    </section>
  );
}

/** Scroll-typed statement: words go from gray to ink as the block crosses the screen. */
export function Say({ label, text }: { label: string; text: string }) {
  const words = splitWords(text);
  return (
    <section className="cp-say">
      <div className="cp-wrap">
        <div className="cp-label">{label}</div>
        <p className="text" data-say>
          <span className="sr-only">{text}</span>
          <span aria-hidden="true">
            {words.map((w, i) => (
              <span key={i}>
                <span className="w">{w}</span>
                {i < words.length - 1 ? " " : ""}
              </span>
            ))}
          </span>
        </p>
      </div>
    </section>
  );
}

/** Sticky heading on the left, scrolling list on the right. */
export function SplitList({ n, label, title, text, children }: { n?: string; label: string; title: ReactNode; text?: ReactNode; children: ReactNode }) {
  return (
    <section className="cp-split">
      <div className="cp-wrap">
        <div className="side">
          <Reveal className="cp-label">
            {n && <span className="n">{n}</span>}
            {label}
          </Reveal>
          <Reveal as="h2" delay={1} style={{ marginTop: 12 }}>
            {title}
          </Reveal>
          {text && (
            <Reveal as="p" delay={2} className="cp-p">
              {text}
            </Reveal>
          )}
        </div>
        <div className="cp-rows">{children}</div>
      </div>
    </section>
  );
}

/** One list row; the one nearest the screen centre is lit and its bar animates to `pct`. */
export function FocusRow({ rank, title, phrase, pct, children }: { rank?: string; title: ReactNode; phrase?: ReactNode; pct?: number; children?: ReactNode }) {
  return (
    <div className="cp-row" style={pct != null ? ({ "--w": `${Math.max(0, Math.min(100, pct))}%` } as React.CSSProperties) : undefined}>
      {rank && <span className="rank">{rank}</span>}
      <h3>{title}</h3>
      {phrase && <div className="phrase">{phrase}</div>}
      {children}
      {pct != null && (
        <div className="cp-bar" aria-hidden="true">
          <i />
        </div>
      )}
    </div>
  );
}

/** Section of stacked sticky cards (use up to 3 <StackCard>). */
export function StackSection({ n, label, title, children }: { n?: string; label: string; title: ReactNode; children: ReactNode }) {
  return (
    <section className="cp-stack">
      <div className="cp-wrap">
        <div className="head">
          <Reveal className="cp-label">
            {n && <span className="n">{n}</span>}
            {label}
          </Reveal>
          <Reveal as="h2" delay={1}>
            {title}
          </Reveal>
        </div>
        <div className="cp-cards">{children}</div>
      </div>
    </section>
  );
}

export function StackCard({ tag, title, top, children }: { tag: string; title: ReactNode; top?: boolean; children: ReactNode }) {
  return (
    <article className={`cp-card${top ? " top" : ""}`}>
      <div>
        <div className="num-l">{tag}</div>
        <h3>{title}</h3>
      </div>
      <div>{children}</div>
    </article>
  );
}

/** Numbered list inside a card: hairlines, 19–22px, mono numbers. */
export function NumberedList({ items }: { items: ReactNode[] }) {
  return (
    <ul>
      {items.map((it, i) => (
        <li key={i}>
          <span className="n">{String(i + 1).padStart(2, "0")}</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

export function Stats({ items }: { items: Array<{ value: string; label: string }> }) {
  return (
    <section className="cp-stats">
      <div className="cp-wrap">
        {items.map((s) => (
          <div key={s.label}>
            <div className="cell">
              <b>{s.value}</b>
              <span>{s.label}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Cta({ n, label, title, text, to, action }: { n?: string; label: string; title: ReactNode; text?: ReactNode; to: string; action: string }) {
  return (
    <section className="cp-cta">
      <div className="cp-wrap">
        <Reveal className="cp-label">
          {n && <span className="n">{n}</span>}
          {label}
        </Reveal>
        <Reveal as="h2" delay={1}>
          {title}
        </Reveal>
        {text && (
          <Reveal as="p" delay={2} className="cp-p">
            {text}
          </Reveal>
        )}
        <Reveal delay={3}>
          <Link to={to} className="cp-btn">
            {action}
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

/** Fine print under the content (broker / AI-written notices). */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <section className="cp-notice">
      <div className="cp-wrap">
        <p>{children}</p>
      </div>
    </section>
  );
}

// ---- One question per screen (/find steps) ----

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Snap scroller with one 100dvh panel per question. Wheel gesture = one panel (~1.1s eased);
 * touch keeps native momentum + snap and only the focused panel is marked `.on`.
 */
export function FocusSteps({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = ref.current;
    if (!scroller) return;
    document.documentElement.dataset.ready = "1";
    let cancelled = false;
    const panels = [...scroller.querySelectorAll<HTMLElement>(".cp-panel")];
    const reduce = reducedMotion();
    const duration = reduce ? 0 : 1100;
    let index = 0;
    let busy = false;
    const mark = (i: number) => {
      index = i;
      panels.forEach((p, k) => p.classList.toggle("on", k === i));
    };
    const go = (i: number) => {
      i = Math.max(0, Math.min(panels.length - 1, i));
      if (i === index && !busy) return;
      busy = true;
      mark(i);
      const from = scroller.scrollTop;
      const to = panels[i].offsetTop - (scroller.clientHeight - panels[i].offsetHeight) / 2;
      if (!duration) {
        scroller.scrollTop = to;
        busy = false;
        return;
      }
      scroller.style.scrollSnapType = "none"; // snapping would fight the tween
      const start = performance.now();
      const step = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - start) / duration);
        scroller.scrollTop = from + (to - from) * easeInOut(t);
        if (t < 1) requestAnimationFrame(step);
        else {
          scroller.style.scrollSnapType = "";
          setTimeout(() => (busy = false), 600); // outlast trackpad inertia
        }
      };
      requestAnimationFrame(step);
    };
    let acc = 0;
    let timer: ReturnType<typeof setTimeout>;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (busy) return;
      acc += wheelPixels(e.deltaY, e.deltaMode, innerHeight);
      clearTimeout(timer);
      timer = setTimeout(() => (acc = 0), 180);
      if (Math.abs(acc) > 40) {
        const dir = Math.sign(acc);
        acc = 0;
        go(index + dir);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (["ArrowDown", "PageDown"].includes(e.key)) {
        e.preventDefault();
        if (!busy) go(index + 1);
      } else if (["ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        if (!busy) go(index - 1);
      }
    };
    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => entries.forEach((en) => !busy && en.isIntersecting && mark(panels.indexOf(en.target as HTMLElement))),
            { root: scroller, threshold: 0.6 },
          );
    panels.forEach((p) => io?.observe(p));
    scroller.addEventListener("wheel", onWheel, { passive: false });
    addEventListener("keydown", onKey);
    requestAnimationFrame(() => mark(0));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      io?.disconnect();
      scroller.removeEventListener("wheel", onWheel);
      removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <div className="cp-steps" ref={ref}>
      {children}
    </div>
  );
}

/** One question = one screen. Children get the staggered entrance (`.in`). */
export function StepPanel({ children }: { children: ReactNode }) {
  return (
    <section className="cp-panel">
      <div className="inner">{children}</div>
    </section>
  );
}
