// S9.2-A1d2a-1A — deterministic tests for the live customer fixture + cleanup
// harness. FAKE in-memory Admin adapter only: no real client, no network, no
// staging mutation, no auth.users SQL. Proves provision/cleanup/always-cleanup,
// mid-way rollback, fail-closed config, and password redaction.
import { describe, it, expect } from "vitest";
import {
  provisionCustomerFixtures,
  cleanupCustomerFixtures,
  withCustomerFixtures,
  assertFixtureConfig,
  fixturePrefix,
} from "../../scripts/platform/live-customer-fixtures.mjs";

interface Rec { method: string; args: unknown[] }

/** In-memory Admin adapter with call recording + programmable failure. */
function fakeAdmin(opts: { throwOn?: string; existingUser?: { userId: string } | null } = {}) {
  const store = {
    users: new Map<string, { userId: string }>(),
    profiles: new Map<string, unknown>(),
    memberships: new Map<string, unknown>(),
    customers: new Map<string, unknown>(),
  };
  const calls: Rec[] = [];
  const rec = (method: string, arg: unknown) => calls.push({ method, args: [arg] });
  const guard = (m: string) => { if (opts.throwOn === m) throw new Error(`boom ${m}`); };
  return {
    store, calls,
    async findUserByEmail(email: string) {
      rec("findUserByEmail", email);
      return opts.existingUser ?? (store.users.get(email) ?? null);
    },
    async createUser(a: { email: string; password: string }) {
      guard("createUser");
      rec("createUser", { email: a.email, hasPassword: Boolean(a.password) }); // NEVER the value
      const userId = `u-${a.email}`;
      store.users.set(a.email, { userId });
      return { userId };
    },
    async deleteUser(userId: string) {
      guard("deleteUser");
      rec("deleteUser", userId);
      for (const [e, v] of store.users) if (v.userId === userId) store.users.delete(e);
    },
    async insertProfile(a: { userId: string }) { guard("insertProfile"); rec("insertProfile", a); store.profiles.set(a.userId, a); },
    async deleteProfile(userId: string) { guard("deleteProfile"); rec("deleteProfile", userId); store.profiles.delete(userId); },
    async insertMembership(a: { id: string }) { guard("insertMembership"); rec("insertMembership", a); store.memberships.set(a.id, a); },
    async deleteMembership(id: string) { guard("deleteMembership"); rec("deleteMembership", id); store.memberships.delete(id); },
    async insertCustomer(a: { id: string }) { guard("insertCustomer"); rec("insertCustomer", a); store.customers.set(a.id, a); },
    async deleteCustomer(id: string) { guard("deleteCustomer"); rec("deleteCustomer", id); store.customers.delete(id); },
  };
}

const CONFIG = { runId: "run0001", secondOrgId: "org-staging-beta", roleId: "crole-sales", customerCount: 2 };
const DETERMINISTIC = { genPassword: () => "FIXED-PW-NEVER-LOGGED" };
const empty = (s: ReturnType<typeof fakeAdmin>["store"]) =>
  s.users.size === 0 && s.profiles.size === 0 && s.memberships.size === 0 && s.customers.size === 0;

describe("S9.2-A1d2a-1A · assertFixtureConfig (fail-closed)", () => {
  it("accepts a valid non-admin second-org config", () => {
    expect(assertFixtureConfig(CONFIG).ok).toBe(true);
  });
  it("rejects a missing/short runId, a missing org, org-teragon, and a privileged role", () => {
    expect(assertFixtureConfig({ ...CONFIG, runId: "x" }).ok).toBe(false);
    expect(assertFixtureConfig({ ...CONFIG, secondOrgId: "" }).ok).toBe(false);
    expect(assertFixtureConfig({ ...CONFIG, secondOrgId: "org-teragon" }).problems.join(" ")).toMatch(/org-teragon/);
    expect(assertFixtureConfig({ ...CONFIG, roleId: "crole-sysadmin" }).problems.join(" ")).toMatch(/privileged/);
  });
});

