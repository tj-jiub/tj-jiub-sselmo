import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Name prefix every e2e-created space / applicant / owner carries so the teardown can find it. */
export const E2E_PREFIX = "e2e·";

const OWNERS = `SELECT id FROM owners WHERE email LIKE 'e2e-%@example.com' OR name LIKE '${E2E_PREFIX}%'`;
const SPACES = `SELECT id FROM spaces WHERE name LIKE '${E2E_PREFIX}%' OR owner_id IN (${OWNERS})`;
const APPS = `SELECT id FROM applications WHERE contact_name LIKE '${E2E_PREFIX}%' OR space_id IN (${SPACES})`;

/** Children first, so foreign keys never block. Seed rows are never matched (their device hashes start with "seed-"). */
export const TEARDOWN_SQL = [
  `DELETE FROM consulting_months WHERE application_id IN (${APPS});`,
  `DELETE FROM educator_links WHERE application_id IN (${APPS});`,
  `DELETE FROM broker_intros WHERE application_id IN (${APPS});`,
  `DELETE FROM candidate_marks WHERE application_id IN (${APPS}) OR owner_id IN (${OWNERS});`,
  `DELETE FROM applications WHERE id IN (${APPS});`,
  // The survey e2e answers on a seed space; seeded answers all carry a "seed-" device hash.
  `DELETE FROM survey_responses WHERE space_id IN (${SPACES}) OR device_hash NOT LIKE 'seed-%';`,
  `DELETE FROM survey_contacts WHERE space_id IN (${SPACES});`,
  `DELETE FROM spaces WHERE id IN (${SPACES});`,
  `DELETE FROM owner_login_tokens WHERE email LIKE 'e2e-%@example.com';`,
  `DELETE FROM owners WHERE id IN (${OWNERS});`,
  "DELETE FROM auth_attempts;",
].join("\n");

// Local D1 only (--local); production data paths are never touched.
// execSync runs through a shell, which Windows needs: `npx` is `npx.cmd` there and cannot be spawned directly.
// A temp file avoids shell quoting of the SQL (the prefix is non-ASCII and the patterns contain %).
export default function globalTeardown() {
  const dir = mkdtempSync(join(tmpdir(), "ssulmo-e2e-"));
  const file = join(dir, "teardown.sql");
  try {
    writeFileSync(file, TEARDOWN_SQL, "utf8");
    execSync(`npx wrangler d1 execute ssulmo --local --file="${file}"`, { stdio: "ignore" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
