#!/usr/bin/env node
// Gate S8.2 — CI entrypoint for the AUTHORITATIVE live staging Auth suite.
//
// Runs ONLY the live Auth files (vitest.staging-auth.config.ts → tests/staging-auth/
// live/**), then emits a machine-readable SAFE summary (files/executed/passed/
// failed/skipped — NO credentials, JWT, or session material). Fails when the run
// failed, when executed=0, or when skipped>0. The suite itself fails hard (never
// skips) unless STAGING_AUTH_LIVE=1 and the staging config is present.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const REPORT = "ci-artifacts/staging-auth-report.json";
const SUMMARY = "ci-artifacts/auth-live-summary.json";

if (process.env.STAGING_AUTH_LIVE !== "1") {
  console.error("[auth:live] STAGING_AUTH_LIVE=1 is required — the live Auth suite never skips.");
  process.exit(1);
}

// One command string with shell:true (avoids the DEP0190 args-with-shell warning).
const run = spawnSync("npx vitest run --config vitest.staging-auth.config.ts", {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

if (!existsSync(REPORT)) {
  console.error(`[auth:live] FAIL — no machine-readable report produced at ${REPORT}.`);
  process.exit(run.status || 1);
}

const rep = JSON.parse(readFileSync(REPORT, "utf8"));
const files = Array.isArray(rep.testResults) ? rep.testResults.length : (rep.numTotalTestSuites ?? 0);
const passed = rep.numPassedTests ?? 0;
const failed = rep.numFailedTests ?? 0;
const skipped = (rep.numPendingTests ?? 0) + (rep.numTodoTests ?? 0);
const executed = passed + failed;
const ok = run.status === 0 && failed === 0 && executed > 0 && skipped === 0;

mkdirSync("ci-artifacts", { recursive: true });
writeFileSync(
  SUMMARY,
  JSON.stringify(
    { suite: "staging-auth-live", files, executed, passed, failed, skipped, ok },
    null,
    2,
  ),
);
console.log(
  `[auth:live] files=${files} executed=${executed} passed=${passed} failed=${failed} skipped=${skipped}`,
);

if (!ok) {
  console.error("[auth:live] FAIL — nonzero failure, zero executed, or skips present.");
  process.exit(1);
}
console.log("[auth:live] PASS");
