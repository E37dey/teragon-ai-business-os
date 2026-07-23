// W7-G Playwright config — own preview port (4973) so a stale preview on a
// shared port can never serve an old build to these tests. Serves the REAL
// production build (dist/) of the full app — /submission/presentation is a
// true top-level route in this build (W7-F wiring on main). Runs only the
// w7g-* specs (e2e/adoption/** + e2e/submission/**).
// NOTE: the webServer builds first, so the tests always run the current source.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /w7g-.*\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4973",
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
    command: "npm run build && npm run preview -- --port 4973 --strictPort",
    url: "http://localhost:4973",
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
