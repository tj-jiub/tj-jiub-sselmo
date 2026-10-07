# Ssulmo Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working end-to-end mobile-web prototype: admin registers a vacant space → public QR survey collects demand → demand report (admin + public summary) → founders apply for free → admin writes a free review result and sends the result link by email by hand → founders may request paid written feedback (10,000원) → admin tracks payment/feedback and logs consented broker introductions.

**Screens:** approved mockup v3 at `docs/mockup.html` (https://claude.ai/artifact/GmnseCT3U36h2Zbw7xUmmr). Screen IDs P0–P9 / A1–A5 are referenced in tasks; match them.

**Architecture:** React Router v7 framework-mode app on Cloudflare Workers. All data access happens in server loaders/actions through small `*.server.ts` modules that take a `D1Database`; pure logic (validation, aggregation) lives in plain modules with no runtime imports so it is trivially unit-testable. Tests run in Node with a ~30-line D1 shim over `node:sqlite` that applies the real migration files.

**Tech Stack:** React Router 7.9, React 19, TypeScript 5.9, Tailwind 4, Vite 7, `@cloudflare/vite-plugin`, Wrangler 4, D1, R2, `qrcode` (browser), Vitest 4, Playwright (final e2e). Node 24 (has `node:sqlite` and TS type stripping).

**Spec:** `docs/spec.md`

**Project root:** `C:\notebook\ssulmo` (all paths below are relative to it). Use the Bash tool (Git Bash) for commands.

## Global Constraints

- Code, comments, commit messages: English. All user-facing UI text: Korean.
- Commit messages end with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Paid feedback is always named exactly `사업계획서 검토 및 피드백 서비스`, price 10,000원. Applying is free; no money copy on the apply page.
- Applicant contact is a single email address. The result page `/result/:token` has no login; the 128-bit token is the only key.
- Per-type report line is exactly `응답자 ${N}명 중 ${M}명이 이용 의향`. No visitor-count claims anywhere.
- Public summary threshold: total responses for the space `>= 50`; below it the page shows only `집계 중`.
- No rent / deposit / lease / contract-term fields or copy. No broker fee/commission fields or copy implying money to/from brokers.
- Survey, report, apply pages return 404 unless the space exists AND `owner_consent = 1`.
- Personal data (survey contacts, applicant contact/name, uploaded files) is rendered only under `/admin`.
- Uncertain legal/policy text is marked `TODO(legal)` in code; never invent a final answer.
- Survey wording is provisional and marked `TODO(survey)`.
- Design: mobile-first, monochrome (`ink #111`, `paper #fff`, `muted #6b6b6b`, `line #e6e6e6`) + one accent `#ff5a1f`. No gradients, no badges, no decoration.
- No payment gateway, no email sending (admin copies the result link and sends it by hand), no multi-admin.

## Review Focus

1. Visiting `/s/:slug`, `/r/:slug`, `/apply/:slug` for an unknown slug or a space without owner consent, or `/result/:token` with a wrong token → plain 404, nothing leaks. (Tests: Task 3 `getPublicSpace`, Task 6 `getResultByToken`, Task 8 e2e.)
2. Submitting the survey twice from the same browser within 24h (double tap, back button) → second attempt shows "이미 응답하셨어요", no second row. (Tests: Task 4 `saveResponse` cooldown, Task 8 e2e.)
3. Uploading a 20MB file or a `.exe` → Korean error, nothing written to R2 or DB. (Test: Task 3 `checkUpload`.)
4. Anonymous POST to an admin action or GET `/admin/files/*` → redirect to `/admin/login`, never data. (Test: Task 2 `requireAdmin`.)
5. Creating a broker-introduction log without introduction consent, or marking paid feedback paid/sent before the applicant requested it, even via a crafted POST or direct SQL → refused. (Tests: Task 7 `createBrokerIntro` + DB trigger, `saveFeedback`.)

---

### Task 1: Scaffold, D1/R2 bindings, schema, test harness

**Files:**
- Create (from template): `package.json`, `vite.config.ts`, `react-router.config.ts`, `tsconfig*.json`, `workers/app.ts`, `app/root.tsx`, `app/entry.server.tsx`
- Create: `wrangler.json` (replace template), `migrations/0001_init.sql`, `vitest.config.mts`, `tests/helpers/d1.ts`, `tests/schema.test.ts`, `.gitignore` additions, `app/lib/hex.ts`
- Delete: `app/welcome/`, template `app/routes/home.tsx` content

**Interfaces:**
- Produces: `createTestDb(): D1Database` (tests only); `toHex(buf: ArrayBuffer | Uint8Array): string`; tables `spaces`, `survey_responses`, `survey_contacts`, `applications`, `broker_intros`; env bindings `DB: D1Database`, `UPLOADS: R2Bucket`.

- [ ] **Step 1: Scaffold the template into a temp dir and copy it in** (the project dir already holds `docs/`)

```bash
cd /c/notebook
npx --yes create-react-router@latest .ssulmo-tmp --template remix-run/react-router-templates/cloudflare --no-install --no-git-init --yes
cp -rn .ssulmo-tmp/. ssulmo/
rm -rf .ssulmo-tmp ssulmo/app/welcome
# Template home.tsx imports app/welcome; stub it until Task 2 replaces it.
printf 'export default function Home() {\n  return null;\n}\n' > ssulmo/app/routes/home.tsx
cd ssulmo && npm install && npm install qrcode && npm install -D @types/qrcode vitest @playwright/test
git init -b main
```

- [ ] **Step 2: Replace `wrangler.json`**

```json
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "ssulmo",
  "main": "./workers/app.ts",
  "compatibility_date": "2025-10-08",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "upload_source_maps": true,
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "ssulmo",
      "database_id": "00000000-0000-0000-0000-000000000000",
      "migrations_dir": "migrations"
    }
  ],
  "r2_buckets": [{ "binding": "UPLOADS", "bucket_name": "ssulmo-uploads" }]
}
```

- [ ] **Step 3: Write `migrations/0001_init.sql`**

```sql
-- Timestamps are Unix epoch milliseconds. Booleans are 0/1 integers.

CREATE TABLE spaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_consent INTEGER NOT NULL DEFAULT 0 CHECK (owner_consent IN (0, 1)),
  consent_file_key TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE survey_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER NOT NULL REFERENCES spaces(id),
  answers TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX survey_responses_device ON survey_responses (space_id, device_hash, created_at);

-- Deliberately not linked to survey_responses: contact details are collected
-- separately from the answers and cannot be joined back to them.
CREATE TABLE survey_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER NOT NULL REFERENCES spaces(id),
  contact TEXT NOT NULL,
  privacy_consented_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER NOT NULL REFERENCES spaces(id),
  result_token TEXT NOT NULL UNIQUE,
  business_type TEXT NOT NULL,
  plan_text TEXT NOT NULL,
  plan_file_key TEXT,
  est_cost_manwon INTEGER NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  consent_privacy_at INTEGER NOT NULL,
  consent_intro_terms_at INTEGER NOT NULL,
  consent_broker_intro INTEGER NOT NULL DEFAULT 0 CHECK (consent_broker_intro IN (0, 1)),
  consent_broker_intro_at INTEGER,
  -- Free review result, shown at /result/:token.
  result_verdict TEXT CHECK (result_verdict IN ('fit', 'improve', 'rethink')),
  result_summary TEXT,
  result_sent INTEGER NOT NULL DEFAULT 0 CHECK (result_sent IN (0, 1)),
  reference_score INTEGER CHECK (reference_score BETWEEN 0 AND 100),
  -- Paid written feedback: exists only after the applicant requests it.
  feedback_requested_at INTEGER,
  consent_fee_terms_at INTEGER,
  payment_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (payment_confirmed IN (0, 1)),
  feedback TEXT,
  feedback_sent INTEGER NOT NULL DEFAULT 0 CHECK (feedback_sent IN (0, 1)),
  created_at INTEGER NOT NULL
);

-- No fee or commission columns by design.
CREATE TABLE broker_intros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id),
  broker_name TEXT NOT NULL,
  introduced_on TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Last line of defence: an introduction can never be logged without consent.
CREATE TRIGGER broker_intros_require_consent
BEFORE INSERT ON broker_intros
WHEN (SELECT consent_broker_intro FROM applications WHERE id = NEW.application_id) IS NOT 1
BEGIN
  SELECT RAISE(ABORT, 'broker introduction consent missing');
END;
```

- [ ] **Step 4: Write `app/lib/hex.ts`**

```ts
export function toHex(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex: string): Uint8Array {
  return new Uint8Array((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)));
}
```

- [ ] **Step 5: Write the test harness `tests/helpers/d1.ts` and `vitest.config.mts`**

```ts
// Minimal D1 stand-in over node:sqlite so server modules can be tested in
// Node against the real migration files. Covers only what the app uses:
// prepare().bind().first() / .all() / .run().
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Param = string | number | null;

export function createTestDb(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).sort()) {
    sqlite.exec(readFileSync(join(dir, file), "utf8"));
  }

  const statement = (sql: string, params: Param[]) => ({
    bind: (...next: Param[]) => statement(sql, next),
    first: async () => (sqlite.prepare(sql).get(...params) as unknown) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => {
      const r = sqlite.prepare(sql).run(...params);
      return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
    },
  });

  return { prepare: (sql: string) => statement(sql, []) } as unknown as D1Database;
}
```

`vitest.config.mts` (the `.mts` extension matters — a `.ts` config is loaded as CJS and silently ignored):

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { include: ["tests/**/*.test.ts"] },
});
```

- [ ] **Step 6: Write the failing schema test `tests/schema.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";

describe("schema", () => {
  it("creates every table", async () => {
    const db = createTestDb();
    const { results } = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual([
      "applications",
      "broker_intros",
      "spaces",
      "survey_contacts",
      "survey_responses",
    ]);
  });
});
```

- [ ] **Step 7: Add scripts to `package.json`** (keep template scripts, add/replace these)

```json
"test": "vitest run",
"db:migrate": "wrangler d1 migrations apply ssulmo --local",
"cf-typegen": "wrangler types && react-router typegen",
"typecheck": "npm run cf-typegen && tsc -b"
```

Append to `.gitignore`: `.dev.vars`, `.wrangler/`, `test-results/`, `playwright-report/`.

- [ ] **Step 8: Run tests and migration**

Run: `npm test` → Expected: 1 passed.
Run: `npm run db:migrate` → Expected: `0001_init.sql ✅`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold React Router Cloudflare app with D1 schema and test harness"
```

---

### Task 2: Admin authentication, layout, theme

**Files:**
- Create: `app/lib/auth.server.ts`, `scripts/hash-password.ts`, `app/components/ui.tsx`, `app/routes/admin-login.tsx`, `app/routes/admin-logout.tsx`, `app/routes/admin-layout.tsx`, `app/routes/admin-index.tsx` (placeholder list, filled in Tasks 3 and 7), `app/routes/home.tsx`, `.dev.vars.example`, `tests/auth.test.ts`
- Modify: `app/routes.ts`, `app/root.tsx`, `app/app.css`

**Interfaces:**
- Consumes: `toHex`, `fromHex` (Task 1)
- Produces:
  - `type AuthEnv = { ADMIN_EMAIL: string; ADMIN_PASSWORD_HASH: string; SESSION_SECRET: string }`
  - `hashPassword(password: string): Promise<string>` → `"pbkdf2:100000:<saltHex>:<hashHex>"`
  - `verifyPassword(password: string, stored: string): Promise<boolean>`
  - `login(request: Request, env: AuthEnv, email: string, password: string): Promise<Response | null>`
  - `isAdmin(request: Request, env: AuthEnv): Promise<boolean>`
  - `requireAdmin(request: Request, env: AuthEnv): Promise<void>` (throws `redirect("/admin/login")`)
  - `logout(request: Request, env: AuthEnv): Promise<Response>`
  - UI components: `Shell`, `Title`, `Question`, `Choice`, `TextInput`, `TextArea`, `Consent`, `SubmitButton`, `ErrorNote`, `Section`

- [ ] **Step 1: Write the failing test `tests/auth.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, isAdmin, login, requireAdmin, verifyPassword } from "~/lib/auth.server";

const env = {
  ADMIN_EMAIL: "admin@ssulmo.local",
  ADMIN_PASSWORD_HASH: "",
  SESSION_SECRET: "test-secret",
};

describe("auth", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse");
    expect(stored).toMatch(/^pbkdf2:100000:[0-9a-f]{32}:[0-9a-f]{64}$/);
    expect(await verifyPassword("correct horse", stored)).toBe(true);
    expect(await verifyPassword("wrong", stored)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  it("logs in with matching credentials and the cookie grants admin", async () => {
    const e = { ...env, ADMIN_PASSWORD_HASH: await hashPassword("pw") };
    const req = new Request("http://localhost/admin/login", { method: "POST" });
    expect(await login(req, e, "someone@else.com", "pw")).toBeNull();
    expect(await login(req, e, "admin@ssulmo.local", "nope")).toBeNull();

    const res = await login(req, e, " Admin@Ssulmo.local ", "pw");
    expect(res?.status).toBe(302);
    const cookie = res!.headers.get("Set-Cookie")!.split(";")[0];
    const authed = new Request("http://localhost/admin", { headers: { Cookie: cookie } });
    expect(await isAdmin(authed, e)).toBe(true);
  });

  it("redirects anonymous requests to the login page", async () => {
    const anon = new Request("http://localhost/admin/files/x", { method: "POST" });
    const thrown = await requireAdmin(anon, env).catch((r: Response) => r);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get("Location")).toBe("/admin/login");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/auth.test.ts` → Expected: FAIL, cannot resolve `~/lib/auth.server`.

- [ ] **Step 3: Implement `app/lib/auth.server.ts`**

```ts
import { createCookieSessionStorage, redirect } from "react-router";
import { fromHex, toHex } from "./hex";

// Cloudflare Workers caps PBKDF2 at 100k iterations.
const ITERATIONS = 100_000;

export type AuthEnv = { ADMIN_EMAIL: string; ADMIN_PASSWORD_HASH: string; SESSION_SECRET: string };

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

// ":" rather than "$" so the value survives .dev.vars / dotenv parsing.
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2:${ITERATIONS}:${toHex(salt)}:${toHex(await derive(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, saltHex, hashHex] = stored.split(":");
  if (scheme !== "pbkdf2" || !iterations || !saltHex || !hashHex) return false;
  const actual = toHex(await derive(password, fromHex(saltHex), Number(iterations)));
  if (actual.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ hashHex.charCodeAt(i);
  return diff === 0;
}

function sessions(request: Request, env: AuthEnv) {
  return createCookieSessionStorage({
    cookie: {
      name: "ssulmo_admin",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
      secure: new URL(request.url).protocol === "https:",
      secrets: [env.SESSION_SECRET],
    },
  });
}

export async function login(request: Request, env: AuthEnv, email: string, password: string): Promise<Response | null> {
  const emailOk = email.trim().toLowerCase() === env.ADMIN_EMAIL.trim().toLowerCase();
  const passwordOk = await verifyPassword(password, env.ADMIN_PASSWORD_HASH);
  if (!emailOk || !passwordOk) return null;
  const storage = sessions(request, env);
  const session = await storage.getSession();
  session.set("admin", true);
  return redirect("/admin", { headers: { "Set-Cookie": await storage.commitSession(session) } });
}

export async function isAdmin(request: Request, env: AuthEnv): Promise<boolean> {
  const session = await sessions(request, env).getSession(request.headers.get("Cookie"));
  return session.get("admin") === true;
}

// Call in every admin loader AND action: a parent layout loader does not run
// for actions or resource routes.
export async function requireAdmin(request: Request, env: AuthEnv): Promise<void> {
  if (!(await isAdmin(request, env))) throw redirect("/admin/login");
}

export async function logout(request: Request, env: AuthEnv): Promise<Response> {
  const storage = sessions(request, env);
  const session = await storage.getSession(request.headers.get("Cookie"));
  return redirect("/admin/login", { headers: { "Set-Cookie": await storage.destroySession(session) } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth.test.ts` → Expected: 3 passed.

