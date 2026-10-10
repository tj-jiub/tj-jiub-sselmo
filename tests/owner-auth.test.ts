import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import {
  consumeLoginToken, createLoginToken, endOwnerSession, getOwner, LOGIN_TOKEN_TTL_MS, normalizeEmail, ownerProfileComplete,
  parseOwnerProfile, requestLoginLink, requireOwner, saveOwnerProfile, startOwnerSession, upsertOwner,
} from "~/lib/owner-auth.server";
import { hashPassword, isAdmin } from "~/lib/auth.server";
import type { Mailer } from "~/lib/mail.server";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe("normalizeEmail", () => {
  it("trims, lowercases and rejects junk", () => {
    expect(normalizeEmail("  Owner@Example.COM ")).toBe("owner@example.com");
    for (const bad of ["", "no-at", "a@b", "a b@c.kr", "@x.kr", `${"a".repeat(250)}@x.kr`]) expect(normalizeEmail(bad)).toBeNull();
  });
});

describe("login tokens", () => {
  it("stores only a hash, and the raw token works exactly once", async () => {
    const db = createTestDb();
    const raw = await createLoginToken(db, "o@x.kr", 1000);
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    const row = await db.prepare("SELECT token_hash, expires_at FROM owner_login_tokens").first<{ token_hash: string; expires_at: number }>();
    expect(row!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.token_hash).not.toBe(raw);
    expect(row!.expires_at).toBe(1000 + LOGIN_TOKEN_TTL_MS);
    expect(await consumeLoginToken(db, raw, 2000)).toBe("o@x.kr");
    expect(await consumeLoginToken(db, raw, 2001)).toBeNull();
  });
  it("expires after 15 minutes and rejects wrong or empty tokens", async () => {
    const db = createTestDb();
    expect(LOGIN_TOKEN_TTL_MS).toBe(15 * 60_000);
    const raw = await createLoginToken(db, "o@x.kr", 0);
    expect(await consumeLoginToken(db, "f".repeat(64), 1)).toBeNull();
    expect(await consumeLoginToken(db, "", 1)).toBeNull();
    expect(await consumeLoginToken(db, raw, LOGIN_TOKEN_TTL_MS + 1)).toBeNull();
    // an expired attempt must not burn the token's used state in a way that matters, but it stays unusable
    expect(await consumeLoginToken(db, raw, LOGIN_TOKEN_TTL_MS + 2)).toBeNull();
  });
  it("two tokens for the same email are independent", async () => {
    const db = createTestDb();
    const a = await createLoginToken(db, "o@x.kr", 0);
    const b = await createLoginToken(db, "o@x.kr", 0);
    expect(a).not.toBe(b);
    expect(await consumeLoginToken(db, a, 1)).toBe("o@x.kr");
    expect(await consumeLoginToken(db, b, 1)).toBe("o@x.kr");
  });
});

describe("upsertOwner", () => {
  it("creates once per email (case-insensitive) and updates last_login_at", async () => {
    const db = createTestDb();
    const a = await upsertOwner(db, "o@x.kr", 100);
    const b = await upsertOwner(db, "O@X.KR", 200);
    expect(b.id).toBe(a.id);
    const row = await db.prepare("SELECT created_at, last_login_at FROM owners WHERE id = ?").bind(a.id).first<{ created_at: number; last_login_at: number }>();
    expect(row).toEqual({ created_at: 100, last_login_at: 200 });
    expect(ownerProfileComplete(a)).toBe(false);
  });
});

