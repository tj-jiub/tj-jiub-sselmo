import { listShortlist, type Candidate } from "./owner.server.ts";
import type { ParseResult } from "./result.ts";
import { getOwnedSpace } from "./owner-spaces.server.ts";

export const MEMO_MAX = 1000;

/** Candidate (no name/email/plan/file keys by construction) plus the owner's own mark. */
export type OwnerCandidate = Candidate & { starred: boolean; memo: string };

/** null = not the owner's space (404). [] while the space is not public. */
export async function listOwnerCandidates(db: D1Database, ownerId: number, spaceId: number): Promise<OwnerCandidate[] | null> {
  const space = await getOwnedSpace(db, ownerId, spaceId);
  if (!space) return null;
  if (space.status !== "active" || space.owner_consent !== 1) return [];
  const candidates = await listShortlist(db, space.id);
  const { results } = await db
    .prepare("SELECT application_id, starred, memo FROM candidate_marks WHERE owner_id = ?")
    .bind(ownerId)
    .all<{ application_id: number; starred: number; memo: string | null }>();
  const marks = new Map(results.map((m) => [m.application_id, m]));
  return candidates.map((c) => ({ ...c, starred: marks.get(c.id)?.starred === 1, memo: marks.get(c.id)?.memo ?? "" }));
}

export function parseMarkForm(form: FormData): ParseResult<{ starred: boolean | undefined; memo: string | undefined }> {
  const starredRaw = form.get("starred");
  const memoRaw = form.get("memo");
  if (starredRaw === null && memoRaw === null) return { ok: false, error: "저장할 내용이 없어요." };
  if (starredRaw !== null && starredRaw !== "0" && starredRaw !== "1") return { ok: false, error: "관심 표시 값이 올바르지 않아요." };
  const memo = memoRaw === null ? undefined : String(memoRaw).trim();
  if (memo !== undefined && memo.length > MEMO_MAX) return { ok: false, error: `메모는 ${MEMO_MAX}자 이내로 적어 주세요.` };
  return { ok: true, value: { starred: starredRaw === null ? undefined : starredRaw === "1", memo } };
}

/**
 * Upserts a partial mark. false = the application is not on this owner's current shortlist
 * (someone else's, below the cut-off, unknown): the route answers 404.
 */
export async function saveMark(
  db: D1Database,
  ownerId: number,
  applicationId: number,
  v: { starred?: boolean; memo?: string },
  now = Date.now(),
): Promise<boolean> {
  if (!Number.isSafeInteger(applicationId)) return false;
  const app = await db
    .prepare("SELECT a.space_id FROM applications a JOIN spaces s ON s.id = a.space_id WHERE a.id = ? AND s.owner_id = ?")
    .bind(applicationId, ownerId)
    .first<{ space_id: number }>();
  if (!app) return false;
  const candidates = await listOwnerCandidates(db, ownerId, app.space_id);
  if (!candidates?.some((c) => c.id === applicationId)) return false;
  const starred = v.starred === undefined ? null : v.starred ? 1 : 0;
  const memo = v.memo === undefined ? null : v.memo;
  // COALESCE keeps the field the caller did not send, so a star toggle and a memo autosave in flight together cannot undo each other.
  await db
    .prepare(
      `INSERT INTO candidate_marks (owner_id, application_id, starred, memo, updated_at) VALUES (?, ?, COALESCE(?, 0), ?, ?)
       ON CONFLICT (owner_id, application_id) DO UPDATE SET
         starred = COALESCE(?, starred), memo = COALESCE(?, memo), updated_at = excluded.updated_at`,
    )
    .bind(ownerId, applicationId, starred, memo, now, starred, memo)
    .run();
  return true;
}

export type OwnerMark = { starred: boolean; memo: string; ownerName: string | null; updatedAt: number };
const MARK_SELECT = `SELECT m.application_id, m.starred, m.memo, m.updated_at, o.name AS owner_name
  FROM candidate_marks m
  JOIN applications a ON a.id = m.application_id
  JOIN spaces s ON s.id = a.space_id AND s.owner_id = m.owner_id
  JOIN owners o ON o.id = m.owner_id`;
type MarkRow = { application_id: number; starred: number; memo: string | null; updated_at: number; owner_name: string | null };
const toMark = (r: MarkRow): OwnerMark => ({ starred: r.starred === 1, memo: r.memo ?? "", ownerName: r.owner_name, updatedAt: r.updated_at });

/** Admin: the current owner's marks for one space, keyed by application id (read-only; shared with the operator by design). */
export async function listMarksForSpace(db: D1Database, spaceId: number): Promise<Map<number, OwnerMark>> {
  const { results } = await db.prepare(`${MARK_SELECT} WHERE s.id = ? AND (m.starred = 1 OR COALESCE(m.memo, '') != '')`).bind(spaceId).all<MarkRow>();
  return new Map(results.map((r) => [r.application_id, toMark(r)]));
}

export async function getMarkForApplication(db: D1Database, applicationId: number): Promise<OwnerMark | null> {
  const row = await db.prepare(`${MARK_SELECT} WHERE a.id = ? AND (m.starred = 1 OR COALESCE(m.memo, '') != '')`).bind(applicationId).first<MarkRow>();
  return row ? toMark(row) : null;
}
