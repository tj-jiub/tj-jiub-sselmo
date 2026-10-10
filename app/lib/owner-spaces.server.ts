import { listShortlist } from "./owner.server.ts";
import type { ParseResult } from "./result.ts";
import type { Space } from "./spaces.server.ts";
import { slugTaken } from "./spaces.server.ts";
import { toHex } from "./hex.ts";
import { MAX_PHOTOS } from "./uploads.server.ts";
import { resolveCoverKey } from "./cover.ts";

/** Stops one sign-up from flooding the operator queue and the photo bucket. */
export const MAX_PENDING_SPACES = 5;

export async function countPendingSpaces(db: D1Database, ownerId: number): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM spaces WHERE owner_id = ? AND status = 'pending'").bind(ownerId).first<{ n: number }>();
  return row?.n ?? 0;
}

export type OwnerSpaceInput = {
  name: string;
  district: string;
  neighborhood: string;
  locationNotes: string | null;
  photoKeys: string[];
};

export function parseOwnerSpaceForm(
  form: FormData,
): ParseResult<{ name: string; district: string; neighborhood: string; locationNotes: string | null }> {
  const name = String(form.get("name") ?? "").trim();
  const district = String(form.get("district") ?? "").trim();
  const dong = String(form.get("dong") ?? "").trim();
  const notes = String(form.get("locationNotes") ?? "").trim();
  if (!name || name.length > 60) return { ok: false, error: "공간 이름을 60자 이내로 적어 주세요." };
  if (!district || district.length > 20 || !district.endsWith("구")) return { ok: false, error: "구를 적어 주세요. (예: 성동구)" };
  if (!dong || dong.length > 40) return { ok: false, error: "동을 적어 주세요. (예: 성수동)" };
  if (notes.length > 500) return { ok: false, error: "위치 특징은 500자 이내로 적어 주세요." };
  // TODO(legal): how much ownership verification is enough (registry check etc.)? For now the owner's own check + operator review.
  if (form.get("ownerConfirm") !== "on") return { ok: false, error: "공간의 소유자(또는 위임받은 사람)인지 확인해 주세요." };
  return { ok: true, value: { name, district, neighborhood: `${district} ${dong}`, locationNotes: notes || null } };
}

export function parseOwnerSpaceEdit(form: FormData): ParseResult<{ name: string; locationNotes: string | null }> {
  const name = String(form.get("name") ?? "").trim();
  const notes = String(form.get("locationNotes") ?? "").trim();
  if (!name || name.length > 60) return { ok: false, error: "공간 이름을 60자 이내로 적어 주세요." };
  if (notes.length > 500) return { ok: false, error: "위치 특징은 500자 이내로 적어 주세요." };
  return { ok: true, value: { name, locationNotes: notes || null } };
}

/** Owner-registered spaces start pending; the owner's ownership check is the building-owner consent. */
export async function createOwnerSpace(db: D1Database, ownerId: number, input: OwnerSpaceInput, now = Date.now()): Promise<number> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = `space-${toHex(crypto.getRandomValues(new Uint8Array(5)))}`;
    if (await slugTaken(db, slug)) continue;
    const res = await db
      .prepare(
        `INSERT INTO spaces (name, district, neighborhood, slug, owner_consent, location_notes, owner_id, status, photo_keys, cover_key, created_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, 'pending', ?, ?, ?)`,
      )
      .bind(input.name, input.district, input.neighborhood, slug, input.locationNotes, ownerId, input.photoKeys.length ? JSON.stringify(input.photoKeys) : null, input.photoKeys[0] ?? null, now)
      .run();
    return res.meta.last_row_id;
  }
  throw new Error("could not generate a unique slug");
}

/** The ownership guard: null means "not yours" and callers answer 404 (never 403, so ids do not leak). */
export async function getOwnedSpace(db: D1Database, ownerId: number, spaceId: number): Promise<Space | null> {
  if (!Number.isSafeInteger(spaceId)) return null;
  return db.prepare("SELECT * FROM spaces WHERE id = ? AND owner_id = ?").bind(spaceId, ownerId).first<Space>();
}

export async function updatePendingSpace(
  db: D1Database,
  ownerId: number,
  spaceId: number,
  v: { name: string; locationNotes: string | null },
): Promise<boolean> {
  const res = await db
    .prepare("UPDATE spaces SET name = ?, location_notes = ? WHERE id = ? AND owner_id = ? AND status = 'pending'")
    .bind(v.name, v.locationNotes, spaceId, ownerId)
    .run();
  return res.meta.changes === 1;
}

