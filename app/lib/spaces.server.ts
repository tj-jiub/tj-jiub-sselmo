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
