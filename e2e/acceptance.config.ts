// TERAGON AI BUSINESS OS — REMOTE STAGING ACCEPTANCE config (Gate S7.0).
// =============================================================================
// The complete remote-acceptance harness. It is WIRED but GUARDED OFF: it never
// runs in S7.0 (no remote URL is provided, and STAGING_ACCEPTANCE is not set),
// and it is intentionally NOT discoverable by the default playwright.config.ts
// (those pick up *.spec.ts; these files are *.accept.ts, matched ONLY here).
//
// There is NO webServer: it never builds, never serves, never deploys. It drives
// a real browser against an ALREADY-DEPLOYED staging Deploy Preview. Run later,
// by an operator, ONLY after a preview exists:
//
//   STAGING_ACCEPTANCE=1 \
//   STAGING_PREVIEW_URL=https://<preview>.netlify.app \
//   STAGING_SUPABASE_PROJECT_REF=<ref> \
//   INTENDED_COMMIT=<sha> \
//   npx playwright test -c e2e/acceptance.config.ts
//
// The harness FAILS (never skips / never silently passes) when: no tests
// execute, any test is skipped, the app silently falls back to IndexedDB, the
// preview is connected to the wrong Supabase project, or the deployed commit is
// not the intended commit.
import { defineConfig, devices } from "@playwright/test";

const PREVIEW_URL = (process.env.STAGING_PREVIEW_URL ?? "").replace(/\/$/, "");

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
    baseURL: PREVIEW_URL || "http://acceptance.invalid",
    trace: "retain-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  projects: [
    { name: "chromium-1920", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } } },
    { name: "chromium-1024", use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } } },
  ],
});
