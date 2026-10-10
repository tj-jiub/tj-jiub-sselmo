import { execSync } from "node:child_process";

// Rate limits (owner link requests, admin login) are real in dev too, so reruns of the suite would
// trip them. Start every run with an empty attempts table.
// execSync runs through a shell, which Windows needs: `npx` is `npx.cmd` there and cannot be spawned directly.
export default function globalSetup() {
  execSync('npx wrangler d1 execute ssulmo --local --command "DELETE FROM auth_attempts"', { stdio: "ignore" });
}
