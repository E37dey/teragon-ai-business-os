// TERAGON AI BUSINESS OS — LIVE Supabase repository-adapter integration suite.
//
// Runs against a live, local, ephemeral Supabase stack (Postgres + GoTrue +
// PostgREST) provisioned by CI. It NEVER skips: the folder is excluded from the
// default Vitest config, and ./setup.ts throws when SUPABASE_LIVE_TESTS!=1 or the
// env is incomplete — so a misconfigured run FAILS, it does not silently pass.
//
// Every ordinary CRUD/RPC assertion drives the REAL src/persistence/supabase
// adapter over the anon (publishable) key + a REAL authenticated JWT session, so
// RLS is exercised through the exact client boundary the app uses. The service-
// role client is used ONLY for user creation / bootstrap / teardown / invariant
// inspection. No JWT, key, or password is ever printed.
import "./setup"; // fail-hard env guard (throws at load when the live run isn't enabled)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BaseEntity } from "@/domain/types";
import type { CollectionKey } from "@/repositories/collections";
import { createSupabaseRepository } from "@/persistence/supabase/index";
import { SupabaseRepository } from "@/persistence/supabase/SupabaseRepository";
import { callRpc } from "@/persistence/supabase/rpc";
import type { PersistenceRepository } from "@/persistence/boundary";
import { DEFAULT_PERSISTENCE_PROVIDER, resolvePersistenceProvider } from "@/persistence/provider";
import type { SafeErrorCode } from "@/persistence/result";
import { enrollmentSchema } from "@/domain/schemas";
import {
  liveEnvOrThrow,
  setupFixtures,
  teardown,
  makeAgent,
  makeApproval,
  makeAuditEvent,
  makeContact,
  makeCourse,
  makeCustomer,
  makeEnrollment,
  makeKnowledgeNote,
  makeLead,
  makeMemoryRecord,
  makeOpportunity,
  makePrinterModel,
  makeQuotation,
  makeRecommendation,
  makeServiceTicket,
  makeStudent,
  makeTask,
  type LiveContext,
  type UserCtx,
} from "./helpers";

// --- shared state ----------------------------------------------------------

let ctx: LiveContext;
let executed = 0;
/** Increment on every executed live test (final guard asserts > 0). */
function bump(): void {
  executed += 1;
}

/** Build a REAL Supabase adapter for `user` (authenticated anon session). */
function repo<T extends BaseEntity>(user: UserCtx, collection: CollectionKey): PersistenceRepository<T> {
  return createSupabaseRepository<T>(collection, user.client, user.orgId);
}

/** The stable, provider-agnostic safe-error codes the boundary may surface. */
const SAFE_CODES: readonly SafeErrorCode[] = [
  "not_found",
  "duplicate",
  "validation",
  "conflict",
  "unauthorized",
  "network",
  "unavailable",
  "unknown",
];

beforeAll(async () => {
  ctx = await setupFixtures(liveEnvOrThrow());
});

afterAll(async () => {
  if (ctx) await teardown(ctx);
});

// --- diagnostics probe (temporary): surfaces WHY authenticated writes are
// resolving, so a CI run pinpoints auth-context vs org-injection issues. Logs
// only org ids + booleans + safe error messages — never tokens/keys. ---------
describe("0. diagnostics probe", () => {
  it("logs the authenticated admin's resolved RLS context + a probe write", async () => {
    bump();
    const u = ctx.adminA;
    const org = await u.raw.rpc("auth_org_id");
    const active = await u.raw.rpc("is_active");
    const capU = await u.raw.rpc("has_capability", { cap: "customer.update" });
    const capC = await u.raw.rpc("has_capability", { cap: "customer.create" });
    // eslint-disable-next-line no-console
    console.log(
      `[probe] adminA orgId=${u.orgId} role=${u.roleId}` +
        ` auth_org_id=${JSON.stringify(org.data)} orgErr=${org.error?.message ?? ""}` +
        ` is_active=${JSON.stringify(active.data)} actErr=${active.error?.message ?? ""}` +
        ` cap(customer.create)=${JSON.stringify(capC.data)} cap(customer.update)=${JSON.stringify(capU.data)}`,
    );
    const pid = `cu-probe-${ctx.suffix}`;
    const cRepo = repo<ReturnType<typeof makeCustomer>>(u, "customers");
    const created = await cRepo.createSafe(makeCustomer(pid, { name: "probe" }));
    // eslint-disable-next-line no-console
    console.log(`[probe] create ok=${created.ok} code=${created.ok ? "" : created.error.code} msg=${created.ok ? "" : created.error.message}`);
    // service_role inspection: does the row exist, and what tenant is stored?
    const row = await ctx.admin.from("customers").select("id,organization_id").eq("id", pid).maybeSingle();
    // eslint-disable-next-line no-console
    console.log(`[probe] stored row id=${row.data?.id ?? "MISSING"} organization_id=${row.data?.organization_id ?? "null"} selErr=${row.error?.message ?? ""}`);
    const upd = await cRepo.updateSafe(pid, { city: "תל אביב" });
    // eslint-disable-next-line no-console
    console.log(`[probe] update ok=${upd.ok} code=${upd.ok ? "" : upd.error.code} msg=${upd.ok ? "" : upd.error.message}`);
    expect(true).toBe(true);
  });
});

