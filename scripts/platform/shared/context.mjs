// TERAGON AI BUSINESS OS — platform deploy: read-only context resolver (Gate S1).
// =============================================================================
// Gathers LOCAL, read-only facts about the repo + toolchain. NEVER makes a
// remote call and NEVER throws (mirrors config.ts: probe, degrade honestly,
// report). Every probe that shells out uses a short timeout and swallows
// failure into a boolean/null rather than crashing the caller.
import { execFile } from "node:child_process";
import { existsSync, statSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import process from "node:process";
import { isPresent } from "./env.mjs";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** production is a hard, explicit opt-in — anything but "true" ⇒ staging. */
export function deployProductionEnabled(env = process.env) {
  return (env["DEPLOY_PRODUCTION"] ?? "").trim().toLowerCase() === "true";
}

/** Which environment a run targets. 'production' requires the gate. */
export function resolveEnvironment(env = process.env) {
  return deployProductionEnabled(env) ? "production" : "staging";
}

/** Netlify deploy context flag mapping (staging ⇒ preview, production ⇒ prod). */
export function netlifyIsProduction(env = process.env) {
  return deployProductionEnabled(env);
}

// --- read-only local repo facts ---------------------------------------------

// On Windows only the npm/npx (.cmd) wrappers need a shell to resolve; real
// executables (git, docker) resolve directly, which also avoids Node's DEP0190
// "args + shell:true" deprecation warning.
function needsShell(command) {
  return process.platform === "win32" && /^(npm|npx|netlify|supabase)$/i.test(command);
}

function safeExec(command, args, timeout = 5000) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { cwd: REPO_ROOT, timeout, windowsHide: true, shell: needsShell(command) },
      (err, stdout) => resolve(err ? null : String(stdout).trim()),
    );
  });
}

/** Do Supabase migrations exist locally? (verify-before-create input) */
export function migrationsPresent() {
  const dir = join(REPO_ROOT, "supabase", "migrations");
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return { present: false, count: 0 };
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".sql"));
  return { present: files.length > 0, count: files.length };
}

/** Is a Supabase project config committed locally? */
export function supabaseConfigPresent() {
  return existsSync(join(REPO_ROOT, "supabase", "config.toml"));
}

/** Is the Netlify site already linked locally? (idempotency input) */
export function netlifyStatePresent() {
  const p = join(REPO_ROOT, ".netlify", "state.json");
  return { present: existsSync(p), path: ".netlify/state.json" };
}

/** Read-only git facts. Null fields when git is unavailable. */
export async function gitFacts() {
  const commit = await safeExec("git", ["rev-parse", "--short", "HEAD"]);
  const branch = await safeExec("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = await safeExec("git", ["status", "--porcelain"]);
  return {
    commit,
    branch,
    clean: status === "" ? true : status === null ? null : false,
  };
}

// --- toolchain probes (local, read-only) ------------------------------------

/** Is the Supabase CLI resolvable via npx (declared dev dep)? */
export async function supabaseCliState() {
  const version = await safeExec("npx", ["--no-install", "supabase", "--version"], 20000);
  return { available: isPresent(version), version: version || null };
}

/** Is a Docker daemon up? `docker info` succeeds only when the daemon runs. */
export async function dockerState() {
  const info = await safeExec("docker", ["info", "--format", "{{.ServerVersion}}"], 8000);
  return { available: isPresent(info), serverVersion: info || null };
}
