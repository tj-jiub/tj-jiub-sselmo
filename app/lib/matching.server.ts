import { PUBLIC_SPACE_SQL } from "./spaces.server";
import { resolveCoverKey } from "./cover";
import { tallySpace, type SpaceTally } from "./matching";
import type { SurveyAnswers } from "./survey";

// Public gating lives here: only active + owner_consent = 1 spaces are ever read.
export async function loadPublicTallies(db: D1Database): Promise<SpaceTally[]> {
  const { results: spaces } = await db
    .prepare(`SELECT id, slug, name, neighborhood, district FROM spaces WHERE ${PUBLIC_SPACE_SQL} ORDER BY id`)
    .all<{ id: number; slug: string; name: string; neighborhood: string; district: string | null }>();
  const { results: rows } = await db
    .prepare(
      `SELECT r.space_id, r.answers FROM survey_responses r
       JOIN spaces s ON s.id = r.space_id WHERE s.status = 'active' AND s.owner_consent = 1`,
    )
    .all<{ space_id: number; answers: string }>();

  const bySpace = new Map<number, SurveyAnswers[]>();
  for (const row of rows) {
    const list = bySpace.get(row.space_id) ?? [];
    list.push(JSON.parse(row.answers) as SurveyAnswers);
    bySpace.set(row.space_id, list);
  }
  return spaces.map((s) =>
    tallySpace({ slug: s.slug, name: s.name, neighborhood: s.neighborhood, district: s.district }, bySpace.get(s.id) ?? []),
  );
}

/** Slugs of public spaces that have a cover photo. Non-public spaces never appear here. */
export async function loadPublicCoverSlugs(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(`SELECT slug, photo_keys, cover_key FROM spaces WHERE ${PUBLIC_SPACE_SQL}`)
    .all<{ slug: string; photo_keys: string | null; cover_key: string | null }>();
  return results
    .filter((r) => {
      let photos: string[] = [];
      try {
        photos = r.photo_keys ? (JSON.parse(r.photo_keys) as string[]) : [];
      } catch {
        // malformed photo_keys: treat as no photos
      }
      return resolveCoverKey(photos, r.cover_key) !== null;
    })
    .map((r) => r.slug);
}
