// TERAGON Business Graph — Phase 7 BUSINESS QUERY security + isolation tests.
// Proves: hidden entities never affect visible counts, org isolation, and the
// stale/corrupt health rules (inherited from the traversal layer) stay enforced.
import { beforeAll, describe, expect, it } from "vitest";
import type { GraphIndexSnapshot } from "@/graph";
import {
  detQueryService,
  deriveValidSnapshot,
  nid,
  qctx,
  queryServiceWithHealth,
  recurringServiceSnapshot,
} from "./helpers";
import { denyNodeIds } from "../traversal/helpers";

let valid: GraphIndexSnapshot;
beforeAll(async () => {
  valid = await deriveValidSnapshot();
});

// ---------------------------------------------------------------------------
// hidden entities do NOT affect visible counts
// ---------------------------------------------------------------------------

describe("hidden entities are removed BEFORE any count", () => {
  it("a hidden service ticket is excluded from the recurring count + entity totals", async () => {
    const { snap, pm, tickets } = recurringServiceSnapshot();
    const hiddenTicket = tickets[2]!;

    const visible = detQueryService(snap);
    const rAll = await visible.findRecurringServiceIssues(
      { query: "findRecurringServiceIssues", subjects: [pm.id] },
      qctx(),
    );
    const allTickets = rAll.findings.flatMap((f) => f.evidence).filter((e) => e.entityType === "serviceTicket");
    expect(allTickets).toHaveLength(3);

    // now hide one ticket via the permission oracle
    const hiddenSvc = detQueryService(snap);
    const rHidden = await hiddenSvc.findRecurringServiceIssues(
      { query: "findRecurringServiceIssues", subjects: [pm.id] },
      qctx({ permissions: denyNodeIds(new Set([hiddenTicket.id])) }),
    );
    const shownTickets = rHidden.findings.flatMap((f) => f.evidence).filter((e) => e.entityType === "serviceTicket");
    expect(shownTickets).toHaveLength(2);
    expect(shownTickets.map((e) => e.nodeId)).not.toContain(hiddenTicket.id);
    // the hidden ticket contributes to NO entity total.
    const entityIds = new Set(rHidden.findings.flatMap((f) => [
      f.subject.nodeId,
      ...f.relatedEntities.map((x) => x.nodeId),
      ...f.evidence.map((x) => x.nodeId),
    ]));
    expect(entityIds.has(hiddenTicket.id)).toBe(false);
    expect(rHidden.counts.entities).toBe(entityIds.size);
  });
});

// ---------------------------------------------------------------------------
// organization isolation
// ---------------------------------------------------------------------------

describe("organization isolation is mandatory", () => {
  it("a context whose org disagrees with its viewer org is blocked by permission", async () => {
    const svc = detQueryService(valid);
    const r = await svc.findCustomersNeedingFollowUp(
      { query: "findCustomersNeedingFollowUp", subjects: [nid("customer", "cu-1")] },
      qctx({ organizationId: "org-canonical", viewer: { organizationId: "org-other", actor: { kind: "SYSTEM" } } }),
    );
    expect(r.ok).toBe(false);
    expect(r.readiness).toBe("BLOCKED_BY_PERMISSION");
    expect(r.refusalReason).toBe("ORG_CONTEXT_MISMATCH");
    expect(r.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// stale / corrupt health rules (inherited from the traversal layer)
// ---------------------------------------------------------------------------

describe("stale + corrupt health rules remain enforced", () => {
  it("CORRUPT health blocks the query under BLOCKED_BY_HEALTH", async () => {
    const svc = queryServiceWithHealth(valid, "CORRUPT");
    const r = await svc.findCustomersNeedingFollowUp(
      { query: "findCustomersNeedingFollowUp", subjects: [nid("customer", "cu-1")] },
      qctx(),
    );
    expect(r.ok).toBe(false);
    expect(r.readiness).toBe("BLOCKED_BY_HEALTH");
    expect(r.findings).toHaveLength(0);
  });

  it("STALE without an explicit stale grant is DENIED (BLOCKED_BY_HEALTH)", async () => {
    const svc = queryServiceWithHealth(valid, "STALE");
    const r = await svc.findCustomersNeedingFollowUp(
      { query: "findCustomersNeedingFollowUp", subjects: [nid("customer", "cu-1")] },
      qctx(), // no allowStale
    );
    expect(r.ok).toBe(false);
    expect(r.readiness).toBe("BLOCKED_BY_HEALTH");
    expect(r.refusalReason).toBe("STALE_NOT_AUTHORIZED");
  });

  it("STALE WITH an authorized human grant serves stale, and findings are marked stale", async () => {
    const svc = queryServiceWithHealth(valid, "STALE");
    const r = await svc.findCustomersNeedingFollowUp(
      { query: "findCustomersNeedingFollowUp", subjects: [nid("customer", "cu-1")] },
      qctx({ allowStale: true }),
    );
    expect(r.ok).toBe(true);
    expect(r.stale).toBe(true);
    expect(r.findings.every((f) => f.stale === true)).toBe(true);
  });

  it("an AGENT actor can NEVER receive stale data even with allowStale", async () => {
    const svc = queryServiceWithHealth(valid, "STALE");
    const r = await svc.findCustomersNeedingFollowUp(
      { query: "findCustomersNeedingFollowUp", subjects: [nid("customer", "cu-1")] },
      qctx({
        allowStale: true,
        viewer: { organizationId: "org-canonical", actor: { kind: "AGENT", agentId: "ag-1" } },
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.readiness).toBe("BLOCKED_BY_HEALTH");
  });
});
