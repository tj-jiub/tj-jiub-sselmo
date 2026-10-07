// tests/uploads.test.ts
import { describe, expect, it } from "vitest";
import { checkUpload, MAX_UPLOAD_BYTES } from "~/lib/uploads.server";

const file = (name: string, size: number) => new File([new Uint8Array(size)], name);

describe("checkUpload", () => {
  it("treats a missing or empty file as no upload", () => {
    expect(checkUpload(null)).toEqual({ ok: true, value: null });
    expect(checkUpload(file("empty.pdf", 0))).toEqual({ ok: true, value: null });
  });
  it("accepts allowed document types", () => {
    for (const name of ["plan.pdf", "plan.HWP", "plan.hwpx", "plan.docx", "scan.jpg", "scan.png"]) {
      expect(checkUpload(file(name, 10)).ok).toBe(true);
    }
  });
  it("rejects other types and oversized files", () => {
    expect(checkUpload(file("virus.exe", 10)).ok).toBe(false);
    expect(checkUpload(file("noext", 10)).ok).toBe(false);
    expect(checkUpload(file("big.pdf", MAX_UPLOAD_BYTES + 1)).ok).toBe(false);
  });
});
