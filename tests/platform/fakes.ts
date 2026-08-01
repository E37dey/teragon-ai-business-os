// Gate S7.0 — deterministic fakes for the platform pipeline unit tests.
// No network, no filesystem, no CLI. Every adapter method is recorded so tests
// can assert exactly what was (and was NOT) called.
import { createStageTracker } from "../../scripts/platform/shared/stage.mjs";

export interface Call {
  readonly method: string;
  readonly args: unknown[];
}

/** In-memory stage tracker (exercises the REAL stage.mjs via injected I/O). */
export function memoryStage(now = () => "2026-08-01T00:00:00.000Z") {
  const store: { text: string | null } = { text: null };
  const tracker = createStageTracker({
    path: "MEMORY",
    now,
    reader: () => store.text,
    writer: (_p: string, t: string) => {
      store.text = t;
    },
  });
  return { tracker, store };
}

/** A fake Supabase adapter with programmable data + full call recording. */
export function fakeSupabase(opts: {
  orgs?: unknown[];
  projects?: unknown[];
  createdRef?: string;
  health?: Record<string, unknown>;
  remoteHistory?: unknown[];
  existingUser?: { userId: string } | null;
  profile?: Record<string, unknown> | null;
  membership?: Record<string, unknown> | null;
  apiKeys?: unknown[];
  connectionUrl?: string;
} = {}) {
  const calls: Call[] = [];
  const rec = (method: string, ...args: unknown[]) => calls.push({ method, args });
  return {
    calls,
    called: (m: string) => calls.some((c) => c.method === m),
    async listOrgs() {
      rec("listOrgs");
      return opts.orgs ?? [{ id: "org-1", name: "Teragon" }];
    },
    async listProjects() {
      rec("listProjects");
      return opts.projects ?? [];
    },
    async createProject(a: { name?: string; orgId?: string; region?: string; dbPassword?: string }) {
      // Model the CLI contract: a non-empty db password is mandatory. Record the
      // args REDACTED — never the password value — so no call log can leak it.
      if (typeof a?.dbPassword !== "string" || a.dbPassword.trim() === "") {
        throw new Error("createProject requires a database password (by name): SUPABASE_DB_PASSWORD");
      }
      rec("createProject", { name: a.name, orgId: a.orgId, region: a.region, hasDbPassword: true });
      return { ref: opts.createdRef ?? "newref01", raw: {} };
    },
    async getProjectHealth(ref: string) {
      rec("getProjectHealth", ref);
      return opts.health ?? { status: "ACTIVE_HEALTHY", found: true, project: { organization_id: "org-1", region: "eu-central-1", name: "teragon-staging" } };
    },
    async link(ref: string) {
      rec("link", ref);
    },
    async getConnectionMetadata(ref: string) {
      rec("getConnectionMetadata", ref);
      return { url: opts.connectionUrl ?? `https://${ref}.supabase.co` };
    },
    async getProjectApiKeys(ref: string) {
      rec("getProjectApiKeys", ref);
      return (
        opts.apiKeys ?? [
          { name: "anon", api_key: "anon-legacy-value-abcdef" },
          { name: "service_role", api_key: "service-role-value-abcdef" },
        ]
      );
    },
    async remoteMigrationList() {
      rec("remoteMigrationList");
      return opts.remoteHistory ?? [];
    },
    async dbPush() {
      rec("dbPush");
    },
    async findUserByEmail(email: string) {
      rec("findUserByEmail", email);
      return opts.existingUser ?? null;
    },
    async createUser(a: { email: string; password: string }) {
      rec("createUser", { email: a.email, hasPassword: Boolean(a.password) });
      return { userId: "user-new" };
    },
    async bootstrapAdminRpc(a: unknown) {
      rec("bootstrapAdminRpc", a);
    },
    async getProfile(userId: string) {
      rec("getProfile", userId);
      return opts.profile ?? { id: userId, organization_id: "org-teragon", role_id: "crole-sysadmin", active: true, status: "פעיל" };
    },
    async getMembership(userId: string, orgId: string) {
      rec("getMembership", userId, orgId);
      return opts.membership ?? { profile_id: userId, organization_id: orgId, role_id: "crole-sysadmin", active: true };
    },
  };
}

