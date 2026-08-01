// TERAGON AI BUSINESS OS — unified credential provider + runtime context (S7.0/S7.0.1).
// =============================================================================
// ONE loader + ONE in-memory runtime context used by every platform script. It
// removes duplicated ".env parse + process.env read + fail-closed" logic AND
// solves the S7.0.1 problem: the connection values that only exist AFTER a
// project is created/selected (URL + API keys) are injected into the SAME
// provider mid-apply and become immediately visible to later stages, with
// readiness recalculated — WITHOUT weakening fail-closed and WITHOUT persisting
// or printing any privileged material.
//
// Layers + precedence for every NAME (highest first):
//   1. process.env                       (CI / explicit operator override)
//   2. runtime context                   (values discovered during apply, e.g.
//                                          SUPABASE_URL / SUPABASE_SERVER_KEY —
//                                          in-memory only, cleared on exit)
//   3. .env.staging.local  (gitignored)  (S6.1 output; parsed safely; redacted)
//   plus an authorization dimension: an authenticated Supabase CLI session used
//   ONLY when SUPABASE_ACCESS_TOKEN is absent ("env-token OR cli-session").
//
// NORMALIZED KEY NAMES (S7.0.1): SUPABASE_BROWSER_KEY / SUPABASE_SERVER_KEY
// resolve from a modern source then a legacy fallback (see KEY_ALIASES).
//
// The provider is value-blind at its public surface. get()/getRequired()/
// getOptional() return a value for handing straight to an adapter (never
// logged). There is deliberately NO method that serializes ALL credentials.
import process from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./context.mjs";
import { registerSecretValues, log } from "./log.mjs";
import { isPresent } from "./env.mjs";
import {
  COMMAND_CREDENTIALS,
  SECRET_VALUE_NAMES,
  KEY_ALIASES,
  POST_PROVISION_NAMES,
  PRE_PROVISION_NAMES,
} from "./names.mjs";
import { resolveSupabaseAuth } from "./supabase-auth.mjs";

const STAGING_FILE = join(REPO_ROOT, ".env.staging.local");

/**
 * Parse KEY=VALUE lines from a .env-style text blob. Ignores blanks + comments.
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
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
      v = v.slice(1, -1);
    }
    if (k) out[k] = v;
  }
  return out;
}

function readStagingFile() {
  try {
    return existsSync(STAGING_FILE) ? readFileSync(STAGING_FILE, "utf8") : "";
  } catch {
    return "";
  }
}

function pickPresent(env) {
  /** @type {Record<string,string>} */
  const out = {};
  for (const [k, v] of Object.entries(env)) if (isPresent(v)) out[k] = /** @type {string} */ (v);
  return out;
}

function isSecretName(name) {
  if (SECRET_VALUE_NAMES.includes(name)) return true;
  // normalized keys are secret too (browser key stays redacted in output).
  return name === "SUPABASE_BROWSER_KEY" || name === "SUPABASE_SERVER_KEY";
}

/**
 * Build the unified credential provider + runtime context.
 * @param {Object} [deps]
 * @param {Record<string,string|undefined>} [deps.env]
 * @param {string} [deps.fileText]
 * @param {(env:Record<string,string|undefined>)=>Promise<{ready:boolean, via:'env-token'|'cli-session'|'none'}>} [deps.authResolver]
 */
