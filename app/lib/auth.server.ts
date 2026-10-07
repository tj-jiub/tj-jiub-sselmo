import { createCookieSessionStorage, redirect } from "react-router";
import { fromHex, toHex } from "./hex.ts";

// Cloudflare Workers caps PBKDF2 at 100k iterations.
const ITERATIONS = 100_000;

export type AuthEnv = { ADMIN_EMAIL: string; ADMIN_PASSWORD_HASH: string; SESSION_SECRET: string };

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
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
