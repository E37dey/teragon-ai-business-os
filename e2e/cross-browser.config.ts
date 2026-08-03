// S10.3-C1 — cross-browser × responsive matrix for the Demo Pilot.
// ISOLATED from the default playwright.config.ts (which stays chromium-only for
// the existing suite). 3 engines × 3 viewports = 9 projects, running ONLY the
// pilot spec against a LOCAL synthetic-data preview build. No staging, no
// Production.
//
// WebKit is a Safari COMPATIBILITY PROXY on Linux/Windows CI — it is NOT proof of
// testing real Safari on Apple hardware. The evidence file states this plainly.
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
} as const;

const ENGINES = [
  { key: "chromium", device: devices["Desktop Chrome"] },
  { key: "firefox", device: devices["Desktop Firefox"] },
  { key: "webkit", device: devices["Desktop Safari"] },
] as const;

const projects = ENGINES.flatMap((e) =>
  Object.entries(VIEWPORTS).map(([vp, viewport]) => ({
    name: `${e.key}-${vp}`,
    use: { ...e.device, viewport },
  })),
);

export default defineConfig({
  testDir: "./pilot",
  testMatch: /cross-browser\.pilot\.ts/,
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Artifacts ONLY on failure.
  // Resolve from cwd — a bare relative path resolves against the config dir and
  // lands in e2e/e2e/.
  reporter: [["list"], ["json", { outputFile: resolve(process.cwd(), "e2e/pilot/_cross-browser.json") }]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects,
  webServer: {
    command: "npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
