// W7-F Playwright config — own preview port (4873) so a stale preview on a
// shared port can never serve an old build. Serves the W7-F harness (the
// requested final wiring: top-level /submission/presentation outside OsShell
// + app-wide ReturnToPresentation). Runs only e2e/presentation/w7f-*.spec.ts.
// SPA fallback note: `vite preview` serves index.html for unknown paths, so
// deep links like /submission/presentation load directly.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./presentation",
  testMatch: /w7f-.*\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4873",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: {
    // cwd = this config's directory (e2e/) — paths are relative to it
    command:
      "npx vite build --config presentation/harness.vite.config.ts && npx vite preview --config presentation/harness.vite.config.ts --port 4873 --strictPort",
    url: "http://localhost:4873",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
