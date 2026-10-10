import { execFileSync } from "node:child_process";

// Rate limits (owner link requests, admin login) are real in dev too, so reruns of the suite would
// trip them. Start every run with an empty attempts table.
export default function globalSetup() {
  execFileSync("npx", ["wrangler", "d1", "execute", "ssulmo", "--local", "--command", "DELETE FROM auth_attempts"], { stdio: "ignore" });
}
