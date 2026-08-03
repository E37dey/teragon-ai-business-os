// S10.3-D — accessibility gate for the Demo Pilot. Chromium-only (the completed
// cross-browser matrix covers engines); 2 viewports. LOCAL synthetic-data build,
// Demo Mode ON. No staging, no Production, no real data, no service-role.
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./pilot",
  testMatch: /a11y\.pilot\.ts/,
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: resolve(process.cwd(), "e2e/pilot/_a11y.json") }]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "a11y-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "a11y-mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