// ===========================================================================
// provider contract — the suite explicitly forces SUPABASE; LOCAL default holds
// ===========================================================================
describe("provider contract", () => {
  it("forces SUPABASE in the test composition while the LOCAL default is unchanged", () => {
    bump();
    expect(resolvePersistenceProvider("SUPABASE")).toBe("SUPABASE");
    expect(DEFAULT_PERSISTENCE_PROVIDER).toBe("LOCAL_INDEXEDDB");
    const r = repo(ctx.adminA, "customers");
    // The composition really is the Supabase adapter (not the local wrapper).
    expect(r instanceof SupabaseRepository).toBe(true);
  });
});

// ===========================================================================
// 1. identity / org
// ===========================================================================
describe("1. identity & organization", () => {
  it("resolves profile / membership / role / organization for an authenticated user", async () => {
    bump();
    const { adminA, orgA } = ctx;
    const prof = await adminA.raw.from("profiles").select("*").eq("id", adminA.userId).maybeSingle();
    expect(prof.data?.organization_id).toBe(orgA);
    expect(prof.data?.role_id).toBe("crole-sysadmin");
    const mem = await adminA.raw.from("memberships").select("*").eq("profile_id", adminA.userId).maybeSingle();
    expect(mem.data?.organization_id).toBe(orgA);
    expect(mem.data?.active).toBe(true);
    const role = await adminA.raw.from("roles").select("*").eq("id", "crole-sysadmin").maybeSingle();
    expect(role.data?.key).toBe("crole-sysadmin");
    const org = await adminA.raw.from("organizations").select("*").eq("id", orgA).maybeSingle();
    expect(org.data?.id).toBe(orgA);
  });

  it("denies an INACTIVE user everywhere (RLS is_active gate)", async () => {
    bump();
    const { inactiveA } = ctx;
    // identity read: own profile invisible (is_active() false)
    const prof = await inactiveA.raw.from("profiles").select("*").eq("id", inactiveA.userId).maybeSingle();
    expect(prof.data).toBeNull();
    // business read through the adapter: zero rows, safe result
    const list = await repo(inactiveA, "customers").listSafe();
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data).toEqual([]);
    // business write through the adapter: denied
    const write = await repo<BaseEntity>(inactiveA, "customers").createSafe(
      makeCustomer(`cu-${ctx.suffix}-inact`),
    );
    expect(write.ok).toBe(false);
  });

  it("ignores a browser-supplied organization — server/RLS wins on writes", async () => {
    bump();
    const { adminA, orgB, admin } = ctx;
    const id = `cu-${ctx.suffix}-rogueorg`;
    // adminA is authenticated in org A but the client CLAIMS org B in the payload.
    const rogue = createSupabaseRepository<BaseEntity>("customers", adminA.client, orgB);
    const res = await rogue.createSafe(makeCustomer(id));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(["unauthorized", "conflict"]).toContain(res.error.code);
    // invariant inspection: nothing was written into org B (no cross-tenant leak)
    const check = await admin.from("customers").select("id").eq("id", id);
    expect(check.data ?? []).toHaveLength(0);
  });

  it("rejects a browser-supplied role — self role-escalation is structurally blocked", async () => {
    bump();
    // Use an ACTIVE NON-ADMIN (viewerA has no user.manage). Self role-escalation
    // must be structurally impossible for such a user: the column-guarded
    // profiles_self_update policy pins role_id to its stored value (WITH CHECK),
    // and the admin-update policy does not apply (it requires user.manage). An
    // admin (crole-sysadmin) is deliberately NOT used here — admins legitimately
    // hold user.manage and MAY change roles (see the 04/05 RLS SQL proofs), so
    // they are the wrong fixture for a "self-escalation-blocked" assertion.
    const { viewerA, admin } = ctx;
    // authenticated non-admin tries to promote itself to CEO via the anon session.
    await viewerA.raw.from("profiles").update({ role_id: "crole-ceo" }).eq("id", viewerA.userId).select();
    // invariant inspection: the stored role is unchanged (column-guarded policy).
    const after = await admin.from("profiles").select("role_id").eq("id", viewerA.userId).single();
    expect(after.data?.role_id).toBe("crole-viewer");
  });
});

