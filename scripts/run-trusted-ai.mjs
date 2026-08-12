#!/usr/bin/env node
// Teragon Trusted-AI — orchestrator (npm run evals:trusted-ai).
//
// 1) runs the S7.3B-PREP live browser acceptance harness (produces the UI-card
//    evidence in ci-artifacts/acceptance-report.json),
// 2) runs the Trusted-AI live executor (evals/runner.trusted-ai.ts) which does
//    the identity/isolation/infra cards + aggregates all 15 cards + computes the
//    gate + writes evals/results/trusted-ai-report.{json,md},
// 3) surfaces the SAFE gate summary.
// Requires STAGING_ACCEPTANCE_LIVE=1 + ACCEPTANCE_BASE_URL + INTENDED_COMMIT (a
// LOCAL Preview build must already be served). Never prints credentials.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

for (const k of ["STAGING_ACCEPTANCE_LIVE", "ACCEPTANCE_BASE_URL", "INTENDED_COMMIT"]) {
  if (!process.env[k]) {
    console.error(`[trusted-ai] ${k} is required — this suite never skips.`);
    process.exit(1);
  }
}

console.log("[trusted-ai] step 1/2 — live browser acceptance harness…");
const acc = spawnSync("node scripts/run-staging-acceptance.mjs", {
  stdio: "inherit",
  shell: true,
  env: process.env,
});
if (!existsSync("ci-artifacts/acceptance-report.json")) {
  console.error("[trusted-ai] FAIL — acceptance report missing; cannot evaluate UI cards.");
  process.exit(acc.status || 1);
}

console.log("[trusted-ai] step 2/2 — Trusted-AI live executor…");
const run = spawnSync("npx vitest run --config vitest.trusted-ai.config.ts", {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

const REPORT = "evals/results/trusted-ai-report.json";
if (!existsSync(REPORT)) {
  console.error(`[trusted-ai] FAIL — no report at ${REPORT}.`);
  process.exit(run.status || 1);
}
const rep = JSON.parse(readFileSync(REPORT, "utf8"));
const c = rep.counts;
console.log(
  `[trusted-ai] executed=${c.executed} pass=${c.pass} fail=${c.fail} blocked=${c.blocked} n/a=${c.not_applicable} skipped=${c.skipped}`,
);
for (const g of rep.gate.perCapability) {
  console.log(`[trusted-ai]   ${g.capability}: ${g.verdict} (pass ${g.passed}/${g.total})`);
}
console.log(
  `[trusted-ai] platform=${rep.gate.platformVerdict} · active-ai=${rep.gate.aiVerdict}`,
);

if (c.executed !== 15 || c.skipped > 0 || run.status !== 0) {
  console.error("[trusted-ai] FAIL — executed!=15 / skips / executor failure (safety gate).");
  process.exit(1);
}
console.log("[trusted-ai] executor completed cleanly — gate verdicts above are the source of truth.");
