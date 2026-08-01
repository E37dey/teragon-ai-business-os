#!/usr/bin/env node
// TERAGON AI BUSINESS OS — staging pipeline orchestrator (Gate S7.0).
// =============================================================================
// Two modes (see runtime.mjs):
//   • plan  (default) — fully READ-ONLY. Contacts nothing, mutates nothing.
//     Produces a readiness report: per-command credential readiness + the
//     intended actions + the current stage-tracker state.
//   • apply — refuses unless APPLY_STAGING=true. Runs the sequence in order,
//     STOPPING ON FIRST FAILURE, skipping idempotent steps already completed
//     (stage tracker), never duplicating a project/admin, never resetting a DB.
//
// Every step shares ONE credential provider + ONE stage tracker + injected
// adapters, so the whole pipeline loads credentials exactly once.
import process from "node:process";
import { log } from "./shared/log.mjs";
import { createCredentialProvider, describeValidation } from "./shared/credentials.mjs";
import { createSupabaseAdapter } from "./shared/adapters/supabase.mjs";
import { createNetlifyAdapter } from "./shared/adapters/netlify.mjs";
import { createStageTracker } from "./shared/stage.mjs";
import { resolveMode, assertApplyAllowed, isEntrypoint } from "./shared/runtime.mjs";
import { provisionStaging } from "./provision-staging.mjs";
import { migrateStaging } from "./migrate.mjs";
import { bootstrapAdmin } from "./bootstrap-admin.mjs";
import { configureNetlify } from "./configure-netlify.mjs";
import { deployPreview } from "./deploy-preview.mjs";
import { verifyPreview } from "./verify-preview.mjs";

// command, its completed-state (for idempotent skip), and its core runner.
const STEPS = [
  { command: "provision-staging", state: "PROJECT_READY", run: provisionStaging },
  { command: "migrate", state: "MIGRATIONS_APPLIED", run: migrateStaging },
  { command: "bootstrap-admin", state: "ADMIN_BOOTSTRAPPED", run: bootstrapAdmin },
  { command: "configure-netlify", state: "NETLIFY_CONFIGURED", run: configureNetlify },
  { command: "deploy-preview", state: "PREVIEW_DEPLOYED", run: deployPreview },
  { command: "verify-preview", state: null, run: verifyPreview },
];

async function runPlan(credentials, stage) {
  log.step("STAGING PLAN — READ-ONLY. Safe status/auth probes only. No mutation. No credentials required to run.");
  const st = stage.read();
  log.info(`stage tracker: state=${st.state} completed=[${st.completed.join(", ") || "none"}]`);

  let allReady = true;
  for (const step of STEPS) {
    const v = await credentials.validate(step.command);
    if (!v.ok) allReady = false;
    log.step(`[${step.command}]`);
    for (const line of describeValidation(v)) log.plain(`  ${line}`);
  }
  log.step("PLAN summary");
  log.info(`all steps credential-ready: ${allReady ? "YES" : "NO (staging cannot apply yet — see missing names above)"}`);
  log.info("APPLY is gated behind APPLY_STAGING=true; production behind DEPLOY_PRODUCTION=true. Neither is set here.");
  log.step("STAGING PLAN complete — remote mutations performed: ZERO. (exit 0)");
  return allReady;
}

async function runApply(credentials, adapters, stage) {
  log.step("STAGING APPLY — APPLY_STAGING=true. Stop-on-first-failure, idempotent resume.");
  for (const step of STEPS) {
    if (step.state && stage.completed(step.state)) {
      log.ok(`[${step.command}] already completed (${step.state}) — skipping (idempotent resume).`);
      continue;
    }
    const validation = await credentials.validate(step.command);
    log.step(`[${step.command}] applying`);
    const result = await step.run({ mode: "apply", credentials, ...adapters, stage, validation });
    if (!result.ok) {
      log.error(`staging halted at ${step.command}: ${result.reason ?? (result.problems ?? []).join("; ")}`);
      process.exit(2);
    }
    log.ok(`[${step.command}] done.`);
  }
  log.step("STAGING APPLY complete.");
}

async function main() {
  const mode = resolveMode();
  const credentials = createCredentialProvider();
  const stage = createStageTracker();

  if (mode === "plan") {
    stage.markComplete("PLAN_READY", {}, "plan generated");
    await runPlan(credentials, stage);
    process.exit(0);
  }

  const gate = assertApplyAllowed(mode);
  if (!gate.allowed) {
    log.error(`refused: ${gate.reason}. No remote action taken. (set APPLY_STAGING=true to apply staging)`);
    process.exit(3);
  }
  const adapters = {
    supabase: createSupabaseAdapter({ credentials: credentials.get }),
    netlify: createNetlifyAdapter({ credentials: credentials.get }),
  };
  await runApply(credentials, adapters, stage);
  process.exit(0);
}

if (isEntrypoint(import.meta.url)) {
  main().catch((err) => {
    log.error(`staging orchestrator failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
