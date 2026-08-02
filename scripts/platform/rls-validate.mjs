#!/usr/bin/env node
// TERAGON AI BUSINESS OS — remote RLS validation (Gate S7.1).
// =============================================================================
// Runs AFTER schema verification. Executes the complete isolation suite against
// the LIVE linked staging project by running the 8 canonical SQL assertion
// scripts (supabase/tests/0*.sql) via the privileged db adapter. Each script
// opens a transaction, simulates anon/authenticated/service callers through
// `set local role` + `request.jwt.claims`, asserts with RAISE EXCEPTION on
// failure, and ROLLBACKs — so temp data is inherently scoped + cleaned.
//
// The 8 required checks (1:1 with the files): anonymous-access denial,
// cross-org read denial, cross-org write denial, membership-change denial,
// role-escalation denial, inactive-user denial, aggregate non-leakage,
// service-only bootstrap restriction. FAIL CLOSED: any failed check OR fewer
// than 8 executed OR zero executed ⇒ failure. Policies are NEVER weakened to
// pass. The real admin is NOT bootstrapped. Safe report only (names + ok).
import process from "node:process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { log } from "./shared/log.mjs";
import { REPO_ROOT } from "./shared/context.mjs";
import { isEntrypoint } from "./shared/runtime.mjs";

export const RLS_TESTS_DIR = join(REPO_ROOT, "supabase", "tests");
export const EXPECTED_CHECK_COUNT = 8;

/** The 8 canonical isolation checks (sorted SQL files). */
export function listRlsScripts(dir = RLS_TESTS_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d.*\.sql$/i.test(f))
    .sort();
}

/**
 * Core RLS validation with an injected db adapter. Never process.exit.
 * @param {Object} deps
 * @param {'plan'|'apply'} deps.mode
 * @param {{runScriptFile:(path:string)=>Promise<{ok:boolean,error?:string}>}} deps.db
 * @param {ReturnType<import('./shared/stage.mjs').createStageTracker>} deps.stage
 */
export async function validateRls({ mode, db, stage }) {
  const scripts = listRlsScripts();

  if (mode !== "apply") {
    return {
      ok: scripts.length === EXPECTED_CHECK_COUNT,
      mutated: false,
      action: "plan",
      checks: scripts,
      intended: [
        `run the ${EXPECTED_CHECK_COUNT} canonical isolation checks against the LIVE staging DB (temp data, rolled back)`,
        "authenticated/anon/service simulated via role + jwt.claims; privileged access only for controlled fixtures",
        "FAIL CLOSED on any failed check, fewer than 8 executed, or zero executed; never weaken policies; do NOT bootstrap the real admin",
      ],
    };
  }

  if (scripts.length < EXPECTED_CHECK_COUNT) {
    stage.fail(`only ${scripts.length}/${EXPECTED_CHECK_COUNT} RLS checks found`);
    return { ok: false, mutated: false, reason: `expected ${EXPECTED_CHECK_COUNT} RLS checks, found ${scripts.length}` };
  }

  const results = [];
  for (const file of scripts) {
    const r = await db.runScriptFile(join(RLS_TESTS_DIR, file));
    results.push({ check: file, ok: r.ok, error: r.ok ? undefined : r.error });
  }
  const executed = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  // Fail closed: zero executed, fewer than expected, or any failure.
  if (executed === 0) {
    stage.fail("no RLS checks executed (zero-executed is a failure)");
    return { ok: false, mutated: false, reason: "no RLS checks executed", executed, passed, failed: [], results };
  }
  if (executed < EXPECTED_CHECK_COUNT || failed.length > 0) {
    stage.fail(`RLS validation failed: ${failed.map((f) => f.check).join(", ") || "incomplete"}`);
    return {
      ok: false,
      mutated: false,
      reason: `RLS validation failed (${passed}/${executed}): ${failed.map((f) => `${f.check}: ${f.error}`).join("; ")}`,
      executed,
      passed,
      failed: failed.map((f) => ({ check: f.check, error: f.error })),
      results: results.map((r) => ({ check: r.check, ok: r.ok })),
    };
  }

  stage.markComplete("RLS_VALIDATED", { rls: { executed, passed } }, "8/8 isolation checks passed");
  return { ok: true, mutated: false, executed, passed, cleanup: "per-script transaction rollback (inherent)", results: results.map((r) => ({ check: r.check, ok: r.ok })) };
}

if (isEntrypoint(import.meta.url)) {
  log.error("rls-validate runs inside `platform:staging:apply` (needs the shared linked db). Run the orchestrator.");
  process.exit(2);
}
