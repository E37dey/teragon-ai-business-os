// TERAGON AI BUSINESS OS — platform deploy: Supabase auth resolver (Gate S6.1).
// =============================================================================
// The Supabase Management-API steps (provision / link / migrate / gen types)
// authenticate one of two supported ways, and this module is the single place
// that decides which is available — WITHOUT weakening the fail-closed contract:
//
//   1. SUPABASE_ACCESS_TOKEN in the environment (CI / headless), OR
//   2. an already-authenticated Supabase CLI session (`supabase login` done
//      once on an operator machine; the CLI persists its own token in the OS
//      profile — we NEVER read, copy, or print that token).
//
// A step is authorized iff EITHER is present. If NEITHER is present the caller
// still refuses before any remote action — fail-closed is preserved, just now
// satisfiable by the CLI session too. This module never returns or logs a token
// value; the session probe only observes an exit code.
import { execFile } from "node:child_process";
import process from "node:process";
import { isPresent } from "./env.mjs";

function needsShell(command) {
  return process.platform === "win32" && /^(npm|npx|netlify|supabase)$/i.test(command);
}

/**
 * Probe whether the Supabase CLI already holds a valid authenticated session.
 * Runs a harmless, read-only Management-API call (`supabase orgs list`) and
 * observes ONLY the exit code — no stdout token, nothing printed. Any failure
 * (not logged in, offline, CLI missing) resolves to false, never throws.
 * @returns {Promise<boolean>}
 */
export function supabaseSessionPresent() {
  return new Promise((resolve) => {
    execFile(
      "supabase",
      ["orgs", "list", "--output", "json"],
      { timeout: 25000, windowsHide: true, shell: needsShell("supabase") },
      (err) => resolve(!err),
    );
  });
}

/** Does the env carry an explicit Management-API token? (name-presence only) */
export function supabaseTokenPresent(env = process.env) {
  return isPresent(env["SUPABASE_ACCESS_TOKEN"]);
}

/**
 * Resolve Supabase authorization readiness by NAME/kind only (never a value).
 * @param {Readonly<Record<string,string|undefined>>} [env]
 * @returns {Promise<{ready: boolean, via: 'env-token'|'cli-session'|'none'}>}
 */
export async function resolveSupabaseAuth(env = process.env) {
  if (supabaseTokenPresent(env)) return { ready: true, via: "env-token" };
  if (await supabaseSessionPresent()) return { ready: true, via: "cli-session" };
  return { ready: false, via: "none" };
}
