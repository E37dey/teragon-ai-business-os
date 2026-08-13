import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // DETERMINISTIC LOCAL GATE. e2e/live/** drives a real browser over the PUBLIC
  // network against an already-deployed Netlify preview (see e2e/live.config.ts,
  // which owns that suite and is run with `npm run test:e2e:live`). Those specs
  // are legitimate and must never be mocked — but a public-internet hiccup must
  // not make the local release gate red, so they are discovered ONLY by their own
  // config and reported separately.
  testIgnore: ["live/**"],
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: {
    command: "npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
