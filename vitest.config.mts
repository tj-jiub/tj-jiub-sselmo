import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The .mts extension matters: a .ts config is loaded as CJS and silently ignored.
// Tests are not part of the Worker tsconfig, so the "~" alias is declared here.
export default defineConfig({
  resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
  test: { include: ["tests/**/*.test.ts"] },
});
