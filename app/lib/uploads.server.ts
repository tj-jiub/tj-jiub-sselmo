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
export async function storeUpload(bucket: R2Bucket, prefix: string, file: File): Promise<string> {
  const key = `${prefix}/${crypto.randomUUID()}.${extensionOf(file.name)}`;
  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  return key;
}
