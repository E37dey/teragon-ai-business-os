// W6-F Playwright config — own preview port (4773) so a stale preview on a
// shared port can never serve an old build to these tests. Runs only the
// w6-* specs (e2e/memory/** + e2e/knowledge/** + e2e/learning/**).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /w6-.*\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4773",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: {
    command: "npm run preview -- --port 4773 --strictPort",
    url: "http://localhost:4773",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
