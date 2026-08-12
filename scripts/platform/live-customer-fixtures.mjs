// TERAGON AI BUSINESS OS — Gate S9.2-A1d2a-1A: live customer fixture + cleanup
// harness (adapter-injected, fail-closed, process.exit-free core).
// =============================================================================
// Provisions the CONTROLLED staging-only fixtures the live customer acceptance
// (org-isolation / cross-org RLS) needs — a temporary NON-admin Auth user in a
// SECOND (already-seeded) organization, plus its canonical profile + membership
// and optional second-org customers — and GUARANTEES their removal.
//
// Hard rules enforced here:
//   • The Auth user is created ONLY via the injected Admin adapter's createUser
//     (Admin API). There is NO auth.users SQL and NO manual password hashing.
//   • A per-run acceptance prefix `accrun-<runId>` stamps EVERY created id/email,
//     so cleanup targets exactly this run and nothing else.
//   • The fixture role MUST be non-admin, and the org MUST NOT be org-teragon —
//     isolation is meaningless against the canonical admin's own org.
//   • The generated password is held in memory ONLY, passed to createUser, and
//     NEVER logged, persisted, or placed in a returned error/category.
//   • Cleanup is idempotent and runs in an always/finally position; a cleanup
//     failure fails the whole run even when the body passed.
//
// This module contains NO real client. The real service-role Admin adapter +
// the fail-closed runner (env/provider/ref gates, the once-only live suite) are
// a later checkpoint; this checkpoint ships the harness + fake-client tests only.
import process from "node:process";
import { randomBytes } from "node:crypto";
import { log } from "./shared/log.mjs";
import { isEntrypoint } from "./shared/runtime.mjs";

export const ACC_PREFIX = "accrun";
/** Privileged roles that fixtures must never use (isolation needs a plain user). */
export const ADMIN_ROLES = new Set(["crole-sysadmin", "crole-ceo"]);

/** The per-run stamp on every created id/email — the ONLY thing cleanup targets. */
export function fixturePrefix(runId) {
  return `${ACC_PREFIX}-${runId}`;
}

/** SAFE error category — never HTML/body/token/key/password. */
export function classifyFixtureError(err) {
  const status = err?.status ?? err?.statusCode ?? err?.code;
  const msg = String(err?.message ?? "").toLowerCase();
  if (msg.includes("<") || msg.includes("doctype") || msg.includes("not valid json")) return "non-json/HTML response";
  if (String(status) === "401" || msg.includes("unauthor")) return "401 unauthorized";
  if (String(status) === "403" || msg.includes("forbidden")) return "403 forbidden";
  if (String(status) === "409" || msg.includes("duplicate") || msg.includes("conflict")) return "conflict/duplicate";
  if (msg.includes("network") || msg.includes("fetch")) return "network/retryable error";
  return "fixture adapter error";
}

/** Fail-closed config validation. Pure + total. */
export function assertFixtureConfig(config) {
  const problems = [];
  if (!config || typeof config !== "object") return { ok: false, problems: ["config object required"] };
  if (typeof config.runId !== "string" || !/^[a-z0-9]{6,}$/.test(config.runId))
    problems.push("runId must be a stable [a-z0-9]{6,} acceptance-run id");
  if (typeof config.secondOrgId !== "string" || config.secondOrgId.length === 0)
    problems.push("secondOrgId required (an EXISTING seeded org, not org-teragon)");
  else if (config.secondOrgId === "org-teragon")
    problems.push("secondOrgId must not be org-teragon — isolation needs a DIFFERENT org");
  if (typeof config.roleId !== "string" || config.roleId.length === 0) problems.push("roleId required");
  else if (ADMIN_ROLES.has(config.roleId)) problems.push(`roleId ${config.roleId} is privileged — fixtures must use a NON-admin role`);
  if (config.customerCount != null && (!Number.isInteger(config.customerCount) || config.customerCount < 0))
    problems.push("customerCount must be a non-negative integer");
  return { ok: problems.length === 0, problems };
}

/** Strong random plaintext password for the Admin API (never a hash, never logged). */
function defaultGenPassword() {
  return `Acc-${randomBytes(18).toString("base64url")}-9!`;
}

function customerIds(prefix, n) {
  return Array.from({ length: n }, (_, i) => `${prefix}-cust-${i + 1}`);
}

/**
 * S9.3-E: contact fixtures live in the PRIMARY (administrator's) organization,
 * because the browser suite signs in as the administrator and RLS correctly hides
 * the second organization's rows. The second-org records stay exactly as they
 * were — they are what proves isolation.
 */
