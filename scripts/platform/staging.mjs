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
import { createDbAdapter } from "./shared/adapters/db.mjs";
import { createStageTracker, mask } from "./shared/stage.mjs";
import { discoverAndInjectConnection } from "./shared/connection.mjs";
import { resolveMode, assertApplyAllowed, isEntrypoint, stopAfterStage } from "./shared/runtime.mjs";
import { provisionStaging, selectStagingProject, DEFAULT_STAGING_NAME } from "./provision-staging.mjs";
import { migrateStaging } from "./migrate.mjs";
import { verifySchema } from "./schema-verify.mjs";
import { validateRls } from "./rls-validate.mjs";
import { bootstrapAdmin } from "./bootstrap-admin.mjs";
import { configureNetlify } from "./configure-netlify.mjs";
import { deployPreview } from "./deploy-preview.mjs";
import { verifyPreview } from "./verify-preview.mjs";

// command, its completed-state (for idempotent skip), and its core runner.
const STEPS = [
  { command: "provision-staging", state: "PROJECT_READY", run: provisionStaging },
  { command: "migrate", state: "MIGRATIONS_APPLIED", run: migrateStaging },
  { command: "schema-verify", state: "SCHEMA_VERIFIED", run: verifySchema },
  { command: "rls-validate", state: "RLS_VALIDATED", run: validateRls },
  { command: "bootstrap-admin", state: "ADMIN_BOOTSTRAPPED", run: bootstrapAdmin },
  { command: "configure-netlify", state: "NETLIFY_CONFIGURED", run: configureNetlify },
  { command: "deploy-preview", state: "PREVIEW_DEPLOYED", run: deployPreview },
  { command: "verify-preview", state: null, run: verifyPreview },
];

async function runPlan(credentials, stage) {
  log.step("STAGING PLAN — READ-ONLY. Safe status/auth probes only. No mutation. No credentials required to run.");
  const st = stage.read();
  log.info(`stage tracker: state=${st.state} completed=[${st.completed.join(", ") || "none"}]`);

  // S7.0.1 readiness classification — distinguishes pre-provision creds from
  // project-DERIVED values (which do NOT exist before creation and must not be
  // reported as blocking).
  const readiness = await credentials.classifyPipelineReadiness();
  log.step("Pipeline readiness (S7.0.1)");
  log.info(`state: ${readiness.state}`);
  log.info(`PRE_PROVISION_READY (can create/select a project): ${readiness.preProvisionReady ? "YES" : "NO"}`);
  log.info(
    `POST_PROVISION_PENDING (project-derived URL/keys not yet existing — EXPECTED before creation): ${readiness.postProvisionPending ? "YES" : "NO"}`,
  );
  log.info(
    `APPLY_READY (orchestrator can fetch post-provision values during the same apply): ${readiness.applyReady ? "YES" : "NO"}`,
  );
  if (readiness.blocked) for (const r of readiness.blockedReasons) log.warn(`blocked: ${r}`);

  for (const step of STEPS) {
    const v = await credentials.validate(step.command);
    log.step(`[${step.command}]`);
    for (const line of describeValidation(v)) log.plain(`  ${line}`);
  }
  log.step("PLAN summary");
  if (readiness.applyReady) {
    log.ok(
      "APPLY_READY — the pipeline can acquire the post-provision connection values (URL + browser/server keys) automatically during apply. It is NOT blocked by their pre-creation absence.",
    );
  } else {
    log.warn(`BLOCKED — ${readiness.blockedReasons.join("; ")}`);
  }
  log.info("APPLY is gated behind APPLY_STAGING=true; production behind DEPLOY_PRODUCTION=true. Neither is set here.");
  log.step("STAGING PLAN complete — remote mutations performed: ZERO. (exit 0)");
  return readiness.applyReady;
}

