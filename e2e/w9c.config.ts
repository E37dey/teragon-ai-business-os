// W9-C Playwright config — FINAL release-gate suite. Own preview port (5373) so
// a stale preview on a shared port can never serve an old build to these tests.
// Serves the REAL production build (dist/) of the full app — all 31 canonical
// routes live. Runs only the FINAL cross-cutting suites:
//   e2e/final-regression/**  (Phase 9.8 workflows + 9.9 per-route resilience)
//   e2e/final-accessibility/** (Phase 9.10 axe + keyboard/focus across 31 routes)
//   e2e/final-regression/w9c-visual.spec.ts (9.11) + w9c-print/presentation (9.12)
// The webServer builds first, so the tests always run the current source.
// Set W9C_REUSE=1 to reuse an already-running preview during iteration; the
// default (unset) builds a fresh dist/ every run — the correct gate behaviour.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /(final-regression|final-accessibility)[\\/].*\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5373",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: {
    // cwd = this config's directory (e2e/) — npm scripts run at the repo root
    command: "npm run build && npm run preview -- --port 5373 --strictPort",
    url: "http://localhost:5373",
    reuseExistingServer: !!process.env.W9C_REUSE,
    timeout: 300_000,
  },
});
