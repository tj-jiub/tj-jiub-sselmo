import type { ParseResult } from "./result";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "docx", "hwp", "hwpx"];

const extensionOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

export function checkUpload(value: FormDataEntryValue | null): ParseResult<File | null> {
  if (!(value instanceof File) || value.size === 0) return { ok: true, value: null };
  if (!ALLOWED_EXTENSIONS.includes(extensionOf(value.name))) {
    return { ok: false, error: "PDF, 이미지, 한글, 워드 파일만 올릴 수 있어요." };
  }
  if (value.size > MAX_UPLOAD_BYTES) return { ok: false, error: "파일은 10MB 이하만 올릴 수 있어요." };
  return { ok: true, value };
}

// Keys are random so a leaked key reveals nothing; files are only ever served
// through the admin-only /admin/files route.
export async function storeUpload(bucket: R2Bucket, prefix: string, file: File, contentType?: string): Promise<string> {
  const key = `${prefix}/${crypto.randomUUID()}.${extensionOf(file.name)}`;
  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: contentType ?? (file.type || "application/octet-stream") },
  });
  return key;
}

export const MAX_PHOTOS = 5;
const PHOTO_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

/** Owner photos: images only, at most 5, each within the usual size limit. Empty file inputs are ignored. */
export function checkPhotos(values: FormDataEntryValue[]): ParseResult<File[]> {
  const files = values.filter((v): v is File => v instanceof File && v.size > 0);
  if (files.length > MAX_PHOTOS) return { ok: false, error: `사진은 최대 ${MAX_PHOTOS}장까지 올릴 수 있어요.` };
  for (const f of files) {
    if (!PHOTO_EXTENSIONS.includes(extensionOf(f.name))) return { ok: false, error: "사진은 PNG, JPG, WEBP 파일만 올릴 수 있어요." };
    if (f.size > MAX_UPLOAD_BYTES) return { ok: false, error: "사진은 한 장에 10MB 이하만 올릴 수 있어요." };
  }
  return { ok: true, value: files };
}

const PHOTO_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
/** Photos get their content type from the (validated) extension, never from the client-supplied header. */
export const photoContentType = (file: File): string => PHOTO_TYPES[extensionOf(file.name)] ?? "application/octet-stream";