export function createCredentialProvider(deps = {}) {
  const envSource = deps.env ?? process.env;
  const authResolver = deps.authResolver ?? resolveSupabaseAuth;

  const layers = {
    env: pickPresent(envSource),
    /** @type {Record<string,string>} */ runtime: {},
    file: deps.fileText !== undefined ? parseEnvText(deps.fileText) : parseEnvText(readStagingFile()),
  };
  /** @type {{ready:boolean, via:'env-token'|'cli-session'|'none'}} */
  let sessionAuth = { ready: false, via: "none" };
  let lastReadiness = null;

  // --- layer loaders (idempotent) -------------------------------------------
  function loadFromProcessEnvironment() {
    layers.env = pickPresent(envSource);
    return Object.keys(layers.env).length;
  }
  function loadFromLocalSecureFile() {
    layers.file = deps.fileText !== undefined ? parseEnvText(deps.fileText) : parseEnvText(readStagingFile());
    return Object.keys(layers.file).length;
  }
  async function loadFromSupabaseCliSession() {
    sessionAuth = await authResolver(mergedForAuth());
    return sessionAuth;
  }

  // --- resolution (env > runtime > file, with normalized-key aliases) --------
  function rawLookup(name) {
    if (isPresent(layers.env[name])) return { value: layers.env[name], source: "env" };
    if (isPresent(layers.runtime[name])) return { value: layers.runtime[name], source: "runtime" };
    if (isPresent(layers.file[name])) return { value: layers.file[name], source: "staging-file" };
    return null;
  }
  function resolveEntry(name) {
    const direct = rawLookup(name);
    if (direct) return direct;
    const aliases = KEY_ALIASES[name];
    if (aliases)
      for (const a of aliases) {
        const r = rawLookup(a);
        if (r) return { ...r, alias: a };
      }
    return null;
  }

  function get(name) {
    return resolveEntry(name)?.value;
  }
  function has(name) {
    return Boolean(resolveEntry(name));
  }
  function source(name) {
    return resolveEntry(name)?.source;
  }
  function getOptional(name) {
    return get(name);
  }
  function getRequired(name) {
    const v = get(name);
    // NAMES-only error — a required credential value is never placed in a message.
    if (!isPresent(v)) throw new Error(`required credential not available (by name): ${name}`);
    return v;
  }

  // --- runtime injection (values discovered mid-apply) ----------------------
  function setRuntimeValue(name, value) {
    if (!isPresent(value)) return;
    layers.runtime[name] = value;
    if (isSecretName(name)) registerSecretValues([value]);
  }
  function setRuntimeValues(values) {
    for (const [k, v] of Object.entries(values ?? {})) {
      if (k.startsWith("__")) continue; // skip metadata like __browserSource
      setRuntimeValue(k, v);
    }
  }
  function clearRuntime() {
    for (const k of Object.keys(layers.runtime)) delete layers.runtime[k];
  }

  function mergedForAuth() {
    return { ...layers.file, ...layers.runtime, ...layers.env };
  }

  // --- redaction ------------------------------------------------------------
  function registerSecrets() {
    const values = [];
    for (const n of SECRET_VALUE_NAMES) {
      const v = get(n);
      if (isPresent(v)) values.push(v);
    }
    registerSecretValues(values);
  }

  /**
   * A child ENV for a server-only adapter/CLI child process. It carries real
   * values (the child needs them) but every secret value is registered with the
   * logger first, so this object must NEVER be logged — only handed to a child.
   */
  function createRedactedChildEnvironment() {
    registerSecrets();
    /** @type {Record<string,string>} */
    const out = {};
    for (const [k, v] of Object.entries({ ...layers.file, ...layers.runtime })) if (isPresent(v)) out[k] = v;
    for (const [k, v] of Object.entries(layers.env)) if (isPresent(v)) out[k] = v;
    return out;
  }

  // --- per-command validation (fail-closed) ---------------------------------
  async function validate(command) {
    registerSecrets();
    const spec = COMMAND_CREDENTIALS[command];
    if (!spec) throw new Error(`unknown platform command: ${command}`);

    const names = [...(spec.names ?? [])];
    if (spec.serviceClient) names.push("SUPABASE_URL", "SUPABASE_SERVER_KEY");
    if (spec.netlifyAuth) names.push("NETLIFY_AUTH_TOKEN");

    const missing = [...new Set(names)].filter((n) => !has(n));

    /** @type {{required:boolean, ready:boolean, via:'env-token'|'cli-session'|'none'}} */
    let supabaseAuth = { required: false, ready: false, via: "none" };
    if (spec.supabaseAuth) {
      const resolved = await authResolver(mergedForAuth());
      supabaseAuth = { required: true, ready: resolved.ready, via: resolved.via };
    }
    const netlifyAuth = { required: Boolean(spec.netlifyAuth), ready: has("NETLIFY_AUTH_TOKEN") };
    const serviceClient = {
      required: Boolean(spec.serviceClient),
      present: has("SUPABASE_URL") && has("SUPABASE_SERVER_KEY"),
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

  // --- pipeline readiness classification (S7.0.1) ---------------------------
  // Distinguishes pre-provision creds from project-DERIVED values so the plan
  // never reports the pipeline blocked merely because keys don't exist before a
  // project is created.
  async function classifyPipelineReadiness() {
    const auth = await authResolver(mergedForAuth());
    const authReady = auth.ready;
    const orgResolved = has("SUPABASE_ORG_ID");
    const dbPassword = has("SUPABASE_DB_PASSWORD");
    const adminConfirmed =
      has("TERAGON_ADMIN_EMAIL") && (get("TERAGON_ADMIN_EMAIL_CONFIRMED") ?? "").trim().toLowerCase() === "true";
    const netlifyTarget = has("NETLIFY_AUTH_TOKEN") && has("NETLIFY_SITE_ID");

    const postPresent = POST_PROVISION_NAMES.filter((n) => has(n));
    const postProvisionPresent = postPresent.length === POST_PROVISION_NAMES.length;
    const preProvisionReady = authReady && orgResolved && dbPassword;

    const blockedReasons = [];
    if (!authReady) blockedReasons.push("Supabase CLI session/token unavailable");
    if (!orgResolved) blockedReasons.push("SUPABASE_ORG_ID unresolved");
    if (!dbPassword) blockedReasons.push("SUPABASE_DB_PASSWORD absent");
    if (!adminConfirmed) blockedReasons.push("admin confirmation absent (TERAGON_ADMIN_EMAIL[_CONFIRMED])");
    if (!netlifyTarget) blockedReasons.push("Netlify target unresolved (NETLIFY_AUTH_TOKEN + NETLIFY_SITE_ID)");

    const applyReady = blockedReasons.length === 0;
    const state = !applyReady
      ? "BLOCKED"
      : postProvisionPresent
        ? "APPLY_READY (post-provision values already present)"
        : "APPLY_READY (post-provision values will be fetched during apply)";

    lastReadiness = {
      state,
      preProvisionReady,
      postProvisionPresent,
      postProvisionPending: !postProvisionPresent,
      applyReady,
      blocked: !applyReady,
      blockedReasons,
      derivedPresentNames: postPresent, // NAMES only
      pins: { orgResolved, dbPassword, adminConfirmed, netlifyTarget, authVia: auth.via },
    };
    return lastReadiness;
  }
  async function refreshReadiness() {
    return classifyPipelineReadiness();
  }

  // --- presence report (NAMES + booleans ONLY — never values) ---------------
  function getPresenceReport() {
    const interesting = [
      ...new Set([
        ...PRE_PROVISION_NAMES,
        ...POST_PROVISION_NAMES,
        "TERAGON_ADMIN_EMAIL",
        "TERAGON_ADMIN_EMAIL_CONFIRMED",
        "TERAGON_ADMIN_PASSWORD",
        "NETLIFY_AUTH_TOKEN",
        "NETLIFY_SITE_ID",
      ]),
    ];
    /** @type {Record<string,{present:boolean, source:(string|undefined)}>} */
    const names = {};
    for (const n of interesting) names[n] = { present: has(n), source: source(n) };
    return { names, readiness: lastReadiness?.state ?? null };
  }

  return {
    // loaders
    loadFromProcessEnvironment,
    loadFromLocalSecureFile,
    loadFromSupabaseCliSession,
    // resolution
    get,
    getOptional,
    getRequired,
    has,
    source,
    // runtime context
    setRuntimeValue,
    setRuntimeValues,
    clearRuntime,
    // readiness + reports
    validate,
    refreshReadiness,
    classifyPipelineReadiness,
    getPresenceReport,
    // redaction / child env
    registerSecrets,
    createRedactedChildEnvironment,
  };
}

/**
 * Human-readable, NAMES-only summary of a validation verdict for logs/plans.
 * @param {{command:string, ok:boolean, missing:string[], supabaseAuth:{required:boolean,ready:boolean,via:string}, serviceClient:{required:boolean,present:boolean}, netlifyAuth:{required:boolean,ready:boolean}, confirmGate:({name:string,confirmed:boolean}|null)}} v
 */
export function describeValidation(v) {
  const lines = [];
  lines.push(`command: ${v.command} — ${v.ok ? "READY" : "NOT READY (would refuse before any remote action)"}`);
  if (v.missing.length) lines.push(`  missing names: ${v.missing.join(", ")}`);
  if (v.supabaseAuth.required) {
    lines.push(`  supabase authorization: ${v.supabaseAuth.ready ? `ready via ${v.supabaseAuth.via}` : "MISSING (need env-token OR cli-session)"}`);
  }
  if (v.serviceClient.required) {
    lines.push(`  service-role client (SUPABASE_URL + SUPABASE_SERVER_KEY): ${v.serviceClient.present ? "present" : "MISSING (fetched from project during apply)"}`);
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
 * @param {{ok:boolean, command:string}} v
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
