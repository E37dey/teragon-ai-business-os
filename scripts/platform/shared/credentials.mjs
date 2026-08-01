// TERAGON AI BUSINESS OS — unified credential provider (Gate S7.0).
// =============================================================================
// ONE loader used by every platform script. It removes the duplicated ".env
// parse + process.env read + fail-closed" logic that had crept into each
// script, and it does so WITHOUT weakening the fail-closed contract.
//
// Deterministic, documented precedence for every NAME:
//   1. process.env                       (CI / explicit operator override)
//   2. .env.staging.local  (gitignored)  (S6.1 bootstrap output; parsed safely,
//                                          values registered for redaction and
//                                          NEVER logged)
// PLUS a special authorization dimension for Supabase Management-API steps:
//   3. an authenticated Supabase CLI session — used ONLY when
//      SUPABASE_ACCESS_TOKEN is absent from (1) and (2). Expressed as an
//      authorization REQUIREMENT ("env-token OR cli-session"), never as a bare
//      token NAME, so a logged-in operator with no token still passes.
//
// The provider is value-blind at its public surface: validate() reports NAMES
// and an authorization KIND only. get() exists so a script can hand a value
// straight to an adapter (e.g. a DB password to the CLI via env) — its result
// is NEVER logged; every registered secret value is scrubbed by the logger.
//
// Injectable for tests: pass { env, fileText, authResolver } to exercise the
// precedence and fail-closed logic against fakes with zero filesystem/CLI/
// network access.
import process from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./context.mjs";
import { registerSecretValues, log } from "./log.mjs";
import { isPresent } from "./env.mjs";
import { COMMAND_CREDENTIALS, SECRET_VALUE_NAMES } from "./names.mjs";
import { resolveSupabaseAuth } from "./supabase-auth.mjs";

const STAGING_FILE = join(REPO_ROOT, ".env.staging.local");

/**
 * Parse KEY=VALUE lines from a .env-style text blob. Ignores blanks + comments.
 * Values are returned verbatim (trimmed) — the caller decides what is secret.
 * @param {string} text
 * @returns {Record<string,string>}
 */
export function parseEnvText(text) {
  /** @type {Record<string,string>} */
  const out = {};
  if (typeof text !== "string") return out;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    // Strip a single layer of matching surrounding quotes.
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
      v = v.slice(1, -1);
    }
    if (k) out[k] = v;
  }
  return out;
}

/** Default staging-file reader (returns "" when the file is absent). */
function readStagingFile() {
  try {
    return existsSync(STAGING_FILE) ? readFileSync(STAGING_FILE, "utf8") : "";
  } catch {
    return "";
  }
}

/**
 * @typedef {Object} CredentialProvider
 * @property {(name:string)=>(string|undefined)} get        resolved value (NEVER log)
 * @property {(name:string)=>boolean} has                   presence by name
 * @property {(name:string)=>('env'|'staging-file'|undefined)} source  where a value came from
 * @property {()=>void} registerSecrets                     add known secret values to the log scrubber
 * @property {(command:string)=>Promise<CredentialValidation>} validate  per-command fail-closed check
 */

/**
 * @typedef {Object} CredentialValidation
 * @property {string} command
 * @property {boolean} ok
 * @property {string[]} missing                  missing plain NAMES
 * @property {{required:boolean, ready:boolean, via:'env-token'|'cli-session'|'none'}} supabaseAuth
 * @property {{required:boolean, ready:boolean}} netlifyAuth
 * @property {{required:boolean, present:boolean}} serviceClient
 * @property {{name:string, confirmed:boolean}|null} confirmGate
 */

/**
 * Build the unified credential provider.
 * @param {Object} [deps]
 * @param {Record<string,string|undefined>} [deps.env]   defaults to process.env
 * @param {string} [deps.fileText]                        raw .env.staging.local text (defaults to reading the file)
 * @param {(env:Record<string,string|undefined>)=>Promise<{ready:boolean, via:'env-token'|'cli-session'|'none'}>} [deps.authResolver]
 * @returns {CredentialProvider}
 */
