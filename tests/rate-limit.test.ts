import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { adminLoginBlocked, clientIp, hit, recordAdminLoginFailure } from "~/lib/rate-limit.server";

describe("hit", () => {
  it("allows up to max inside the window, then blocks without extending the lockout", async () => {
    const db = createTestDb();
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(await hit(db, "k", 3, 600_000, t + i)).toBe(true);
    expect(await hit(db, "k", 3, 600_000, t + 10)).toBe(false);
    expect(await hit(db, "k", 3, 600_000, t + 599_999)).toBe(false); // blocked attempts are not recorded
    expect(await hit(db, "k", 3, 600_000, t + 600_001)).toBe(true); // first three have aged out
  });
  it("keeps keys independent", async () => {
    const db = createTestDb();
    expect(await hit(db, "a", 1, 1000, 5)).toBe(true);
    expect(await hit(db, "a", 1, 1000, 6)).toBe(false);
    expect(await hit(db, "b", 1, 1000, 6)).toBe(true);
  });
  it("prunes rows older than a day", async () => {
    const db = createTestDb();
    await hit(db, "old", 5, 1000, 1);
    await hit(db, "new", 5, 1000, 2 * 24 * 3600 * 1000);
    const left = await db.prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE key = 'old'").first<{ n: number }>();
    expect(left!.n).toBe(0);
  });
});

describe("admin login limiter", () => {
  it("blocks the 6th attempt inside 15 minutes per IP only", async () => {
    const db = createTestDb();
    const t = 5_000_000;
    for (let i = 0; i < 5; i++) {
      expect(await adminLoginBlocked(db, "1.1.1.1", t + i)).toBe(false);
      await recordAdminLoginFailure(db, "1.1.1.1", t + i);
    }
    expect(await adminLoginBlocked(db, "1.1.1.1", t + 10)).toBe(true);
    expect(await adminLoginBlocked(db, "2.2.2.2", t + 10)).toBe(false);
    expect(await adminLoginBlocked(db, "1.1.1.1", t + 15 * 60_000 + 10)).toBe(false);
  });
});

describe("clientIp", () => {
  it("reads CF-Connecting-IP, falls back to a constant", () => {
    expect(clientIp(new Request("http://x", { headers: { "CF-Connecting-IP": "9.9.9.9" } }))).toBe("9.9.9.9");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});
