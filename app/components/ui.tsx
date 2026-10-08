import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { Link, useNavigation } from "react-router";

/** The one headline highlight per screen. Never use it on numbers or body text. */
export function Hl({ children }: { children: ReactNode }) {
  return <mark className="hl">{children}</mark>;
}

export function NavBar() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between px-4 py-3.5 lg:px-12 lg:py-[18px]">
        <Link to="/" className="text-lg font-bold tracking-tight">
          썰모
        </Link>
        <nav className="flex gap-5 text-sm text-muted lg:gap-7">
          <Link to="/spaces" className="hover:text-ink">
            공실 찾기
          </Link>
          <Link to="/admin/login" className="hover:text-ink">
            관리자
          </Link>
        </nav>
      </div>
    </header>
  );
}

/**
 * Page frame. Narrow (single column) by default; `wide` opens up to ~1180px on PC.
 * `nav={false}` is for screens that bring their own top bar (admin) or stay minimal (QR survey).
 */
export function Shell({ children, wide = false, nav = true }: { children: ReactNode; wide?: boolean; nav?: boolean }) {
  return (
    <>
      {nav && <NavBar />}
      <main className={`mx-auto w-full px-4 py-8 lg:px-12 lg:py-14 ${wide ? "max-w-md lg:max-w-[1180px]" : "max-w-md lg:max-w-xl"}`}>
        {children}
      </main>
    </>
  );
}

/** Thin 1px card. `top` = best recommendation (green border), `selected` = yellow fill. */
export function Card({
  top,
  selected,
  className = "",
  children,
}: {
  top?: boolean;
  selected?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const tone = selected ? "border-yellow-deep bg-yellow" : top ? "border-green-deep bg-paper" : "border-line bg-paper";
  return <div className={`rounded-[14px] border p-4 lg:p-6 ${tone} ${className}`}>{children}</div>;
}

export function Title({
  eyebrow,
  children,
  sub,
  hero,
}: {
  eyebrow?: string;
  children: ReactNode;
  sub?: ReactNode;
  hero?: boolean;
}) {
  const size = hero ? "text-[26px] lg:text-h1 lg:tracking-[-0.03em]" : "text-[26px] lg:text-h2 lg:tracking-[-0.02em]";
  return (
    <header className="mb-8 lg:mb-10">
      {eyebrow && <p className="text-cap font-bold tracking-[0.12em] text-muted">{eyebrow}</p>}
      <h1 className={`mt-2 font-bold leading-[1.382] lg:leading-[1.2] ${size}`}>{children}</h1>
      {sub && <p className="mt-3 max-w-[34em] text-muted lg:text-[17px]">{sub}</p>}
    </header>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 border-b border-ink pb-2 text-sm font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function Question({
  label,
  hint,
  stack,
  children,
}: {
  label: string;
  hint?: string;
  /** Lay children out as a stack of blocks (category cards) instead of wrapping chips. */
  stack?: boolean;
  children: ReactNode;
}) {
  return (
    <fieldset className="mb-8">
      <legend className="font-bold">{label}</legend>
      {hint && <p className="mt-1 text-cap text-muted">{hint}</p>}
      <div className={stack ? "mt-3 grid gap-3" : "mt-3 flex flex-wrap gap-2.5"}>{children}</div>
    </fieldset>
  );
}

export function Choice(props: { type: "radio" | "checkbox"; name: string; value: string; label: string }) {
  return (
    <label className="cursor-pointer">
      <input type={props.type} name={props.name} value={props.value} className="peer sr-only" />
      <span className="flex min-h-12 items-center rounded-full border border-line bg-paper px-[18px] py-2 transition-colors peer-checked:border-yellow-deep peer-checked:bg-yellow peer-checked:font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
        {props.label}
      </span>
    </label>
  );
}

const fieldClass =
  "min-h-12 w-full rounded-[10px] border border-line bg-paper px-3.5 py-2.5 text-base focus:border-ink focus:outline-none";

export function TextInput({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="mb-5 block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input className={fieldClass} {...rest} />
    </label>
  );
}

export function TextArea({ label, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="mb-5 block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <textarea className={`${fieldClass} min-h-40`} {...rest} />
    </label>
  );
}

export function Consent(props: { name: string; label: string; detail?: string; required?: boolean }) {
  return (
    <label className="mb-3 flex cursor-pointer gap-3 rounded-[14px] border border-line p-4">
      <input type="checkbox" name={props.name} required={props.required} className="mt-1 size-5 shrink-0 accent-ink" />
      <span>
        <span className="text-sm font-medium">
          {props.required ? "[필수] " : "[선택] "}
          {props.label}
        </span>
        {props.detail && <span className="mt-1 block text-cap text-muted">{props.detail}</span>}
      </span>
    </label>
  );
}

/** Button styles shared by <button> and <Link>. Primary = yellow fill, ink text, ink border. */
const btnBase =
  "inline-flex min-h-12 items-center justify-center rounded-[10px] border px-[22px] py-3 text-center font-bold text-ink";
export const btnPrimary = `${btnBase} border-ink bg-yellow disabled:opacity-50`;
export const btnGhost = `${btnBase} border-ink bg-paper`;
/** Phones: full-width finger-size; PC: natural width. */
export const btnResponsive = "w-full lg:w-auto";
/** Compact variant for admin tables and toolbars. */
export const btnSmall =
  "inline-flex min-h-10 items-center justify-center rounded-[10px] border border-ink bg-yellow px-3.5 py-2 text-sm font-bold text-ink disabled:opacity-50";
export const btnSmallGhost = btnSmall.replace("bg-yellow", "bg-paper");

export function SubmitButton({ children }: { children: ReactNode }) {
  const busy = useNavigation().state === "submitting";
  return (
    <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
      {busy ? "보내는 중…" : children}
    </button>
  );
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-5 rounded-[10px] border border-ink bg-soft px-4 py-3 text-sm font-medium">
      {message}
    </p>
  );
}
