// Wave 3 local Playwright config — runs only the w3-* specs on its own port
// (4273) so it never collides with the shared 4173 config.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /w3-.*\.spec\.ts/,
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4273",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: {
    command: "npm run preview -- --port 4273 --strictPort",
    url: "http://localhost:4273",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
