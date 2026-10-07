import { defineConfig, devices } from "@playwright/test";

// Requires a migrated + seeded local DB (npm run db:migrate && npm run db:seed)
// and .dev.vars copied from .dev.vars.example.
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:5180", ...devices["Pixel 7"] },
  webServer: {
    command: "npm run dev -- --port 5180 --strictPort",
    url: "http://localhost:5180",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
