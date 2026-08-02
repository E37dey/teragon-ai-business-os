// TERAGON AI BUSINESS OS — real Netlify adapter (Gate S7.0).
// =============================================================================
// Wraps the Netlify CLI behind a small, injectable method surface consumed by
// the configure-netlify / deploy-preview / verify-preview CORES. Tests inject a
// deterministic fake of the same shape. Invoked ONLY in APPLY mode.
//
// Security: NETLIFY_AUTH_TOKEN is consumed from the child ENV; secret env var
// values are passed to `env:set` via stdin-style value args but the logger
// scrubs registered secrets, and privileged values are set at Functions scope
// only (never a VITE_-prefixed browser var — enforced by the core).
import { execFile } from "node:child_process";
import process from "node:process";

function needsShell(command) {
  return process.platform === "win32" && /^(npm|npx|netlify|supabase)$/i.test(command);
}

function capture(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { env: { ...process.env, ...env }, timeout: 300000, windowsHide: true, shell: needsShell(command), maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(String(stdout).trim())),
    );
  });
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

/**
 * @param {Object} deps
 * @param {(name:string)=>(string|undefined)} deps.credentials
 * @param {(command:string,args:string[],env?:object)=>Promise<string>} [deps.capture]
 */
export function createNetlifyAdapter(deps) {
  const cred = deps.credentials;
  const run = deps.capture ?? capture;
  const authEnv = () => ({ NETLIFY_AUTH_TOKEN: cred("NETLIFY_AUTH_TOKEN") ?? "" });
  const siteArgs = () => {
    const id = cred("NETLIFY_SITE_ID");
    return id ? ["--site", id] : [];
  };

  return {
    async getLinkedSite() {
      const out = await run("netlify", ["status", "--json"], authEnv());
      const s = parseJson(out, {});
      return { id: s?.siteData?.id ?? null, name: s?.siteData?.name ?? null };
    },
    async listEnv(context) {
      // Read the vars resolved for a SPECIFIC context (deploy-preview or
      // production). Only KEYS are consumed by the core — values are never
      // printed/stored. Context-scoped so the core can verify Production is
      // untouched separately from Preview.
      const args = ["env:list", "--json", ...(context ? ["--context", context] : []), ...siteArgs()];
      return parseJson(await run("netlify", args, authEnv()), {});
    },
    async setEnv({ key, value, scopes, secret, context }) {
      // S7.3A: write to a SINGLE context (default deploy-preview) — NEVER
      // "--context all", so Production is never modified. This upserts only this
      // one var in this one context; unrelated vars/contexts are preserved.
      const ctx = context ?? "deploy-preview";
      const args = ["env:set", key, value, "--scope", (scopes ?? []).join(","), "--context", ctx, ...siteArgs()];
      if (secret) args.push("--secret");
      await run("netlify", args, authEnv());
    },
    async deploy({ dir, prod }) {
      const args = ["deploy", "--dir", dir, "--json", ...siteArgs()];
      if (prod) args.push("--prod");
      const out = await run("netlify", args, authEnv());
      const d = parseJson(out, {});
      return { deployId: d.deploy_id ?? d.deployId ?? null, url: d.deploy_url ?? d.url ?? null, logs: d.logs ?? null };
    },
    async getDeploy(deployId) {
      const out = await run("netlify", ["api", "getDeploy", "--data", JSON.stringify({ deploy_id: deployId })], authEnv());
      const d = parseJson(out, {});
      return {
        state: d.state ?? null,
        commit: d.commit_ref ?? d.commit ?? null,
        siteId: d.site_id ?? null,
        sslUrl: d.deploy_ssl_url ?? d.ssl_url ?? null,
      };
    },
  };
}
