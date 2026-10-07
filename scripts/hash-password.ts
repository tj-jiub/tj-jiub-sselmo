// Usage: node scripts/hash-password.ts <password>
import { hashPassword } from "../app/lib/auth.server.ts";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.ts <password>");
  process.exit(1);
}
console.log(await hashPassword(password));