/**
 * Run the staging apply. Returns a verdict (never process.exit — the caller
 * decides) so the two-path provision handling + resume rebuild are testable.
 *
 * provision-staging is handled EXPLICITLY for both paths, rebuilding the
 * connection context EXACTLY ONCE per run:
 *   A. Fresh — provisionStaging creates/verifies the project AND discovers +
 *      injects the connection (URL + browser/server keys) inside its core.
 *   B. Resume (PROJECT_READY already completed) — skip creation, then
 *      rebuildConnectionOnResume() re-verifies the tracked project and rebuilds
 *      the connection context BEFORE advancing to migrate.
 * @returns {Promise<{ok:boolean, failedStep?:string, reason?:string}>}
 */
export async function runApply(credentials, adapters, stage, opts = {}) {
  const { stopAfter = null, ...extraDeps } = opts;
  log.step("STAGING APPLY — APPLY_STAGING=true. Stop-on-first-failure, idempotent resume.");
  if (stopAfter) log.info(`stop boundary: S7_STOP_AFTER=${stopAfter} — later stages will NOT run.`);

  // Successfully stop after `stopAfter` completes (run OR already-done).
  const stopHere = (step) => Boolean(stopAfter) && step.state === stopAfter;

  for (const step of STEPS) {
    const alreadyDone = Boolean(step.state) && stage.completed(step.state);

    if (step.command === "provision-staging") {
      if (alreadyDone) {
        // PATH B — resume. Rebuild the connection context BEFORE any `continue`,
        // so migrate/bootstrap/netlify have their runtime creds. Zero createProject.
        log.ok(`[provision-staging] already completed (PROJECT_READY) — skipping creation; rebuilding connection context.`);
        const rc = await rebuildConnectionOnResume(credentials, adapters.supabase, stage);
        if (!rc.ok) {
          credentials.clearRuntime(); // clear any partial privileged material
          log.error(`staging halted at provision-staging (resume): ${rc.reason}`);
          return { ok: false, failedStep: "provision-staging", reason: rc.reason };
        }
        log.ok(`[provision-staging] connection context rebuilt (browser=${rc.report.browserKeySource}, server=${rc.report.serverKeySource}).`);
      } else {
        // PATH A — fresh. The core discovers + injects the connection once.
        const validation = await credentials.validate("provision-staging");
        log.step(`[provision-staging] applying`);
        const result = await provisionStaging({ mode: "apply", credentials, ...adapters, stage, validation, ...extraDeps });
        if (!result.ok) {
          credentials.clearRuntime();
          log.error(`staging halted at provision-staging: ${result.reason}`);
          return { ok: false, failedStep: "provision-staging", reason: result.reason };
        }
        log.ok(`[provision-staging] done (${result.action}).`);
      }
      if (stopHere(step)) return stopped(stopAfter);
      continue;
    }

    if (alreadyDone) {
      log.ok(`[${step.command}] already completed (${step.state}) — skipping (idempotent resume).`);
      if (stopHere(step)) return stopped(stopAfter);
      continue;
    }
    const validation = await credentials.validate(step.command);
    log.step(`[${step.command}] applying`);
    const result = await step.run({ mode: "apply", credentials, ...adapters, stage, validation, ...extraDeps });
    if (!result.ok) {
      log.error(`staging halted at ${step.command}: ${result.reason ?? (result.problems ?? []).join("; ")}`);
      return { ok: false, failedStep: step.command, reason: result.reason ?? (result.problems ?? []).join("; ") };
    }
    log.ok(`[${step.command}] done.`);
    if (stopHere(step)) return stopped(stopAfter);
  }
  log.step("STAGING APPLY complete.");
  return { ok: true };
}

/** Successful early stop at the S7_STOP_AFTER boundary. */
function stopped(stopAfter) {
  log.step(`STAGING APPLY stopped SUCCESSFULLY at the S7_STOP_AFTER=${stopAfter} boundary — later stages not run.`);
  return { ok: true, stoppedAt: stopAfter };
}

/**
 * Rebuild the in-memory connection context on a RESUMED apply — never creating a
 * second project. Resolves the existing project ref (provider → tracker →
 * read-only verified reuse by name+org), cross-checks it against the tracked
 * mask, re-verifies live identity (name/org/region/health), then retrieves +
 * classifies the current API keys and injects the runtime connection values.
 * Fails CLOSED (returns a sanitized verdict) on any verification/discovery
 * failure — PROJECT_READY stays the safe resume point. NAMES/kinds only in the
 * report; no key material.
 * @returns {Promise<{ok:boolean, reason?:string, report?:object}>}
 */
