/** Pure helpers for the space cover photo / avatar (no server imports: used by components too). */

/** Public cover URL. The route itself answers 404 unless the space is active and consented. */
export const publicCoverUrl = (slug: string) => `/media/space/${slug}/cover`;
/** Owner's own cover URL (owner-isolated route; works while the space is still pending). */
export const ownerCoverUrl = (spaceId: number) => `/owner/spaces/${spaceId}/cover`;
/** Admin file URL for any R2 key. */
export const adminFileUrl = (key: string) => `/admin/files/${key}`;

/** First Korean character of the 동 (last word of the neighborhood), else of the name, else "?". */
export function avatarInitial(name: string, neighborhood?: string | null): string {
  const isHangul = (c: string) => /[가-힣]/.test(c);
  const dong = neighborhood?.trim().split(/\s+/).pop() ?? "";
  for (const source of [dong, name.trim()]) {
    const found = [...source].find(isHangul);
    if (found) return found;
  }
  const first = [...name.trim()][0];
  return first ?? "?";
}

/** The stored cover if it is one of the photos, otherwise the first photo, otherwise null. */
export function resolveCoverKey(photoKeys: string[], coverKey: string | null): string | null {
  if (coverKey && photoKeys.includes(coverKey)) return coverKey;
  return photoKeys[0] ?? null;
}
