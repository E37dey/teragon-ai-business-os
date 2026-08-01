// TERAGON AI BUSINESS OS — plan/apply runtime helpers (Gate S7.0).
// =============================================================================
// Central definition of the plan/apply separation every remote-capable script
// honors:
//   • plan  — fully read-only. MUST NOT create/link/migrate/change-netlify/
//             deploy. Requires no credentials; mutates nothing.
//   • apply — performs remote mutation, and ONLY runs when APPLY_STAGING=true
//             (staging) — otherwise it refuses. Production stays SEPARATELY
//             gated by DEPLOY_PRODUCTION=true (unchanged).
import process from "node:process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Is APPLY_STAGING explicitly enabled? (hard opt-in, anything else ⇒ false) */
export function applyStagingEnabled(env = process.env) {
  return (env["APPLY_STAGING"] ?? "").trim().toLowerCase() === "true";
}

/**
 * Resolve the requested mode from argv + env. A script/orchestrator run with
 * "apply" as an argument requests apply; anything else (including "plan" or no
 * arg) is plan. Whether apply is PERMITTED is a separate check
 * (applyStagingEnabled) enforced by assertApplyAllowed.
 * @param {string[]} [argv]
 * @returns {'plan'|'apply'}
 */
export function resolveMode(argv = process.argv.slice(2)) {
  return argv.includes("apply") ? "apply" : "plan";
}

/**
 * In apply mode, refuse unless APPLY_STAGING=true. Returns the effective mode
 * (downgraded to a hard refusal is the caller's job — this returns a verdict).
 * @param {'plan'|'apply'} mode
 * @param {Record<string,string|undefined>} [env]
 * @returns {{mode:'plan'|'apply', allowed:boolean, reason:string}}
 */
export function assertApplyAllowed(mode, env = process.env) {
  if (mode !== "apply") return { mode, allowed: true, reason: "plan mode — read-only, no mutation" };
  if (applyStagingEnabled(env)) return { mode, allowed: true, reason: "APPLY_STAGING=true" };
  return { mode, allowed: false, reason: "apply requested but APPLY_STAGING is not true — refusing all remote mutation" };
}

/** True when the given module is the process entrypoint (thin-CLI guard). */
export function isEntrypoint(importMetaUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(importMetaUrl)) === realpathSync(entry);
  } catch {
    return fileURLToPath(importMetaUrl) === entry;
  }
}
