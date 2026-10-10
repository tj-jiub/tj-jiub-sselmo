import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("migration 0006", () => {
  it("backfills cover_key from the first photo key and leaves others NULL", () => {
    const sqlite = new DatabaseSync(":memory:");
    const dir = join(process.cwd(), "migrations");
    const files = readdirSync(dir).sort();
    for (const f of files.filter((f) => f < "0006")) sqlite.exec(readFileSync(join(dir, f), "utf8"));
    const ins = sqlite.prepare("INSERT INTO spaces (name, neighborhood, slug, owner_consent, photo_keys, created_at) VALUES (?, 'n', ?, 1, ?, 1)");
    ins.run("with photos", "with-photos", JSON.stringify(["owner-photos/a.png", "owner-photos/b.png"]));
    ins.run("no photos", "no-photos", null);
    ins.run("broken", "broken-json", "not json");
    for (const f of files.filter((f) => f >= "0006")) sqlite.exec(readFileSync(join(dir, f), "utf8"));
    const cover = (slug: string) => (sqlite.prepare("SELECT cover_key FROM spaces WHERE slug = ?").get(slug) as { cover_key: string | null }).cover_key;
    expect(cover("with-photos")).toBe("owner-photos/a.png");
    expect(cover("no-photos")).toBeNull();
    expect(cover("broken-json")).toBeNull();
  });
});
