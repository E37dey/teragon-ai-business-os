// S10.3-E — network-resilience UI gate for the Demo Pilot. Chromium × {1440,390}.
// LOCAL synthetic-data build, Demo Mode ON. No staging, no Production, no real
// data, no service-role. Domain read/write FAILURE SEMANTICS are proven at the
// integration level (tests/app/network-resilience.test.tsx); this suite proves
// the UI stays usable and does not crash when connectivity drops.
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./pilot",
  testMatch: /network\.pilot\.ts/,
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: resolve(process.cwd(), "e2e/pilot/_network.json") }]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "net-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "net-mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
