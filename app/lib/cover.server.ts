import { resolveCoverKey } from "./cover.ts";
import { addSpacePhotos, getOwnedSpace, setCoverKey } from "./owner-spaces.server.ts";
import { checkPhotos, MAX_PHOTOS, photoContentType, storeUpload } from "./uploads.server.ts";
import type { Space } from "./spaces.server.ts";
import { getPublicSpace } from "./spaces.server.ts";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const notFound = () => new Response("Not found", { status: 404 });

export function photoKeysOf(space: Pick<Space, "photo_keys">): string[] {
  try {
    const v = space.photo_keys ? (JSON.parse(space.photo_keys) as unknown) : [];
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

async function streamImage(bucket: R2Bucket, key: string | null, cacheControl: string): Promise<Response> {
  if (!key) return notFound();
  const object = await bucket.get(key);
  const type = object?.httpMetadata?.contentType;
  // Never serve anything that is not a plain raster image from these routes.
  if (!object || !type || !IMAGE_TYPES.has(type)) return notFound();
  return new Response(object.body, {
    headers: { "Content-Type": type, "Cache-Control": cacheControl, "X-Content-Type-Options": "nosniff" },
  });
}

/** Anonymous cover: only for a public space (active AND owner consent). Everything else is the same 404. */
export async function publicCoverResponse(env: { DB: D1Database; UPLOADS: R2Bucket }, slug: string): Promise<Response> {
  const space = await getPublicSpace(env.DB, slug);
  if (!space) return notFound();
  return streamImage(env.UPLOADS, resolveCoverKey(photoKeysOf(space), space.cover_key), "public, max-age=3600");
}

/** The owner's own photo: the cover when `index` is null, otherwise the photo at that position. Other owners' ids give 404. */
export async function ownerPhotoResponse(
  env: { DB: D1Database; UPLOADS: R2Bucket },
  ownerId: number,
  spaceId: number,
  index: number | null,
): Promise<Response> {
  const space = await getOwnedSpace(env.DB, ownerId, spaceId);
  if (!space) return notFound();
  const keys = photoKeysOf(space);
  const key = index === null ? resolveCoverKey(keys, space.cover_key) : (keys[index] ?? null);
  return streamImage(env.UPLOADS, key, "private, no-store");
}

export type PhotosResult = { ok: true } | { ok: false; status: 400 | 404; error: string };

/** Handles the "사진 바꾸기" form: intent=cover (radio `cover`) or intent=add (files `photos`). */
export async function applyPhotosForm(
  env: { DB: D1Database; UPLOADS: R2Bucket },
  ownerId: number,
  spaceId: number,
  form: FormData,
): Promise<PhotosResult> {
  const space = await getOwnedSpace(env.DB, ownerId, spaceId);
  if (!space || (space.status !== "pending" && space.status !== "active")) return { ok: false, status: 404, error: "Not found" };
  if (form.get("intent") === "cover") {
    const ok = await setCoverKey(env.DB, ownerId, spaceId, String(form.get("cover") ?? ""));
    return ok ? { ok: true } : { ok: false, status: 400, error: "대표 사진으로 고를 수 없는 사진이에요." };
  }
  const checked = checkPhotos(form.getAll("photos"));
  if (!checked.ok) return { ok: false, status: 400, error: checked.error };
  if (checked.value.length === 0) return { ok: false, status: 400, error: "올릴 사진을 골라 주세요." };
  const room = MAX_PHOTOS - photoKeysOf(space).length;
  if (checked.value.length > room) {
    return { ok: false, status: 400, error: room > 0 ? `사진은 ${room}장만 더 올릴 수 있어요. (최대 ${MAX_PHOTOS}장)` : `사진은 최대 ${MAX_PHOTOS}장까지 올릴 수 있어요.` };
  }
  const keys: string[] = [];
  for (const file of checked.value) keys.push(await storeUpload(env.UPLOADS, "owner-photos", file, photoContentType(file)));
  if (!(await addSpacePhotos(env.DB, ownerId, spaceId, keys))) {
    await Promise.all(keys.map((k) => env.UPLOADS.delete(k)));
    return { ok: false, status: 400, error: "사진을 저장하지 못했어요. 다시 시도해 주세요." };
  }
  return { ok: true };
}
