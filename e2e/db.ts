import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Read-only helper for specs: runs one SELECT against the local D1 (never production) and returns its rows. */
export function dbRows<T = Record<string, unknown>>(sql: string): T[] {
  const dir = mkdtempSync(join(tmpdir(), "ssulmo-e2e-"));
  const file = join(dir, "query.sql");
  try {
    writeFileSync(file, sql, "utf8");
    // execSync goes through a shell, which Windows needs (`npx` is `npx.cmd` there).
    const out = execSync(`npx wrangler d1 execute ssulmo --local --json --file="${file}"`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const parsed = JSON.parse(out.slice(out.indexOf("["))) as Array<{ results: T[] }>;
    return parsed[0]?.results ?? [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const kstMonthNow = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 7);
