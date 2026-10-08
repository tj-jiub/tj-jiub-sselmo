import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = (f: string) => readFileSync(join(process.cwd(), "migrations", f), "utf8");

describe("0003_space_district", () => {
  it("backfills district from the neighborhood's first token when it ends with 구", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(sql("0001_init.sql"));
    db.exec(sql("0002_feedback_guard.sql"));
    const ins = db.prepare("INSERT INTO spaces (name, neighborhood, slug, created_at) VALUES (?, ?, ?, 0)");
    ins.run("a", "마포구 망원동", "aa-1");
    ins.run("b", "망원동", "bb-1");
    ins.run("c", "성동구", "cc-1");
    db.exec(sql("0003_space_district.sql"));
    const rows = db.prepare("SELECT slug, district FROM spaces ORDER BY slug").all();
    expect(rows).toEqual([
      { slug: "aa-1", district: "마포구" },
      { slug: "bb-1", district: null },
      { slug: "cc-1", district: "성동구" },
    ]);
  });
});
