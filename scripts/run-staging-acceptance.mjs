#!/usr/bin/env node
// Gate S7.3B-PREP — CI entrypoint for the LIVE browser acceptance harness.
//
// Enforces the fail-hard flags, runs ONLY the *.accept.ts suite against the
// LOCALLY-served Preview build (ACCEPTANCE_BASE_URL), then surfaces the SAFE
// machine-readable report the suite wrote (verdict / counts / masked ref /
// ui-missing / defects — no credentials). Never discovered by the default
// vitest or Playwright suites.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

if (process.env.STAGING_ACCEPTANCE_LIVE !== "1") {
  console.error("[acceptance] STAGING_ACCEPTANCE_LIVE=1 is required — this harness never skips.");
  process.exit(1);
}
if (!process.env.ACCEPTANCE_BASE_URL) {
  console.error("[acceptance] ACCEPTANCE_BASE_URL=<local url> is required.");
  process.exit(1);
}

const run = spawnSync("npx playwright test -c e2e/acceptance.config.ts", {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

const REPORT = "ci-artifacts/acceptance-report.json";
if (!existsSync(REPORT)) {
  console.error(`[acceptance] FAIL — no machine-readable report at ${REPORT}.`);
  process.exit(run.status || 1);
}
const rep = JSON.parse(readFileSync(REPORT, "utf8"));
console.log(
  `[acceptance] verdict=${rep.verdict} executed=${rep.executed} passed=${rep.passed} failed=${rep.failed} skipped=${rep.skipped} ui_missing=${rep.uiCapabilityMissing.length} defects=${rep.defects.length} target=${rep.targetOrigin} ref=${rep.maskedRef} commit=${rep.observedCommit}`,
);

// Fail-hard: zero executed, any real test failure, or any skip.
if (rep.executed === 0 || rep.skipped > 0 || run.status !== 0) {
  console.error("[acceptance] FAIL — zero executed / skips present / unexpected test failure.");
  process.exit(1);
}
// A PARTIAL verdict (UI_CAPABILITY_MISSING / blocking defect) is an HONEST result,
// not a harness failure — surface it and exit 0 so the report is the source of truth.
console.log(`[acceptance] harness completed cleanly; verdict = ${rep.verdict}.`);
