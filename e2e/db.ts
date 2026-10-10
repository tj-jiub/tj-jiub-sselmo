import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ATTEMPTS = 4;
const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Read-only helper for specs: runs one SELECT against the local D1 (never production) and returns its rows.
 * Retries briefly: while the dev server writes to the same local SQLite file, a read can hit a transient
 * lock (seen on Windows under parallel specs). The last error keeps wrangler's stderr for diagnosis.
 */
export function dbRows<T = Record<string, unknown>>(sql: string): T[] {
  const dir = mkdtempSync(join(tmpdir(), "ssulmo-e2e-"));
  const file = join(dir, "query.sql");
  try {
    writeFileSync(file, sql, "utf8");
    let lastError: unknown;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        // execSync goes through a shell, which Windows needs (`npx` is `npx.cmd` there).
        const out = execSync(`npx wrangler d1 execute ssulmo --local --json --file="${file}"`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        const parsed = JSON.parse(out.slice(out.indexOf("["))) as Array<{ results: T[] }>;
        return parsed[0]?.results ?? [];
      } catch (error) {
        lastError = error;
        if (attempt < ATTEMPTS) pause(400 * attempt);
      }
    }
    const stderr = (lastError as { stderr?: string }).stderr ?? "";
    throw new Error(`dbRows failed after ${ATTEMPTS} attempts: ${String(lastError)}\n${stderr.slice(-800)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const kstMonthNow = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 7);