describe("S9.2-A1d2a-1A · provision + cleanup", () => {
  it("creates a prefixed user + non-admin profile + membership + N customers; password redacted", async () => {
    const adapter = fakeAdmin();
    const res = await provisionCustomerFixtures({ adapter, config: CONFIG, deps: DETERMINISTIC });
    expect(res.ok).toBe(true);
    const prefix = fixturePrefix("run0001");
    expect(res.handle.email).toBe(`${prefix}-user@fixtures.teragon.local`);
    expect(res.handle.membershipId).toBe(`${prefix}-mem`);
    expect(res.handle.customerIds).toEqual([`${prefix}-cust-1`, `${prefix}-cust-2`]);
    expect(res.handle.customerIds.every((id: string) => id.startsWith(prefix))).toBe(true);
    // store reflects exactly one user/profile/membership + 2 customers
    expect(adapter.store.users.size).toBe(1);
    expect(adapter.store.profiles.size).toBe(1);
    expect(adapter.store.memberships.size).toBe(1);
    expect(adapter.store.customers.size).toBe(2);
    // password never entered the recorded call log
    expect(JSON.stringify(adapter.calls)).not.toContain("FIXED-PW-NEVER-LOGGED");
    const createCall = adapter.calls.find((c) => c.method === "createUser");
    expect(createCall?.args[0]).toMatchObject({ hasPassword: true });
  });

  it("cleanup removes everything and is idempotent", async () => {
    const adapter = fakeAdmin();
    const prov = await provisionCustomerFixtures({ adapter, config: CONFIG, deps: DETERMINISTIC });
    const c1 = await cleanupCustomerFixtures({ adapter, handle: prov.handle });
    expect(c1.ok).toBe(true);
    expect(empty(adapter.store)).toBe(true);
    const c2 = await cleanupCustomerFixtures({ adapter, handle: prov.handle }); // second run = no-op
    expect(c2.ok).toBe(true);
  });

  it("rolls back partial state when provisioning fails mid-way (fail-closed)", async () => {
    const adapter = fakeAdmin({ throwOn: "insertMembership" });
    const res = await provisionCustomerFixtures({ adapter, config: CONFIG, deps: DETERMINISTIC });
    expect(res.ok).toBe(false);
    expect(res.handle).toBeNull();
    expect(empty(adapter.store)).toBe(true); // user + profile were rolled back
  });
});

describe("S9.2-A1d2a-1A · withCustomerFixtures (always-cleanup)", () => {
  it("runs the body then cleans up; overall ok", async () => {
    const adapter = fakeAdmin();
    const seen: string[] = [];
    // The harness is a .mjs module, so the body param has no inferred type;
    // annotate the one field this assertion reads instead of widening to any.
    const run = await withCustomerFixtures({ adapter, config: CONFIG, deps: DETERMINISTIC }, async (h: { userId: string }) => {
      seen.push(h.userId);
      return "body-done";
    });
    expect(run.ok).toBe(true);
    expect(run.bodyResult).toBe("body-done");
    expect(seen).toHaveLength(1);
    expect(empty(adapter.store)).toBe(true);
  });

  it("cleans up even when the body throws (run fails, staging left clean)", async () => {
    const adapter = fakeAdmin();
    const run = await withCustomerFixtures({ adapter, config: CONFIG, deps: DETERMINISTIC }, async () => {
      throw new Error("body blew up");
    });
    expect(run.ok).toBe(false);
    expect(run.phase).toBe("body");
    expect(empty(adapter.store)).toBe(true);
  });

  it("a cleanup failure fails the run even when the body passed", async () => {
    const adapter = fakeAdmin({ throwOn: "deleteUser" });
    const run = await withCustomerFixtures({ adapter, config: CONFIG, deps: DETERMINISTIC }, async () => "ok");
    expect(run.ok).toBe(false);
    expect(run.phase).toBe("cleanup");
    expect(run.cleanup.errors.length).toBeGreaterThan(0);
  });

  it("refuses a bad config before any adapter call", async () => {
    const adapter = fakeAdmin();
    const run = await withCustomerFixtures({ adapter, config: { ...CONFIG, roleId: "crole-sysadmin" }, deps: DETERMINISTIC }, async () => "x");
    expect(run.ok).toBe(false);
    expect(run.phase).toBe("provision");
    expect(adapter.calls).toHaveLength(0);
  });
});
