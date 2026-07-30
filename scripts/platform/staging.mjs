#!/usr/bin/env node
// TERAGON AI BUSINESS OS — staging pipeline orchestrator (Gate S1).
// =============================================================================
// Runs the staging sequence in order, STOPPING ON FIRST FAILURE. Each child
// script performs its OWN fail-closed credential check, so with credentials
// absent the very first step (provision-staging) refuses before any remote
// action and the pipeline halts — the intended, tested behavior now.
import { run } from "./shared/exec.mjs";
import { log } from "./shared/log.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import process from "node:process";

const HERE = dirname(fileURLToPath(import.meta.url));
const SEQUENCE = [
  "provision-staging.mjs",
  "migrate.mjs",
  "bootstrap-admin.mjs",
  "configure-netlify.mjs",
  "deploy-preview.mjs",
  "verify-preview.mjs",
];

async function main() {
  log.step("STAGING pipeline — provision → migrate → bootstrap → configure → preview → verify");
  for (const script of SEQUENCE) {
    const code = await run(process.execPath, [join(HERE, script)]);
    if (code !== 0) {
      log.error(`staging halted at ${script} (exit ${code}). Remaining steps not run.`);
      process.exit(code);
    }
  }
  log.step("STAGING pipeline complete.");
  process.exit(0);
}

main().catch((err) => {
  log.error(`staging orchestrator failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