function contactIds(prefix, n) {
  return Array.from({ length: n }, (_, i) => `${prefix}-ct-${i + 1}`);
}

/**
 * Provision the fixtures. Returns `{ ok, handle }`; on any mid-way failure it
 * ROLLS BACK whatever it already created and returns `{ ok:false, handle:null }`.
 * The returned handle carries the fixture password IN MEMORY for the browser
 * login step — callers must never log or persist it.
 * @param {Object} p
 * @param {Object} p.adapter injected Admin adapter (createUser + insert/delete methods)
 * @param {Object} p.config  { runId, secondOrgId, roleId, customerCount?, emailDomain? }
 * @param {Object} [p.deps]  { genPassword? } — injected for deterministic tests
 */
export async function provisionCustomerFixtures({ adapter, config, deps = {} }) {
  const check = assertFixtureConfig(config);
  if (!check.ok) return { ok: false, reason: check.problems.join("; "), handle: null };

  const genPassword = deps.genPassword ?? defaultGenPassword;
  const prefix = fixturePrefix(config.runId);
  const email = `${prefix}-user@${config.emailDomain ?? "fixtures.teragon.local"}`;
  const password = genPassword(); // held in memory only — NEVER logged
  const membershipId = `${prefix}-mem`;
  // Primary-org fixtures (S9.3-E): ONE customer + N contacts the administrator's
  // own session can legitimately read/edit. `primaryOrgId` defaults to the
  // canonical org; when absent, no primary-org fixture is provisioned at all.
  const primaryOrgId = config.primaryOrgId ?? "org-teragon";
  const primaryCustomerId = `${prefix}-pcust`;
  const created = {
    userId: null, profile: false, membershipId: null, customerIds: [],
    contactIds: [], primaryCustomerId: null,
  };

  try {
    const existing = adapter.findUserByEmail ? await adapter.findUserByEmail(email) : null;
    const user = existing ?? (await adapter.createUser({ email, password }));
    created.userId = user.userId;

    await adapter.insertProfile({
      userId: user.userId, orgId: config.secondOrgId, roleId: config.roleId,
      name: `${prefix} fixture`, email, active: true,
    });
    created.profile = true;

    await adapter.insertMembership({
      id: membershipId, orgId: config.secondOrgId, userId: user.userId, roleId: config.roleId, active: true,
    });
    created.membershipId = membershipId;

    for (const id of customerIds(prefix, config.customerCount ?? 0)) {
      await adapter.insertCustomer({ id, orgId: config.secondOrgId, name: `${prefix} לקוח`, type: "עסק", city: "חיפה", status: "פעיל" });
      created.customerIds.push(id);
    }

    // Primary-org customer + contacts (only when contacts are requested).
    const contactCount = config.contactCount ?? 0;
    if (contactCount > 0 && adapter.insertContact) {
      await adapter.insertCustomer({ id: primaryCustomerId, orgId: primaryOrgId, name: `${prefix} לקוח ראשי`, type: "עסק", city: "תל אביב", status: "פעיל" });
      created.primaryCustomerId = primaryCustomerId;
      created.customerIds.push(primaryCustomerId);
      for (const [i, id] of contactIds(prefix, contactCount).entries()) {
        await adapter.insertContact({
          id, orgId: primaryOrgId, customerId: primaryCustomerId,
          name: `${prefix} איש קשר ${i + 1}`, role: i === 0 ? "רכש" : "תפעול",
          phone: "050", email: `${id}@fixtures.teragon.local`, isPrimary: i === 0,
        });
        created.contactIds.push(id);
      }
    }

    return {
      ok: true,
      handle: {
        runId: config.runId, prefix, secondOrgId: config.secondOrgId, roleId: config.roleId,
        email, password, userId: user.userId, profile: true, membershipId,
        customerIds: [...created.customerIds], reusedUser: Boolean(existing),
        primaryOrgId, primaryCustomerId: created.primaryCustomerId,
        contactIds: [...created.contactIds],
      },
    };
  } catch (err) {
    // Roll back whatever we managed to create, then fail closed.
    const rollback = await cleanupCustomerFixtures({
      adapter,
      handle: {
        userId: created.userId, profile: created.profile, membershipId: created.membershipId,
        customerIds: created.customerIds, contactIds: created.contactIds,
      },
    });
    return { ok: false, reason: `provision failed: ${classifyFixtureError(err)}`, cleanup: rollback, handle: null };
  }
}

