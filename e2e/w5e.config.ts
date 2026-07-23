// W5-E stage 2 local Playwright config — own preview port (4673) so a stale
// preview on a shared port can never serve an old build to these tests.
// Runs only the w5e-* specs (e2e/ai/** + e2e/agents/**).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /w5e-.*\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4673",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: {
    command: "npm run preview -- --port 4673 --strictPort",
    url: "http://localhost:4673",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