describe("owner profile", () => {
  it("requires name, phone and both consents", () => {
    expect(parseOwnerProfile(fd({ name: "이건물", phone: "010-1234-5678", consentTerms: "on", consentPrivacy: "on" }))).toEqual({
      ok: true, value: { name: "이건물", phone: "010-1234-5678" },
    });
    for (const bad of [
      { name: "", phone: "010-1234-5678", consentTerms: "on", consentPrivacy: "on" },
      { name: "a", phone: "abc", consentTerms: "on", consentPrivacy: "on" },
      { name: "a", phone: "010-1234-5678", consentPrivacy: "on" },
      { name: "a", phone: "010-1234-5678", consentTerms: "on" },
      { name: "가".repeat(41), phone: "010-1234-5678", consentTerms: "on", consentPrivacy: "on" },
    ]) expect(parseOwnerProfile(fd(bad)).ok).toBe(false);
  });
  it("saving completes the profile", async () => {
    const db = createTestDb();
    const o = await upsertOwner(db, "o@x.kr", 1);
    await saveOwnerProfile(db, o.id, { name: "이건물", phone: "010-1234-5678" }, 50);
    const again = await upsertOwner(db, "o@x.kr", 60);
    expect(again).toMatchObject({ name: "이건물", phone: "010-1234-5678", consentTermsAt: 50, consentPrivacyAt: 50 });
    expect(ownerProfileComplete(again)).toBe(true);
  });
});

describe("requestLoginLink", () => {
  const fixed = (sent: Array<{ to: string; text: string }>): Mailer => ({ send: async (to, body) => void sent.push({ to, text: body.text }) });
  const base = { origin: "https://ssulmo.test", ip: "1.1.1.1", showDevLink: false };

  it("mails a verify link; the page never learns the link", async () => {
    const db = createTestDb();
    const sent: Array<{ to: string; text: string }> = [];
    const r = await requestLoginLink(db, { ...base, email: "O@x.kr", mailer: fixed(sent) }, 1000);
    expect(r).toEqual({ status: "sent", devLink: null });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("o@x.kr");
    const token = /token=([0-9a-f]{64})/.exec(sent[0].text)![1];
    expect(sent[0].text).toContain("https://ssulmo.test/owner/verify?token=");
    expect(await consumeLoginToken(db, token, 2000)).toBe("o@x.kr");
  });
  it("without a mailer shows the link only when the dev flag is on", async () => {
    const db = createTestDb();
    const off = await requestLoginLink(db, { ...base, email: "o@x.kr", mailer: null }, 1);
    expect(off).toEqual({ status: "sent", devLink: null });
    const on = await requestLoginLink(db, { ...base, email: "o@x.kr", mailer: null, showDevLink: true }, 2);
    expect(on.devLink).toMatch(/^https:\/\/ssulmo\.test\/owner\/verify\?token=[0-9a-f]{64}$/);
  });
  it("answers identically for unknown and existing accounts and swallows mail failures", async () => {
    const db = createTestDb();
    await upsertOwner(db, "known@x.kr", 1);
    const boom: Mailer = { send: async () => { throw new Error("Resend 500"); } };
    const a = await requestLoginLink(db, { ...base, email: "known@x.kr", mailer: boom }, 10);
    const b = await requestLoginLink(db, { ...base, email: "unknown@x.kr", mailer: boom }, 11);
    expect(a).toEqual(b);
  });
  it("rejects a malformed address without creating anything", async () => {
    const db = createTestDb();
    expect(await requestLoginLink(db, { ...base, email: "nope", mailer: null }, 1)).toEqual({ status: "invalid", devLink: null });
    expect((await db.prepare("SELECT COUNT(*) AS n FROM owner_login_tokens").first<{ n: number }>())!.n).toBe(0);
  });
  it("limits to 3 per email per 10 minutes, with the same neutral answer and no token or mail", async () => {
    const db = createTestDb();
    const sent: Array<{ to: string; text: string }> = [];
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await requestLoginLink(db, { ...base, ip: `9.9.9.${i}`, email: "o@x.kr", mailer: fixed(sent) }, 1000 + i));
    expect(results.every((r) => r.status === "sent" && r.devLink === null)).toBe(true);
    expect(sent).toHaveLength(3);
    const later = await requestLoginLink(db, { ...base, ip: "9.9.9.9", email: "o@x.kr", mailer: fixed(sent) }, 1000 + 10 * 60_000 + 5);
    expect(later.status).toBe("sent");
    expect(sent).toHaveLength(4);
  });
  it("limits to 20 per IP per hour across emails, and shows no dev link when limited", async () => {
    const db = createTestDb();
    const sent: Array<{ to: string; text: string }> = [];
    for (let i = 0; i < 20; i++) await requestLoginLink(db, { ...base, email: `u${i}@x.kr`, mailer: fixed(sent) }, 1000 + i);
    expect(sent).toHaveLength(20);
    const over = await requestLoginLink(db, { ...base, email: "u99@x.kr", mailer: null, showDevLink: true }, 2000);
    expect(over).toEqual({ status: "sent", devLink: null });
    expect(sent).toHaveLength(20);
  });
});