// ===========================================================================
// 2. CRM
// ===========================================================================
describe("2. CRM", () => {
  it("creates/reads/updates customer, contact, lead, opportunity, quotation through the adapters", async () => {
    bump();
    const { adminA } = ctx;
    const cuId = `cu-${ctx.suffix}-crm`;
    const customers = repo<ReturnType<typeof makeCustomer>>(adminA, "customers");
    const created = await customers.createSafe(makeCustomer(cuId, { name: "לקוח CRM" }));
    expect(created.ok).toBe(true);
    const read = await customers.getSafe(cuId);
    expect(read.ok && read.data?.name).toBe("לקוח CRM");
    const updated = await customers.updateSafe(cuId, { city: "תל אביב" });
    expect(updated.ok && updated.data.city).toBe("תל אביב");

    const contact = await repo(adminA, "contacts").createSafe(makeContact(`ct-${ctx.suffix}-1`, cuId));
    expect(contact.ok).toBe(true);
    const lead = await repo(adminA, "leads").createSafe(makeLead(`ld-${ctx.suffix}-1`, adminA.userId));
    expect(lead.ok).toBe(true);
    const opp = await repo(adminA, "opportunities").createSafe(
      makeOpportunity(`op-${ctx.suffix}-1`, adminA.userId, { customerId: cuId }),
    );
    expect(opp.ok).toBe(true);
    const quote = await repo(adminA, "quotations").createSafe(
      makeQuotation(`qt-${ctx.suffix}-1`, adminA.userId, { customerId: cuId }),
    );
    expect(quote.ok).toBe(true);
  });

  it("fails cross-organization access — user A cannot read or write org B rows", async () => {
    bump();
    const { adminA, adminB } = ctx;
    const bId = `cu-${ctx.suffix}-bonly`;
    const bCreate = await repo<ReturnType<typeof makeCustomer>>(adminB, "customers").createSafe(
      makeCustomer(bId, { name: "לקוח B" }),
    );
    expect(bCreate.ok).toBe(true);
    // read: other-org row is invisible (safe undefined, not an error, not the data)
    const read = await repo(adminA, "customers").getSafe(bId);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.data).toBeUndefined();
    // write: blind cross-org update hits zero visible rows → safe not_found
    const upd = await repo<ReturnType<typeof makeCustomer>>(adminA, "customers").updateSafe(bId, { city: "פריצה" });
    expect(upd.ok).toBe(false);
    if (!upd.ok) expect(upd.error.code).toBe("not_found");
  });

  it("returns deterministic, non-overlapping pages", async () => {
    bump();
    const { adminP } = ctx;
    const customers = repo<ReturnType<typeof makeCustomer>>(adminP, "customers");
    const ids = [1, 2, 3, 4, 5].map((n) => `cu-${ctx.suffix}-pg-0${n}`);
    for (const id of ids) {
      const r = await customers.createSafe(makeCustomer(id));
      expect(r.ok).toBe(true);
    }
    const all = await customers.listSafe();
    expect(all.ok && all.data).toHaveLength(5);
    const p1 = await customers.listPage({ from: 0, to: 1 });
    const p2 = await customers.listPage({ from: 2, to: 3 });
    const p3 = await customers.listPage({ from: 4, to: 5 });
    expect(p1.ok && p1.data.rows.map((r) => r.id)).toEqual([ids[0], ids[1]]);
    expect(p2.ok && p2.data.rows.map((r) => r.id)).toEqual([ids[2], ids[3]]);
    expect(p3.ok && p3.data.rows.map((r) => r.id)).toEqual([ids[4]]);
    // pages are non-overlapping and the last is a short page
    expect(p2.ok && p2.data.hasMore).toBe(true);
    expect(p3.ok && p3.data.hasMore).toBe(false);
  });
});

