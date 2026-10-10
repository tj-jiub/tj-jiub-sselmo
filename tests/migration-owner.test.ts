import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/d1";
import { createSpace } from "~/lib/spaces.server";

describe("migration 0005", () => {
  it("keeps existing spaces public: they become status 'active' with no owner", () => {
    const sqlite = new DatabaseSync(":memory:");
    const dir = join(process.cwd(), "migrations");
    const files = readdirSync(dir).sort();
    for (const f of files.filter((f) => f < "0005")) sqlite.exec(readFileSync(join(dir, f), "utf8"));
    sqlite.exec("INSERT INTO spaces (name, neighborhood, slug, owner_consent, created_at) VALUES ('old', 'n', 'old-space', 1, 1)");
    for (const f of files.filter((f) => f >= "0005")) sqlite.exec(readFileSync(join(dir, f), "utf8"));
    expect(sqlite.prepare("SELECT status, owner_id FROM spaces").get()).toEqual({ status: "active", owner_id: null });
  });

  it("rejects an unknown status and a duplicate owner email in any case", async () => {
    const db = createTestDb();
    const id = await createSpace(db, { name: "A", district: "마포구", neighborhood: "n", slug: "a-space", ownerConsent: true, consentFileKey: null });
    await expect(db.prepare("UPDATE spaces SET status = 'weird' WHERE id = ?").bind(id).run()).rejects.toThrow();
    await db.prepare("INSERT INTO owners (email, created_at) VALUES ('A@x.kr', 1)").run();
    await expect(db.prepare("INSERT INTO owners (email, created_at) VALUES ('a@X.KR', 1)").run()).rejects.toThrow();
  });

  it("token hashes are unique", async () => {
    const db = createTestDb();
    await db.prepare("INSERT INTO owner_login_tokens (email, token_hash, expires_at, created_at) VALUES ('a@x.kr', 'h', 1, 1)").run();
    await expect(db.prepare("INSERT INTO owner_login_tokens (email, token_hash, expires_at, created_at) VALUES ('b@x.kr', 'h', 1, 1)").run()).rejects.toThrow();
  });
});
