import { kstMonth } from "./admin-todo.server.ts";
import { resolveCoverKey } from "./cover.ts";
import { approveSpace, rejectSpace } from "./owner-spaces.server.ts";
import type { Space } from "./spaces.server.ts";

/** Application ids behind the "이번 달 매출 미기록" card (same definition as adminTodoCounts.revenueMissing). */
export async function revenueMissingIds(db: D1Database, now: number): Promise<Set<number>> {
  const { results } = await db
    .prepare(
      `SELECT a.id FROM applications a
       WHERE a.track = 'ssulmo' AND a.consent_consulting_at IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM consulting_months m WHERE m.application_id = a.id AND m.month = ?)`,
    )
    .bind(kstMonth(now))
    .all<{ id: number }>();
  return new Set(results.map((r) => r.id));
}

/** The cover key of a full space row, resolved against its photo list (null = no photo). */
export function spaceCoverKey(space: Pick<Space, "photo_keys" | "cover_key">): string | null {
  let keys: string[] = [];
  try {
    const v = space.photo_keys ? (JSON.parse(space.photo_keys) as unknown) : [];
    if (Array.isArray(v)) keys = v.filter((k): k is string => typeof k === "string");
  } catch {
    keys = [];
  }
  return resolveCoverKey(keys, space.cover_key);
}

export type ModerationError = { error: string; status: 400 | 409 };

/**
 * Approve / reject a pending owner space from a posted form (shared by the 할 일 queue and the space page).
 * Returns null on success, otherwise the user-facing error and HTTP status.
 */
export async function moderateSpace(db: D1Database, form: FormData): Promise<ModerationError | null> {
  const intent = form.get("intent");
  const rawId = String(form.get("spaceId") ?? "");
  if (!/^\d+$/.test(rawId)) return { error: "공실 번호가 올바르지 않아요.", status: 400 };
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) return { error: "공실 번호가 올바르지 않아요.", status: 400 };
  if (intent === "approve") {
    return (await approveSpace(db, id)) ? null : { error: "이미 처리됐거나 승인할 수 없는 공실이에요.", status: 409 };
  }
  if (intent === "reject") {
    return (await rejectSpace(db, id, String(form.get("reason") ?? ""))) ? null : { error: "이미 처리됐거나 반려할 수 없는 공실이에요.", status: 409 };
  }
  return { error: "알 수 없는 요청이에요.", status: 400 };
}
