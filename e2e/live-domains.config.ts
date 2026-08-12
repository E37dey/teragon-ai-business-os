// TERAGON AI BUSINESS OS — Gate S9.2-A1d2a-1B1: LIVE customer-domain acceptance
// config. Intentionally NOT discoverable by the default playwright.config.ts
// (which matches *.spec.ts) — these files are *.live.ts, matched ONLY here — and
// NOT by vitest. There is NO webServer: the runner (scripts/live-domains/
// run-domains-live.mjs) preflights, then the operator/CI builds + serves the
// exact Preview dist at ACCEPTANCE_BASE_URL first. The suite FAILS (never skips)
// when misconfigured or when zero tests execute.
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = (process.env.ACCEPTANCE_BASE_URL ?? "").replace(/\/$/, "");

// The runner reads PW_JSON_PATH as a cwd-relative path, so resolve the reporter's
// target the SAME way. Owning the json reporter here (instead of passing
// `--reporter=list,json`, which OVERRIDES this list) is what makes the totals
// deterministic: the CLI override wrote no file, so the runner fell back to
// executed=0 and reported "zero tests executed" even when the suite had run.
const PW_JSON = resolve(process.cwd(), "e2e/live-domains/_pw.json");

/** Restrict the run to ONE domain suite. Letters only — never a raw regex. */
const SUITE = /^[a-z]+$/.test(process.env.ACC_SUITE ?? "") ? process.env.ACC_SUITE : "";

export default defineConfig({
  testDir: "./live-domains",
  // S9.3-E: ACC_SUITE selects ONE domain suite (e.g. "contacts" → contacts.live.ts)
  // so each live run reports exactly its own inventory. Unset keeps the original
  // behavior of matching every *.live.ts file.
  testMatch: SUITE ? new RegExp(`${SUITE}\\.live\\.ts$`) : /.*\.live\.ts/,
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  retries: 0, // a flaky live result is a finding, never hidden
  reporter: [["list"], ["json", { outputFile: PW_JSON }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