// ===========================================================================
// 3. products / printers / service
// ===========================================================================
describe("3. products, printers & service", () => {
  it("creates a printer model + customer printer + service ticket with a repair relationship", async () => {
    bump();
    const { adminA, orgA } = ctx;
    const pmId = `pm-${ctx.suffix}-1`;
    const pm = await repo(adminA, "printerModels").createSafe(makePrinterModel(pmId));
    expect(pm.ok).toBe(true);
    const cuId = `cu-${ctx.suffix}-svc`;
    const cu = await repo(adminA, "customers").createSafe(makeCustomer(cuId));
    expect(cu.ok).toBe(true);
    // customer_printers has no domain adapter — create the installed-base link via
    // the authenticated anon session (RLS-enforced), then wire a ticket to it.
    const cpId = `cp-${ctx.suffix}-1`;
    const cp = await adminA.raw
      .from("customer_printers")
      .insert({ id: cpId, organization_id: orgA, customer_id: cuId, printer_model_id: pmId, serial_number: "SN-1" })
      .select();
    expect(cp.error).toBeNull();
    const tkId = `st-${ctx.suffix}-rel`;
    const tk = await repo(adminA, "serviceTickets").createSafe(
      makeServiceTicket(tkId, adminA.userId, { customerId: cuId, customerPrinterId: cpId }),
    );
    expect(tk.ok).toBe(true);
    const back = await repo<ReturnType<typeof makeServiceTicket>>(adminA, "serviceTickets").getSafe(tkId);
    expect(back.ok && back.data?.customerPrinterId).toBe(cpId);
  });

  it("rejects an invalid foreign key (safe typed error, no throw)", async () => {
    bump();
    const { adminA } = ctx;
    const res = await repo(adminA, "serviceTickets").createSafe(
      makeServiceTicket(`st-${ctx.suffix}-badfk`, adminA.userId, { customerId: `cu-${ctx.suffix}-missing` }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("conflict"); // 23503 foreign_key_violation → conflict
  });

  it("does not create duplicate rows on repeated submission (idempotent upsert by id)", async () => {
    bump();
    const { adminA, admin } = ctx;
    const pmId = `pm-${ctx.suffix}-dup`;
    const first = await repo(adminA, "printerModels").upsertSafe(makePrinterModel(pmId, { name: "ראשון" }));
    const second = await repo(adminA, "printerModels").upsertSafe(makePrinterModel(pmId, { name: "שני" }));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const rows = await admin.from("printer_models").select("id").eq("id", pmId);
    expect(rows.data ?? []).toHaveLength(1); // one row, never a duplicate
  });
});

// ===========================================================================
// 4. training
// ===========================================================================
describe("4. training", () => {
  it("round-trips a course + enrollment with embedded StageProgress through zod (JSONB stages)", async () => {
    bump();
    const { adminA } = ctx;
    const coId = `co-${ctx.suffix}-1`;
    const co = await repo(adminA, "courses").createSafe(makeCourse(coId, adminA.userId));
    expect(co.ok).toBe(true);
    const sdId = `sd-${ctx.suffix}-1`;
    const sd = await repo(adminA, "students").createSafe(makeStudent(sdId));
    expect(sd.ok).toBe(true);
    const enId = `en-${ctx.suffix}-1`;
    const enrollments = repo<ReturnType<typeof makeEnrollment>>(adminA, "enrollments");
    const created = await enrollments.createSafe(makeEnrollment(enId, sdId, coId));
    expect(created.ok).toBe(true);
    const read = await enrollments.getSafe(enId);
    expect(read.ok).toBe(true);
    if (!read.ok || !read.data) return;
    // the embedded value object survived the JSONB round-trip AND re-validates.
    expect(enrollmentSchema.safeParse(read.data).success).toBe(true);
    expect(read.data.stages[0]?.stageId).toBe("stage-1");
    expect(read.data.stages[0]?.notes[0]?.author).toBe("מדריך");
  });

  it("fails cross-organization enrollment access", async () => {
    bump();
    const { adminA, adminB } = ctx;
    // an enrollment created in org A must be invisible to org B.
    const coId = `co-${ctx.suffix}-x`;
    const sdId = `sd-${ctx.suffix}-x`;
    const enId = `en-${ctx.suffix}-x`;
    await repo(adminA, "courses").createSafe(makeCourse(coId, adminA.userId));
    await repo(adminA, "students").createSafe(makeStudent(sdId));
    const en = await repo(adminA, "enrollments").createSafe(makeEnrollment(enId, sdId, coId));
    expect(en.ok).toBe(true);
    const read = await repo(adminB, "enrollments").getSafe(enId);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.data).toBeUndefined();
  });
});

// ===========================================================================
// 5. tasks / approvals + atomic RPC
// ===========================================================================
describe("5. tasks, approvals & atomic RPC", () => {
  const isApproved = (status: string): boolean => status === "אושר";

  it("chains recommendation → named-human approval → generated task", async () => {
    bump();
    const { adminA } = ctx;
    const agId = `ag-${ctx.suffix}-1`;
    const ag = await repo(adminA, "agents").createSafe(makeAgent(agId));
    expect(ag.ok).toBe(true);
    const recId = `rec-${ctx.suffix}-1`;
    const rec = await repo(adminA, "aiRecommendations").createSafe(makeRecommendation(recId, agId));
    expect(rec.ok).toBe(true);
    const apId = `ap-${ctx.suffix}-1`;
    const ap = await repo(adminA, "approvals").createSafe(
      makeApproval(apId, adminA.userId, { subjectRef: `recommendation:${recId}` }),
    );
    expect(ap.ok).toBe(true);
    const tkId = `tk-${ctx.suffix}-1`;
    const tk = await repo<ReturnType<typeof makeTask>>(adminA, "tasks").createSafe(
      makeTask(tkId, adminA.userId, { sourceRecommendationId: recId }),
    );
    expect(tk.ok && tk.data.sourceRecommendationId).toBe(recId);
  });

  it("a pending or rejected approval cannot satisfy an approved workflow", async () => {
    bump();
    const { adminA } = ctx;
    const apId = `ap-${ctx.suffix}-gate`;
    const approvals = repo<ReturnType<typeof makeApproval>>(adminA, "approvals");
    const pending = await approvals.createSafe(makeApproval(apId, adminA.userId, { status: "ממתין" }));
    expect(pending.ok && isApproved(pending.data.status)).toBe(false);
    const rejected = await approvals.updateSafe(apId, { status: "נדחה" });
    expect(rejected.ok && isApproved(rejected.data.status)).toBe(false);
    // only an explicit "אושר" qualifies
    const approved = await approvals.updateSafe(apId, { status: "אושר" });
    expect(approved.ok && isApproved(approved.data.status)).toBe(true);
  });

  it("commits a multi-record write atomically via the approved RPC (close_service_ticket)", async () => {
    bump();
    const { adminA, admin } = ctx;
    const tkId = `st-${ctx.suffix}-close`;
    const created = await repo(adminA, "serviceTickets").createSafe(makeServiceTicket(tkId, adminA.userId));
    expect(created.ok).toBe(true);
    // Atomic boundary: one RPC updates the ticket + inserts a repair_action +
    // appends an immutable audit_event, all in a single DB transaction.
    const res = await callRpc<{ ticketId: string; status: string }>(
      adminA.client,
      "close_service_ticket",
      { p_ticket_id: tkId, p_solution: "הוחלף חלק", p_repair_description: "החלפת אקסטרודר", p_parts_cost: 120 },
      (v) => {
        if (v && typeof v === "object" && "id" in v) {
          const row = v as Record<string, unknown>;
          return { ticketId: String(row.id), status: String(row.status) };
        }
        return null;
      },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.ticketId).toBe(tkId);
      expect(res.data.status).toBe("נסגר");
    }
    // invariant inspection: all three writes committed together.
    const ticket = await admin.from("service_tickets").select("status").eq("id", tkId).single();
    expect(ticket.data?.status).toBe("נסגר");
    const repairs = await admin.from("repair_actions").select("id").eq("ticket_id", tkId);
    expect((repairs.data ?? []).length).toBeGreaterThanOrEqual(1);
    const audits = await admin.from("audit_events").select("id").eq("entity_ref", `service-ticket:${tkId}`);
    expect((audits.data ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("rolls back FULLY on a partial failure inside the atomic RPC", async () => {
    bump();
    const { adminA, admin } = ctx;
    const tkId = `st-${ctx.suffix}-rollback`;
    const created = await repo(adminA, "serviceTickets").createSafe(makeServiceTicket(tkId, adminA.userId));
    expect(created.ok).toBe(true);
    // Induce a mid-transaction failure: a negative parts_cost violates the
    // repair_actions CHECK (parts_cost >= 0). The whole function must roll back —
    // the earlier ticket UPDATE included.
    const res = await callRpc<{ ticketId: string }>(
      adminA.client,
      "close_service_ticket",
      { p_ticket_id: tkId, p_solution: "לא אמור להישמר", p_repair_description: "נכשל", p_parts_cost: -1 },
      (v) => (v && typeof v === "object" && "id" in v ? { ticketId: String((v as Record<string, unknown>).id) } : null),
    );
    expect(res.ok).toBe(false);
    // invariant inspection: NOTHING from the transaction persisted.
    const ticket = await admin.from("service_tickets").select("status,solution").eq("id", tkId).single();
    expect(ticket.data?.status).toBe("חדש"); // still open — the UPDATE rolled back
    expect(ticket.data?.solution).toBe("");
    const repairs = await admin.from("repair_actions").select("id").eq("ticket_id", tkId);
    expect(repairs.data ?? []).toHaveLength(0);
    const audits = await admin.from("audit_events").select("id").eq("entity_ref", `service-ticket:${tkId}`);
    expect(audits.data ?? []).toHaveLength(0);
  });
});

// ===========================================================================
// 6. knowledge / memory / governance
// ===========================================================================
describe("6. knowledge, memory & governance", () => {
  it("does representative CRUD through the real adapters (knowledge notes)", async () => {
    bump();
    const { adminA } = ctx;
    const knId = `kn-${ctx.suffix}-1`;
    const notes = repo<ReturnType<typeof makeKnowledgeNote>>(adminA, "knowledgeNotes");
    const created = await notes.createSafe(makeKnowledgeNote(knId));
    expect(created.ok).toBe(true);
    const read = await notes.getSafe(knId);
    expect(read.ok && read.data?.id).toBe(knId);
    const updated = await notes.updateSafe(knId, { approved: true });
    expect(updated.ok && updated.data.approved).toBe(true);
    const removed = await notes.removeSafe(knId);
    expect(removed.ok).toBe(true);
    const gone = await notes.getSafe(knId);
    expect(gone.ok && gone.data).toBeUndefined();
  });

  it("keeps protected fields permission-gated (RLS capability gate)", async () => {
    bump();
    const { adminA, viewerA, admin } = ctx;
    // sysadmin lacks memory.approve → memory_records write denied.
    const memId = `mem-${ctx.suffix}-1`;
    const mem = await repo(adminA, "memoryRecords").createSafe(makeMemoryRecord(memId));
    expect(mem.ok).toBe(false);
    // an ACTIVE viewer holds only read caps → customer write denied.
    const cuId = `cu-${ctx.suffix}-viewerwrite`;
    const write = await repo(viewerA, "customers").createSafe(makeCustomer(cuId));
    expect(write.ok).toBe(false);
    // invariant inspection: neither write persisted.
    const m = await admin.from("memory_records").select("id").eq("id", memId);
    const c = await admin.from("customers").select("id").eq("id", cuId);
    expect(m.data ?? []).toHaveLength(0);
    expect(c.data ?? []).toHaveLength(0);
  });

  it("keeps audit records immutable (append-only; update & delete rejected)", async () => {
    bump();
    const { adminA, admin } = ctx;
    const auId = `au-${ctx.suffix}-1`;
    const audit = repo<ReturnType<typeof makeAuditEvent>>(adminA, "auditEvents");
    const appended = await audit.createSafe(makeAuditEvent(auId, { details: "מקורי" }));
    expect(appended.ok).toBe(true);
    // no UPDATE / DELETE policy exists → both are rejected (deny-by-default).
    const upd = await audit.updateSafe(auId, { details: "שונה" });
    expect(upd.ok).toBe(false);
    const del = await audit.removeSafe(auId);
    expect(del.ok).toBe(false);
    // invariant inspection: the row is unchanged.
    const row = await admin.from("audit_events").select("details").eq("id", auId).single();
    expect(row.data?.details).toBe("מקורי");
  });
});

// ===========================================================================
// 7. failure behavior
// ===========================================================================
describe("7. failure behavior", () => {
  it("never silently falls back to IndexedDB on a failed Supabase write", async () => {
    bump();
    const { adminA, orgB, admin } = ctx;
    const id = `cu-${ctx.suffix}-nofallback`;
    const rogue = createSupabaseRepository<BaseEntity>("customers", adminA.client, orgB);
    // it is genuinely the Supabase adapter — there is no local repository here.
    expect(rogue instanceof SupabaseRepository).toBe(true);
    const res = await rogue.createSafe(makeCustomer(id));
    expect(res.ok).toBe(false);
    // the failure was surfaced, not hidden by a local write anywhere.
    const check = await admin.from("customers").select("id").eq("id", id);
    expect(check.data ?? []).toHaveLength(0);
  });

  it("returns typed safe errors for zod-invalid rows (write-path and read-path), never a raw throw", async () => {
    bump();
    const { adminA, orgA, admin } = ctx;
    // write-path: an empty name fails zod BEFORE the row leaves the client.
    const badWrite = await repo(adminA, "customers").createSafe(makeCustomer(`cu-${ctx.suffix}-badname`, { name: "" }));
    expect(badWrite.ok).toBe(false);
    if (!badWrite.ok) expect(badWrite.error.code).toBe("validation");
    // read-path: seed (service role) a row the DB accepts but zod rejects (review
    // is free-form JSONB with no DB check but a strict zod shape).
    const badId = `cu-${ctx.suffix}-badread`;
    await admin.from("customers").insert({
      id: badId,
      organization_id: orgA,
      name: "בעל review פגום",
      type: "עסק",
      phone: "",
      email: "",
      city: "",
      printer_summary: "",
      course_names: [],
      revenue: 0,
      contact_state: "פעיל",
      review: { foo: "bar" }, // valid JSONB, invalid per zod (needs {rating,text})
      status: "פעיל",
    });
    const badRead = await repo(adminA, "customers").getSafe(badId);
    expect(badRead.ok).toBe(false);
    if (!badRead.ok) expect(badRead.error.code).toBe("validation");
  });

  it("returns a safe denial on an organization mismatch", async () => {
    bump();
    const { adminA, orgB } = ctx;
    const rogue = createSupabaseRepository<BaseEntity>("leads", adminA.client, orgB);
    const res = await rogue.createSafe(makeLead(`ld-${ctx.suffix}-mismatch`, adminA.userId));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(SAFE_CODES).toContain(res.error.code); // a stable, non-raw code
      expect(typeof res.error.message).toBe("string"); // human-safe message, never a raw payload
    }
  });

  it("is deterministic under retry / idempotency (sequential and concurrent)", async () => {
    bump();
    const { adminA, admin } = ctx;
    const knId = `kn-${ctx.suffix}-idem`;
    const notes = repo<ReturnType<typeof makeKnowledgeNote>>(adminA, "knowledgeNotes");
    const a = await notes.upsertSafe(makeKnowledgeNote(knId, { title: "גרסה" }));
    const b = await notes.upsertSafe(makeKnowledgeNote(knId, { title: "גרסה" }));
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    // concurrent identical submits collapse to a single write (in-flight guard).
    const knId2 = `kn-${ctx.suffix}-idem2`;
    const [c, d] = await Promise.all([
      notes.upsertSafe(makeKnowledgeNote(knId2)),
      notes.upsertSafe(makeKnowledgeNote(knId2)),
    ]);
    expect(c.ok).toBe(true);
    expect(d.ok).toBe(true);
    const rows1 = await admin.from("knowledge_notes").select("id").eq("id", knId);
    const rows2 = await admin.from("knowledge_notes").select("id").eq("id", knId2);
    expect(rows1.data ?? []).toHaveLength(1);
    expect(rows2.data ?? []).toHaveLength(1);
  });
});

// ===========================================================================
// executed-count guard — fails the run if zero live tests executed
// ===========================================================================
describe("suite guard", () => {
  it("executed at least one live test (never a zero-test pass)", () => {
    expect(executed).toBeGreaterThan(0);
  });
});
