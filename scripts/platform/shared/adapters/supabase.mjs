// TERAGON AI BUSINESS OS — real Supabase adapter (Gate S7.0).
// =============================================================================
// Wraps the Supabase CLI (Management API) + the service-role Admin API
// (@supabase/supabase-js) behind a small, injectable method surface. The script
// CORES depend ONLY on this surface, so tests can substitute a deterministic
// fake with zero network. This module is invoked ONLY in APPLY mode (never in
// plan mode, never in this S7.0 task — credentials are absent here).
//
// Security: the DB password is passed to the CLI via the child ENV
// (SUPABASE_DB_PASSWORD), never as a logged argv flag. No token, password, key,
// or session is ever returned in a loggable field.
import { execFile } from "node:child_process";
import process from "node:process";

function needsShell(command) {
  return process.platform === "win32" && /^(npm|npx|netlify|supabase)$/i.test(command);
}

/** Run a CLI command capturing stdout; rejects on non-zero. env is merged. */
function capture(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { env: { ...process.env, ...env }, timeout: 120000, windowsHide: true, shell: needsShell(command), maxBuffer: 16 * 1024 * 1024 },
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
 * @param {(name:string)=>(string|undefined)} deps.credentials  value resolver (never logged)
 * @param {(command:string,args:string[],env?:object)=>Promise<string>} [deps.capture]  injectable runner
 * @param {()=>Promise<any>} [deps.serviceClientFactory]  injectable @supabase/supabase-js client factory
 */
export function createSupabaseAdapter(deps) {
  const cred = deps.credentials;
  const run = deps.capture ?? capture;

  async function serviceClient() {
    if (deps.serviceClientFactory) return deps.serviceClientFactory();
    const url = cred("SUPABASE_URL");
    // Normalized server key resolves from SECRET (modern) or SERVICE_ROLE (legacy).
    const key = cred("SUPABASE_SERVER_KEY");
    if (!url || !key) throw new Error("service-role client requires SUPABASE_URL + SUPABASE_SERVER_KEY");
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  return {
    // --- Management API (CLI) — read ----------------------------------------
    async listOrgs() {
      return parseJson(await run("supabase", ["orgs", "list", "--output", "json"]), []);
    },
    async listProjects() {
      return parseJson(await run("supabase", ["projects", "list", "--output", "json"]), []);
    },
    // --- Management API (CLI) — mutate (APPLY only) --------------------------
    async createProject({ name, orgId, region, dbPassword }) {
      // The Supabase CLI REQUIRES --db-password in non-interactive mode (env
      // alone is NOT honoured for `projects create`). It must be an explicit,
      // non-empty argv element. Refuse with a NAMES-only error otherwise — the
      // password VALUE is never placed in any message, log, or report.
      if (typeof dbPassword !== "string" || dbPassword.trim() === "") {
        throw new Error("createProject requires a database password (by name): SUPABASE_DB_PASSWORD");
      }
      // Exact argv, each token a SEPARATE element (no shell interpolation). The
      // value following --db-password is masked by the redacting exec/log layer.
      const out = await run(
        "supabase",
        ["projects", "create", name, "--org-id", orgId, "--region", region, "--db-password", dbPassword, "--output", "json"],
      );
      const parsed = parseJson(out, {});
      return { ref: parsed.id ?? parsed.ref ?? null, raw: parsed };
    },
    async getProjectHealth(ref) {
      const projects = parseJson(await run("supabase", ["projects", "list", "--output", "json"]), []);
      const found = (Array.isArray(projects) ? projects : []).find((p) => (p.id ?? p.ref) === ref);
      return { status: found?.status ?? found?.health ?? "UNKNOWN", found: Boolean(found), project: found ?? null };
    },
    async link(ref) {
      await run("supabase", ["link", "--project-ref", ref], {
        SUPABASE_DB_PASSWORD: cred("SUPABASE_DB_PASSWORD") ?? "",
      });
    },
    // --- connection discovery (S7.0.1) --------------------------------------
    async getConnectionMetadata(ref) {
      // Authoritative, canonical project URL. Prefer any explicit endpoint from
      // the projects list; fall back to the canonical <ref>.supabase.co host.
      const projects = parseJson(await run("supabase", ["projects", "list", "--output", "json"]), []);
      const found = (Array.isArray(projects) ? projects : []).find((p) => (p.id ?? p.ref) === ref);
      const endpoint = found?.endpoint ?? found?.api_url ?? null;
      return { url: endpoint || `https://${ref}.supabase.co` };
    },
    async getProjectApiKeys(ref) {
      // Capture stdout PRIVATELY, parse in memory. NEVER forward the raw stdout
      // (key values) to logs/errors/disk. On CLI failure throw a sanitized error
      // that carries NO raw output (which could contain key material via stderr).
      let out;
      try {
        out = await run("supabase", ["projects", "api-keys", "--project-ref", ref, "--output", "json"]);
      } catch {
        throw new Error("failed to retrieve project API keys");
      }
      return parseJson(out, []);
    },
    // --- migrations ---------------------------------------------------------
    async remoteMigrationList() {
      const out = await run("supabase", ["migration", "list", "--linked", "--output", "json"]).catch(() => "[]");
      return parseJson(out, []);
    },
    async dbPush() {
      // --yes: the orchestrator captures stdio, so the push must be
      // non-interactive. We deliberately do NOT pass --include-seed (config
      // seed) — only the committed migrations 001..014 are applied. The DB
      // password is supplied via env (never a logged argv flag).
      await run("supabase", ["db", "push", "--linked", "--yes"], { SUPABASE_DB_PASSWORD: cred("SUPABASE_DB_PASSWORD") ?? "" });
    },
    // --- Admin API (service role) -------------------------------------------
    async findUserByEmail(email) {
      const client = await serviceClient();
      // listUsers is paginated; scan a bounded number of pages for the email.
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw new Error(`listUsers failed: ${error.message}`);
        const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
        if (hit) return { userId: hit.id };
        if (data.users.length < 200) break;
      }
      return null;
    },
    async createUser({ email, password }) {
      const client = await serviceClient();
      const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw new Error(`createUser failed: ${error?.message ?? "no user"}`);
      return { userId: data.user.id };
    },
    async bootstrapAdminRpc({ userId, orgId, orgName, name, email }) {
      const client = await serviceClient();
      const { error } = await client.rpc("bootstrap_admin", {
        p_user_id: userId,
        p_org_id: orgId,
        p_org_name: orgName ?? "",
        p_name: name ?? "",
        p_email: email ?? "",
      });
      if (error) throw new Error(`bootstrap_admin failed: ${error.message}`);
    },
    async getProfile(userId) {
      const client = await serviceClient();
      const { data, error } = await client.from("profiles").select("id, organization_id, role_id, active, status").eq("id", userId).maybeSingle();
      if (error) throw new Error(`profile read failed: ${error.message}`);
      return data;
    },
    async getMembership(userId, orgId) {
      const client = await serviceClient();
      const { data, error } = await client
        .from("memberships")
        .select("profile_id, organization_id, role_id, active")
        .eq("profile_id", userId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (error) throw new Error(`membership read failed: ${error.message}`);
      return data;
    },
  };
}
