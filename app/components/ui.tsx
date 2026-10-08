import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useNavigation } from "react-router";

export function Shell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={`mx-auto w-full px-4 py-8 ${wide ? "max-w-4xl" : "max-w-md"}`}>{children}</div>;
}

export function Title({ eyebrow, children, sub }: { eyebrow?: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-8">
      {eyebrow && <p className="text-xs font-semibold tracking-widest text-accent">{eyebrow}</p>}
      <h1 className="mt-2 text-2xl font-bold leading-snug">{children}</h1>
      {sub && <p className="mt-2 text-sm text-muted">{sub}</p>}
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

export function Question({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="mb-8">
      <legend className="font-semibold">{label}</legend>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

export function Choice(props: { type: "radio" | "checkbox"; name: string; value: string; label: string }) {
  return (
    <label className="cursor-pointer">
      <input type={props.type} name={props.name} value={props.value} className="peer sr-only" />
      <span className="block rounded-full border border-line px-4 py-2 text-sm transition-colors peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
        {props.label}
      </span>
    </label>
  );
}

const fieldClass =
  "w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-base focus:border-ink focus:outline-none";

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
    <label className="mb-3 flex cursor-pointer gap-3 rounded-lg border border-line p-4">
      <input type="checkbox" name={props.name} required={props.required} className="mt-0.5 size-4 shrink-0 accent-ink" />
      <span>
        <span className="text-sm font-medium">
          {props.required ? "[필수] " : "[선택] "}
          {props.label}
        </span>
        {props.detail && <span className="mt-1 block text-xs leading-relaxed text-muted">{props.detail}</span>}
      </span>
    </label>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  const busy = useNavigation().state === "submitting";
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded-lg bg-ink py-3.5 font-semibold text-paper disabled:opacity-50"
    >
      {busy ? "보내는 중…" : children}
    </button>
  );
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-5 rounded-lg border border-accent px-4 py-3 text-sm text-accent">
      {message}
    </p>
  );
}

// TEMP stubs on wip/matching only; worker 1's versions win on merge.
export function Hl({ children }: { children: ReactNode }) {
  return <mark className="bg-yellow text-ink">{children}</mark>;
}

export function Card({ top = false, selected = false, children }: { top?: boolean; selected?: boolean; children: ReactNode }) {
  const tone = top ? "border-green-deep" : selected ? "border-yellow-deep bg-yellow" : "border-line";
  return <div className={`rounded-xl border p-4 md:p-5 ${tone}`}>{children}</div>;
}