export async function rebuildConnectionOnResume(credentials, supabase, stage) {
  // Exactly-once guard: if already rebuilt in this run, do not discover again.
  if (credentials.has("SUPABASE_SERVER_KEY")) {
    return { ok: true, report: { alreadyPresent: true, browserKeySource: "n/a", serverKeySource: "n/a" } };
  }
  const orgId = credentials.get("SUPABASE_ORG_ID");
  const tracked = stage.read().project ?? {};

  // 1. resolve the ref WITHOUT creating anything.
  let ref = credentials.get("SUPABASE_PROJECT_REF") ?? tracked.ref ?? null;
  if (!ref) {
    // read-only verified reuse: find the existing teragon-staging project by name+org.
    let projects = [];
    try {
      projects = await supabase.listProjects();
    } catch {
      return { ok: false, reason: "could not list projects to resolve the tracked staging project on resume" };
    }
    const decision = selectStagingProject({ projects, orgId, desiredName: DEFAULT_STAGING_NAME });
    if (decision.action !== "reuse") {
      // NEVER create on resume because a runtime ref is absent.
      return { ok: false, reason: `cannot resolve the existing staging project on resume (${decision.action}: ${decision.reason})` };
    }
    ref = decision.ref;
  }
  if (!ref) return { ok: false, reason: "no tracked staging project ref on resume" };

  // 2. cross-check the resolved ref against the tracker's recorded mask.
  if (tracked.refMask && mask(ref) !== tracked.refMask) {
    return { ok: false, reason: "resolved project ref does not match the tracked project (mask mismatch)" };
  }

  // 3. re-verify live identity (name/org/region/health) BEFORE trusting the ref.
  let health;
  try {
    health = await supabase.getProjectHealth(ref);
  } catch {
    return { ok: false, reason: "could not verify the tracked project on resume" };
  }
  if (!health.found) return { ok: false, reason: "tracked project not found on resume" };
  const p = health.project ?? {};
  const projOrg = p.organization_id ?? p.orgId ?? p.organizationId ?? null;
  if (orgId && projOrg && projOrg !== orgId) return { ok: false, reason: "tracked project org mismatch on resume" };
  if (p.name && String(p.name) !== DEFAULT_STAGING_NAME) return { ok: false, reason: "tracked project identity mismatch on resume" };
  if (health.status && !/ACTIVE_HEALTHY|ACTIVE|HEALTHY/i.test(String(health.status))) {
    return { ok: false, reason: `tracked project not healthy on resume (${health.status})` };
  }

  // 4. retrieve + classify keys + inject runtime connection values.
  const conn = await discoverAndInjectConnection({ supabase, credentials, ref, orgId });
  if (!conn.ok) return { ok: false, reason: conn.reason };

  // 5. confirm the required runtime creds are now present.
  const present = credentials.has("SUPABASE_URL") && credentials.has("SUPABASE_BROWSER_KEY") && credentials.has("SUPABASE_SERVER_KEY");
  if (!present) return { ok: false, reason: "connection values not present in runtime after rebuild" };
  return { ok: true, report: conn.report };
}

async function main() {
  const mode = resolveMode();
  const credentials = createCredentialProvider();
  const stage = createStageTracker();
  // Runtime secrets (discovered keys) are in-memory only and cleared on exit.
  process.once("exit", () => credentials.clearRuntime());

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
    db: createDbAdapter(),
  };
  const stopAfter = stopAfterStage();
  const verdict = await runApply(credentials, adapters, stage, { stopAfter });
  credentials.clearRuntime(); // privileged runtime values never outlive the run
  if (verdict.stoppedAt) log.ok(`stopped at ${verdict.stoppedAt} (as requested by S7_STOP_AFTER).`);
  process.exit(verdict.ok ? 0 : 2);
}

if (isEntrypoint(import.meta.url)) {
  main().catch((err) => {
    log.error(`staging orchestrator failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
