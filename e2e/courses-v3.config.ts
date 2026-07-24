// Courses Layout v3 rebuild — dedicated Playwright config on its own preview
// port (5474) so a stale preview can never serve an old build to these tests.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /courses-v3\.spec\.ts/,
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5474",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run preview -- --port 5474 --strictPort",
    url: "http://localhost:5474",
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
