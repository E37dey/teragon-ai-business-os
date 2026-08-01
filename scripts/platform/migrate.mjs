#!/usr/bin/env node
// TERAGON AI BUSINESS OS — apply migrations to the LINKED staging DB (Gate S7.0).
// =============================================================================
// Fail-closed. Plan-safe. NEVER runs `supabase db reset` against a remote.
//
// Before any remote apply it (all pure + plan-safe via migrations.mjs):
//   • verifies all 14 migrations are present
//   • verifies the local migration lineage matches the S5-validated lock
//   • reads the remote migration history (dry-run compare) and rejects
//     UNEXPECTED remote migrations
//   • rejects DESTRUCTIVE SQL in the local set
//   • verifies the target is STAGING, not production
//   • prepares a rollback reference (records the remote head before push)
// Stops on any mismatch. Only `db push` (additive) is ever executed.
import process from "node:process";
import { log } from "./shared/log.mjs";
import { createCredentialProvider, enforceOrExit, describeValidation } from "./shared/credentials.mjs";
import { createSupabaseAdapter } from "./shared/adapters/supabase.mjs";
import { createStageTracker } from "./shared/stage.mjs";
import { migrationSafetyReport, EXPECTED_COUNT } from "./shared/migrations.mjs";
import { deployProductionEnabled } from "./shared/context.mjs";
import { resolveMode, assertApplyAllowed, isEntrypoint } from "./shared/runtime.mjs";

const PRODUCTION_RE = /prod|production|live/i;

/**
 * Core migration routine with injected adapters. Never process.exit.
 * @param {Object} deps
 * @param {'plan'|'apply'} deps.mode
 * @param {ReturnType<import('./shared/credentials.mjs').createCredentialProvider>} deps.credentials
 * @param {ReturnType<import('./shared/adapters/supabase.mjs').createSupabaseAdapter>} deps.supabase
 * @param {ReturnType<import('./shared/stage.mjs').createStageTracker>} deps.stage
 * @param {import('./shared/credentials.mjs').CredentialValidation} deps.validation
 * @param {Record<string,string|undefined>} [deps.env]
 */
export async function migrateStaging({ mode, credentials, supabase, stage, validation, env = process.env }) {
  const plan = mode !== "apply";

  // Guard: never target production from this staging path.
  if (deployProductionEnabled(env)) {
    return { ok: false, mutated: false, reason: "DEPLOY_PRODUCTION=true — migrate.mjs is staging-only; refusing" };
  }

  if (plan) {
    const safety = migrationSafetyReport({ remoteHistory: null });
    return {
      ok: safety.ok,
      mutated: false,
      action: "plan",
      safety,
      intended: [
        `verify ${EXPECTED_COUNT} migrations present + lineage matches S5-validated lock`,
        "read remote migration history and compare (reject unexpected)",
        "reject destructive SQL; verify target is staging; prepare rollback ref",
        "apply ONLY additive `supabase db push --linked` (never db reset)",
      ],
    };
  }

  if (!validation.ok) return { ok: false, mutated: false, reason: "credentials not ready" };

  // Verify target is staging (not a production-looking linked project).
  const ref = credentials.get("SUPABASE_PROJECT_REF");
  if (ref) {
    const health = await supabase.getProjectHealth(ref);
    if (health.project && PRODUCTION_RE.test(String(health.project.name ?? ""))) {
      stage.fail("linked project looks production");
      return { ok: false, mutated: false, reason: `linked project "${health.project.name}" looks production — refusing` };
    }
  }

  // Read remote history for a dry-run compare BEFORE any push.
  let remoteHistory = null;
  try {
    remoteHistory = await supabase.remoteMigrationList();
  } catch {
    remoteHistory = null;
  }
  const safety = migrationSafetyReport({ remoteHistory });
  if (!safety.ok) {
    stage.fail(`migration safety failed: ${safety.reasons.join("; ")}`);
    return { ok: false, mutated: false, reason: safety.reasons.join("; "), safety };
  }

  // Prepare rollback reference: record the remote head (versions applied) before push.
  const rollbackRef = Array.isArray(remoteHistory) ? remoteHistory.map((r) => r.version ?? r.name).filter(Boolean) : [];
  stage.enter("MIGRATIONS_APPLIED", `rollback-ref: ${rollbackRef.length} remote version(s) recorded pre-push`);

  // Additive push only.
  await supabase.dbPush();
  stage.markComplete("MIGRATIONS_APPLIED", {}, `pushed (had ${rollbackRef.length} remote versions before)`);
  return { ok: true, mutated: true, action: "push", safety, rollbackVersions: rollbackRef.length };
}

// --- thin entrypoint ---------------------------------------------------------
async function main() {
  const mode = resolveMode();
  const gate = assertApplyAllowed(mode);
  const credentials = createCredentialProvider();
  const validation = await credentials.validate("migrate");

  log.step(`migrate — mode=${mode}`);
  if (mode === "apply" && !gate.allowed) {
    log.error(`refused: ${gate.reason}. No remote action taken.`);
    process.exit(3);
  }
  if (mode === "apply") enforceOrExit(validation);
  else for (const line of describeValidation(validation)) log.plain(`  ${line}`);

  const supabase = createSupabaseAdapter({ credentials: credentials.get });
  const stage = createStageTracker();
  const result = await migrateStaging({ mode, credentials, supabase, stage, validation });

  if (result.action === "plan") {
    log.info(`migration safety (local): ${result.safety.ok ? "OK" : "BLOCKED — " + result.safety.reasons.join("; ")}`);
    log.info(`migrations present: ${result.safety.count}/${EXPECTED_COUNT}; lineage matches lock: ${result.safety.lineageOk}`);
    for (const line of result.intended) log.plain(`  would: ${line}`);
    log.step("migrate PLAN — nothing pushed or contacted.");
    process.exit(result.ok ? 0 : 2);
  }
  if (!result.ok) {
    log.error(`migrate refused/failed: ${result.reason}`);
    process.exit(2);
  }
  log.ok(`migrate complete (additive push; ${result.rollbackVersions} remote versions before).`);
  process.exit(0);
}

if (isEntrypoint(import.meta.url)) {
  main().catch((err) => {
    log.error(`migrate failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
