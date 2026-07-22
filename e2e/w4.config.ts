// Wave 4 local Playwright config — own preview port (4374) so a stale preview
// on the shared 4173 port can never serve an old build to these tests.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /w4-.*\.spec\.ts/,
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4374",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: {
    command: "npm run preview -- --port 4374 --strictPort",
    url: "http://localhost:4374",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
