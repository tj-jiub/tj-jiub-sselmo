import { createCookieSessionStorage, redirect } from "react-router";
import { toHex } from "./hex.ts";
import { loginMailBody, type Mailer } from "./mail.server.ts";
import { hit } from "./rate-limit.server.ts";
import type { ParseResult } from "./result.ts";

export const LOGIN_TOKEN_TTL_MS = 15 * 60_000;
const SESSION_MAX_AGE_S = 60 * 60 * 24 * 14;

export type Owner = {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  consentTermsAt: number | null;
  consentPrivacyAt: number | null;
};

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** Returns the raw token (emailed, never stored). Only its SHA-256 goes into the database. */
export async function createLoginToken(db: D1Database, email: string, now = Date.now()): Promise<string> {
  const raw = toHex(crypto.getRandomValues(new Uint8Array(32)));
  await db
    .prepare("INSERT INTO owner_login_tokens (email, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(email, await sha256Hex(raw), now + LOGIN_TOKEN_TTL_MS, now)
    .run();
  return raw;
}

/** One statement: marking used and checking unused/unexpired cannot race, so a token works once. */
export async function consumeLoginToken(db: D1Database, raw: string, now = Date.now()): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(raw)) return null;
  const row = await db
    .prepare("UPDATE owner_login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email")
    .bind(now, await sha256Hex(raw), now)
    .first<{ email: string }>();
  return row?.email ?? null;
}

type OwnerRow = {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  consent_terms_at: number | null;
  consent_privacy_at: number | null;
};
const toOwner = (r: OwnerRow): Owner => ({
  id: r.id,
  email: r.email,
  name: r.name,
  phone: r.phone,
  consentTermsAt: r.consent_terms_at,
  consentPrivacyAt: r.consent_privacy_at,
});

export async function upsertOwner(db: D1Database, email: string, now = Date.now()): Promise<Owner> {
  const row = await db
    .prepare(
      `INSERT INTO owners (email, created_at, last_login_at) VALUES (?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET last_login_at = excluded.last_login_at
       RETURNING id, email, name, phone, consent_terms_at, consent_privacy_at`,
    )
    .bind(email, now, now)
    .first<OwnerRow>();
  return toOwner(row!);
}

export const ownerProfileComplete = (o: Owner) => Boolean(o.name && o.phone && o.consentTermsAt && o.consentPrivacyAt);

export function parseOwnerProfile(form: FormData): ParseResult<{ name: string; phone: string }> {
  const name = String(form.get("name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  if (!name || name.length > 40) return { ok: false, error: "이름을 40자 이내로 적어 주세요." };
  if (!/^[0-9+\-\s]{9,20}$/.test(phone)) return { ok: false, error: "연락처를 숫자로 적어 주세요. (예: 010-1234-5678)" };
  // TODO(legal): wording and scope of the terms / privacy consents.
  if (form.get("consentTerms") !== "on" || form.get("consentPrivacy") !== "on") {
    return { ok: false, error: "이용약관과 개인정보 수집·이용에 동의해 주세요." };
  }
  return { ok: true, value: { name, phone } };
}

export async function saveOwnerProfile(db: D1Database, ownerId: number, p: { name: string; phone: string }, now = Date.now()): Promise<void> {
  await db
    .prepare("UPDATE owners SET name = ?, phone = ?, consent_terms_at = ?, consent_privacy_at = ? WHERE id = ?")
    .bind(p.name, p.phone, now, now, ownerId)
    .run();
}

export const OWNER_LINK_EMAIL_MAX = 3;
export const OWNER_LINK_EMAIL_WINDOW_MS = 10 * 60_000;
export const OWNER_LINK_IP_MAX = 20;
export const OWNER_LINK_IP_WINDOW_MS = 60 * 60_000;

export type LoginLinkResult = { status: "sent" | "invalid"; devLink: string | null };

/**
 * The caller always shows the same neutral message for "sent": a rate-limited or
 * unknown address is indistinguishable from a delivered mail.
 */
export async function requestLoginLink(
  db: D1Database,
  input: { email: string; ip: string; origin: string; mailer: Mailer | null; showDevLink: boolean },
  now = Date.now(),
): Promise<LoginLinkResult> {
  const email = normalizeEmail(input.email);
  if (!email) return { status: "invalid", devLink: null };
  const emailOk = await hit(db, `owner-link:email:${email}`, OWNER_LINK_EMAIL_MAX, OWNER_LINK_EMAIL_WINDOW_MS, now);
  const ipOk = await hit(db, `owner-link:ip:${input.ip}`, OWNER_LINK_IP_MAX, OWNER_LINK_IP_WINDOW_MS, now);
  if (!emailOk || !ipOk) return { status: "sent", devLink: null };

  const link = `${input.origin}/owner/verify?token=${await createLoginToken(db, email, now)}`;
  if (input.mailer) {
    try {
      await input.mailer.send(email, loginMailBody(link));
    } catch {
      // Swallowed on purpose: the page answers the same either way. Never log the link.
      console.error("owner login mail failed");
    }
    return { status: "sent", devLink: null };
  }
  return { status: "sent", devLink: input.showDevLink ? link : null };
}

// A separate cookie name and secret context from the admin session: neither cookie can stand in for the other.
export type OwnerAuthEnv = { SESSION_SECRET: string };
function sessions(request: Request, env: OwnerAuthEnv) {
  return createCookieSessionStorage({
    cookie: {
      name: "ssulmo_owner",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_S,
      secure: new URL(request.url).protocol === "https:",
      secrets: [`${env.SESSION_SECRET}:owner`],
    },
  });
}

/** Fresh session on every login (no fixation): the cookie carries only the owner id. */
export async function startOwnerSession(request: Request, env: OwnerAuthEnv, ownerId: number, to: string): Promise<Response> {
  const storage = sessions(request, env);
  const session = await storage.getSession();
  session.set("ownerId", ownerId);
  return redirect(to, { headers: { "Set-Cookie": await storage.commitSession(session) } });
}

export async function endOwnerSession(request: Request, env: OwnerAuthEnv): Promise<Response> {
  const storage = sessions(request, env);
  const session = await storage.getSession(request.headers.get("Cookie"));
  return redirect("/owner", { headers: { "Set-Cookie": await storage.destroySession(session) } });
}

/** Re-reads the owner on every request, so a deleted account loses access at once. */
export async function getOwner(request: Request, env: OwnerAuthEnv & { DB: D1Database }): Promise<Owner | null> {
  const session = await sessions(request, env).getSession(request.headers.get("Cookie"));
  const id = session.get("ownerId");
  if (typeof id !== "number") return null;
  const row = await env.DB
    .prepare("SELECT id, email, name, phone, consent_terms_at, consent_privacy_at FROM owners WHERE id = ?")
    .bind(id)
    .first<OwnerRow>();
  return row ? toOwner(row) : null;
}

// Call in every /owner loader AND action (a layout loader does not run for actions).
export async function requireOwner(request: Request, env: OwnerAuthEnv & { DB: D1Database }): Promise<Owner> {
  const owner = await getOwner(request, env);
  if (!owner) throw redirect("/owner");
  return owner;
}
