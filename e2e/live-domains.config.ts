// TERAGON AI BUSINESS OS — Gate S9.2-A1d2a-1B1: LIVE customer-domain acceptance
// config. Intentionally NOT discoverable by the default playwright.config.ts
// (which matches *.spec.ts) — these files are *.live.ts, matched ONLY here — and
// NOT by vitest. There is NO webServer: the runner (scripts/live-domains/
// run-domains-live.mjs) preflights, then the operator/CI builds + serves the
// exact Preview dist at ACCEPTANCE_BASE_URL first. The suite FAILS (never skips)
// when misconfigured or when zero tests execute.
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = (process.env.ACCEPTANCE_BASE_URL ?? "").replace(/\/$/, "");

export default defineConfig({
  testDir: "./live-domains",
  testMatch: /.*\.live\.ts/,
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  retries: 0, // a flaky live result is a finding, never hidden
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