function parseKeys(raw: string | null): string[] {
  try {
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The photos and cover the owner currently sees: the staged proposal when one is waiting, else the
 * published ones. On a pending space nothing is ever staged, so this is just the published state.
 */
export function ownerPhotoState(space: Pick<Space, "photo_keys" | "cover_key" | "pending_photo_keys" | "pending_cover_key">): {
  keys: string[];
  cover: string | null;
  staged: boolean;
} {
  const staged = space.pending_photo_keys !== null || space.pending_cover_key !== null;
  const keys = space.pending_photo_keys !== null ? parseKeys(space.pending_photo_keys) : parseKeys(space.photo_keys);
  return { keys, cover: resolveCoverKey(keys, space.pending_cover_key ?? space.cover_key), staged };
}

/**
 * Writes a photo change. A pending space is already under review as a whole, so it changes directly;
 * an active (public) space only stages the change until the operator approves (user decision 2026-10-10).
 */
async function writePhotos(db: D1Database, ownerId: number, space: Space, keys: string[], cover: string | null): Promise<boolean> {
  const sql =
    space.status === "pending"
      ? "UPDATE spaces SET photo_keys = ?, cover_key = ? WHERE id = ? AND owner_id = ? AND status = 'pending'"
      : "UPDATE spaces SET pending_photo_keys = ?, pending_cover_key = ? WHERE id = ? AND owner_id = ? AND status = 'active'";
  const res = await db.prepare(sql).bind(JSON.stringify(keys), cover, space.id, ownerId).run();
  return res.meta.changes === 1;
}

/** Owner picks the cover among the space's own photos. False = not yours, or not one of your photos. */
export async function setCoverKey(db: D1Database, ownerId: number, spaceId: number, key: string): Promise<boolean> {
  const space = await getOwnedSpace(db, ownerId, spaceId);
  if (!space || (space.status !== "pending" && space.status !== "active")) return false;
  const { keys } = ownerPhotoState(space);
  if (!keys.includes(key)) return false;
  return writePhotos(db, ownerId, space, keys, key);
}

/** Appends already-stored photo keys (max MAX_PHOTOS in total) while the space is pending or active. */
export async function addSpacePhotos(db: D1Database, ownerId: number, spaceId: number, keys: string[]): Promise<boolean> {
  const space = await getOwnedSpace(db, ownerId, spaceId);
  if (!space || keys.length === 0 || (space.status !== "pending" && space.status !== "active")) return false;
  const { keys: existing, cover } = ownerPhotoState(space);
  if (existing.length + keys.length > MAX_PHOTOS) return false;
  return writePhotos(db, ownerId, space, [...existing, ...keys], cover ?? keys[0]);
}

export type PhotoReview = {
  id: number;
  name: string;
  neighborhood: string;
  ownerName: string | null;
  currentCover: string | null;
  proposedCover: string | null;
  proposedKeys: string[];
  /** Photos in the proposal that are not published yet (what the operator is really checking). */
  newKeys: string[];
};

/** Active spaces whose owner proposed a photo change, oldest space first. */
export async function listPhotoReviews(db: D1Database): Promise<PhotoReview[]> {
  const { results } = await db
    .prepare(
      `SELECT s.*, o.name AS owner_name FROM spaces s LEFT JOIN owners o ON o.id = s.owner_id
       WHERE s.status = 'active' AND (s.pending_photo_keys IS NOT NULL OR s.pending_cover_key IS NOT NULL)
       ORDER BY s.id`,
    )
    .all<Space & { owner_name: string | null }>();
  return results.map((s) => {
    const published = parseKeys(s.photo_keys);
    const proposed = ownerPhotoState(s);
    return {
      id: s.id,
      name: s.name,
      neighborhood: s.neighborhood,
      ownerName: s.owner_name,
      currentCover: resolveCoverKey(published, s.cover_key),
      proposedCover: proposed.cover,
      proposedKeys: proposed.keys,
      newKeys: proposed.keys.filter((k) => !published.includes(k)),
    };
  });
}

/** Operator publishes the staged photos and cover. False = nothing was waiting. */
export async function approvePhotoChange(db: D1Database, spaceId: number): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE spaces SET photo_keys = COALESCE(pending_photo_keys, photo_keys), cover_key = COALESCE(pending_cover_key, cover_key),
              pending_photo_keys = NULL, pending_cover_key = NULL
       WHERE id = ? AND (pending_photo_keys IS NOT NULL OR pending_cover_key IS NOT NULL)`,
    )
    .bind(spaceId)
    .run();
  return res.meta.changes === 1;
}

/** Operator drops the proposal. Returns the newly uploaded keys that are now unused, for R2 cleanup. */
export async function rejectPhotoChange(db: D1Database, spaceId: number): Promise<{ ok: boolean; orphanKeys: string[] }> {
  const space = await db.prepare("SELECT * FROM spaces WHERE id = ?").bind(spaceId).first<Space>();
  if (!space || (space.pending_photo_keys === null && space.pending_cover_key === null)) return { ok: false, orphanKeys: [] };
  const published = new Set(parseKeys(space.photo_keys));
  const orphanKeys = parseKeys(space.pending_photo_keys).filter((k) => !published.has(k));
  const res = await db
    .prepare("UPDATE spaces SET pending_photo_keys = NULL, pending_cover_key = NULL WHERE id = ?")
    .bind(spaceId)
    .run();
  return { ok: res.meta.changes === 1, orphanKeys };
}

export type SpaceStage = "pending" | "collecting" | "evaluated" | "rejected" | "paused";
export type OwnerSpaceCard = {
  id: number;
  name: string;
  neighborhood: string;
  slug: string;
  status: Space["status"];
  stage: SpaceStage;
  /** The owner's own count: shown even below the public threshold (public pages still say "집계 중"). */
  responseCount: number;
  candidateCount: number;
  rejectReason: string | null;
  /** True when the space has a cover photo; the page links ownerCoverUrl(id). */
  hasCover: boolean;
};

export async function listOwnerSpaces(db: D1Database, ownerId: number): Promise<OwnerSpaceCard[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.name, s.neighborhood, s.slug, s.status, s.owner_consent, s.reject_reason, s.cover_key, s.photo_keys,
              (SELECT COUNT(*) FROM survey_responses r WHERE r.space_id = s.id) AS response_count
       FROM spaces s WHERE s.owner_id = ? ORDER BY s.id DESC`,
    )
    .bind(ownerId)
    .all<{ id: number; name: string; neighborhood: string; slug: string; status: Space["status"]; owner_consent: number; reject_reason: string | null; cover_key: string | null; photo_keys: string | null; response_count: number }>();
  const cards: OwnerSpaceCard[] = [];
  for (const s of results) {
    const isPublic = s.status === "active" && s.owner_consent === 1;
    const candidateCount = isPublic ? (await listShortlist(db, s.id)).length : 0;
    const stage: SpaceStage =
      s.status === "pending" ? "pending" : s.status === "rejected" ? "rejected" : !isPublic ? "paused" : candidateCount > 0 ? "evaluated" : "collecting";
    cards.push({
      id: s.id, name: s.name, neighborhood: s.neighborhood, slug: s.slug, status: s.status, stage,
      responseCount: s.response_count, candidateCount, rejectReason: s.reject_reason,
      hasCover: Boolean(s.cover_key) || parseKeys(s.photo_keys).length > 0,
    });
  }
  return cards;
}

