import type { ReactNode } from "react";
import { Link } from "react-router";
import { NumberTicker } from "~/components/NumberTicker";

/** Content frame inside the admin shell (the shell already provides the nav). */
export function AdminPage({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-[1100px] px-4 py-8 lg:px-10 lg:py-12">{children}</main>;
}

/** Big count on the 할 일 cards (rolling digits; final value without JS or with reduced motion). */
export function CountNumber({ value, unit }: { value: number; unit: string }) {
  return <NumberTicker value={value} unit={unit} className="text-[44px] font-medium" />;
}

export function Chip({ to, on, children }: { to: string; on: boolean; children: ReactNode }) {
  return (
    <Link
      to={to}
      aria-current={on ? "true" : undefined}
      className={`inline-flex min-h-10 items-center rounded-full border px-3.5 py-1.5 text-[15px] ${on ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink hover:border-ink"}`}
    >
      {children}
    </Link>
  );
}

/** The computed "다음 할 일" box; `children` are the real action buttons. */
export function NextBox({ title, hint, children }: { title: string; hint: string; children?: ReactNode }) {
  return (
    <section
      data-testid="next-action"
      className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-yellow-deep bg-[#fffbe6] px-5 py-4"
    >
      <div className="min-w-0">
        <p className="text-[17px] font-bold">다음 할 일: {title}</p>
        <p className="text-[15px] text-muted">{hint}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </section>
  );
}

/** Collapsible secondary section (native <details>, works without JS). */
export function Fold({ title, id, open, children }: { title: string; id?: string; open?: boolean; children: ReactNode }) {
  return (
    <details id={id} open={open} className="mb-4 rounded-[14px] border border-line bg-paper">
      <summary className="min-h-12 cursor-pointer px-4 py-3 text-base font-bold">{title}</summary>
      <div className="border-t border-line px-4 py-4">{children}</div>
    </details>
  );
}

export const adminDate = (ms: number) =>
  new Date(ms).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