- [ ] **Step 5: Password helper `scripts/hash-password.ts`** (runs via Node 24 type stripping)

```ts
// Usage: node scripts/hash-password.ts <password>
import { hashPassword } from "../app/lib/auth.server.ts";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.ts <password>");
  process.exit(1);
}
console.log(await hashPassword(password));
```

`auth.server.ts` imports `./hex` without an extension, which Node's stripper can't resolve. Change that import line to `import { fromHex, toHex } from "./hex.ts";` and set `"allowImportingTsExtensions": true` in `tsconfig.cloudflare.json` `compilerOptions` (it already has `noEmit`). Re-run `npx vitest run tests/auth.test.ts` → still passes.

Run: `node scripts/hash-password.ts ssulmo-dev` → prints `pbkdf2:100000:...`. Write `.dev.vars.example` with that output, then `cp .dev.vars.example .dev.vars`:

```
ADMIN_EMAIL=admin@ssulmo.local
# Dev-only password "ssulmo-dev". Generate your own: node scripts/hash-password.ts <password>
ADMIN_PASSWORD_HASH=<paste output>
SESSION_SECRET=dev-only-change-me
```

- [ ] **Step 6: Theme — replace `app/app.css`**

```css
@import "tailwindcss";

@theme {
  --color-ink: #111111;
  --color-paper: #ffffff;
  --color-muted: #6b6b6b;
  --color-line: #e6e6e6;
  --color-accent: #ff5a1f;
  --font-sans: "Pretendard Variable", Pretendard, system-ui, -apple-system, sans-serif;
}

html,
body {
  background: var(--color-paper);
  color: var(--color-ink);
}
```

- [ ] **Step 7: Replace `app/root.tsx`**

```tsx
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  {
    rel: "stylesheet",
    href: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css",
  },
];

export const meta: Route.MetaFunction = () => [{ title: "썰모" }];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="antialiased">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-dvh font-sans">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-xl font-bold">{notFound ? "페이지를 찾을 수 없어요" : "문제가 생겼어요"}</h1>
      <p className="mt-3 text-sm text-muted">
        {notFound ? "주소를 다시 확인해 주세요." : "잠시 후 다시 시도해 주세요."}
      </p>
    </div>
  );
}
```

- [ ] **Step 8: Shared UI `app/components/ui.tsx`**

```tsx
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
```

- [ ] **Step 9: Routes `app/routes.ts`** (later tasks' routes are registered now; create each as a stub `export default function X() { return null; }` so typegen succeeds — Tasks 3–7 replace them)

```ts
import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("spaces", "routes/spaces.tsx"),
  route("s/:slug", "routes/survey.tsx"),
  route("r/:slug", "routes/public-report.tsx"),
  route("apply/:slug", "routes/apply.tsx"),
  route("result/:token", "routes/result.tsx"),
  route("admin/login", "routes/admin-login.tsx"),
  route("admin/logout", "routes/admin-logout.tsx"),
  route("admin/files/*", "routes/admin-file.tsx"),
  layout("routes/admin-layout.tsx", [
    route("admin", "routes/admin-index.tsx"),
    route("admin/spaces/new", "routes/admin-space-new.tsx"),
    route("admin/spaces/:id", "routes/admin-space.tsx"),
    route("admin/applications/:id", "routes/admin-application.tsx"),
  ]),
] satisfies RouteConfig;
```

- [ ] **Step 10: `app/routes/home.tsx`** — role selection (mockup P0)

```tsx
import { Link } from "react-router";
import { Shell, Title } from "~/components/ui";

const roles = [
  { to: "/spaces", title: "창업하고 싶어요", desc: "모집 중인 공실을 보고 창업을 신청해요. 신청은 무료예요." },
  { to: "/admin/login", title: "관리자예요", desc: "공실 등록, 수요 리포트, 신청 검토" },
];

export default function Home() {
  return (
    <Shell>
      <Title eyebrow="SSULMO">비어 있는 가게 자리에 어떤 가게가 필요한지, 동네가 알려줘요</Title>
      <div className="mb-8 grid gap-2.5">
        {roles.map((r) => (
          <Link key={r.to} to={r.to} className="block rounded-xl border border-ink p-4 hover:bg-[#f6f6f6]">
            <span className="block font-bold">{r.title}</span>
            <span className="mt-0.5 block text-sm text-muted">{r.desc}</span>
          </Link>
        ))}
      </div>
      <p className="text-sm text-muted">동네 주민이라면 가게 앞에 붙은 QR을 찍어 의견을 남겨 주세요.</p>
    </Shell>
  );
}
```

- [ ] **Step 11: `app/routes/admin-login.tsx`**

```tsx
import { data, Form, redirect } from "react-router";
import type { Route } from "./+types/admin-login";
import { isAdmin, login } from "~/lib/auth.server";
import { ErrorNote, Shell, SubmitButton, TextInput, Title } from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  if (await isAdmin(request, context.cloudflare.env)) throw redirect("/admin");
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  const res = await login(request, context.cloudflare.env, String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (res) return res;
  return data({ error: "이메일 또는 비밀번호가 맞지 않아요." }, { status: 401 });
}

export default function AdminLogin({ actionData }: Route.ComponentProps) {
  return (
    <Shell>
      <Title eyebrow="ADMIN">관리자 로그인</Title>
      <Form method="post">
        <TextInput label="이메일" name="email" type="email" autoComplete="username" required />
        <TextInput label="비밀번호" name="password" type="password" autoComplete="current-password" required />
        <ErrorNote message={actionData?.error} />
        <SubmitButton>로그인</SubmitButton>
      </Form>
    </Shell>
  );
}
```

- [ ] **Step 12: `app/routes/admin-logout.tsx`**

```tsx
import type { Route } from "./+types/admin-logout";
import { logout } from "~/lib/auth.server";

export async function action({ request, context }: Route.ActionArgs) {
  return logout(request, context.cloudflare.env);
}
```

- [ ] **Step 13: `app/routes/admin-layout.tsx`**

```tsx
import { Form, Link, Outlet } from "react-router";
import type { Route } from "./+types/admin-layout";
import { requireAdmin } from "~/lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context.cloudflare.env);
  return null;
}

export default function AdminLayout() {
  return (
    <div>
      <nav className="border-b border-line">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 text-sm">
          <Link to="/admin" className="font-bold">
            썰모 관리자
          </Link>
          <Form method="post" action="/admin/logout">
            <button className="text-muted underline-offset-4 hover:underline">로그아웃</button>
          </Form>
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 14: Placeholder `app/routes/admin-index.tsx`** (Task 3 replaces)

```tsx
import type { Route } from "./+types/admin-index";
import { requireAdmin } from "~/lib/auth.server";
import { Shell, Title } from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context.cloudflare.env);
  return null;
}

export default function AdminIndex() {
  return (
    <Shell wide>
      <Title eyebrow="ADMIN">대시보드</Title>
    </Shell>
  );
}
```

- [ ] **Step 15: Verify**

Run: `npm run typecheck && npm test` → Expected: no type errors, all tests pass.
Run: `npm run dev`, open `http://localhost:5173/admin` → redirected to login; log in with `admin@ssulmo.local` / `ssulmo-dev` → "대시보드"; 로그아웃 → back to login.

- [ ] **Step 16: Commit**

```bash
git add -A
git commit -m "feat: single-admin email login with signed session cookie"
```

---

### Task 3: A — Space registration (admin) with consent gating and uploads

**Files:**
- Create: `app/lib/result.ts`, `app/lib/spaces.server.ts`, `app/lib/uploads.server.ts`, `app/routes/admin-space-new.tsx`, `app/routes/admin-file.tsx`, `tests/spaces.test.ts`, `tests/uploads.test.ts`
- Modify: `app/routes/admin-index.tsx` (list spaces), `app/routes/admin-space.tsx` (minimal detail + consent toggle; Task 5 adds the report)

**Interfaces:**
- Consumes: `requireAdmin`, UI components (Task 2); `createTestDb` (Task 1)
- Produces:
  - `type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }`
  - `type Space = { id: number; name: string; neighborhood: string; slug: string; owner_consent: number; consent_file_key: string | null; created_at: number }`
  - `parseSpaceForm(form: FormData): ParseResult<{ name: string; neighborhood: string; slug: string; ownerConsent: boolean }>`
  - `slugTaken(db: D1Database, slug: string): Promise<boolean>`
  - `createSpace(db, input: { name; neighborhood; slug; ownerConsent: boolean; consentFileKey: string | null }, now?: number): Promise<number>`
  - `setOwnerConsent(db, id: number, consent: boolean): Promise<void>`
  - `getSpace(db, id: number): Promise<Space | null>`
  - `getPublicSpace(db, slug: string): Promise<Space | null>` (null unless consent = 1)
  - `listSpaces(db): Promise<Array<Space & { response_count: number }>>`
  - `MAX_UPLOAD_BYTES = 10 * 1024 * 1024`; `checkUpload(value: FormDataEntryValue | null): ParseResult<File | null>`; `storeUpload(bucket: R2Bucket, prefix: string, file: File): Promise<string>`

- [ ] **Step 1: `app/lib/result.ts`**

```ts
export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };
```

- [ ] **Step 2: Write failing tests `tests/spaces.test.ts` and `tests/uploads.test.ts`**

```ts
// tests/spaces.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { createSpace, getPublicSpace, getSpace, listSpaces, parseSpaceForm, setOwnerConsent, slugTaken } from "~/lib/spaces.server";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("parseSpaceForm", () => {
  it("accepts a valid space and reads the consent checkbox", () => {
    const r = parseSpaceForm(form({ name: "망원 1층", neighborhood: "마포구 망원동", slug: "mangwon-01", ownerConsent: "on" }));
    expect(r).toEqual({ ok: true, value: { name: "망원 1층", neighborhood: "마포구 망원동", slug: "mangwon-01", ownerConsent: true } });
  });
  it("rejects bad slugs and missing fields", () => {
    expect(parseSpaceForm(form({ name: "a", neighborhood: "b", slug: "Bad Slug" })).ok).toBe(false);
    expect(parseSpaceForm(form({ name: "", neighborhood: "b", slug: "ok-slug" })).ok).toBe(false);
  });
});

describe("spaces repository", () => {
  it("hides spaces without owner consent from the public", async () => {
    const db = createTestDb();
    const id = await createSpace(db, { name: "A", neighborhood: "망원동", slug: "a-space", ownerConsent: false, consentFileKey: null });
    expect(await getSpace(db, id)).not.toBeNull();
    expect(await getPublicSpace(db, "a-space")).toBeNull();
    expect(await getPublicSpace(db, "nope")).toBeNull();

    await setOwnerConsent(db, id, true);
    expect((await getPublicSpace(db, "a-space"))?.id).toBe(id);
  });

  it("detects taken slugs and lists spaces with response counts", async () => {
    const db = createTestDb();
    await createSpace(db, { name: "A", neighborhood: "망원동", slug: "a-space", ownerConsent: true, consentFileKey: null });
    expect(await slugTaken(db, "a-space")).toBe(true);
    expect(await slugTaken(db, "b-space")).toBe(false);
    const spaces = await listSpaces(db);
    expect(spaces).toHaveLength(1);
    expect(spaces[0].response_count).toBe(0);
  });
});
```

```ts
// tests/uploads.test.ts
import { describe, expect, it } from "vitest";
import { checkUpload, MAX_UPLOAD_BYTES } from "~/lib/uploads.server";

const file = (name: string, size: number) => new File([new Uint8Array(size)], name);

describe("checkUpload", () => {
  it("treats a missing or empty file as no upload", () => {
    expect(checkUpload(null)).toEqual({ ok: true, value: null });
    expect(checkUpload(file("empty.pdf", 0))).toEqual({ ok: true, value: null });
  });
  it("accepts allowed document types", () => {
    for (const name of ["plan.pdf", "plan.HWP", "plan.hwpx", "plan.docx", "scan.jpg", "scan.png"]) {
      expect(checkUpload(file(name, 10)).ok).toBe(true);
    }
  });
  it("rejects other types and oversized files", () => {
    expect(checkUpload(file("virus.exe", 10)).ok).toBe(false);
    expect(checkUpload(file("noext", 10)).ok).toBe(false);
    expect(checkUpload(file("big.pdf", MAX_UPLOAD_BYTES + 1)).ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/spaces.test.ts tests/uploads.test.ts` → Expected: FAIL, modules not found.

- [ ] **Step 4: Implement `app/lib/spaces.server.ts`**

```ts
import type { ParseResult } from "./result";

export type Space = {
  id: number;
  name: string;
  neighborhood: string;
  slug: string;
  owner_consent: number;
  consent_file_key: string | null;
  created_at: number;
};

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export function parseSpaceForm(
  form: FormData,
): ParseResult<{ name: string; neighborhood: string; slug: string; ownerConsent: boolean }> {
  const name = String(form.get("name") ?? "").trim();
  const neighborhood = String(form.get("neighborhood") ?? "").trim();
  const slug = String(form.get("slug") ?? "").trim();
  if (!name || name.length > 60) return { ok: false, error: "공간 이름을 60자 이내로 적어 주세요." };
  if (!neighborhood || neighborhood.length > 60) return { ok: false, error: "동네를 적어 주세요. (예: 마포구 망원동)" };
  if (!SLUG_PATTERN.test(slug)) return { ok: false, error: "주소용 이름은 영문 소문자·숫자·하이픈 3~40자로 적어 주세요." };
  return { ok: true, value: { name, neighborhood, slug, ownerConsent: form.get("ownerConsent") === "on" } };
}

export async function slugTaken(db: D1Database, slug: string): Promise<boolean> {
  return (await db.prepare("SELECT 1 FROM spaces WHERE slug = ?").bind(slug).first()) !== null;
}

export async function createSpace(
  db: D1Database,
  input: { name: string; neighborhood: string; slug: string; ownerConsent: boolean; consentFileKey: string | null },
  now = Date.now(),
): Promise<number> {
  const res = await db
    .prepare(
      "INSERT INTO spaces (name, neighborhood, slug, owner_consent, consent_file_key, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(input.name, input.neighborhood, input.slug, input.ownerConsent ? 1 : 0, input.consentFileKey, now)
    .run();
  return res.meta.last_row_id;
}

export async function setOwnerConsent(db: D1Database, id: number, consent: boolean): Promise<void> {
  await db.prepare("UPDATE spaces SET owner_consent = ? WHERE id = ?").bind(consent ? 1 : 0, id).run();
}

export async function getSpace(db: D1Database, id: number): Promise<Space | null> {
  return db.prepare("SELECT * FROM spaces WHERE id = ?").bind(id).first<Space>();
}

// Public pages must use this: a space without building-owner consent does
// not exist as far as anonymous visitors are concerned.
export async function getPublicSpace(db: D1Database, slug: string): Promise<Space | null> {
  return db.prepare("SELECT * FROM spaces WHERE slug = ? AND owner_consent = 1").bind(slug).first<Space>();
}

export async function listSpaces(db: D1Database): Promise<Array<Space & { response_count: number }>> {
  const { results } = await db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM survey_responses r WHERE r.space_id = s.id) AS response_count
       FROM spaces s ORDER BY s.id DESC`,
    )
    .all<Space & { response_count: number }>();
  return results;
}
```

- [ ] **Step 5: Implement `app/lib/uploads.server.ts`**

```ts
import type { ParseResult } from "./result";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "docx", "hwp", "hwpx"];

const extensionOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

export function checkUpload(value: FormDataEntryValue | null): ParseResult<File | null> {
  if (!(value instanceof File) || value.size === 0) return { ok: true, value: null };
  if (!ALLOWED_EXTENSIONS.includes(extensionOf(value.name))) {
    return { ok: false, error: "PDF, 이미지, 한글, 워드 파일만 올릴 수 있어요." };
  }
  if (value.size > MAX_UPLOAD_BYTES) return { ok: false, error: "파일은 10MB 이하만 올릴 수 있어요." };
  return { ok: true, value };
}

