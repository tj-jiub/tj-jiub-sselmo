import { defineConfig, devices } from "@playwright/test";

// Requires a migrated + seeded local DB (npm run db:migrate && npm run db:seed)
// and .dev.vars copied from .dev.vars.example (DEV_SHOW_LOGIN_LINK=1 and EVALUATOR=fake).
const port = Number(process.env.E2E_PORT ?? 5180);

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${port}`, ...devices["Pixel 7"] },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
