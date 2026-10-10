import type { ParseResult } from "./result";

export type Space = {
  id: number;
  name: string;
  neighborhood: string;
  district: string | null;
  slug: string;
  owner_consent: number;
  consent_file_key: string | null;
  location_notes: string | null;
  owner_token: string | null;
  owner_id: number | null;
  status: "pending" | "active" | "rejected";
  reject_reason: string | null;
  photo_keys: string | null;
  /** R2 key of the cover photo (one of photo_keys); null = none. */
  cover_key: string | null;
  margin_pct: number | null;
  scale_factor: number;
  created_at: number;
};

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export function parseSpaceForm(
  form: FormData,
): ParseResult<{ name: string; district: string; neighborhood: string; slug: string; ownerConsent: boolean }> {
  const name = String(form.get("name") ?? "").trim();
  const district = String(form.get("district") ?? "").trim();
  const neighborhood = String(form.get("neighborhood") ?? "").trim();
  const slug = String(form.get("slug") ?? "").trim();
  if (!name || name.length > 60) return { ok: false, error: "공간 이름을 60자 이내로 적어 주세요." };
  if (!district || district.length > 20 || !district.endsWith("구")) {
    return { ok: false, error: "구를 적어 주세요. (예: 마포구)" };
  }
  if (!neighborhood || neighborhood.length > 60) return { ok: false, error: "동네를 적어 주세요. (예: 마포구 망원동)" };
  if (!SLUG_PATTERN.test(slug)) return { ok: false, error: "주소용 이름은 영문 소문자·숫자·하이픈 3~40자로 적어 주세요." };
  return { ok: true, value: { name, district, neighborhood, slug, ownerConsent: form.get("ownerConsent") === "on" } };
}

export async function slugTaken(db: D1Database, slug: string): Promise<boolean> {
  return (await db.prepare("SELECT 1 FROM spaces WHERE slug = ?").bind(slug).first()) !== null;
}

export async function createSpace(
  db: D1Database,
  input: { name: string; district: string; neighborhood: string; slug: string; ownerConsent: boolean; consentFileKey: string | null },
  now = Date.now(),
): Promise<number> {
  const res = await db
    .prepare(
      "INSERT INTO spaces (name, district, neighborhood, slug, owner_consent, consent_file_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(input.name, input.district, input.neighborhood, input.slug, input.ownerConsent ? 1 : 0, input.consentFileKey, now)
    .run();
  return res.meta.last_row_id;
}

export async function setOwnerConsent(db: D1Database, id: number, consent: boolean): Promise<void> {
  await db.prepare("UPDATE spaces SET owner_consent = ? WHERE id = ?").bind(consent ? 1 : 0, id).run();
}

export async function getSpace(db: D1Database, id: number): Promise<Space | null> {
  return db.prepare("SELECT * FROM spaces WHERE id = ?").bind(id).first<Space>();
}

/**
 * The one public gate: a space is visible to anonymous visitors only when the operator has
 * approved it (status) AND the building owner consents. Every public query must use this.
 */
export const PUBLIC_SPACE_SQL = "status = 'active' AND owner_consent = 1";

// Public pages must use this: a space that is not public does not exist
// as far as anonymous visitors are concerned.
export async function getPublicSpace(db: D1Database, slug: string): Promise<Space | null> {
  return db.prepare(`SELECT * FROM spaces WHERE slug = ? AND ${PUBLIC_SPACE_SQL}`).bind(slug).first<Space>();
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

export async function listPublicSpaces(db: D1Database): Promise<Space[]> {
  const { results } = await db.prepare(`SELECT * FROM spaces WHERE ${PUBLIC_SPACE_SQL} ORDER BY id DESC`).all<Space>();
  return results;
}

export type SpaceSettings = { locationNotes: string | null; marginPct: number | null; scaleFactor: number };

export function parseSpaceSettings(form: FormData): ParseResult<SpaceSettings> {
  const notes = String(form.get("locationNotes") ?? "").trim();
  if (notes.length > 500) return { ok: false, error: "위치 특징은 500자 이내로 적어 주세요." };
  const margin = String(form.get("marginPct") ?? "").trim();
  if (margin && (!/^\d+$/.test(margin) || Number(margin) < 1 || Number(margin) > 90)) {
    return { ok: false, error: "순이익률은 1~90 사이 정수로 적어 주세요. 비워 두면 업종별 기본값을 써요." };
  }
  const scaleRaw = String(form.get("scaleFactor") ?? "").trim();
  const scale = Number(scaleRaw);
  if (!/^\d+(\.\d+)?$/.test(scaleRaw) || scale <= 0 || scale > 1000) {
    return { ok: false, error: "환산 배수는 0보다 크고 1000 이하인 숫자로 적어 주세요." };
  }
  return { ok: true, value: { locationNotes: notes || null, marginPct: margin ? Number(margin) : null, scaleFactor: scale } };
}

export async function saveSpaceSettings(db: D1Database, id: number, s: SpaceSettings): Promise<void> {
  await db
    .prepare("UPDATE spaces SET location_notes = ?, margin_pct = ?, scale_factor = ? WHERE id = ?")
    .bind(s.locationNotes, s.marginPct, s.scaleFactor, id)
    .run();
}
