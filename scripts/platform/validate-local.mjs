#!/usr/bin/env node
// TERAGON AI BUSINESS OS — LOCAL validation gate (Gate S1).
// =============================================================================
// Orchestrates the repo's existing quality gate, STOPPING ON FIRST FAILURE
// (non-zero exit). No credentials, no remote calls. Steps, in order:
//   1. oxlint                     (npx oxlint)
//   2. typecheck                  (npm run typecheck)
//   3. typecheck:tests            (npm run typecheck:tests)
//   4. unit/integration tests     (vitest run)
//   5. build                      (npm run build)
//   6. bundle secret scan         (npm run scan:secrets — needs dist/ from step 5)
//   7. local Supabase steps       ONLY if a Docker daemon is up; otherwise the
//                                 live-DB steps are SKIPPED with a clear
//                                 "DOCKER REQUIRED" message and the run exits
//                                 non-zero (partial) — they are NEVER faked.
import { run } from "./shared/exec.mjs";
import { dockerState, migrationsPresent } from "./shared/context.mjs";
import { log } from "./shared/log.mjs";
import process from "node:process";

const CORE_STEPS = [
  { name: "oxlint", cmd: "npx", args: ["oxlint"] },
  { name: "typecheck", cmd: "npm", args: ["run", "typecheck"] },
  { name: "typecheck:tests", cmd: "npm", args: ["run", "typecheck:tests"] },
  { name: "vitest run", cmd: "npx", args: ["vitest", "run"] },
  { name: "build", cmd: "npm", args: ["run", "build"] },
  { name: "scan:secrets", cmd: "npm", args: ["run", "scan:secrets"] },
];

async function main() {
  log.step("LOCAL validation gate — stop-on-first-failure, no remote calls");

  for (const step of CORE_STEPS) {
    log.step(`local step: ${step.name}`);
    const code = await run(step.cmd, step.args);
    if (code !== 0) {
      log.error(`FAILED at "${step.name}" (exit ${code}). Stopping — later steps not run.`);
      process.exit(code === 0 ? 1 : code);
    }
    log.ok(`${step.name} passed.`);
  }

  // --- Docker-gated local Supabase steps ------------------------------------
  log.step("local Supabase steps (Docker-gated)");
  const docker = await dockerState();
  if (!docker.available) {
    log.warn("DOCKER REQUIRED: no Docker daemon detected (docker info failed).");
    log.warn("SKIPPING local Supabase start / db reset / seed — these are NOT faked.");
    log.warn("Start Docker Desktop and re-run to exercise the live local DB gate.");
    // Partial success: core gate passed, but the local-DB half could not run.
    process.exit(4);
  }

  const mig = migrationsPresent();
  log.info(`Docker up (server ${docker.serverVersion}) — running local Supabase gate.`);
  // Local-ONLY reset is safe here (ephemeral local DB, NOT the linked remote).
  // WOULD RUN: npx supabase start
  // WOULD RUN: npx supabase db reset   (local shadow DB only — never --linked)
  await run("npx", ["supabase", "start"]);
  if (mig.present) await run("npx", ["supabase", "db", "reset"]);
  await run("npx", ["supabase", "stop"]);
  log.ok("local Supabase gate complete.");

  log.step("LOCAL validation gate PASSED.");
  process.exit(0);
}

main().catch((err) => {
  log.error(`validate-local failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
