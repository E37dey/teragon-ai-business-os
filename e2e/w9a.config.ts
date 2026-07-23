// W9-A Playwright config — FINAL runtime interaction audit. Owns preview port
// 5273 (in the unused 5173-range, distinct from every other wave's port) so a
// stale preview can never serve an old build to these tests. Serves the REAL
// production build (dist/) of the full app — all 31 canonical routes live.
// Runs only the w9a-* specs in e2e/final-interactions/**.
// The webServer builds first, so the tests always run the current source.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./final-interactions",
  testMatch: /w9a-.*\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5273",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: {
    // cwd = this config's directory (e2e/) — npm scripts run at the repo root
    command: "npm run build && npm run preview -- --port 5273 --strictPort",
    url: "http://localhost:5273",
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
