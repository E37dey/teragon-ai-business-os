// S9.2-A1d2a-1B1 — deterministic tests for the real server-only Admin adapter +
// the fail-closed live runner. Injected fakes only: no network, no staging
// mutation, no real service-role key.
import { describe, it, expect } from "vitest";
import {
  createLiveCustomerAdmin,
  safeAdminMessage,
  assertNoServiceRoleInViteEnv,
} from "../../scripts/platform/shared/adapters/live-customer-admin.mjs";
import {
  preflight,
  dryRun,
  evaluateReport,
  readReport,
  refFromUrl,
  STAGING_REF,
  adminPreflight,
  safeAuthCategory,
  parsePlaywrightTotals,
  assembleReport,
} from "../../scripts/live-domains/run-domains-live.mjs";
import {
  provisionCustomerFixtures,
  cleanupCustomerFixtures,
} from "../../scripts/platform/live-customer-fixtures.mjs";

interface Call { m: string; a: unknown[] }

/** Fake @supabase/supabase-js client: auth.admin + PostgREST table chains. */
function fakeClient() {
  const calls: Call[] = [];
  const rec = (m: string, ...a: unknown[]) => calls.push({ m, a });
  const resolved = (data: unknown = {}) => Promise.resolve({ data, error: null });
  const from = (t: string) => ({
    upsert: (row: Record<string, unknown>, opts: unknown) => { rec(`${t}.upsert`, row, opts); return resolved({ id: row.id }); },
    delete: () => ({ eq: (c: string, v: string) => { rec(`${t}.delete`, c, v); return resolved(null); } }),
    select: () => ({ eq: () => ({ maybeSingle: () => { rec(`${t}.select`); return resolved(null); } }) }),
  });
  const auth = {
    admin: {
      createUser: (a: { email: string; password: string }) => { rec("createUser", { email: a.email, hasPassword: Boolean(a.password) }); return resolved({ user: { id: "u-live" } }); },
      deleteUser: (id: string) => { rec("deleteUser", id); return resolved({}); },
      listUsers: () => { rec("listUsers"); return resolved({ users: [] }); },
    },
  };
  return { calls, from, auth };
}

const admin = (fake: ReturnType<typeof fakeClient>) => createLiveCustomerAdmin({ env: {}, clientFactory: () => fake });

const VALID_ENV: Record<string, string> = {
  STAGING_DOMAINS_LIVE: "1",
  SUPABASE_URL: "https://bjvirkmagwpqroakazjj.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_FAKE_NEVER_PRINTED_0001",
  SUPABASE_ANON_KEY: "sb_publishable_fake",
  TERAGON_ADMIN_EMAIL: "admin@example.co",
  TERAGON_ADMIN_PASSWORD: "pw-in-env",
  ACCEPTANCE_BASE_URL: "http://localhost:4173",
  INTENDED_COMMIT: "e5d5c17",
};
const withDeletes = { deleteUser() {}, deleteCustomer() {} };

describe("S9.2-A1d2a-1B1 · real Admin adapter (injected fake client)", () => {
  it("createUser goes through the Admin API and never records the password value", async () => {
    const fake = fakeClient();
    const res = await admin(fake).createUser({ email: "acc@x.co", password: "TOP-SECRET-PW" });
    expect(res.userId).toBe("u-live");
    const call = fake.calls.find((c) => c.m === "createUser");
    expect(call?.a[0]).toMatchObject({ hasPassword: true });
    expect(JSON.stringify(fake.calls)).not.toContain("TOP-SECRET-PW");
  });

  it("profile/membership/customer writes carry the canonical org; deletes target ids", async () => {
    const fake = fakeClient();
    const a = admin(fake);
    await a.insertProfile({ userId: "u1", orgId: "org-staging-beta", roleId: "crole-sales", name: "n", email: "e@x.co", active: true });
    await a.insertMembership({ id: "accrun-r-mem", orgId: "org-staging-beta", userId: "u1", roleId: "crole-sales", active: true });
    await a.insertCustomer({ id: "accrun-r-cust-1", orgId: "org-staging-beta", name: "c", type: "עסק", city: "חיפה", status: "פעיל" });
    await a.deleteCustomer("accrun-r-cust-1");
    await a.deleteUser("u1");
    const prof = fake.calls.find((c) => c.m === "profiles.upsert");
    expect(prof?.a[0]).toMatchObject({ id: "u1", organization_id: "org-staging-beta", role_id: "crole-sales" });
    expect(fake.calls.some((c) => c.m === "customers.delete")).toBe(true);
    expect(fake.calls.some((c) => c.m === "deleteUser")).toBe(true);
  });

  it("refuses construction when a service-role key is VITE_-exposed", () => {
    expect(assertNoServiceRoleInViteEnv({ VITE_SUPABASE_SERVICE_ROLE_KEY: "x" }).ok).toBe(false);
    expect(() => createLiveCustomerAdmin({ env: { VITE_SUPABASE_SERVICE_ROLE_KEY: "x" } })).toThrow(/VITE_/);
  });

  it("redacts jwt / sb_ / service_role from adapter error messages", () => {
    const msg = safeAdminMessage(new Error("boom eyJabcdefghijklmnop.qrstuvwx.token sb_secret_xxxxxxxx service_role denied"));
    expect(msg).not.toMatch(/eyJ|sb_secret_|service_role/);
  });
});

