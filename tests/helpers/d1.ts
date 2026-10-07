// Minimal D1 stand-in over node:sqlite so server modules can be tested in
// Node against the real migration files. Covers only what the app uses:
// prepare().bind().first() / .all() / .run().
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Param = string | number | null;

export function createTestDb(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).sort()) {
    sqlite.exec(readFileSync(join(dir, file), "utf8"));
  }

  const statement = (sql: string, params: Param[]) => ({
    bind: (...next: Param[]) => statement(sql, next),
    first: async () => (sqlite.prepare(sql).get(...params) as unknown) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => {
      const r = sqlite.prepare(sql).run(...params);
      return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
    },
  });

  return { prepare: (sql: string) => statement(sql, []) } as unknown as D1Database;
}