/**
 * Remove every fixture the handle names. Idempotent (a missing resource is not
 * an error) and best-effort across all resources, collecting SAFE categories.
 * `ok` is true only when nothing failed to delete.
 */
export async function cleanupCustomerFixtures({ adapter, handle }) {
  if (!handle) return { ok: true, removed: [], errors: [] };
  const removed = [];
  const errors = [];
  // Delete, then VERIFY absence (when the adapter can probe) — cleanup "ok" must
  // mean the row is gone, not merely that the delete call did not throw.
  const attempt = async (label, del, verifyGone) => {
    try {
      await del();
      if (verifyGone && typeof adapter.exists === "function") {
        const still = await verifyGone();
        if (still) {
          errors.push(`${label}: still present after delete`);
          return;
        }
      }
      removed.push(label);
    } catch (err) {
      errors.push(`${label}: ${classifyFixtureError(err)}`);
    }
  };
  // Contacts FIRST — they reference customers, so deleting the parent first would
  // violate the FK. Sweep by parent customer so browser-created contacts (whose
  // app-generated ids the handle cannot know) are removed too, then verify the
  // parent holds ZERO contacts before the customer itself is deleted.
  if (handle.primaryCustomerId && typeof adapter.deleteContactsForCustomer === "function") {
    await attempt(
      `contacts-of:${handle.primaryCustomerId}`,
      () => adapter.deleteContactsForCustomer(handle.primaryCustomerId),
      async () =>
        typeof adapter.countBy === "function"
          ? (await adapter.countBy("contacts", "customer_id", handle.primaryCustomerId)) > 0
          : false,
    );
  }
  for (const id of handle.contactIds ?? [])
    if (typeof adapter.deleteContact === "function")
      await attempt(`contact:${id}`, () => adapter.deleteContact(id), () => adapter.exists("contacts", "id", id));

  for (const id of handle.customerIds ?? [])
    await attempt(`customer:${id}`, () => adapter.deleteCustomer(id), () => adapter.exists("customers", "id", id));
  if (handle.membershipId)
    await attempt(`membership:${handle.membershipId}`, () => adapter.deleteMembership(handle.membershipId), () => adapter.exists("memberships", "id", handle.membershipId));
  if (handle.userId && handle.profile)
    await attempt(`profile:${handle.userId}`, () => adapter.deleteProfile(handle.userId), () => adapter.exists("profiles", "id", handle.userId));
  if (handle.userId) await attempt(`user:${handle.userId}`, () => adapter.deleteUser(handle.userId));
  return { ok: errors.length === 0, removed, errors };
}

/**
 * Provision → run `body(handle)` → ALWAYS clean up. A body error OR a cleanup
 * failure fails the run; cleanup runs regardless of how the body ends.
 */
export async function withCustomerFixtures({ adapter, config, deps }, body) {
  const prov = await provisionCustomerFixtures({ adapter, config, deps });
  if (!prov.ok) return { ok: false, phase: "provision", reason: prov.reason, bodyResult: null, cleanup: prov.cleanup ?? null };

  let bodyResult = null;
  let bodyError = null;
  try {
    bodyResult = await body(prov.handle);
  } catch (err) {
    bodyError = classifyFixtureError(err);
  }
  const cleanup = await cleanupCustomerFixtures({ adapter, handle: prov.handle }); // always
  const ok = !bodyError && cleanup.ok;
  const reason = bodyError ?? (cleanup.ok ? null : `cleanup failed: ${cleanup.errors.join("; ")}`);
  return { ok, phase: bodyError ? "body" : cleanup.ok ? "done" : "cleanup", reason, bodyResult, cleanup };
}

// --- thin PLAN entrypoint: describe intended actions, contact nothing ---------
function planLines() {
  return [
    "createUser({email: accrun-<runId>-user@…, password: ***}) via the service-role Admin adapter",
    "insert NON-admin profile + membership in the SECOND seeded org (never org-teragon)",
    "optionally insert N accrun-<runId>-cust-* customers for that org",
    "run the live body, then ALWAYS delete customers → membership → profile → user (idempotent)",
    "cleanup failure fails the run; password is never logged or persisted",
  ];
}

async function main() {
  log.step("live-customer-fixtures — PLAN (no adapter, nothing contacted).");
  for (const line of planLines()) log.plain(`  would: ${line}`);
  process.exit(0);
}

if (isEntrypoint(import.meta.url)) {
  main().catch((err) => {
    log.error(`live-customer-fixtures failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