describe("owner session", () => {
  const env = { SESSION_SECRET: "test-secret", ADMIN_EMAIL: "a@a.kr", ADMIN_PASSWORD_HASH: "" };
  const cookieOf = (res: Response) => res.headers.get("Set-Cookie")!.split(";")[0];
  const req = (cookie?: string) => new Request("http://localhost/owner/spaces", { headers: cookie ? { Cookie: cookie } : {} });

  it("start sets an httpOnly lax cookie and redirects; getOwner resolves the owner from the DB", async () => {
    const db = createTestDb();
    const o = await upsertOwner(db, "o@x.kr", 1);
    const res = await startOwnerSession(req(), env, o.id, "/owner/spaces");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/owner/spaces");
    const setCookie = res.headers.get("Set-Cookie")!;
    expect(setCookie).toMatch(/ssulmo_owner=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect((await getOwner(req(cookieOf(res)), { ...env, DB: db }))?.email).toBe("o@x.kr");
    expect(await getOwner(req(), { ...env, DB: db })).toBeNull();
  });
  it("marks the cookie Secure on https", async () => {
    const res = await startOwnerSession(new Request("https://ssulmo.test/owner/verify"), env, 1, "/owner/spaces");
    expect(res.headers.get("Set-Cookie")).toMatch(/Secure/i);
  });
  it("rejects a tampered cookie, a cookie signed with another secret, and a deleted owner", async () => {
    const db = createTestDb();
    const o = await upsertOwner(db, "o@x.kr", 1);
    const good = cookieOf(await startOwnerSession(req(), env, o.id, "/x"));
    expect(await getOwner(req(good.slice(0, -3) + "AAA"), { ...env, DB: db })).toBeNull();
    const other = cookieOf(await startOwnerSession(req(), { ...env, SESSION_SECRET: "different" }, o.id, "/x"));
    expect(await getOwner(req(other), { ...env, DB: db })).toBeNull();
    await db.prepare("DELETE FROM owners WHERE id = ?").bind(o.id).run();
    expect(await getOwner(req(good), { ...env, DB: db })).toBeNull();
  });
  it("an owner session is not an admin session and vice versa", async () => {
    const db = createTestDb();
    const o = await upsertOwner(db, "o@x.kr", 1);
    const ownerCookie = cookieOf(await startOwnerSession(req(), env, o.id, "/x"));
    expect(await isAdmin(req(ownerCookie), { ...env, ADMIN_PASSWORD_HASH: await hashPassword("x") })).toBe(false);
    const forged = ownerCookie.replace("ssulmo_owner=", "ssulmo_admin=");
    expect(await isAdmin(req(forged), env)).toBe(false);
  });
  it("requireOwner redirects anonymous visitors to /owner and returns the owner otherwise", async () => {
    const db = createTestDb();
    const o = await upsertOwner(db, "o@x.kr", 1);
    const thrown = await requireOwner(req(), { ...env, DB: db }).catch((r: Response) => r);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get("Location")).toBe("/owner");
    const cookie = cookieOf(await startOwnerSession(req(), env, o.id, "/x"));
    expect((await requireOwner(req(cookie), { ...env, DB: db })).id).toBe(o.id);
  });
  it("end clears the cookie", async () => {
    const res = await endOwnerSession(req(), env);
    expect(res.headers.get("Location")).toBe("/owner");
    expect(res.headers.get("Set-Cookie")).toMatch(/ssulmo_owner=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });
});