// Keys are random so a leaked key reveals nothing; files are only ever served
// through the admin-only /admin/files route.
export async function storeUpload(bucket: R2Bucket, prefix: string, file: File): Promise<string> {
  const key = `${prefix}/${crypto.randomUUID()}.${extensionOf(file.name)}`;
  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  return key;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/spaces.test.ts tests/uploads.test.ts` → Expected: all pass.

- [ ] **Step 7: `app/routes/admin-space-new.tsx`**

```tsx
import { data, Form, redirect } from "react-router";
import type { Route } from "./+types/admin-space-new";
import { requireAdmin } from "~/lib/auth.server";
import { createSpace, parseSpaceForm, slugTaken } from "~/lib/spaces.server";
import { checkUpload, storeUpload } from "~/lib/uploads.server";
import { Consent, ErrorNote, Shell, SubmitButton, TextInput, Title } from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdmin(request, context.cloudflare.env);
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const form = await request.formData();

  const parsed = parseSpaceForm(form);
  if (!parsed.ok) return data({ error: parsed.error }, { status: 400 });
  const upload = checkUpload(form.get("consentFile"));
  if (!upload.ok) return data({ error: upload.error }, { status: 400 });
  // Check before uploading so a rejected form never leaves an orphan file.
  if (await slugTaken(env.DB, parsed.value.slug)) {
    return data({ error: "이미 쓰고 있는 주소용 이름이에요." }, { status: 400 });
  }

  const consentFileKey = upload.value ? await storeUpload(env.UPLOADS, "owner-consents", upload.value) : null;
  const id = await createSpace(env.DB, { ...parsed.value, consentFileKey });
  return redirect(`/admin/spaces/${id}`);
}

export default function AdminSpaceNew({ actionData }: Route.ComponentProps) {
  return (
    <Shell>
      <Title eyebrow="공간 등록" sub="임대료·보증금 등 계약 조건은 입력하지 않아요.">
        새 공실 등록
      </Title>
      <Form method="post" encType="multipart/form-data">
        <TextInput label="공간 이름" name="name" placeholder="예: 망원동 1층 코너 공실" required />
        <TextInput label="동네 (동 단위까지만)" name="neighborhood" placeholder="예: 마포구 망원동" required />
        <TextInput
          label="주소용 이름 (QR 링크에 쓰여요)"
          name="slug"
          placeholder="mangwon-01"
          pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]"
          required
        />
        <Consent
          name="ownerConsent"
          label="건물주 동의를 받았어요"
          detail="체크하지 않으면 설문·리포트·신청 링크가 공개되지 않아요. 나중에 공간 화면에서 바꿀 수 있어요."
        />
        {/* TODO(legal): confirm what form of building-owner consent is sufficient (written form, scope, retention). */}
        <label className="mb-6 block">
          <span className="mb-1.5 block text-sm font-medium">건물주 동의서 파일 (선택)</span>
          <input type="file" name="consentFile" accept=".pdf,.png,.jpg,.jpeg,.hwp,.hwpx,.docx" className="text-sm" />
        </label>
        <ErrorNote message={actionData?.error} />
        <SubmitButton>등록하기</SubmitButton>
      </Form>
    </Shell>
  );
}
```

- [ ] **Step 8: `app/routes/admin-file.tsx`**

```tsx
import type { Route } from "./+types/admin-file";
import { requireAdmin } from "~/lib/auth.server";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const key = params["*"];
  const object = key ? await env.UPLOADS.get(key) : null;
  if (!object) throw new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${key!.split("/").pop()}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
```

- [ ] **Step 9: Minimal `app/routes/admin-space.tsx`** (Task 5 extends it with the report and QR)

```tsx
import { Form, Link } from "react-router";
import type { Route } from "./+types/admin-space";
import { requireAdmin } from "~/lib/auth.server";
import { getSpace, setOwnerConsent } from "~/lib/spaces.server";
import { Section, Shell, Title } from "~/components/ui";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const space = await getSpace(env.DB, Number(params.id));
  if (!space) throw new Response("Not found", { status: 404 });
  return { space, origin: new URL(request.url).origin };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const form = await request.formData();
  if (form.get("intent") === "set-consent") {
    await setOwnerConsent(env.DB, Number(params.id), form.get("consent") === "1");
  }
  return null;
}

export default function AdminSpace({ loaderData }: Route.ComponentProps) {
  const { space, origin } = loaderData;
  const consented = space.owner_consent === 1;
  return (
    <Shell wide>
      <Title eyebrow={space.neighborhood}>{space.name}</Title>
      <Section title="건물주 동의">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p>
            {consented ? "동의 완료 — 링크가 공개돼 있어요." : "동의 전 — 설문·리포트·신청 링크가 모두 비공개예요."}
            {space.consent_file_key && (
              <>
                {" "}
                <a className="underline" href={`/admin/files/${space.consent_file_key}`}>
                  동의서 파일
                </a>
              </>
            )}
          </p>
          <Form method="post">
            <input type="hidden" name="intent" value="set-consent" />
            <input type="hidden" name="consent" value={consented ? "0" : "1"} />
            <button className="rounded-lg border border-ink px-3 py-1.5">
              {consented ? "동의 취소(비공개로)" : "동의 받음(공개하기)"}
            </button>
          </Form>
        </div>
      </Section>
      <Section title="링크">
        <ul className="space-y-1 text-sm break-all">
          <li>설문: {origin}/s/{space.slug}</li>
          <li>공개 요약: {origin}/r/{space.slug}</li>
          <li>창업 신청: {origin}/apply/{space.slug}</li>
        </ul>
      </Section>
      <Link to="/admin" className="text-sm text-muted underline">
        ← 목록으로
      </Link>
    </Shell>
  );
}
```

- [ ] **Step 10: Replace `app/routes/admin-index.tsx` with the space list** (Task 7 adds applications)

```tsx
import { Link } from "react-router";
import type { Route } from "./+types/admin-index";
import { requireAdmin } from "~/lib/auth.server";
import { listSpaces } from "~/lib/spaces.server";
import { Section, Shell, Title } from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  return { spaces: await listSpaces(env.DB) };
}