describe("S9.2-A1d2a-1B1 · runner preflight (fail-closed)", () => {
  it("passes a fully-valid staging env", () => {
    const pf = preflight(VALID_ENV, { provider: "SUPABASE", adapter: withDeletes });
    expect(pf.ok).toBe(true);
    expect(refFromUrl(VALID_ENV.SUPABASE_URL)).toBe(STAGING_REF);
  });

  it("fails on missing env, wrong provider, wrong ref, missing commit, VITE leak, no cleanup", () => {
    expect(preflight({ ...VALID_ENV, SUPABASE_URL: "" }, { provider: "SUPABASE" }).ok).toBe(false);
    expect(preflight(VALID_ENV, { provider: "LOCAL_INDEXEDDB" }).problems.join(" ")).toMatch(/SUPABASE/);
    expect(preflight({ ...VALID_ENV, SUPABASE_URL: "https://other0000000000000.supabase.co" }, { provider: "SUPABASE" }).problems.join(" ")).toMatch(/ref/);
    expect(preflight({ ...VALID_ENV, INTENDED_COMMIT: "" }, { provider: "SUPABASE", commit: "" }).problems.join(" ")).toMatch(/commit/);
    expect(preflight({ ...VALID_ENV, VITE_SUPABASE_SERVICE_ROLE_KEY: "x" }, { provider: "SUPABASE" }).problems.join(" ")).toMatch(/VITE_/);
    expect(preflight(VALID_ENV, { provider: "SUPABASE", adapter: { foo: 1 } }).problems.join(" ")).toMatch(/cleanup/);
  });

  it("requires the STAGING_DOMAINS_LIVE gate", () => {
    expect(preflight({ ...VALID_ENV, STAGING_DOMAINS_LIVE: "0" }, { provider: "SUPABASE" }).problems.join(" ")).toMatch(/STAGING_DOMAINS_LIVE/);
  });
});

describe("S9.2-A1d2a-1B1 · dry-run (zero mutations, no values)", () => {
  it("performs zero createUser/db-writes/deletes and never echoes secret values", () => {
    const rep = dryRun(VALID_ENV, { provider: "SUPABASE" });
    expect(rep.mode).toBe("dry-run");
    expect(rep.mutations).toEqual({ createUser: 0, dbWrites: 0, deletes: 0, staging: 0 });
    expect(rep.envPresent.SUPABASE_SERVICE_ROLE_KEY).toBe(true);
    expect(JSON.stringify(rep)).not.toContain("sb_secret_FAKE_NEVER_PRINTED_0001");
    expect(JSON.stringify(rep)).not.toContain("pw-in-env");
  });
});

describe("S9.2-A1d2a-1B1 · report evaluation (fail-hard)", () => {
  const base = { files: 1, executed: 12, passed: 12, failed: 0, skipped: 0, cleanup: "ok" };
  it("passes a clean report; fails on skip / failure / cleanup / zero-executed", () => {
    expect(evaluateReport(base).ok).toBe(true);
    expect(evaluateReport({ ...base, skipped: 1 }).ok).toBe(false);
    expect(evaluateReport({ ...base, failed: 1 }).ok).toBe(false);
    expect(evaluateReport({ ...base, cleanup: "failed" }).ok).toBe(false);
    expect(evaluateReport({ ...base, executed: 0 }).ok).toBe(false);
    expect(evaluateReport(null).ok).toBe(false);
  });
  it("readReport returns null when no report exists (injected fs)", () => {
    expect(readReport({ existsSync: () => false })).toBeNull();
  });
});

// --- S9.2-A1d2a-1B3: admin preflight + runner-owned report/cleanup -----------
function fakeAuthClient(session: boolean, err?: { message: string }) {
  const calls: string[] = [];
  return {
    calls,
    auth: {
      signInWithPassword: async (_a: { email: string; password: string }) => {
        calls.push("signIn");
        return session ? { data: { session: { access_token: "x" } }, error: null } : { data: { session: null }, error: err ?? { message: "Invalid login credentials" } };
      },
      signOut: async () => { calls.push("signOut"); },
    },
  };
}