// ---- admin side -----------------------------------------------------------

export type PendingSpace = {
  id: number;
  name: string;
  neighborhood: string;
  locationNotes: string | null;
  photoKeys: string[];
  createdAt: number;
  ownerName: string | null;
  ownerEmail: string;
  ownerPhone: string | null;
};

export async function listPendingSpaces(db: D1Database): Promise<PendingSpace[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.name, s.neighborhood, s.location_notes, s.photo_keys, s.created_at,
              o.name AS owner_name, o.email AS owner_email, o.phone AS owner_phone
       FROM spaces s JOIN owners o ON o.id = s.owner_id WHERE s.status = 'pending' ORDER BY s.id`,
    )
    .all<{ id: number; name: string; neighborhood: string; location_notes: string | null; photo_keys: string | null; created_at: number; owner_name: string | null; owner_email: string; owner_phone: string | null }>();
  return results.map((r) => ({
    id: r.id, name: r.name, neighborhood: r.neighborhood, locationNotes: r.location_notes,
    photoKeys: r.photo_keys ? (JSON.parse(r.photo_keys) as string[]) : [], createdAt: r.created_at,
    ownerName: r.owner_name, ownerEmail: r.owner_email, ownerPhone: r.owner_phone,
  }));
}

/** Only owner-registered spaces that are not live yet; admin-created spaces use the consent toggle. */
export async function approveSpace(db: D1Database, spaceId: number): Promise<boolean> {
  const res = await db
    .prepare("UPDATE spaces SET status = 'active', reject_reason = NULL WHERE id = ? AND owner_id IS NOT NULL AND status IN ('pending', 'rejected')")
    .bind(spaceId)
    .run();
  return res.meta.changes === 1;
}

export async function rejectSpace(db: D1Database, spaceId: number, reason: string): Promise<boolean> {
  const res = await db
    .prepare("UPDATE spaces SET status = 'rejected', reject_reason = ? WHERE id = ? AND owner_id IS NOT NULL AND status = 'pending'")
    .bind(reason.trim().slice(0, 200) || null, spaceId)
    .run();
  return res.meta.changes === 1;
}

export async function getSpaceOwner(db: D1Database, spaceId: number): Promise<{ id: number; name: string | null; email: string; phone: string | null } | null> {
  return db
    .prepare("SELECT o.id, o.name, o.email, o.phone FROM owners o JOIN spaces s ON s.owner_id = o.id WHERE s.id = ?")
    .bind(spaceId)
    .first<{ id: number; name: string | null; email: string; phone: string | null }>();
}
