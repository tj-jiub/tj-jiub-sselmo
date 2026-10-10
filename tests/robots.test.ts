import { describe, expect, it } from "vitest";
import { needsNoindex } from "../app/lib/robots.ts";

describe("needsNoindex", () => {
  it("covers /admin and /owner trees", () => {
    for (const p of ["/admin", "/admin/", "/admin/login", "/admin/spaces/3", "/owner", "/owner/verify", "/owner/spaces/1/candidates"]) {
      expect(needsNoindex(p), p).toBe(true);
    }
  });
  it("does not match look-alike prefixes or public pages", () => {
    for (const p of ["/", "/find", "/administrator", "/owners-x", "/owner-x", "/s/admin", "/r/owner"]) {
      expect(needsNoindex(p), p).toBe(false);
    }
  });
});