describe("S9.2-A1d2a-1B3 · admin preflight (server-side, redacted)", () => {
  it("PASS when the admin credential authenticates, then signs out", async () => {
    const c = fakeAuthClient(true);
    const r = await adminPreflight(VALID_ENV, { clientFactory: () => c });
    expect(r.pass).toBe(true);
    expect(c.calls).toContain("signOut");
  });
  it("FAIL (invalid_credentials) on a rejected login — no secret leaks", async () => {
    const c = fakeAuthClient(false, { message: "Invalid login credentials for eyJabc.tok" });
    const r = await adminPreflight(VALID_ENV, { clientFactory: () => c });
    expect(r.pass).toBe(false);
    expect(r.category).toBe("invalid_credentials");
    expect(JSON.stringify(r)).not.toMatch(/eyJ|password|VALID_ENV/);
  });
  it("FAIL (missing_env) when a required name is absent — never constructs a client", async () => {
    let built = false;
    const r = await adminPreflight({ ...VALID_ENV, TERAGON_ADMIN_PASSWORD: "" }, { clientFactory: () => { built = true; return fakeAuthClient(true); } });
    expect(r.pass).toBe(false);
    expect(r.category).toBe("missing_env");
    expect(built).toBe(false);
  });
  it("safeAuthCategory redacts jwt/password from any message", () => {
    expect(safeAuthCategory({ message: "eyJx.tok invalid credential" })).toBe("invalid_credentials");
  });
});

describe("S9.2-A1d2a-1B3 · authoritative report assembly", () => {
  const PW = { suites: [{ file: "customers.live.ts", specs: Array.from({ length: 12 }, (_, i) => ({ tests: [{ status: i < 12 ? "expected" : "unexpected" }] })) }] };
  it("parses Playwright JSON into real totals (12 executed/passed)", () => {
    const t = parsePlaywrightTotals(PW);
    expect(t.executed).toBe(12);
    expect(t.passed).toBe(12);
    expect(t.failed).toBe(0);
  });
  it("a cleanup failure forces a FAIL verdict even when all tests passed", () => {
    const totals = { files: 1, executed: 12, passed: 12, failed: 0, skipped: 0 };
    expect(assembleReport({ totals, cleanup: "ok", preflight: "pass", maskedRef: "bjvi…azjj", commit: "c" }).verdict).toBe("PASS");
    expect(assembleReport({ totals, cleanup: "failed", preflight: "pass", maskedRef: "bjvi…azjj", commit: "c" }).verdict).toBe("FAIL");
  });
  it("a failed preflight forces FAIL and cleanup is never 'not-run'", () => {
    const rep = assembleReport({ totals: { files: 1, executed: 0, passed: 0, failed: 0, skipped: 0 }, cleanup: "ok", preflight: "fail", maskedRef: "-", commit: "c", note: "ADMIN_CREDENTIAL_MISMATCH" });
    expect(rep.verdict).toBe("FAIL");
    expect(rep.cleanup).not.toBe("not-run");
  });
  it("evaluateReport still fails a cleanup=not-run report defensively", () => {
    expect(evaluateReport({ files: 1, executed: 12, passed: 12, failed: 0, skipped: 0, cleanup: "not-run" }).ok).toBe(false);
  });
});

describe("S9.2-A1d2a-1B3 · cleanup verifies deletion", () => {
  const CONFIG = { runId: "run0001", secondOrgId: "org-staging-beta", roleId: "crole-sales", customerCount: 1 };
  function fakeAdapterWithExists(opts: { orphan?: boolean } = {}) {
    const store = new Set<string>();
    return {
      async createUser() { return { userId: "u1" }; },
      async deleteUser() {},
      async insertProfile() { store.add("profile:u1"); },
      async deleteProfile() { store.delete("profile:u1"); },
      async insertMembership(a: { id: string }) { store.add(`mem:${a.id}`); },
      async deleteMembership() { /* leave orphan when requested */ if (!opts.orphan) store.delete("mem:accrun-run0001-mem"); },
      async insertCustomer(a: { id: string }) { store.add(`cust:${a.id}`); },
      async deleteCustomer(id: string) { store.delete(`cust:${id}`); },
      async exists(table: string, _c: string, id: string) {
        if (table === "memberships") return store.has(`mem:${id}`);
        if (table === "profiles") return store.has(`profile:${id}`);
        if (table === "customers") return store.has(`cust:${id}`);
        return false;
      },
    };
  }
  it("cleanup ok when everything is verified gone", async () => {
    const adapter = fakeAdapterWithExists();
    const prov = await provisionCustomerFixtures({ adapter, config: CONFIG, deps: { genPassword: () => "pw" } });
    const c = await cleanupCustomerFixtures({ adapter, handle: prov.handle });
    expect(c.ok).toBe(true);
  });
  it("cleanup FAILS when a row survives deletion (verified via exists)", async () => {
    const adapter = fakeAdapterWithExists({ orphan: true });
    const prov = await provisionCustomerFixtures({ adapter, config: CONFIG, deps: { genPassword: () => "pw" } });
    const c = await cleanupCustomerFixtures({ adapter, handle: prov.handle });
    expect(c.ok).toBe(false);
    expect(c.errors.join(" ")).toMatch(/still present/);
  });
});
