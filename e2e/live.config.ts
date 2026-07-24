// W9-F — LIVE DEPLOYMENT VERIFICATION config (Phase 10.2).
// =============================================================================
// This config has NO webServer: it never builds, never serves, never deploys.
// It drives a real browser over the public network against an ALREADY-DEPLOYED
// Netlify Deploy Preview. The target is overridable with LIVE_URL so the same
// suite can later be pointed at the production domain by the operator.
//
//   npx playwright test -c e2e/live.config.ts
//   LIVE_URL=https://<other>.netlify.app npx playwright test -c e2e/live.config.ts
//
// Default target = Deploy Preview of commit 14d3cd6 / tag teragon-os-demo-v1.0.1.
import { defineConfig, devices } from "@playwright/test";

export const LIVE_URL = (
  process.env.LIVE_URL ?? "https://6a62adca1eee4c6ed026e8c7--teragon-os-demo.netlify.app"
).replace(/\/$/, "");

export default defineConfig({
  testDir: "./live",
  testMatch: /.*\.spec\.ts/,
  // Network round-trips + Netlify function cold starts are slower than a local
  // preview; give every test real headroom instead of masking latency as a fail.
  timeout: 240_000,
  fullyParallel: false,
  // 2 workers, NOT more. The target tolerates parallel reads happily; the LOCAL
  // machine does not — at 4 workers the 3840×2160 capture pass and the analytics
  // CSV/print run timed out purely from browser memory/CPU contention (both pass
  // standalone). Two file-level workers keep the 31-route sweep reasonable
  // (~10 min) without producing contention artefacts that look like site defects.
  workers: process.env.LIVE_WORKERS ? Number(process.env.LIVE_WORKERS) : 2,
  // ZERO retries — a flaky live result is a finding, not something to hide.
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: LIVE_URL,
    trace: "retain-on-failure",
    // Real network: allow a generous per-action budget for cold starts.
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    ignoreHTTPSErrors: false,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
  ],
});
