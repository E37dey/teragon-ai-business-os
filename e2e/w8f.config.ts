// W8-F Playwright config — own preview port (5073) so a stale preview on a
// shared port can never serve an old build to these tests. Serves the REAL
// production build (dist/) of the full app — all 31 canonical routes live.
// Runs only the w8f-* specs (e2e/analytics/** + e2e/governance/** +
// e2e/administration/** + e2e/system-health/** + e2e/settings/**).
// NOTE: the webServer builds first, so the tests always run the current source.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /w8f-.*\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5073",
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
    command: "npm run build && npm run preview -- --port 5073 --strictPort",
    url: "http://localhost:5073",
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