export function createCredentialProvider(deps = {}) {
  const env = deps.env ?? process.env;
  const fileText = deps.fileText ?? readStagingFile();
  const authResolver = deps.authResolver ?? resolveSupabaseAuth;
  const fileValues = parseEnvText(fileText);

  /** process.env wins over the staging file. */
  function get(name) {
    if (isPresent(env[name])) return env[name];
    if (isPresent(fileValues[name])) return fileValues[name];
    return undefined;
  }
  function has(name) {
    return isPresent(get(name));
  }
  function source(name) {
    if (isPresent(env[name])) return "env";
    if (isPresent(fileValues[name])) return "staging-file";
    return undefined;
  }

  // Merged view used only for auth resolution + secret registration.
  const merged = { ...fileValues, ...pickPresent(env) };

  function registerSecrets() {
    registerSecretValues(SECRET_VALUE_NAMES.map((n) => get(n)));
  }

  /**
   * Fail-closed per-command validation. NEVER throws and NEVER exits — it
   * RETURNS a structured verdict so the caller (thin entrypoint OR orchestrator)
   * decides whether to refuse. Callers MUST refuse before any remote action
   * when ok === false. Registers secrets for redaction as a side effect.
   * @param {string} command
   * @returns {Promise<CredentialValidation>}
   */
  async function validate(command) {
    registerSecrets();
    const spec = COMMAND_CREDENTIALS[command];
    if (!spec) throw new Error(`unknown platform command: ${command}`);

    const names = [...(spec.names ?? [])];
    if (spec.serviceClient) names.push("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
    if (spec.netlifyAuth) names.push("NETLIFY_AUTH_TOKEN");

    const missing = [...new Set(names)].filter((n) => !has(n));

    // Supabase authorization = env-token OR cli-session (never a bare name).
    /** @type {{required:boolean, ready:boolean, via:'env-token'|'cli-session'|'none'}} */
    let supabaseAuth = { required: false, ready: false, via: "none" };
    if (spec.supabaseAuth) {
      const resolved = await authResolver(merged);
      supabaseAuth = { required: true, ready: resolved.ready, via: resolved.via };
    }

    const netlifyAuth = { required: Boolean(spec.netlifyAuth), ready: has("NETLIFY_AUTH_TOKEN") };
    const serviceClient = {
      required: Boolean(spec.serviceClient),
      present: has("SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY"),
    };
    const confirmGate = spec.confirmGate
      ? { name: spec.confirmGate, confirmed: (get(spec.confirmGate) ?? "").trim().toLowerCase() === "true" }
      : null;

    const ok =
      missing.length === 0 &&
      (!supabaseAuth.required || supabaseAuth.ready) &&
      (!confirmGate || confirmGate.confirmed);

    return { command, ok, missing, supabaseAuth, netlifyAuth, serviceClient, confirmGate };
  }

  return { get, has, source, registerSecrets, validate };
}

function pickPresent(env) {
  /** @type {Record<string,string>} */
  const out = {};
  for (const [k, v] of Object.entries(env)) if (isPresent(v)) out[k] = /** @type {string} */ (v);
  return out;
}

/**
 * Human-readable, NAMES-only summary of a validation verdict for logs/plans.
 * Never prints a value. Marks WHY a command would refuse.
 * @param {CredentialValidation} v
 * @returns {string[]}
 */
export function describeValidation(v) {
  const lines = [];
  lines.push(`command: ${v.command} — ${v.ok ? "READY" : "NOT READY (would refuse before any remote action)"}`);
  if (v.missing.length) lines.push(`  missing names: ${v.missing.join(", ")}`);
  if (v.supabaseAuth.required) {
    lines.push(`  supabase authorization: ${v.supabaseAuth.ready ? `ready via ${v.supabaseAuth.via}` : "MISSING (need env-token OR cli-session)"}`);
  }
  if (v.serviceClient.required) {
    lines.push(`  service-role client (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY): ${v.serviceClient.present ? "present" : "MISSING"}`);
  }
  if (v.netlifyAuth.required) {
    lines.push(`  netlify authorization (NETLIFY_AUTH_TOKEN): ${v.netlifyAuth.ready ? "present" : "MISSING"}`);
  }
  if (v.confirmGate) {
    lines.push(`  confirmation gate ${v.confirmGate.name}: ${v.confirmGate.confirmed ? "confirmed" : "NOT confirmed (held)"}`);
  }
  return lines;
}

/**
 * Fail-closed enforcement used by APPLY-mode entrypoints only. Logs the NAMES-
 * only reason and exits BEFORE any remote action when the verdict is not ok.
 * Plan mode never calls this — it reports readiness and mutates nothing.
 * @param {CredentialValidation} v
 */
export function enforceOrExit(v) {
  if (v.ok) {
    log.ok(`credentials READY for ${v.command} (by name / authorization kind only).`);
    return;
  }
  log.error(`refused BEFORE any remote action — ${v.command} is not credential-ready:`);
  for (const line of describeValidation(v)) log.plain(`  ${line}`);
  process.exit(2);
}
