// Sliding-window limiter over the auth_attempts table (spec 2026-10-10-owner-accounts §6).
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Records one attempt for `key` unless `max` attempts already happened inside `windowMs`.
 * Blocked attempts are not recorded, so hammering a key cannot extend its own lockout.
 */
export async function hit(db: D1Database, key: string, max: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE key = ? AND created_at > ?")
    .bind(key, now - windowMs)
    .first<{ n: number }>();
  if ((row?.n ?? 0) >= max) return false;
  await db.prepare("INSERT INTO auth_attempts (key, created_at) VALUES (?, ?)").bind(key, now).run();
  await db.prepare("DELETE FROM auth_attempts WHERE created_at < ?").bind(now - DAY_MS).run();
  return true;
}

export const ADMIN_LOGIN_MAX_FAILURES = 5;
export const ADMIN_LOGIN_WINDOW_MS = 15 * 60_000;
const adminKey = (ip: string) => `admin-login:${ip}`;

/**
 * Records an attempt and says whether it may proceed, in ONE statement so a burst of parallel
 * requests cannot all pass a check before any is counted. Call before verifying the password;
 * a successful login then clears the counter, so only failures accumulate.
 */
export async function tryAdminLoginAttempt(db: D1Database, ip: string, now = Date.now()): Promise<boolean> {
  const res = await db
    .prepare(
      `INSERT INTO auth_attempts (key, created_at) SELECT ?, ?
       WHERE (SELECT COUNT(*) FROM auth_attempts WHERE key = ? AND created_at > ?) < ?`,
    )
    .bind(adminKey(ip), now, adminKey(ip), now - ADMIN_LOGIN_WINDOW_MS, ADMIN_LOGIN_MAX_FAILURES)
    .run();
  return res.meta.changes === 1;
}

export async function clearAdminLoginAttempts(db: D1Database, ip: string): Promise<void> {
  await db.prepare("DELETE FROM auth_attempts WHERE key = ?").bind(adminKey(ip)).run();
}

/** Cloudflare sets CF-Connecting-IP; without it all callers share one bucket (stricter, never looser). */
export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP")?.trim() || "unknown";
}
