// TERAGON AI BUSINESS OS — LIVE STAGING ACCEPTANCE config (Gate S7.3B-PREP).
// =============================================================================
// Drives a real browser against a LOCALLY-served Preview-context build wired to
// live teragon-staging. It is intentionally NOT discoverable by the default
// playwright.config.ts (those pick up *.spec.ts; these files are *.accept.ts,
// matched ONLY here) and NOT by vitest. There is NO webServer — the operator
// (or scripts/run-staging-acceptance.mjs) builds + serves dist locally first,
// then runs:
//
//   STAGING_ACCEPTANCE_LIVE=1 \
//   ACCEPTANCE_BASE_URL=http://localhost:<port> \
//   STAGING_SUPABASE_PROJECT_REF=<ref> \
//   INTENDED_COMMIT=<sha> \
//   npx playwright test -c e2e/acceptance.config.ts
//
// The harness FAILS (never skips) when misconfigured, when the target is not a
// LOCAL origin, when the wrong Supabase project is reached, or when zero tests
// execute (see _acceptanceCore + the afterAll guard).
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = (process.env.ACCEPTANCE_BASE_URL ?? "").replace(/\/$/, "");

export default defineConfig({
  testDir: "./acceptance",
  testMatch: /.*\.accept\.ts/,
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  // ZERO retries — a flaky acceptance result is a finding, never hidden.
  retries: 0,
  // forbidOnly so a stray test.only can never silently narrow the suite.
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL || "http://localhost:0",
    trace: "retain-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  projects: [
    { name: "chromium-1920", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } } },
    { name: "chromium-1024", use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } } },
  ],
});