export default function AdminIndex({ loaderData }: Route.ComponentProps) {
  return (
    <Shell wide>
      <Title eyebrow="ADMIN">대시보드</Title>
      <Section title="공간">
        <ul className="divide-y divide-line text-sm">
          {loaderData.spaces.map((s) => (
            <li key={s.id}>
              <Link to={`/admin/spaces/${s.id}`} className="flex justify-between gap-3 py-3">
                <span>
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-2 text-muted">{s.neighborhood}</span>
                </span>
                <span className="shrink-0 text-muted">
                  응답 {s.response_count} · {s.owner_consent ? "공개" : "비공개"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Link to="/admin/spaces/new" className="mt-4 inline-block rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper">
          + 공간 등록
        </Link>
      </Section>
    </Shell>
  );
}
```

- [ ] **Step 11: Verify**

Run: `npm run typecheck && npm test` → all pass.
Manual: `npm run dev` → `/admin/spaces/new`, register without consent → detail shows "비공개"; `/s/<slug>` 404s (stub route still renders null for consented spaces; Task 4 fills it).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(A): admin space registration with owner-consent gating and R2 uploads"
```

---

### Task 4: B — Public QR demand survey `/s/:slug`

**Files:**
- Create: `app/lib/survey.ts`, `app/lib/surveys.server.ts`, `app/lib/device.server.ts`, `tests/survey.test.ts`, `tests/surveys.test.ts`
- Modify: `app/routes/survey.tsx` (replace stub)

**Interfaces:**
- Consumes: `getPublicSpace` (Task 3), `toHex` (Task 1), UI (Task 2)
- Produces:
  - `BUSINESS_TYPES: readonly string[]`, `OTHER = "기타"`, `VISIT_FREQUENCY`, `SPEND_RANGE`, `VISIT_TIME`, `RESPONDENT_TYPE: Option[]` where `type Option = { value: string; label: string }`
  - `type SurveyAnswers = { businessTypes: string[]; businessTypeOther: string | null; visitFrequency: string; spendRange: string; visitTime: string; respondentType: string }`
  - `parseSurvey(form: FormData): ParseResult<SurveyAnswers>`; `parseSurveyContact(form: FormData): ParseResult<string | null>`
  - `RESPONSE_COOLDOWN_MS`; `hashDeviceId(id: string): Promise<string>`; `saveResponse(db, spaceId, deviceHash, answers, now?): Promise<"saved" | "cooldown">`; `saveContact(db, spaceId, contact, now?): Promise<void>`; `listAnswers(db, spaceId): Promise<SurveyAnswers[]>`; `listContacts(db, spaceId): Promise<Array<{ contact: string; created_at: number }>>`
  - `getDeviceId(request: Request): Promise<{ id: string; setCookie: string | null }>`

- [ ] **Step 1: Write failing tests**

```ts
// tests/survey.test.ts
import { describe, expect, it } from "vitest";
import { parseSurvey, parseSurveyContact } from "~/lib/survey";

const base = { visitFrequency: "weekly1", spendRange: "5to10k", visitTime: "afternoon", respondentType: "resident" };

function form(types: string[], extra: Record<string, string> = {}) {
  const f = new FormData();
  for (const t of types) f.append("businessTypes", t);
  for (const [k, v] of Object.entries({ ...base, ...extra })) f.set(k, v);
  return f;
}

describe("parseSurvey", () => {
  it("accepts 1-3 business types", () => {
    const r = parseSurvey(form(["카페", "베이커리"]));
    expect(r).toEqual({ ok: true, value: { businessTypes: ["카페", "베이커리"], businessTypeOther: null, ...base } });
  });
  it("counts 기타 toward the limit and requires its text", () => {
    expect(parseSurvey(form(["카페", "기타"])).ok).toBe(false);
    const r = parseSurvey(form(["카페", "기타"], { businessTypeOther: " 아이스크림집 " }));
    expect(r.ok && r.value).toMatchObject({ businessTypes: ["카페"], businessTypeOther: "아이스크림집" });
    expect(parseSurvey(form(["카페", "베이커리", "분식", "기타"], { businessTypeOther: "x" })).ok).toBe(false);
  });
  it("rejects zero types, unknown values and missing answers", () => {
    expect(parseSurvey(form([])).ok).toBe(false);
    expect(parseSurvey(form(["없는업종"])).ok).toBe(false);
    expect(parseSurvey(form(["카페"], { visitTime: "" })).ok).toBe(false);
    expect(parseSurvey(form(["카페"], { respondentType: "alien" })).ok).toBe(false);
  });
});

describe("parseSurveyContact", () => {
  const f = (contact: string, consent: boolean) => {
    const d = new FormData();
    d.set("contact", contact);
    if (consent) d.set("contactConsent", "on");
    return d;
  };
  it("is optional", () => expect(parseSurveyContact(f("", false))).toEqual({ ok: true, value: null }));
  it("needs separate consent when given", () => {
    expect(parseSurveyContact(f("010-1234-5678", false)).ok).toBe(false);
    expect(parseSurveyContact(f("010-1234-5678", true))).toEqual({ ok: true, value: "010-1234-5678" });
  });
});
```

```ts
// tests/surveys.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { createSpace } from "~/lib/spaces.server";
import { hashDeviceId, listAnswers, listContacts, RESPONSE_COOLDOWN_MS, saveContact, saveResponse } from "~/lib/surveys.server";
import type { SurveyAnswers } from "~/lib/survey";

const answers: SurveyAnswers = {
  businessTypes: ["카페"],
  businessTypeOther: null,
  visitFrequency: "weekly1",
  spendRange: "5to10k",
  visitTime: "afternoon",
  respondentType: "resident",
};

async function setup() {
  const db = createTestDb();
  const a = await createSpace(db, { name: "A", neighborhood: "n", slug: "a-space", ownerConsent: true, consentFileKey: null });
  const b = await createSpace(db, { name: "B", neighborhood: "n", slug: "b-space", ownerConsent: true, consentFileKey: null });
  return { db, a, b };
}

describe("saveResponse", () => {
  it("allows one response per device per space per 24h", async () => {
    const { db, a, b } = await setup();
    const device = await hashDeviceId("device-1");
    const t0 = 1_700_000_000_000;
    expect(await saveResponse(db, a, device, answers, t0)).toBe("saved");
    expect(await saveResponse(db, a, device, answers, t0 + 1000)).toBe("cooldown");
    expect(await saveResponse(db, b, device, answers, t0 + 1000)).toBe("saved");
    expect(await saveResponse(db, a, await hashDeviceId("device-2"), answers, t0 + 1000)).toBe("saved");
    expect(await saveResponse(db, a, device, answers, t0 + RESPONSE_COOLDOWN_MS + 1)).toBe("saved");
    expect(await listAnswers(db, a)).toHaveLength(3);
  });

  it("hashes device ids rather than storing them", async () => {
    expect(await hashDeviceId("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores contacts separately from answers", async () => {
    const { db, a } = await setup();
    await saveContact(db, a, "010-0000-0000");
    expect((await listContacts(db, a)).map((c) => c.contact)).toEqual(["010-0000-0000"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/survey.test.ts tests/surveys.test.ts` → FAIL, modules not found.

- [ ] **Step 3: Implement `app/lib/survey.ts`** (no runtime imports — shared by browser, server and the seed script)

```ts
// TODO(survey): question wording and option lists are provisional and will be
// finalised with the founder (e.g. adding "왜 이 자리가 오래 비어 있을까요?").
// Answers are stored as JSON, so changing questions needs no migration.

export type Option = { value: string; label: string };

export const BUSINESS_TYPES = [
  "카페",
  "베이커리",
  "아이스크림·디저트",
  "분식",
  "반찬가게",
  "세탁소",
  "꽃집",
  "공방",
  "스터디카페",
  "필라테스·요가",
] as const;
export const OTHER = "기타";
export const MAX_BUSINESS_TYPES = 3;

export const VISIT_FREQUENCY: Option[] = [
  { value: "weekly3", label: "주 3회 이상" },
  { value: "weekly1", label: "주 1~2회" },
  { value: "monthly", label: "월 1~3회" },
  { value: "rarely", label: "가끔" },
];
export const SPEND_RANGE: Option[] = [
  { value: "lt5k", label: "5천원 미만" },
  { value: "5to10k", label: "5천~1만원" },
  { value: "10to20k", label: "1만~2만원" },
  { value: "gt20k", label: "2만원 이상" },
];
export const VISIT_TIME: Option[] = [
  { value: "morning", label: "오전" },
  { value: "lunch", label: "점심" },
  { value: "afternoon", label: "오후" },
  { value: "evening", label: "저녁" },
  { value: "night", label: "밤" },
];
export const RESPONDENT_TYPE: Option[] = [
  { value: "resident", label: "주민" },
  { value: "worker", label: "직장인" },
  { value: "student", label: "학생" },
  { value: "passerby", label: "지나가는 길" },
];

export type SurveyAnswers = {
  businessTypes: string[];
  businessTypeOther: string | null;
  visitFrequency: string;
  spendRange: string;
  visitTime: string;
  respondentType: string;
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseSurvey(form: FormData): Result<SurveyAnswers> {
  const picked = [...new Set(form.getAll("businessTypes").map(String))];
  const wantsOther = picked.includes(OTHER);
  const known = picked.filter((t) => (BUSINESS_TYPES as readonly string[]).includes(t));
  if (known.length + (wantsOther ? 1 : 0) !== picked.length) return { ok: false, error: "선택지를 다시 확인해 주세요." };
  if (picked.length < 1 || picked.length > MAX_BUSINESS_TYPES) return { ok: false, error: "업종은 1~3개 골라 주세요." };

  const otherText = String(form.get("businessTypeOther") ?? "").trim();
  if (wantsOther && !otherText) return { ok: false, error: "기타 업종을 적어 주세요." };
  if (otherText.length > 40) return { ok: false, error: "기타 업종은 40자 이내로 적어 주세요." };

  const pick = (name: string, options: Option[]) => {
    const v = String(form.get(name) ?? "");
    return options.some((o) => o.value === v) ? v : null;
  };
  const visitFrequency = pick("visitFrequency", VISIT_FREQUENCY);
  const spendRange = pick("spendRange", SPEND_RANGE);
  const visitTime = pick("visitTime", VISIT_TIME);
  const respondentType = pick("respondentType", RESPONDENT_TYPE);
  if (!visitFrequency || !spendRange || !visitTime || !respondentType) {
    return { ok: false, error: "모든 질문에 답해 주세요." };
  }

  return {
    ok: true,
    value: {
      businessTypes: known,
      businessTypeOther: wantsOther ? otherText : null,
      visitFrequency,
      spendRange,
      visitTime,
      respondentType,
    },
  };
}

// Contact is optional and consented to separately from the survey answers.
export function parseSurveyContact(form: FormData): Result<string | null> {
  const contact = String(form.get("contact") ?? "").trim();
  if (!contact) return { ok: true, value: null };
  if (contact.length > 100) return { ok: false, error: "연락처는 100자 이내로 적어 주세요." };
  if (form.get("contactConsent") !== "on") {
    return { ok: false, error: "연락처를 남기려면 개인정보 수집·이용에 동의해 주세요." };
  }
  return { ok: true, value: contact };
}
```

- [ ] **Step 4: Implement `app/lib/surveys.server.ts`**

```ts
import { toHex } from "./hex";
import type { SurveyAnswers } from "./survey";

export const RESPONSE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function hashDeviceId(id: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id)));
}

export async function saveResponse(
  db: D1Database,
  spaceId: number,
  deviceHash: string,
  answers: SurveyAnswers,
  now = Date.now(),
): Promise<"saved" | "cooldown"> {
  const recent = await db
    .prepare("SELECT 1 FROM survey_responses WHERE space_id = ? AND device_hash = ? AND created_at > ? LIMIT 1")
    .bind(spaceId, deviceHash, now - RESPONSE_COOLDOWN_MS)
    .first();
  if (recent) return "cooldown";
  await db
    .prepare("INSERT INTO survey_responses (space_id, answers, device_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(spaceId, JSON.stringify(answers), deviceHash, now)
    .run();
  return "saved";
}

export async function saveContact(db: D1Database, spaceId: number, contact: string, now = Date.now()): Promise<void> {
  await db
    .prepare("INSERT INTO survey_contacts (space_id, contact, privacy_consented_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(spaceId, contact, now, now)
    .run();
}

export async function listAnswers(db: D1Database, spaceId: number): Promise<SurveyAnswers[]> {
  const { results } = await db
    .prepare("SELECT answers FROM survey_responses WHERE space_id = ? ORDER BY id")
    .bind(spaceId)
    .all<{ answers: string }>();
  return results.map((r) => JSON.parse(r.answers) as SurveyAnswers);
}

export async function listContacts(db: D1Database, spaceId: number): Promise<Array<{ contact: string; created_at: number }>> {
  const { results } = await db
    .prepare("SELECT contact, created_at FROM survey_contacts WHERE space_id = ? ORDER BY id DESC")
    .bind(spaceId)
    .all<{ contact: string; created_at: number }>();
  return results;
}
```

- [ ] **Step 5: Implement `app/lib/device.server.ts`**

```ts
import { createCookie } from "react-router";

// Best-effort "one response per device": clearing cookies bypasses it, which
// is acceptable for the prototype.
const deviceCookie = createCookie("ssulmo_device", {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 400,
});

export async function getDeviceId(request: Request): Promise<{ id: string; setCookie: string | null }> {
  const existing = await deviceCookie.parse(request.headers.get("Cookie"));
  if (typeof existing === "string" && existing) return { id: existing, setCookie: null };
  const id = crypto.randomUUID();
  return { id, setCookie: await deviceCookie.serialize(id) };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/survey.test.ts tests/surveys.test.ts` → all pass.

- [ ] **Step 7: Replace `app/routes/survey.tsx`**

```tsx
import { data, Form, Link } from "react-router";
import type { Route } from "./+types/survey";
import { getPublicSpace } from "~/lib/spaces.server";
import {
  BUSINESS_TYPES,
  OTHER,
  parseSurvey,
  parseSurveyContact,
  RESPONDENT_TYPE,
  SPEND_RANGE,
  VISIT_FREQUENCY,
  VISIT_TIME,
} from "~/lib/survey";
import { hashDeviceId, saveContact, saveResponse } from "~/lib/surveys.server";
import { getDeviceId } from "~/lib/device.server";
import { CONSENTS } from "~/lib/policy";
import { Choice, Consent, ErrorNote, Question, Shell, SubmitButton, TextInput, Title } from "~/components/ui";

export const meta: Route.MetaFunction = ({ data }) => [{ title: data ? `${data.name} — 썰모 설문` : "썰모" }];

export async function loader({ params, context }: Route.LoaderArgs) {
  const space = await getPublicSpace(context.cloudflare.env.DB, params.slug);
  if (!space) throw new Response("Not found", { status: 404 });
  return { name: space.name, neighborhood: space.neighborhood, slug: space.slug };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const space = await getPublicSpace(env.DB, params.slug);
  if (!space) throw new Response("Not found", { status: 404 });

  const form = await request.formData();
  const parsed = parseSurvey(form);
  if (!parsed.ok) return data({ status: "error" as const, error: parsed.error }, { status: 400 });
  const contact = parseSurveyContact(form);
  if (!contact.ok) return data({ status: "error" as const, error: contact.error }, { status: 400 });

  const device = await getDeviceId(request);
  const result = await saveResponse(env.DB, space.id, await hashDeviceId(device.id), parsed.value);
  if (result === "saved" && contact.value) await saveContact(env.DB, space.id, contact.value);

  return data(
    { status: result, error: null },
    { headers: device.setCookie ? { "Set-Cookie": device.setCookie } : undefined },
  );
}

const options = (list: { value: string; label: string }[], name: string) =>
  list.map((o) => <Choice key={o.value} type="radio" name={name} value={o.value} label={o.label} />);

export default function Survey({ loaderData, actionData }: Route.ComponentProps) {
  const { name, neighborhood, slug } = loaderData;

  if (actionData?.status === "saved" || actionData?.status === "cooldown") {
    return (
      <Shell>
        <Title eyebrow={neighborhood}>
          {actionData.status === "saved" ? "응답이 저장됐어요. 고마워요!" : "이미 응답하셨어요."}
        </Title>
        <p className="text-sm leading-relaxed text-muted">
          {actionData.status === "saved"
            ? "응답이 50명 이상 모이면 결과를 공개해요."
            : "같은 기기에서는 24시간에 한 번 참여할 수 있어요."}
        </p>
        <Link to={`/r/${slug}`} className="mt-8 block rounded-lg border border-ink py-3.5 text-center font-semibold">
          결과 보러 가기
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <Title eyebrow={neighborhood} sub="30초면 끝나요. 이름은 묻지 않아요.">
        {name}에 어떤 가게가 생기면 좋을까요?
      </Title>
      <Form method="post">
        <Question label="생기면 이용할 가게" hint="최대 3개">
          {BUSINESS_TYPES.map((t) => (
            <Choice key={t} type="checkbox" name="businessTypes" value={t} label={t} />
          ))}
          <Choice type="checkbox" name="businessTypes" value={OTHER} label={OTHER} />
        </Question>
        <TextInput label="기타를 골랐다면 적어 주세요" name="businessTypeOther" maxLength={40} placeholder="예: 아이스크림집" />
        <Question label="얼마나 자주 갈 것 같나요?">{options(VISIT_FREQUENCY, "visitFrequency")}</Question>
        <Question label="한 번에 쓸 것 같은 금액">{options(SPEND_RANGE, "spendRange")}</Question>
        <Question label="주로 가는 시간대">{options(VISIT_TIME, "visitTime")}</Question>
        <Question label="나는">{options(RESPONDENT_TYPE, "respondentType")}</Question>

        <details className="mb-8 rounded-lg border border-line p-4">
          <summary className="cursor-pointer text-sm font-medium">가게가 생기면 소식 받기 (선택)</summary>
          <div className="mt-4">
            <TextInput label="연락처 (전화번호 또는 이메일)" name="contact" maxLength={100} />
            <Consent name="contactConsent" label={CONSENTS.surveyContact.label} detail={CONSENTS.surveyContact.detail} />
          </div>
        </details>

        <ErrorNote message={actionData?.error} />
        <SubmitButton>제출하기</SubmitButton>
      </Form>
    </Shell>
  );
}
```

This route imports `CONSENTS` from `~/lib/policy`, which Task 6 owns. Create it now with this content (Task 6 uses the same file unchanged):

```ts
// app/lib/policy.ts
// Fixed copy and policy values. Anything marked TODO(legal) must be reviewed
// before real users see it.

export const FEE_SERVICE_NAME = "사업계획서 검토 및 피드백 서비스";

// Paid written feedback, requested from the result page. Applying is free.
export const FEE_AMOUNT_KRW = 10000;
// TODO(legal): placeholder account — confirm before launch.
export const BANK_TRANSFER = { bank: "OO은행", account: "000-000000-00-000", holder: "썰모" };

export const CONSENTS = {
  // TODO(legal): purpose, items, retention period and destruction policy need review.
  surveyContact: {
    label: "개인정보 수집·이용 동의",
    detail: "수집 항목: 연락처 · 목적: 이 자리에 가게가 생기면 소식 전달 · 보유 기간: 목적 달성 후 즉시 파기",
  },
  // TODO(legal): purpose, items, retention period and destruction policy need review.
  privacy: {
    label: "개인정보 수집·이용 동의",
    detail: "수집 항목: 이름, 이메일, 사업계획 · 목적: 신청 검토 및 결과 안내 · 보유 기간: 검토 완료 후 1년",
  },
  // Collected on the result page when paid feedback is requested.
  // TODO(legal): confirm this wording fully covers the fee's nature.
  feeTerms: {
    label: `${FEE_SERVICE_NAME} 이용료예요`,
    detail: "임대차 계약 체결과 관계없으며, 입점이나 계약을 보장하지 않아요.",
  },
  // TODO(legal): confirm broker-introduction consent may be collected on this form.
  introTerms: {
    label: "중개사 소개는 별도 동의가 있을 때만 이뤄져요",
    detail: "아래 [선택] 항목에 동의하지 않으면 어떤 중개사에게도 신청 정보가 전달되지 않아요.",
  },
  brokerIntroOptIn: {
    label: "공인중개사 소개를 원해요",
    detail: "동의하면 이 공간을 담당하는 공인중개사에게 이름과 이메일을 전달할 수 있어요. 언제든 철회할 수 있어요.",
  },
} as const;
```

- [ ] **Step 8: Verify**

Run: `npm run typecheck && npm test` → all pass.
Manual: register a consented space, open `/s/<slug>` at 390px width → submit → "응답이 저장됐어요"; submit again → "이미 응답하셨어요".

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(B): public QR demand survey with 24h per-device limit and separate contact consent"
```

---

### Task 5: C — Demand report (admin) with QR download, public summary `/r/:slug`, space list `/spaces`

**Files:**
- Create: `app/lib/report.ts`, `app/components/QrDownload.tsx`, `tests/report.test.ts`
- Modify: `app/lib/spaces.server.ts` (add `listPublicSpaces`), `tests/spaces.test.ts` (append), `app/routes/admin-space.tsx` (add report, contacts, QR), `app/routes/public-report.tsx` (replace stub), `app/routes/spaces.tsx` (replace stub)

**Interfaces:**
- Consumes: `listAnswers`, `listContacts` (Task 4), option lists (Task 4), `getPublicSpace`, `getSpace` (Task 3)
- Produces:
  - `PUBLIC_THRESHOLD = 50`
  - `aggregate(answers: SurveyAnswers[]): { total: number; byType: Array<{ type: string; count: number }>; others: string[] }`
  - `formatIntent(total: number, count: number): string`
  - `isPublicReady(total: number): boolean`
  - `distribution(answers: SurveyAnswers[], key: "visitFrequency" | "spendRange" | "visitTime" | "respondentType", options: Option[]): Array<{ label: string; count: number }>`
  - `listPublicSpaces(db): Promise<Space[]>` (owner_consent = 1 only, newest first)

- [ ] **Step 1: Write failing test `tests/report.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { aggregate, distribution, formatIntent, isPublicReady, PUBLIC_THRESHOLD } from "~/lib/report";
import { VISIT_TIME, type SurveyAnswers } from "~/lib/survey";

const a = (types: string[], other: string | null = null, visitTime = "lunch"): SurveyAnswers => ({
  businessTypes: types,
  businessTypeOther: other,
  visitFrequency: "weekly1",
  spendRange: "5to10k",
  visitTime,
  respondentType: "resident",
});

describe("report", () => {
  it("counts respondents per business type, most wanted first", () => {
    const r = aggregate([a(["카페", "분식"]), a(["카페"], "아이스크림집"), a(["분식", "카페"], null, "night")]);
    expect(r.total).toBe(3);
    expect(r.byType).toEqual([
      { type: "카페", count: 3 },
      { type: "분식", count: 2 },
    ]);
    expect(r.others).toEqual(["아이스크림집"]);
  });

  it("uses the exact required phrasing", () => {
    expect(formatIntent(60, 23)).toBe("응답자 60명 중 23명이 이용 의향");
  });

  it("opens the public summary at exactly 50 responses", () => {
    expect(PUBLIC_THRESHOLD).toBe(50);
    expect(isPublicReady(49)).toBe(false);
    expect(isPublicReady(50)).toBe(true);
  });

  it("tallies a question in option order, including zeros", () => {
    const d = distribution([a(["카페"]), a(["카페"], null, "night")], "visitTime", VISIT_TIME);
    expect(d).toEqual([
      { label: "오전", count: 0 },
      { label: "점심", count: 1 },
      { label: "오후", count: 0 },
      { label: "저녁", count: 0 },
      { label: "밤", count: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/report.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement `app/lib/report.ts`**

```ts
import type { Option, SurveyAnswers } from "./survey";

export const PUBLIC_THRESHOLD = 50;

export function aggregate(answers: SurveyAnswers[]) {
  const counts = new Map<string, number>();
  const others: string[] = [];
  for (const a of answers) {
    for (const t of a.businessTypes) counts.set(t, (counts.get(t) ?? 0) + 1);
    if (a.businessTypeOther) others.push(a.businessTypeOther);
  }
  const byType = [...counts]
    .map(([type, count]) => ({ type, count }))
    .sort((x, y) => y.count - x.count || x.type.localeCompare(y.type, "ko"));
  return { total: answers.length, byType, others };
}

// Fixed wording: never replace with visitor counts or other inflated claims.
export function formatIntent(total: number, count: number): string {
  return `응답자 ${total}명 중 ${count}명이 이용 의향`;
}

export function isPublicReady(total: number): boolean {
  return total >= PUBLIC_THRESHOLD;
}

export function distribution(
  answers: SurveyAnswers[],
  key: "visitFrequency" | "spendRange" | "visitTime" | "respondentType",
  options: Option[],
) {
  return options.map((o) => ({ label: o.label, count: answers.filter((a) => a[key] === o.value).length }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/report.test.ts` → 4 passed.

- [ ] **Step 5: `app/components/QrDownload.tsx`** (generated in the browser; no image endpoint needed)

```tsx
import { useEffect, useState } from "react";

export function QrDownload({ url, filename }: { url: string; filename: string }) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    import("qrcode")
      .then((m) => m.default.toDataURL(url, { width: 1024, margin: 2 }))
      .then((dataUrl) => alive && setHref(dataUrl));
    return () => {
      alive = false;
    };
  }, [url]);

  if (!href) return <span className="text-sm text-muted">QR 만드는 중…</span>;
  return (
    <div className="flex items-center gap-4">
      <img src={href} alt={`${url} QR 코드`} className="size-28 border border-line" />
      <a href={href} download={filename} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper">
        QR 이미지 받기 (PNG)
      </a>
    </div>
  );
}
```

- [ ] **Step 6: Extend `app/routes/admin-space.tsx`** — replace the loader and component (action unchanged)

```tsx
import { Form, Link } from "react-router";
import type { Route } from "./+types/admin-space";
import { requireAdmin } from "~/lib/auth.server";
import { getSpace, setOwnerConsent } from "~/lib/spaces.server";
import { listAnswers, listContacts } from "~/lib/surveys.server";
import { aggregate, distribution, formatIntent, PUBLIC_THRESHOLD } from "~/lib/report";
import { RESPONDENT_TYPE, SPEND_RANGE, VISIT_FREQUENCY, VISIT_TIME } from "~/lib/survey";
import { QrDownload } from "~/components/QrDownload";
import { Section, Shell, Title } from "~/components/ui";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const space = await getSpace(env.DB, Number(params.id));
  if (!space) throw new Response("Not found", { status: 404 });
  const answers = await listAnswers(env.DB, space.id);
  return {
    space,
    origin: new URL(request.url).origin,
    report: aggregate(answers),
    breakdowns: [
      { title: "방문 빈도", rows: distribution(answers, "visitFrequency", VISIT_FREQUENCY) },
      { title: "1회 지출", rows: distribution(answers, "spendRange", SPEND_RANGE) },
      { title: "방문 시간대", rows: distribution(answers, "visitTime", VISIT_TIME) },
      { title: "응답자 유형", rows: distribution(answers, "respondentType", RESPONDENT_TYPE) },
    ],
    contacts: await listContacts(env.DB, space.id),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const form = await request.formData();
  if (form.get("intent") === "set-consent") {
    await setOwnerConsent(env.DB, Number(params.id), form.get("consent") === "1");
  }
  return null;
}

export default function AdminSpace({ loaderData }: Route.ComponentProps) {
  const { space, origin, report, breakdowns, contacts } = loaderData;
  const consented = space.owner_consent === 1;
  const surveyUrl = `${origin}/s/${space.slug}`;

  return (
    <Shell wide>
      <Title eyebrow={space.neighborhood}>{space.name}</Title>

      <Section title="건물주 동의">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p>
            {consented ? "동의 완료 — 링크가 공개돼 있어요." : "동의 전 — 설문·리포트·신청 링크가 모두 비공개예요."}
            {space.consent_file_key && (
              <>
                {" "}
                <a className="underline" href={`/admin/files/${space.consent_file_key}`}>
                  동의서 파일
                </a>
              </>
            )}
          </p>
          <Form method="post">
            <input type="hidden" name="intent" value="set-consent" />
            <input type="hidden" name="consent" value={consented ? "0" : "1"} />
            <button className="rounded-lg border border-ink px-3 py-1.5">
              {consented ? "동의 취소(비공개로)" : "동의 받음(공개하기)"}
            </button>
          </Form>
        </div>
      </Section>

      <Section title="QR · 링크">
        <QrDownload url={surveyUrl} filename={`ssulmo-${space.slug}.png`} />
        <ul className="mt-4 space-y-1 text-sm break-all">
          <li>설문: {surveyUrl}</li>
          <li>공개 요약: {origin}/r/{space.slug}</li>
          <li>창업 신청: {origin}/apply/{space.slug}</li>
        </ul>
      </Section>

      <Section title={`수요 리포트 · 응답 ${report.total}건`}>
        {report.total < PUBLIC_THRESHOLD && (
          <p className="mb-3 text-xs text-muted">
            공개 요약은 응답 {PUBLIC_THRESHOLD}건부터 열려요. (현재 {report.total}건)
          </p>
        )}
        <ul className="divide-y divide-line text-sm">
          {report.byType.map((s) => (
            <li key={s.type} className="flex justify-between gap-3 py-2.5">
              <span className="font-medium">{s.type}</span>
              <span>{formatIntent(report.total, s.count)}</span>
            </li>
          ))}
        </ul>
        {report.others.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-xs font-semibold text-muted">기타 응답 (원문)</h3>
            <ul className="flex flex-wrap gap-2 text-sm">
              {report.others.map((o, i) => (
                <li key={i} className="rounded-full border border-line px-3 py-1">
                  {o}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {breakdowns.map((b) => (
            <div key={b.title}>
              <h3 className="mb-2 text-xs font-semibold text-muted">{b.title}</h3>
              <ul className="text-sm">
                {b.rows.map((r) => (
                  <li key={r.label} className="flex justify-between py-1">
                    <span>{r.label}</span>
                    <span className="tabular-nums">{r.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section title={`소식 받기 연락처 ${contacts.length}건 (개인정보)`}>
        <ul className="text-sm">
          {contacts.map((c, i) => (
            <li key={i} className="py-1">
              {c.contact}
            </li>
          ))}
        </ul>
      </Section>

      <Link to="/admin" className="text-sm text-muted underline">
        ← 목록으로
      </Link>
    </Shell>
  );
}
```

- [ ] **Step 7: Replace `app/routes/public-report.tsx`**

```tsx
import { Link } from "react-router";
import type { Route } from "./+types/public-report";
import { getPublicSpace } from "~/lib/spaces.server";
import { listAnswers } from "~/lib/surveys.server";
import { aggregate, formatIntent, isPublicReady } from "~/lib/report";
import { Shell, Title } from "~/components/ui";

export async function loader({ params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const space = await getPublicSpace(env.DB, params.slug);
  if (!space) throw new Response("Not found", { status: 404 });
  const report = aggregate(await listAnswers(env.DB, space.id));
  const header = { name: space.name, neighborhood: space.neighborhood, slug: space.slug };
  // Below the threshold, send nothing but the header — not even the count.
  if (!isPublicReady(report.total)) return { ...header, lines: null };
  return {
    ...header,
    lines: report.byType.map((s) => ({ type: s.type, text: formatIntent(report.total, s.count) })),
  };
}

export default function PublicReport({ loaderData }: Route.ComponentProps) {
  const { name, neighborhood, slug, lines } = loaderData;
  return (
    <Shell>
      <Title eyebrow={neighborhood}>{name}, 동네가 원하는 가게</Title>
      {lines === null ? (
        <p className="py-16 text-center text-lg font-semibold">집계 중</p>
      ) : (
        <ul className="divide-y divide-line">
          {lines.map((l) => (
            <li key={l.type} className="py-4">
              <p className="font-semibold">{l.type}</p>
              <p className="mt-1 text-sm text-muted">{l.text}</p>
            </li>
          ))}
        </ul>
      )}
      <Link to={`/apply/${slug}`} className="mt-10 block rounded-lg bg-ink py-3.5 text-center font-semibold text-paper">
        이 자리에 창업 신청하기
      </Link>
    </Shell>
  );
}
```

- [ ] **Step 7b: Space list for founders (mockup P0-1)**

Append to `tests/spaces.test.ts` (merge the import into the existing one):

```ts
import { listPublicSpaces } from "~/lib/spaces.server";

describe("listPublicSpaces", () => {
  it("lists only consented spaces", async () => {
    const db = createTestDb();
    await createSpace(db, { name: "공개", neighborhood: "n", slug: "open-one", ownerConsent: true, consentFileKey: null });
    await createSpace(db, { name: "비공개", neighborhood: "n", slug: "hidden-one", ownerConsent: false, consentFileKey: null });
    expect((await listPublicSpaces(db)).map((s) => s.slug)).toEqual(["open-one"]);
  });
});
```

Run `npx vitest run tests/spaces.test.ts` → FAIL (not exported). Append to `app/lib/spaces.server.ts`:

```ts
export async function listPublicSpaces(db: D1Database): Promise<Space[]> {
  const { results } = await db.prepare("SELECT * FROM spaces WHERE owner_consent = 1 ORDER BY id DESC").all<Space>();
  return results;
}
```

Run again → PASS. Replace `app/routes/spaces.tsx`:

```tsx
import { Link } from "react-router";
import type { Route } from "./+types/spaces";
import { listPublicSpaces } from "~/lib/spaces.server";
import { listAnswers } from "~/lib/surveys.server";
import { aggregate, isPublicReady } from "~/lib/report";
import { Shell, Title } from "~/components/ui";

export const meta: Route.MetaFunction = () => [{ title: "공실 고르기 — 썰모" }];

export async function loader({ context }: Route.LoaderArgs) {
  const db = context.cloudflare.env.DB;
  const spaces = await listPublicSpaces(db);
  return {
    spaces: await Promise.all(
      spaces.map(async (s) => {
        const report = aggregate(await listAnswers(db, s.id));
        const ready = isPublicReady(report.total);
        // Below the threshold, expose neither the count nor the ranking.
        return {
          slug: s.slug,
          name: s.name,
          neighborhood: s.neighborhood,
          total: ready ? report.total : null,
          top: ready ? (report.byType[0]?.type ?? null) : null,
        };
      }),
    ),
  };
}

export default function Spaces({ loaderData }: Route.ComponentProps) {
  return (
    <Shell>
      <Title eyebrow="창업 신청" sub="동네 의견이 모이고 있는 공실이에요.">
        어느 자리에 창업하고 싶나요?
      </Title>
      {loaderData.spaces.length === 0 && <p className="text-sm text-muted">지금 모집 중인 공실이 없어요.</p>}
      <ul className="divide-y divide-line">
        {loaderData.spaces.map((s) => (
          <li key={s.slug} className="py-4">
            <div className="flex justify-between gap-3">
              <b>{s.name}</b>
              <span className="shrink-0 text-xs text-muted">{s.total === null ? "집계 중" : `의견 ${s.total}건`}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {s.neighborhood}
              {s.top && ` · 1위 ${s.top}`}
            </p>
            <div className="mt-3 flex gap-2 text-sm">
              <Link to={`/r/${s.slug}`} className="rounded-lg border border-ink px-3.5 py-2 font-semibold">
                동네 의견 보기
              </Link>
              <Link to={`/apply/${s.slug}`} className="rounded-lg bg-ink px-3.5 py-2 font-semibold text-paper">
                신청하기
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
```

- [ ] **Step 8: Verify**

Run: `npm run typecheck && npm test` → all pass.
Manual: `/admin/spaces/<id>` shows report lines + QR preview; the PNG downloads; `/r/<slug>` shows "집계 중" (fewer than 50 responses); `/` → "창업하고 싶어요" → `/spaces` lists only consented spaces.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(C): demand report with QR download, thresholded public summary and space list"
```

---

### Task 6: D — Free founder application, result page and paid-feedback request

**Files:**
- Create: `app/lib/verdicts.ts`, `app/lib/applications.server.ts` (public-side functions; Task 7 appends admin ones), `app/routes/result.tsx` (replace stub), `tests/applications.test.ts`
- Modify: `app/routes/apply.tsx` (replace stub)

**Interfaces:**
- Consumes: `getPublicSpace` (Task 3), `checkUpload`, `storeUpload` (Task 3), `toHex` (Task 1), `CONSENTS`, `FEE_SERVICE_NAME`, `FEE_AMOUNT_KRW`, `BANK_TRANSFER` (Task 4's `app/lib/policy.ts`)
- Produces:
  - `VERDICTS: Array<{ value: "fit" | "improve" | "rethink"; label: string }>`; `verdictLabel(v: string | null): string | null`
  - `type ApplicationForm = { businessType: string; planText: string; estCostManwon: number; contactName: string; email: string; consentBrokerIntro: boolean }`
  - `parseApplication(form: FormData): ParseResult<ApplicationForm>`
  - `createApplication(db, spaceId: number, input: ApplicationForm, planFileKey: string | null, now?: number): Promise<{ id: number; token: string }>`
  - `type ResultView = { contactName: string; spaceName: string; verdict: string | null; summary: string | null; feedbackRequested: boolean; feedbackSent: boolean }`
  - `getResultByToken(db, token: string): Promise<ResultView | null>`
  - `requestFeedback(db, token: string, consentFeeTerms: boolean, now?: number): Promise<"requested" | "already" | "not-ready" | "no-consent" | "not-found">`

- [ ] **Step 1: `app/lib/verdicts.ts`** (no runtime imports — used by browser, server and seed)

```ts
export const VERDICTS = [
  { value: "fit", label: "잘 맞아요" },
  { value: "improve", label: "보완하면 좋아요" },
  { value: "rethink", label: "다시 생각해 보세요" },
] as const;

export function verdictLabel(v: string | null): string | null {
  return VERDICTS.find((x) => x.value === v)?.label ?? null;
}
```

- [ ] **Step 2: Write failing test `tests/applications.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { createSpace } from "~/lib/spaces.server";
import { createApplication, getResultByToken, parseApplication, requestFeedback } from "~/lib/applications.server";

const valid = {
  businessType: "아이스크림 가게",
  planText: "동네 아이들과 직장인을 위한 소형 젤라또 가게",
  estCostManwon: "4500",
  contactName: "김창업",
  email: "kim@example.com",
  consentPrivacy: "on",
  consentIntroTerms: "on",
};

export function form(overrides: Record<string, string | null> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ ...valid, ...overrides })) if (v !== null) f.set(k, v);
  return f;
}

export async function seeded(opts: { consentBrokerIntro?: boolean } = {}) {
  const db = createTestDb();
  const spaceId = await createSpace(db, { name: "A", neighborhood: "n", slug: "a-space", ownerConsent: true, consentFileKey: null });
  const r = parseApplication(form(opts.consentBrokerIntro ? { consentBrokerIntro: "on" } : {}));
  if (!r.ok) throw new Error(r.error);
  const { id, token } = await createApplication(db, spaceId, r.value, null, 123);
  return { db, id, token };
}

const setResult = (db: D1Database, id: number) =>
  db.prepare("UPDATE applications SET result_verdict = 'improve', result_summary = '객단가를 다시 보세요.' WHERE id = ?").bind(id).run();

describe("parseApplication", () => {
  it("parses a free application; broker intro is opt-in", () => {
    expect(parseApplication(form())).toEqual({
      ok: true,
      value: {
        businessType: "아이스크림 가게",
        planText: valid.planText,
        estCostManwon: 4500,
        contactName: "김창업",
        email: "kim@example.com",
        consentBrokerIntro: false,
      },
    });
    const opted = parseApplication(form({ consentBrokerIntro: "on" }));
    expect(opted.ok && opted.value.consentBrokerIntro).toBe(true);
  });

  it("requires each of the two consents separately", () => {
    expect(parseApplication(form({ consentPrivacy: null })).ok).toBe(false);
    expect(parseApplication(form({ consentIntroTerms: null })).ok).toBe(false);
  });

  it("rejects missing or malformed fields", () => {
    expect(parseApplication(form({ businessType: "" })).ok).toBe(false);
    expect(parseApplication(form({ planText: "" })).ok).toBe(false);
    expect(parseApplication(form({ estCostManwon: "" })).ok).toBe(false);
    expect(parseApplication(form({ estCostManwon: "사천만원" })).ok).toBe(false);
    expect(parseApplication(form({ estCostManwon: "-1" })).ok).toBe(false);
    expect(parseApplication(form({ email: "" })).ok).toBe(false);
    expect(parseApplication(form({ email: "010-1111-2222" })).ok).toBe(false);
  });
});

describe("application records", () => {
  it("stores consent timestamps and issues an unguessable result token", async () => {
    const { db, id, token } = await seeded({ consentBrokerIntro: true });
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    const row = await db.prepare("SELECT * FROM applications WHERE id = ?").bind(id).first<Record<string, unknown>>();
    expect(row).toMatchObject({
      result_token: token,
      consent_privacy_at: 123,
      consent_intro_terms_at: 123,
      consent_broker_intro: 1,
      consent_broker_intro_at: 123,
      consent_fee_terms_at: null,
      feedback_requested_at: null,
      payment_confirmed: 0,
    });
  });

  it("shows nothing for an unknown token and a pending state before review", async () => {
    const { db, token } = await seeded();
    expect(await getResultByToken(db, "0".repeat(32))).toBeNull();
    expect(await getResultByToken(db, token)).toMatchObject({ contactName: "김창업", spaceName: "A", verdict: null, feedbackRequested: false });
  });
});

describe("requestFeedback", () => {
  it("needs a written result and the fee-terms consent, and is idempotent", async () => {
    const { db, id, token } = await seeded();
    expect(await requestFeedback(db, "nope", true)).toBe("not-found");
    expect(await requestFeedback(db, token, true)).toBe("not-ready");
    await setResult(db, id);
    expect(await requestFeedback(db, token, false)).toBe("no-consent");
    expect(await requestFeedback(db, token, true, 500)).toBe("requested");
    expect(await requestFeedback(db, token, true, 600)).toBe("already");
    const row = await db.prepare("SELECT feedback_requested_at, consent_fee_terms_at FROM applications WHERE id = ?").bind(id).first();
    expect(row).toEqual({ feedback_requested_at: 500, consent_fee_terms_at: 500 });
    expect(await getResultByToken(db, token)).toMatchObject({ verdict: "improve", feedbackRequested: true, feedbackSent: false });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/applications.test.ts` → FAIL, module not found.

- [ ] **Step 4: Implement `app/lib/applications.server.ts`**

```ts
import { toHex } from "./hex";
import type { ParseResult } from "./result";

export type ApplicationForm = {
  businessType: string;
  planText: string;
  estCostManwon: number;
  contactName: string;
  email: string;
  consentBrokerIntro: boolean;
};

const REQUIRED_CONSENTS = ["consentPrivacy", "consentIntroTerms"] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseApplication(form: FormData): ParseResult<ApplicationForm> {
  const str = (k: string) => String(form.get(k) ?? "").trim();
  if (REQUIRED_CONSENTS.some((k) => form.get(k) !== "on")) {
    return { ok: false, error: "필수 동의 항목 2개에 모두 동의해 주세요." };
  }
  const businessType = str("businessType");
  if (!businessType || businessType.length > 40) return { ok: false, error: "희망 업종을 40자 이내로 적어 주세요." };
  const planText = str("planText");
  if (!planText || planText.length > 5000) return { ok: false, error: "사업계획을 5,000자 이내로 적어 주세요." };
  const cost = str("estCostManwon");
  const estCostManwon = Number(cost);
  if (!/^\d+$/.test(cost) || estCostManwon > 1_000_000) {
    return { ok: false, error: "예상 창업 비용을 만원 단위 숫자로 적어 주세요." };
  }
  const contactName = str("contactName");
  if (!contactName || contactName.length > 40) return { ok: false, error: "이름을 적어 주세요." };
  const email = str("email");
  if (!EMAIL_PATTERN.test(email) || email.length > 100) {
    return { ok: false, error: "결과를 받을 이메일 주소를 확인해 주세요." };
  }
  return {
    ok: true,
    value: { businessType, planText, estCostManwon, contactName, email, consentBrokerIntro: form.get("consentBrokerIntro") === "on" },
  };
}

// 128 random bits: the result page has no login, so the token is the only key.
function newResultToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function createApplication(
  db: D1Database,
  spaceId: number,
  input: ApplicationForm,
  planFileKey: string | null,
  now = Date.now(),
): Promise<{ id: number; token: string }> {
  const token = newResultToken();
  const res = await db
    .prepare(
      `INSERT INTO applications (
        space_id, result_token, business_type, plan_text, plan_file_key, est_cost_manwon, contact_name, email,
        consent_privacy_at, consent_intro_terms_at, consent_broker_intro, consent_broker_intro_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      spaceId,
      token,
      input.businessType,
      input.planText,
      planFileKey,
      input.estCostManwon,
      input.contactName,
      input.email,
      now,
      now,
      input.consentBrokerIntro ? 1 : 0,
      input.consentBrokerIntro ? now : null,
      now,
    )
    .run();
  return { id: res.meta.last_row_id, token };
}

export type ResultView = {
  contactName: string;
  spaceName: string;
  verdict: string | null;
  summary: string | null;
  feedbackRequested: boolean;
  feedbackSent: boolean;
};

export async function getResultByToken(db: D1Database, token: string): Promise<ResultView | null> {
  const row = await db
    .prepare(
      `SELECT a.contact_name, s.name AS space_name, a.result_verdict, a.result_summary, a.feedback_requested_at, a.feedback_sent
       FROM applications a JOIN spaces s ON s.id = a.space_id WHERE a.result_token = ?`,
    )
    .bind(token)
    .first<{
      contact_name: string;
      space_name: string;
      result_verdict: string | null;
      result_summary: string | null;
      feedback_requested_at: number | null;
      feedback_sent: number;
    }>();
  if (!row) return null;
  return {
    contactName: row.contact_name,
    spaceName: row.space_name,
    verdict: row.result_verdict,
    summary: row.result_summary,
    feedbackRequested: row.feedback_requested_at !== null,
    feedbackSent: row.feedback_sent === 1,
  };
}

export async function requestFeedback(
  db: D1Database,
  token: string,
  consentFeeTerms: boolean,
  now = Date.now(),
): Promise<"requested" | "already" | "not-ready" | "no-consent" | "not-found"> {
  const row = await db
    .prepare("SELECT id, result_verdict, feedback_requested_at FROM applications WHERE result_token = ?")
    .bind(token)
    .first<{ id: number; result_verdict: string | null; feedback_requested_at: number | null }>();
  if (!row) return "not-found";
  if (row.feedback_requested_at !== null) return "already";
  if (!row.result_verdict) return "not-ready";
  if (!consentFeeTerms) return "no-consent";
  await db
    .prepare("UPDATE applications SET feedback_requested_at = ?, consent_fee_terms_at = ? WHERE id = ?")
    .bind(now, now, row.id)
    .run();
  return "requested";
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/applications.test.ts` → all pass.

- [ ] **Step 6: Replace `app/routes/apply.tsx`** (matches mockup P6/P7)

```tsx
import { data, Form, Link } from "react-router";
import type { Route } from "./+types/apply";
import { getPublicSpace } from "~/lib/spaces.server";
import { createApplication, parseApplication } from "~/lib/applications.server";
import { checkUpload, storeUpload } from "~/lib/uploads.server";
import { CONSENTS } from "~/lib/policy";
import { Consent, ErrorNote, Shell, SubmitButton, TextArea, TextInput, Title } from "~/components/ui";

export const meta: Route.MetaFunction = ({ data }) => [{ title: data ? `${data.name} 창업 신청 — 썰모` : "썰모" }];

export async function loader({ params, context }: Route.LoaderArgs) {
  const space = await getPublicSpace(context.cloudflare.env.DB, params.slug);
  if (!space) throw new Response("Not found", { status: 404 });
  return { name: space.name, neighborhood: space.neighborhood, slug: space.slug };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const space = await getPublicSpace(env.DB, params.slug);
  if (!space) throw new Response("Not found", { status: 404 });

  const form = await request.formData();
  const parsed = parseApplication(form);
  if (!parsed.ok) return data({ email: null, error: parsed.error }, { status: 400 });
  const upload = checkUpload(form.get("planFile"));
  if (!upload.ok) return data({ email: null, error: upload.error }, { status: 400 });

  const planFileKey = upload.value ? await storeUpload(env.UPLOADS, "plans", upload.value) : null;
  await createApplication(env.DB, space.id, parsed.value, planFileKey);
  return { email: parsed.value.email, error: null };
}

export default function Apply({ loaderData, actionData }: Route.ComponentProps) {
  if (actionData?.email) {
    return (
      <Shell>
        <Title eyebrow={loaderData.neighborhood}>신청이 접수됐어요</Title>
        <p className="text-sm leading-relaxed text-muted">
          검토가 끝나면 <b className="text-ink">{actionData.email}</b>으로 결과 링크를 보내드려요.
        </p>
        <p className="mt-2 text-sm text-muted">메일이 오지 않으면 스팸함도 확인해 주세요.</p>
        <Link to={`/r/${loaderData.slug}`} className="mt-8 block rounded-lg border border-ink py-3.5 text-center font-semibold">
          동네 의견 다시 보기
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <Title eyebrow={loaderData.neighborhood} sub="신청은 무료예요. 검토가 끝나면 이메일로 결과 링크를 보내드려요.">
        {loaderData.name} 창업 신청
      </Title>
      <Form method="post" encType="multipart/form-data">
        <TextInput label="하고 싶은 업종" name="businessType" maxLength={40} placeholder="예: 젤라또 가게" required />
        <TextArea label="사업계획" name="planText" maxLength={5000} placeholder="누구에게, 무엇을, 어떻게 팔지 자유롭게 적어 주세요." required />
        <label className="mb-5 block">
          <span className="mb-1.5 block text-sm font-medium">사업계획서 파일 (선택, 10MB 이하)</span>
          <input type="file" name="planFile" accept=".pdf,.png,.jpg,.jpeg,.hwp,.hwpx,.docx" className="text-sm" />
        </label>
        <TextInput label="예상 창업 비용 (만원)" name="estCostManwon" inputMode="numeric" pattern="[0-9]*" placeholder="예: 4500" required />
        <TextInput label="이름" name="contactName" maxLength={40} autoComplete="name" required />
        <TextInput label="이메일 (결과 링크를 받을 주소)" name="email" type="email" maxLength={100} autoComplete="email" placeholder="name@example.com" required />

        <div className="mb-8 mt-8">
          <Consent name="consentPrivacy" required label={CONSENTS.privacy.label} detail={CONSENTS.privacy.detail} />
          <Consent name="consentIntroTerms" required label={CONSENTS.introTerms.label} detail={CONSENTS.introTerms.detail} />
          <Consent name="consentBrokerIntro" label={CONSENTS.brokerIntroOptIn.label} detail={CONSENTS.brokerIntroOptIn.detail} />
        </div>

        <ErrorNote message={actionData?.error} />
        <SubmitButton>무료로 신청하기</SubmitButton>
      </Form>
    </Shell>
  );
}
```

- [ ] **Step 7: Replace `app/routes/result.tsx`** (matches mockup P8/P9)

```tsx
import { data, Form } from "react-router";
import type { Route } from "./+types/result";
import { getResultByToken, requestFeedback } from "~/lib/applications.server";
import { verdictLabel } from "~/lib/verdicts";
import { BANK_TRANSFER, CONSENTS, FEE_AMOUNT_KRW, FEE_SERVICE_NAME } from "~/lib/policy";
import { Consent, ErrorNote, Section, Shell, SubmitButton, Title } from "~/components/ui";
import { CopyButton } from "~/components/CopyButton";

export const meta: Route.MetaFunction = () => [{ title: "검토 결과 — 썰모" }, { name: "robots", content: "noindex" }];

export async function loader({ params, context }: Route.LoaderArgs) {
  const result = await getResultByToken(context.cloudflare.env.DB, params.token);
  if (!result) throw new Response("Not found", { status: 404 });
  return { ...result, verdictLabel: verdictLabel(result.verdict) };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const form = await request.formData();
  const outcome = await requestFeedback(context.cloudflare.env.DB, params.token, form.get("consentFeeTerms") === "on");
  if (outcome === "not-found") throw new Response("Not found", { status: 404 });
  if (outcome === "no-consent") return data({ error: "이용료 안내에 동의해 주세요." }, { status: 400 });
  if (outcome === "not-ready") return data({ error: "아직 검토 중이에요." }, { status: 400 });
  return { error: null };
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export default function Result({ loaderData, actionData }: Route.ComponentProps) {
  const r = loaderData;

  if (!r.verdict) {
    return (
      <Shell>
        <Title eyebrow={r.spaceName}>아직 검토 중이에요</Title>
        <p className="text-sm text-muted">검토가 끝나면 이 링크에서 결과를 볼 수 있어요.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <Title eyebrow={r.spaceName}>{r.contactName}님, 검토 결과가 나왔어요</Title>
      <div className="mb-8 rounded-xl border border-ink p-4">
        <p className="text-xs font-bold tracking-wide text-accent">{r.verdictLabel}</p>
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{r.summary}</p>
      </div>

      {r.feedbackSent ? (
        <p className="text-sm text-muted">서면 피드백을 이메일로 보냈어요. 메일함을 확인해 주세요.</p>
      ) : r.feedbackRequested ? (
        <Section title={`입금 안내 · ${FEE_SERVICE_NAME}`}>
          <dl className="grid grid-cols-[5rem_1fr] gap-y-1.5 text-sm">
            <dt className="text-muted">금액</dt>
            <dd className="font-semibold">{won(FEE_AMOUNT_KRW)}</dd>
            <dt className="text-muted">입금 계좌</dt>
            <dd>
              {BANK_TRANSFER.bank} {BANK_TRANSFER.account}
            </dd>
            <dt className="text-muted">예금주</dt>
            <dd>{BANK_TRANSFER.holder}</dd>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            입금자명은 신청서의 이름({r.contactName})과 같게 해 주세요. 입금이 확인되면 이메일로 피드백 문서를 보내드려요.
          </p>
          <div className="mt-5">
            <CopyButton text={BANK_TRANSFER.account} label="계좌번호 복사" />
          </div>
        </Section>
      ) : (
        <Form method="post">
          <Section title="서면 피드백 받기 (선택)">
            <p className="text-2xl font-bold tabular-nums">{won(FEE_AMOUNT_KRW)}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              동네 설문 결과를 바탕으로 사업계획서를 항목별로 짚은 피드백 문서를 이메일로 보내드려요.
            </p>
            <ul className="mb-4 mt-2 list-disc pl-5 text-xs leading-relaxed text-muted">
              <li>업종·가격·시간대가 동네 수요와 맞는지</li>
              <li>사업계획서에서 보완할 부분</li>
            </ul>
            <Consent name="consentFeeTerms" required label={CONSENTS.feeTerms.label} detail={CONSENTS.feeTerms.detail} />
          </Section>
          <ErrorNote message={actionData?.error} />
          <SubmitButton>피드백 신청하기</SubmitButton>
          <p className="mt-3 text-center text-xs text-muted">신청하지 않아도 위 결과는 계속 볼 수 있어요.</p>
        </Form>
      )}
    </Shell>
  );
}
```

- [ ] **Step 8: `app/components/CopyButton.tsx`**

```tsx
import { useState } from "react";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard
          .writeText(text)
          .then(() => setCopied(true))
          .catch(() => window.prompt("복사해서 쓰세요", text))
      }
      className="rounded-lg border border-ink px-4 py-2 text-sm font-semibold"
    >
      {copied ? "복사했어요" : label}
    </button>
  );
}
```

- [ ] **Step 9: Verify**

Run: `npm run typecheck && npm test` → all pass.
Manual: `/apply/<slug>` at 390px → submit → "신청이 접수됐어요"; copy the new row's `result_token` (`npx wrangler d1 execute ssulmo --local --command "SELECT result_token FROM applications ORDER BY id DESC LIMIT 1"`) → `/result/<token>` shows "아직 검토 중이에요"; `/result/0000` → 404.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(D): free founder application, token result page and paid feedback request"
```

---

### Task 7: E — Admin review: result, paid feedback, broker-introduction log

**Files:**
- Modify: `app/lib/applications.server.ts` (append admin functions), `app/routes/admin-index.tsx` (add application list), `tests/applications.test.ts` (append)
- Create: `app/routes/admin-application.tsx` (replace stub)

**Interfaces:**
- Consumes: Task 6 functions, `VERDICTS`, `CopyButton`, `requireAdmin`, UI
- Produces:
  - `type Application` (all `applications` columns) and `type ApplicationListItem = Application & { space_name: string }`
  - `listApplications(db): Promise<ApplicationListItem[]>`; `getApplication(db, id: number): Promise<ApplicationListItem | null>`
  - `type ResultForm = { verdict: string | null; summary: string | null; referenceScore: number | null; resultSent: boolean }`
  - `parseResultForm(form: FormData): ParseResult<ResultForm>`; `saveResult(db, id: number, r: ResultForm): Promise<void>`
  - `type FeedbackForm = { paymentConfirmed: boolean; feedback: string | null; feedbackSent: boolean }`
  - `parseFeedbackForm(form: FormData): FeedbackForm`; `saveFeedback(db, id: number, f: FeedbackForm): Promise<"saved" | "not-requested">`
  - `createBrokerIntro(db, applicationId: number, brokerName: string, introducedOn: string, now?: number): Promise<"saved" | "no-consent" | "invalid">`
  - `listBrokerIntros(db, applicationId: number): Promise<Array<{ id: number; broker_name: string; introduced_on: string }>>`

- [ ] **Step 1: Append failing tests to `tests/applications.test.ts`** (merge the new names into the existing `~/lib/applications.server` import; `form`/`seeded` are defined at the top of the file)

```ts
import {
  createBrokerIntro,
  getApplication,
  listApplications,
  listBrokerIntros,
  parseFeedbackForm,
  parseResultForm,
  saveFeedback,
  saveResult,
} from "~/lib/applications.server";

const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("admin result", () => {
  it("parses and saves verdict, summary, score and the sent flag", async () => {
    const { db, id } = await seeded();
    const r = parseResultForm(fd({ verdict: "improve", summary: " 객단가를 다시 보세요. ", referenceScore: "72", resultSent: "on" }));
    expect(r).toEqual({ ok: true, value: { verdict: "improve", summary: "객단가를 다시 보세요.", referenceScore: 72, resultSent: true } });
    if (!r.ok) return;
    await saveResult(db, id, r.value);
    expect(await getApplication(db, id)).toMatchObject({ result_verdict: "improve", result_sent: 1, reference_score: 72 });
    expect((await listApplications(db))[0].space_name).toBe("A");
  });

  it("rejects unknown verdicts, bad scores, and 'sent' without a written result", () => {
    expect(parseResultForm(fd({ verdict: "great" })).ok).toBe(false);
    expect(parseResultForm(fd({ referenceScore: "101" })).ok).toBe(false);
    expect(parseResultForm(fd({ resultSent: "on" })).ok).toBe(false);
    expect(parseResultForm(fd({ verdict: "fit", resultSent: "on" })).ok).toBe(false);
    expect(parseResultForm(fd({}))).toEqual({ ok: true, value: { verdict: null, summary: null, referenceScore: null, resultSent: false } });
  });
});

describe("paid feedback", () => {
  it("cannot be marked paid or sent before the applicant requests it", async () => {
    const { db, id, token } = await seeded();
    const f = parseFeedbackForm(fd({ paymentConfirmed: "on", feedback: "피드백", feedbackSent: "on" }));
    expect(await saveFeedback(db, id, f)).toBe("not-requested");

    await db.prepare("UPDATE applications SET result_verdict = 'fit', result_summary = 's' WHERE id = ?").bind(id).run();
    const { requestFeedback } = await import("~/lib/applications.server");
    expect(await requestFeedback(db, token, true)).toBe("requested");
    expect(await saveFeedback(db, id, f)).toBe("saved");
    expect(await getApplication(db, id)).toMatchObject({ payment_confirmed: 1, feedback: "피드백", feedback_sent: 1 });
  });
});

describe("broker introduction log", () => {
  it("refuses to log an introduction without consent", async () => {
    const { db, id } = await seeded();
    expect(await createBrokerIntro(db, id, "망원공인중개사", "2026-10-07")).toBe("no-consent");
    expect(await listBrokerIntros(db, id)).toEqual([]);
  });

  it("database trigger blocks a direct insert without consent", async () => {
    const { db, id } = await seeded();
    await expect(
      db
        .prepare("INSERT INTO broker_intros (application_id, broker_name, introduced_on, created_at) VALUES (?, ?, ?, ?)")
        .bind(id, "x", "2026-10-07", 1)
        .run(),
    ).rejects.toThrow(/consent missing/);
  });

  it("logs an introduction when the founder consented", async () => {
    const { db, id } = await seeded({ consentBrokerIntro: true });
    expect(await createBrokerIntro(db, id, " ", "2026-10-07")).toBe("invalid");
    expect(await createBrokerIntro(db, id, "망원공인중개사", "10/07")).toBe("invalid");
    expect(await createBrokerIntro(db, id, "망원공인중개사", "2026-10-07")).toBe("saved");
    expect(await listBrokerIntros(db, id)).toMatchObject([{ broker_name: "망원공인중개사", introduced_on: "2026-10-07" }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/applications.test.ts` → FAIL, functions not exported.

- [ ] **Step 3: Append to `app/lib/applications.server.ts`**

Add `import { VERDICTS } from "./verdicts";` at the top, then append:

```ts
export type Application = {
  id: number;
  space_id: number;
  result_token: string;
  business_type: string;
  plan_text: string;
  plan_file_key: string | null;
  est_cost_manwon: number;
  contact_name: string;
  email: string;
  consent_privacy_at: number;
  consent_intro_terms_at: number;
  consent_broker_intro: number;
  consent_broker_intro_at: number | null;
  result_verdict: string | null;
  result_summary: string | null;
  result_sent: number;
  reference_score: number | null;
  feedback_requested_at: number | null;
  consent_fee_terms_at: number | null;
  payment_confirmed: number;
  feedback: string | null;
  feedback_sent: number;
  created_at: number;
};
export type ApplicationListItem = Application & { space_name: string };

const SELECT_WITH_SPACE = "SELECT a.*, s.name AS space_name FROM applications a JOIN spaces s ON s.id = a.space_id";

export async function listApplications(db: D1Database): Promise<ApplicationListItem[]> {
  const { results } = await db.prepare(`${SELECT_WITH_SPACE} ORDER BY a.id DESC`).all<ApplicationListItem>();
  return results;
}

export async function getApplication(db: D1Database, id: number): Promise<ApplicationListItem | null> {
  return db.prepare(`${SELECT_WITH_SPACE} WHERE a.id = ?`).bind(id).first<ApplicationListItem>();
}

export type ResultForm = { verdict: string | null; summary: string | null; referenceScore: number | null; resultSent: boolean };

export function parseResultForm(form: FormData): ParseResult<ResultForm> {
  const verdict = String(form.get("verdict") ?? "");
  if (verdict && !VERDICTS.some((v) => v.value === verdict)) return { ok: false, error: "판정을 다시 골라 주세요." };
  const summary = String(form.get("summary") ?? "").trim();
  if (summary.length > 1000) return { ok: false, error: "요약은 1,000자 이내로 적어 주세요." };
  const score = String(form.get("referenceScore") ?? "").trim();
  if (score && (!/^\d+$/.test(score) || Number(score) > 100)) {
    return { ok: false, error: "참고 점수는 0~100 사이 숫자로 적어 주세요." };
  }
  const resultSent = form.get("resultSent") === "on";
  if (resultSent && (!verdict || !summary)) {
    return { ok: false, error: "판정과 요약을 먼저 작성해야 결과 메일을 보낼 수 있어요." };
  }
  return {
    ok: true,
    value: { verdict: verdict || null, summary: summary || null, referenceScore: score ? Number(score) : null, resultSent },
  };
}

export async function saveResult(db: D1Database, id: number, r: ResultForm): Promise<void> {
  await db
    .prepare("UPDATE applications SET result_verdict = ?, result_summary = ?, reference_score = ?, result_sent = ? WHERE id = ?")
    .bind(r.verdict, r.summary, r.referenceScore, r.resultSent ? 1 : 0, id)
    .run();
}

export type FeedbackForm = { paymentConfirmed: boolean; feedback: string | null; feedbackSent: boolean };

export function parseFeedbackForm(form: FormData): FeedbackForm {
  const feedback = String(form.get("feedback") ?? "").trim();
  return {
    paymentConfirmed: form.get("paymentConfirmed") === "on",
    feedback: feedback || null,
    feedbackSent: form.get("feedbackSent") === "on",
  };
}

// Paid feedback only exists once the applicant asked for it on the result page.
export async function saveFeedback(db: D1Database, id: number, f: FeedbackForm): Promise<"saved" | "not-requested"> {
  const res = await db
    .prepare(
      "UPDATE applications SET payment_confirmed = ?, feedback = ?, feedback_sent = ? WHERE id = ? AND feedback_requested_at IS NOT NULL",
    )
    .bind(f.paymentConfirmed ? 1 : 0, f.feedback, f.feedbackSent ? 1 : 0, id)
    .run();
  return res.meta.changes === 1 ? "saved" : "not-requested";
}

export async function createBrokerIntro(
  db: D1Database,
  applicationId: number,
  brokerName: string,
  introducedOn: string,
  now = Date.now(),
): Promise<"saved" | "no-consent" | "invalid"> {
  const name = brokerName.trim();
  if (!name || name.length > 60 || !/^\d{4}-\d{2}-\d{2}$/.test(introducedOn)) return "invalid";
  const app = await db
    .prepare("SELECT consent_broker_intro FROM applications WHERE id = ?")
    .bind(applicationId)
    .first<{ consent_broker_intro: number }>();
  // The broker_intros_require_consent trigger enforces the same rule in the DB.
  if (app?.consent_broker_intro !== 1) return "no-consent";
  await db
    .prepare("INSERT INTO broker_intros (application_id, broker_name, introduced_on, created_at) VALUES (?, ?, ?, ?)")
    .bind(applicationId, name, introducedOn, now)
    .run();
  return "saved";
}

export async function listBrokerIntros(
  db: D1Database,
  applicationId: number,
): Promise<Array<{ id: number; broker_name: string; introduced_on: string }>> {
  const { results } = await db
    .prepare("SELECT id, broker_name, introduced_on FROM broker_intros WHERE application_id = ? ORDER BY introduced_on DESC, id DESC")
    .bind(applicationId)
    .all<{ id: number; broker_name: string; introduced_on: string }>();
  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/applications.test.ts` → all pass.

- [ ] **Step 5: Replace `app/routes/admin-application.tsx`** (matches mockup A5)

```tsx
import { data, Form, Link } from "react-router";
import type { Route } from "./+types/admin-application";
import { requireAdmin } from "~/lib/auth.server";
import {
  createBrokerIntro,
  getApplication,
  listBrokerIntros,
  parseFeedbackForm,
  parseResultForm,
  saveFeedback,
  saveResult,
} from "~/lib/applications.server";
import { VERDICTS } from "~/lib/verdicts";
import { FEE_AMOUNT_KRW } from "~/lib/policy";
import { CopyButton } from "~/components/CopyButton";
import { ErrorNote, Section, Shell, Title } from "~/components/ui";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const app = await getApplication(env.DB, Number(params.id));
  if (!app) throw new Response("Not found", { status: 404 });
  return { app, intros: await listBrokerIntros(env.DB, app.id), resultUrl: `${new URL(request.url).origin}/result/${app.result_token}` };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const id = Number(params.id);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "save-result") {
    const r = parseResultForm(form);
    if (!r.ok) return data({ error: r.error, saved: null }, { status: 400 });
    await saveResult(env.DB, id, r.value);
    return { error: null, saved: "result" };
  }
  if (intent === "save-feedback") {
    if ((await saveFeedback(env.DB, id, parseFeedbackForm(form))) === "not-requested") {
      return data({ error: "신청자가 아직 피드백을 신청하지 않았어요.", saved: null }, { status: 400 });
    }
    return { error: null, saved: "feedback" };
  }
  if (intent === "add-intro") {
    const result = await createBrokerIntro(env.DB, id, String(form.get("brokerName") ?? ""), String(form.get("introducedOn") ?? ""));
    if (result === "no-consent") return data({ error: "신청자의 소개 동의가 없어 기록할 수 없어요.", saved: null }, { status: 400 });
    if (result === "invalid") return data({ error: "중개사 이름과 날짜를 확인해 주세요.", saved: null }, { status: 400 });
    return { error: null, saved: "intro" };
  }
  return data({ error: "알 수 없는 요청이에요.", saved: null }, { status: 400 });
}

const date = (ms: number) => new Date(ms).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
const field = "w-full rounded-lg border border-line px-3 py-2.5 focus:border-ink focus:outline-none";

export default function AdminApplication({ loaderData, actionData }: Route.ComponentProps) {
  const { app, intros, resultUrl } = loaderData;
  const canIntroduce = app.consent_broker_intro === 1;
  const saved = actionData?.saved;

  return (
    <Shell wide>
      <Title eyebrow={app.space_name} sub={`접수 ${date(app.created_at)}`}>
        {app.contact_name} · {app.business_type}
      </Title>
      <ErrorNote message={actionData?.error} />

      <div className="grid gap-x-10 md:grid-cols-2">
        <div className="min-w-0">
          <Section title="신청 내용 (개인정보)">
            <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted">이메일</dt>
              <dd className="break-all">{app.email}</dd>
              <dt className="text-muted">예상 창업 비용</dt>
              <dd>{app.est_cost_manwon.toLocaleString("ko-KR")}만원</dd>
              <dt className="text-muted">사업계획서 파일</dt>
              <dd>
                {app.plan_file_key ? (
                  <a className="underline" href={`/admin/files/${app.plan_file_key}`}>
                    내려받기
                  </a>
                ) : (
                  "없음"
                )}
              </dd>
            </dl>
            <p className="mt-4 whitespace-pre-wrap rounded-lg border border-line p-4 text-sm leading-relaxed">{app.plan_text}</p>
          </Section>

          <Section title="동의 기록">
            <ul className="space-y-1 text-sm">
              <li>개인정보 수집·이용: {date(app.consent_privacy_at)}</li>
              <li>중개 소개 조건 안내: {date(app.consent_intro_terms_at)}</li>
              <li>중개사 소개 동의: {app.consent_broker_intro_at ? date(app.consent_broker_intro_at) : "동의 안 함"}</li>
              <li>피드백 이용료 안내: {app.consent_fee_terms_at ? date(app.consent_fee_terms_at) : "해당 없음"}</li>
            </ul>
          </Section>
        </div>

        <div className="min-w-0">
          <Section title="1. 검토 결과 (무료)">
            <Form method="post" className="space-y-4 text-sm">
              <input type="hidden" name="intent" value="save-result" />
              <fieldset>
                <legend className="mb-2 font-medium">한 줄 판정</legend>
                <div className="flex flex-wrap gap-2">
                  {VERDICTS.map((v) => (
                    <label key={v.value} className="cursor-pointer">
                      <input type="radio" name="verdict" value={v.value} defaultChecked={app.result_verdict === v.value} className="peer sr-only" />
                      <span className="block rounded-full border border-line px-3.5 py-1.5 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper">
                        {v.label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block">
                <span className="mb-1.5 block font-medium">요약 (신청자에게 보여요)</span>
                <textarea name="summary" defaultValue={app.result_summary ?? ""} maxLength={1000} className={`${field} min-h-28`} />
              </label>
              <label className="block">
                <span className="mb-1.5 block font-medium">참고 점수 (참고용, 0~100 · 신청자에게 안 보여요)</span>
                <input name="referenceScore" inputMode="numeric" defaultValue={app.reference_score ?? ""} className={`${field} w-28`} />
              </label>
              <div className="flex items-center gap-2 rounded-lg bg-[#f6f6f6] px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-xs">{resultUrl}</span>
                <CopyButton text={resultUrl} label="링크 복사" />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="resultSent" defaultChecked={app.result_sent === 1} className="size-4 accent-ink" />
                결과 메일 보냄 (직접 보낸 뒤 체크)
              </label>
              <button className="rounded-lg bg-ink px-4 py-2 font-semibold text-paper">저장</button>
              {saved === "result" && <span className="ml-3 text-muted">저장했어요.</span>}
            </Form>
          </Section>

          <Section title={`2. 서면 피드백 (유료 · ${FEE_AMOUNT_KRW.toLocaleString("ko-KR")}원)`}>
            {app.feedback_requested_at ? (
              <Form method="post" className="space-y-4 text-sm">
                <input type="hidden" name="intent" value="save-feedback" />
                <p className="text-muted">신청자가 피드백을 신청했어요 · {date(app.feedback_requested_at)}</p>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="paymentConfirmed" defaultChecked={app.payment_confirmed === 1} className="size-4 accent-ink" />
                  입금 확인
                </label>
                <label className="block">
                  <span className="mb-1.5 block font-medium">서면 피드백</span>
                  <textarea name="feedback" defaultValue={app.feedback ?? ""} className={`${field} min-h-40`} />
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="feedbackSent" defaultChecked={app.feedback_sent === 1} className="size-4 accent-ink" />
                  피드백 발송함 (직접 보낸 뒤 체크)
                </label>
                <button className="rounded-lg bg-ink px-4 py-2 font-semibold text-paper">저장</button>
                {saved === "feedback" && <span className="ml-3 text-muted">저장했어요.</span>}
              </Form>
            ) : (
              <p className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">아직 피드백을 신청하지 않았어요.</p>
            )}
          </Section>

          <Section title="중개사 소개 기록">
            {canIntroduce ? (
              <Form method="post" className="mb-4 flex flex-wrap items-end gap-3 text-sm">
                <input type="hidden" name="intent" value="add-intro" />
                <label>
                  <span className="mb-1 block">중개사 이름</span>
                  <input name="brokerName" required maxLength={60} className="rounded-lg border border-line px-3 py-2" />
                </label>
                <label>
                  <span className="mb-1 block">소개한 날짜</span>
                  <input name="introducedOn" type="date" required className="rounded-lg border border-line px-3 py-2" />
                </label>
                <button className="rounded-lg bg-ink px-4 py-2 font-semibold text-paper">기록</button>
              </Form>
            ) : (
              <p className="mb-4 rounded-lg border border-dashed border-line p-3 text-sm text-muted">
                신청자가 중개사 소개에 동의하지 않아 기록할 수 없어요.
              </p>
            )}
            <ul className="divide-y divide-line text-sm">
              {intros.map((i) => (
                <li key={i.id} className="flex justify-between py-2">
                  <span>{i.broker_name}</span>
                  <span className="text-muted">{i.introduced_on}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>

      <Link to="/admin" className="text-sm text-muted underline">
        ← 목록으로
      </Link>
    </Shell>
  );
}
```

- [ ] **Step 6: Add the application list to `app/routes/admin-index.tsx`** (matches mockup A2)

Loader becomes:

```tsx
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  return { spaces: await listSpaces(env.DB), applications: await listApplications(env.DB) };
}
```

Add `import { listApplications } from "~/lib/applications.server";` and insert this section after the 공간 section inside `<Shell>`:

```tsx
<Section title="창업 신청">
  <div className="overflow-x-auto">
    <table className="w-full min-w-[44rem] text-left text-sm">
      <thead className="text-xs text-muted">
        <tr>
          <th className="py-2 font-medium">신청자 · 업종</th>
          <th className="py-2 font-medium">공간</th>
          <th className="py-2 font-medium">결과 메일</th>
          <th className="py-2 font-medium">피드백 신청</th>
          <th className="py-2 font-medium">입금</th>
          <th className="py-2 font-medium">피드백</th>
          <th className="py-2 font-medium">참고 점수(참고용)</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line tabular-nums">
        {loaderData.applications.map((a) => (
          <tr key={a.id}>
            <td className="py-2.5">
              <Link to={`/admin/applications/${a.id}`} className="font-medium underline-offset-4 hover:underline">
                {a.contact_name} · {a.business_type}
              </Link>
            </td>
            <td className="py-2.5 text-muted">{a.space_name}</td>
            <td className="py-2.5">{a.result_sent ? "보냄" : a.result_verdict ? "작성함" : "검토 중"}</td>
            <td className="py-2.5">{a.feedback_requested_at ? "신청" : "—"}</td>
            <td className="py-2.5">{a.payment_confirmed ? "확인" : "—"}</td>
            <td className="py-2.5">{a.feedback_sent ? "발송함" : a.feedback ? "작성 중" : "—"}</td>
            <td className="py-2.5">{a.reference_score ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</Section>
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm test` → all pass.
Manual: `/admin` lists applications; open one → write verdict + summary, tick "결과 메일 보냄" → `/result/<token>` shows the result; request feedback there → admin page shows the feedback form; an application without broker consent shows no intro form.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(E): admin result review, paid feedback tracking and consent-gated broker log"
```

---

### Task 8: Seed data, README, core-flow e2e

**Files:**
- Create: `scripts/seed.ts`, `README.md` (replace template), `playwright.config.ts`, `e2e/core-flow.spec.ts`
- Modify: `package.json` scripts, `vitest.config.mts` unaffected (e2e lives outside `tests/`)

**Interfaces:**
- Consumes: option lists from `app/lib/survey.ts` (imported with `.ts` extension by Node type stripping)
- Produces: `npm run db:seed`, `npm run e2e`

- [ ] **Step 1: REQUIRED SKILL — invoke `engineering:testing-strategy`** and confirm the core flow below is the right minimal e2e scope; adjust the spec only if it identifies a gap in the Review Focus list.

- [ ] **Step 2: Write `scripts/seed.ts`**

```ts
// Local seed: 1 space, 60 survey responses, 3 applications.
// Usage: node scripts/seed.ts > .wrangler/seed.sql (wired up as `npm run db:seed`).
// Wipes existing rows first — local development only.
import { BUSINESS_TYPES, RESPONDENT_TYPE, SPEND_RANGE, VISIT_FREQUENCY, VISIT_TIME } from "../app/lib/survey.ts";

let state = 42;
const rand = () => {
  state = (state * 1664525 + 1013904223) % 2 ** 32;
  return state / 2 ** 32;
};
const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
const q = (v: string | number | null) => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${v.replaceAll("'", "''")}'`);

const now = Date.now();
const day = 24 * 60 * 60 * 1000;
const space = "(SELECT id FROM spaces WHERE slug = 'mangwon-01')";
const out: string[] = [
  "DELETE FROM broker_intros;",
  "DELETE FROM applications;",
  "DELETE FROM survey_contacts;",
  "DELETE FROM survey_responses;",
  "DELETE FROM spaces;",
  `INSERT INTO spaces (name, neighborhood, slug, owner_consent, consent_file_key, created_at) VALUES ('망원동 1층 코너 공실', '마포구 망원동', 'mangwon-01', 1, NULL, ${now - 20 * day});`,
];

// Skew demand so the report has a visible ranking.
const weighted = ["아이스크림·디저트", "아이스크림·디저트", "카페", "베이커리", "반찬가게", ...BUSINESS_TYPES];
const otherIdeas = ["아이스크림집", "수제버거", "문구점", "키즈카페", "무인 사진관"];

for (let i = 0; i < 60; i++) {
  const types = [...new Set([pick(weighted), pick(weighted), pick(weighted)].slice(0, 1 + Math.floor(rand() * 3)))];
  const other = rand() < 0.15 ? pick(otherIdeas) : null;
  const answers = {
    businessTypes: other ? types.slice(0, 2) : types,
    businessTypeOther: other,
    visitFrequency: pick(VISIT_FREQUENCY).value,
    spendRange: pick(SPEND_RANGE).value,
    visitTime: pick(VISIT_TIME).value,
    respondentType: pick(RESPONDENT_TYPE).value,
  };
  out.push(
    `INSERT INTO survey_responses (space_id, answers, device_hash, created_at) VALUES (${space}, ${q(JSON.stringify(answers))}, ${q(`seed-device-${i}`)}, ${now - Math.floor(rand() * 14 * day)});`,
  );
}

out.push(
  `INSERT INTO survey_contacts (space_id, contact, privacy_consented_at, created_at) VALUES (${space}, 'seed@example.com', ${now - 3 * day}, ${now - 3 * day});`,
);

// Fixed tokens so the e2e test and manual checks can open result pages.
const applications = [
  { type: "젤라또 가게", name: "김예시", cost: 4500, broker: 1, token: "a".repeat(32), verdict: "fit", resultSent: 1, score: 78, requested: true, paid: 1, feedback: "점심·오후 수요가 높아 테이크아웃 중심이 맞아요.", fbSent: 1 },
  { type: "반찬가게", name: "이예시", cost: 3000, broker: 0, token: "b".repeat(32), verdict: "improve", resultSent: 1, score: 64, requested: false, paid: 0, feedback: null, fbSent: 0 },
  { type: "베이커리 카페", name: "박예시", cost: 8000, broker: 1, token: "c".repeat(32), verdict: null, resultSent: 0, score: null, requested: false, paid: 0, feedback: null, fbSent: 0 },
];
for (const [i, a] of applications.entries()) {
  const t = now - (5 - i) * day;
  const req = a.requested ? t + day : null;
  const summary = a.verdict ? `${a.type} 수요는 이 공간 상위권이에요. 객단가와 영업 시간대를 설문 결과와 맞춰 보세요.` : null;
  out.push(
    `INSERT INTO applications (space_id, result_token, business_type, plan_text, plan_file_key, est_cost_manwon, contact_name, email, consent_privacy_at, consent_intro_terms_at, consent_broker_intro, consent_broker_intro_at, result_verdict, result_summary, result_sent, reference_score, feedback_requested_at, consent_fee_terms_at, payment_confirmed, feedback, feedback_sent, created_at) VALUES (${space}, ${q(a.token)}, ${q(a.type)}, ${q(`${a.type} 사업계획 예시입니다. 주 고객은 망원동 주민과 직장인입니다.`)}, NULL, ${a.cost}, ${q(a.name)}, ${q(`seed${i}@example.com`)}, ${t}, ${t}, ${a.broker}, ${a.broker ? t : "NULL"}, ${q(a.verdict)}, ${q(summary)}, ${a.resultSent}, ${q(a.score)}, ${q(req)}, ${q(req)}, ${a.paid}, ${q(a.feedback)}, ${a.fbSent}, ${t});`,
  );
}
out.push(
  `INSERT INTO broker_intros (application_id, broker_name, introduced_on, created_at) VALUES ((SELECT id FROM applications WHERE contact_name = '김예시'), '망원 예시 공인중개사', '${new Date(now - day).toISOString().slice(0, 10)}', ${now});`,
);

console.log(out.join("\n"));
```

- [ ] **Step 3: Add scripts to `package.json`**

```json
"db:seed": "node scripts/seed.ts > .wrangler/seed.sql && wrangler d1 execute ssulmo --local --file=.wrangler/seed.sql",
"e2e": "playwright test"
```

Run: `npm run db:migrate && npm run db:seed` → Expected: wrangler reports the executed statements, no errors.
Run: `npx wrangler d1 execute ssulmo --local --command "SELECT COUNT(*) AS n FROM survey_responses"` → `n = 60`.

- [ ] **Step 4: `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

// Requires a migrated + seeded local DB (npm run db:migrate && npm run db:seed)
// and .dev.vars copied from .dev.vars.example.
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:5180", ...devices["Pixel 7"] },
  webServer: {
    command: "npm run dev -- --port 5180 --strictPort",
    url: "http://localhost:5180",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

- [ ] **Step 5: Write `e2e/core-flow.spec.ts`**

```ts
import { expect, test } from "@playwright/test";

async function answerSurvey(page: import("@playwright/test").Page) {
  await page.goto("/s/mangwon-01");
  await page.getByText("아이스크림·디저트", { exact: true }).click();
  await page.getByText("주 1~2회", { exact: true }).click();
  await page.getByText("5천~1만원", { exact: true }).click();
  await page.getByText("오후", { exact: true }).click();
  await page.getByText("주민", { exact: true }).click();
  await page.getByRole("button", { name: "제출하기" }).click();
}

test("unknown space is a 404", async ({ page }) => {
  const res = await page.goto("/s/does-not-exist");
  expect(res?.status()).toBe(404);
});

test("survey → cooldown → public summary", async ({ page }) => {
  await answerSurvey(page);
  await expect(page.getByText("응답이 저장됐어요. 고마워요!")).toBeVisible();
  await answerSurvey(page);
  await expect(page.getByText("이미 응답하셨어요.")).toBeVisible();

  await page.goto("/r/mangwon-01");
  await expect(page.getByText(/응답자 \d+명 중 \d+명이 이용 의향/).first()).toBeVisible();
});

test("application → admin sees it after login", async ({ page }) => {
  const name = `테스트${Date.now() % 100000}`;
  await page.goto("/apply/mangwon-01");
  await page.getByLabel("하고 싶은 업종").fill("젤라또 가게");
  await page.getByLabel("사업계획", { exact: true }).fill("동네 주민 대상 소형 젤라또 가게");
  await page.getByLabel("예상 창업 비용 (만원)").fill("4000");
  await page.getByLabel("이름").fill(name);
  await page.getByLabel("이메일 (결과 링크를 받을 주소)").fill("e2e@example.com");
  await page.locator('input[name="consentPrivacy"]').check();
  await page.locator('input[name="consentIntroTerms"]').check();
  await page.getByRole("button", { name: "무료로 신청하기" }).click();
  await expect(page.getByText("신청이 접수됐어요")).toBeVisible();

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.getByLabel("이메일").fill("admin@ssulmo.local");
  await page.getByLabel("비밀번호").fill("ssulmo-dev");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByText(`${name} · 젤라또 가게`)).toBeVisible();
});

test("result page → paid feedback request shows transfer details", async ({ page }) => {
  expect((await page.goto(`/result/${"0".repeat(32)}`))?.status()).toBe(404);

  // Seeded 이예시 has a written result; reruns land directly on the transfer step.
  await page.goto(`/result/${"b".repeat(32)}`);
  await expect(page.getByText("보완하면 좋아요")).toBeVisible();
  const consent = page.locator('input[name="consentFeeTerms"]');
  if (await consent.count()) {
    await consent.check();
    await page.getByRole("button", { name: "피드백 신청하기" }).click();
  }
  await expect(page.getByText("입금 안내 · 사업계획서 검토 및 피드백 서비스")).toBeVisible();
  await expect(page.getByText("10,000원")).toBeVisible();
});
```

- [ ] **Step 6: Run e2e**

Run: `npx playwright install chromium && npm run e2e` → Expected: 4 passed.

- [ ] **Step 7: Replace `README.md`** (≤ 10 lines)

```markdown
# 썰모 (Ssulmo) prototype
1. Local: `npm install && cp .dev.vars.example .dev.vars && npm run db:migrate && npm run db:seed && npm run dev` → http://localhost:5173 (admin: admin@ssulmo.local / ssulmo-dev)
2. Env (`.dev.vars` locally, `wrangler secret put` in prod): `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` (`node scripts/hash-password.ts <pw>`), `SESSION_SECRET`.
3. Bindings (`wrangler.json`): D1 `DB` (database `ssulmo`), R2 `UPLOADS` (bucket `ssulmo-uploads`).
4. Deploy: `wrangler d1 create ssulmo` → paste id into `wrangler.json`; `wrangler r2 bucket create ssulmo-uploads`;
   `wrangler d1 migrations apply ssulmo --remote`; set the 3 secrets; `npm run deploy`.
5. Tests: `npm test` (unit, Node 24) · `npm run e2e` (Playwright, needs seeded local DB).
6. Open items: `grep -rn "TODO(legal)\|TODO(survey)" app`.
```

- [ ] **Step 8: Final verification**

Run: `npm run typecheck && npm test && npm run e2e` → all green.
Run: `grep -rn "TODO(legal)\|TODO(survey)" app` → list these for the user's report.
Run: `grep -rniE "임대료|보증금|월세|수수료|commission|rent|deposit" app` → Expected: no matches except the "임대료·보증금 등 계약 조건은 입력하지 않아요." helper line on the space form.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: seed data, README and Playwright core-flow test"
```
