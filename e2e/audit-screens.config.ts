// S-Product Phase 1 — full-route visual + metrics audit harness (LOCAL synthetic,
// Demo Mode ON). No staging, no Production, no real data, no service-role. Captures
// a screenshot per route at 1440/1024/768/390 and records objective layout metrics
// (overflow, header/main presence, dir, console errors) to a JSON report.
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./audit",
  testMatch: /full-route\.audit\.ts/,
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: resolve(process.cwd(), "e2e/audit/_full-route.json") }]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "audit", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