/** An adapter whose every method throws — proves plan mode calls nothing. */
export function throwingSupabase() {
  const boom = (m: string) => async () => {
    throw new Error(`remote adapter ${m} must NOT be called in plan mode`);
  };
  return {
    listOrgs: boom("listOrgs"),
    listProjects: boom("listProjects"),
    createProject: boom("createProject"),
    getProjectHealth: boom("getProjectHealth"),
    link: boom("link"),
    getConnectionMetadata: boom("getConnectionMetadata"),
    getProjectApiKeys: boom("getProjectApiKeys"),
    remoteMigrationList: boom("remoteMigrationList"),
    dbPush: boom("dbPush"),
    findUserByEmail: boom("findUserByEmail"),
    createUser: boom("createUser"),
    bootstrapAdminRpc: boom("bootstrapAdminRpc"),
    getProfile: boom("getProfile"),
    getMembership: boom("getMembership"),
  };
}

// A schema-introspection row in the REAL live CLI/API shape (S7.1.2): integer
// counts arrive as numbers; array columns historically arrive as Postgres
// array-LITERAL strings ("{a,b}") — the shape that broke S7.1 live. Locked to
// the observed live totals (47/3/14/200/96/468/185/2, 9 functions, 0 disabled).
export const GOOD_SCHEMA_ROW = {
  public_tables: 47,
  namespaces: 3,
  migrations: 14,
  functions_present:
    "{auth_org_id,auth_role_id,bootstrap_admin,close_service_ticket,current_profile,has_capability,is_active,is_org_member,is_service_role}",
  indexes: 200,
  fk_constraints: 96,
  check_constraints: 468,
  rls_disabled_tables: "{}",
  nullable_orgid_tenant_tables: "{}",
  storage_buckets: 2,
  rls_policies: 185,
};

/** A per-domain seed-count row where every domain has >=1 canonical record. */
export const GOOD_SEED_COUNTS = {
  crm: 3, products_printers: 2, service_repairs: 1, training: 3, tasks_approvals: 2, knowledge_memory: 2, governance_audit: 1,
};

/** A fake db adapter (supabase db query --linked) with programmable results. */
export function fakeDb(opts: {
  schemaRow?: Record<string, unknown>;
  scriptResults?: Record<string, { ok: boolean; error?: string }>;
  queryThrows?: boolean;
  seedCountRow?: Record<string, number>;
  seedCountRows?: Record<string, number>[];
} = {}) {
  const calls: Call[] = [];
  let seedQueryIndex = 0;
  return {
    calls,
    called: (m: string) => calls.some((c) => c.method === m),
    async query(sql: string) {
      // Route by query shape: the seed stage's count query selects "as crm".
      if (/\bas crm\b/.test(sql)) {
        calls.push({ method: "query", args: ["seed-counts"] });
        if (opts.seedCountRows) return [opts.seedCountRows[Math.min(seedQueryIndex++, opts.seedCountRows.length - 1)]];
        return [opts.seedCountRow ?? GOOD_SEED_COUNTS];
      }
      calls.push({ method: "query", args: [sql.slice(0, 20)] });
      if (opts.queryThrows) throw new Error("sql execution failed");
      return [opts.schemaRow ?? GOOD_SCHEMA_ROW];
    },
    async runScriptFile(path: string) {
      const name = path.split(/[\\/]/).pop() as string;
      calls.push({ method: "runScriptFile", args: [name] });
      return opts.scriptResults?.[name] ?? { ok: true };
    },
  };
}

/** A fake Netlify adapter with programmable env + call recording. */
export function fakeNetlify(opts: { site?: { id: string; name: string }; env?: Record<string, unknown>; deploy?: Record<string, unknown> } = {}) {
  const calls: Call[] = [];
  const state = new Map<string, { scopes: string[]; secret: boolean }>();
  for (const k of Object.keys(opts.env ?? {})) state.set(k, { scopes: ["builds"], secret: false });
  return {
    calls,
    state,
    async getLinkedSite() {
      calls.push({ method: "getLinkedSite", args: [] });
      return opts.site ?? { id: "site-1", name: "teragon-os-demo" };
    },
    async listEnv() {
      calls.push({ method: "listEnv", args: [] });
      return [...state.entries()].map(([key, v]) => ({ key, scopes: v.scopes }));
    },
    async setEnv(a: { key: string; value: string; scopes: string[]; secret: boolean }) {
      calls.push({ method: "setEnv", args: [{ key: a.key, scopes: a.scopes, secret: a.secret }] });
      state.set(a.key, { scopes: a.scopes, secret: a.secret });
    },
    async deploy(a: unknown) {
      calls.push({ method: "deploy", args: [a] });
      return opts.deploy ?? { deployId: "dep-1", url: "https://preview.example.netlify.app" };
    },
    async getDeploy(id: string) {
      calls.push({ method: "getDeploy", args: [id] });
      return { state: "ready", commit: "abc123", siteId: "site-1", sslUrl: "https://preview.example.netlify.app" };
    },
  };
}
