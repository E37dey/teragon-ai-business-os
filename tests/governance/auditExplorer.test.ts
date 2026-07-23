// W8-B — audit explorer: filters (actor/operation/entity/approval/severity/
// date/correlation/free-text), item detail derivation, and the REDACTED export
// (no secrets by the W5-B scanner patterns, no full payloads, truncation).
import { describe, expect, it } from "vitest";
import type { AuditEvent } from "@/domain/types";
import { EMPTY_AUDIT_QUERY, type AuditQuery } from "@/domain/governance";
import {
  EXPORT_DETAIL_MAX_CHARS,
  buildAuditExport,
  correlationChain,
  deriveAuditItemDetail,
  deriveAuditSeverity,
  filterAuditEvents,
} from "@/governance";
import { REDACTED } from "@/server/redact";
import { bootedGovernance } from "./helpers";

const T0 = "2026-07-23T08:00:00.000Z";

function makeEvent(overrides: Partial<AuditEvent>): AuditEvent {
  return {
    id: "t-1",
    createdAt: T0,
    updatedAt: T0,
    at: T0,
    actor: "u-tzachi",
    action: "test.action",
    entityRef: null,
    details: "פרטים",
    correlationId: null,
    ...overrides,
  };
}

const q = (overrides: Partial<AuditQuery>): AuditQuery => ({ ...EMPTY_AUDIT_QUERY, ...overrides });

describe("filters", () => {
  const events: AuditEvent[] = [
    makeEvent({ id: "e-1", actor: "ag-hunter", action: "approval.request", entityRef: "approval:ap-9", correlationId: "corr-1" }),
    makeEvent({ id: "e-2", actor: "u-tzachi", action: "approval.approved", entityRef: "approval:ap-9", correlationId: "corr-1", at: "2026-07-23T09:00:00.000Z" }),
    makeEvent({ id: "e-3", actor: "ag-fixer", action: "run.create", entityRef: "agent-run:r-1", details: "ריצה נוצרה" }),
    makeEvent({ id: "e-4", actor: "system", action: "approval.execute-failed", entityRef: "approval:ap-9", details: "הביצוע נכשל" }),
  ];

  it("filters by actor / agent", () => {
    expect(filterAuditEvents(events, q({ actor: "ag-hunter" })).map((e) => e.id)).toEqual(["e-1"]);
    expect(filterAuditEvents(events, q({ agentId: "ag-fixer" })).map((e) => e.id)).toEqual(["e-3"]);
  });

  it("filters by operation prefix and entityRef", () => {
    expect(filterAuditEvents(events, q({ operation: "approval." }))).toHaveLength(3);
    expect(filterAuditEvents(events, q({ entityRef: "agent-run:r-1" })).map((e) => e.id)).toEqual([
      "e-3",
    ]);
  });

  it("approvalsOnly keeps only approval-referencing events", () => {
    const got = filterAuditEvents(events, q({ approvalsOnly: true }));
    expect(got.every((e) => e.entityRef?.startsWith("approval:"))).toBe(true);
    expect(got).toHaveLength(3);
  });

  it("filters by derived severity, date range and correlationId", () => {
    expect(filterAuditEvents(events, q({ severity: "גבוהה" })).map((e) => e.id)).toEqual(["e-4"]);
    expect(
      filterAuditEvents(events, q({ fromAt: "2026-07-23T08:30:00.000Z" })).map((e) => e.id),
    ).toEqual(["e-2"]);
    expect(filterAuditEvents(events, q({ correlationId: "corr-1" }))).toHaveLength(2);
  });

  it("free text searches action+details+entity+actor", () => {
    expect(filterAuditEvents(events, q({ freeText: "ריצה" })).map((e) => e.id)).toEqual(["e-3"]);
  });

  it("correlation chain is oldest-first", () => {
    expect(correlationChain(events, "corr-1").map((e) => e.id)).toEqual(["e-1", "e-2"]);
  });

  it("severity heuristic: failures גבוהה, approvals בינונית, default רגילה", () => {
    expect(deriveAuditSeverity(makeEvent({ action: "approval.execute-failed" }))).toBe("גבוהה");
    expect(deriveAuditSeverity(makeEvent({ action: "approval.request" }))).toBe("בינונית");
    expect(deriveAuditSeverity(makeEvent({ action: "run.create", details: "רגיל" }))).toBe("רגילה");
  });
});

describe("item detail derivation", () => {
  it("derives actor kind, linked approval, evidence and chain from real seed records", async () => {
    const fx = await bootedGovernance();
    const audit = await fx.stores.audit.list();
    const approvals = await fx.stores.approvals.list();
    const evidence = await fx.stores.evidence.list();
    const agentEvents = await fx.stores.agentEvents.list();
    const ae1 = audit.find((a) => a.id === "ae-1"); // seeded: ag-hunter → approval:ap-1
    expect(ae1).toBeTruthy();
    if (!ae1) return;
    const detail = deriveAuditItemDetail(ae1, { allEvents: audit, approvals, evidence, agentEvents });
    expect(detail.actorKind).toBe("סוכן");
    expect(detail.approval?.id).toBe("ap-1");
    // ap-1's subject is agent-task:at-1 which HAS seeded evidence (ev-1, ev-2)
    expect(detail.evidence.length).toBeGreaterThan(0);
    expect(detail.chain.length).toBeGreaterThan(0); // corr-at1 chain
    // no execution happened — before/after honestly unavailable
    expect(detail.beforeAfterHe).toBeNull();
  });
});

describe("redacted export", () => {
  it("masks secret-shaped strings using the W5-B patterns", () => {
    const events = [
      makeEvent({ id: "s-1", details: "api_key=sk-abc123456789 נשלח בטעות" }),
      makeEvent({ id: "s-2", details: "Bearer abcdefgh12345678 token=very-secret-value" }),
    ];
    const exported = buildAuditExport(events, EMPTY_AUDIT_QUERY, T0);
    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain("sk-abc123456789");
    expect(serialized).not.toContain("very-secret-value");
    expect(serialized).not.toContain("Bearer abcdefgh12345678");
    expect(serialized).toContain(REDACTED);
    expect(exported.redacted).toBe(true);
  });

  it("truncates details — no full payloads in exports", () => {
    const long = "א".repeat(EXPORT_DETAIL_MAX_CHARS * 3);
    const exported = buildAuditExport([makeEvent({ id: "l-1", details: long })], EMPTY_AUDIT_QUERY, T0);
    const detail = exported.events[0]?.details ?? "";
    expect(detail.length).toBeLessThanOrEqual(EXPORT_DETAIL_MAX_CHARS + 1); // +ellipsis
    expect(detail.endsWith("…")).toBe(true);
  });

  it("export carries only the summary fields — never event payload objects", () => {
    const exported = buildAuditExport([makeEvent({ id: "f-1" })], EMPTY_AUDIT_QUERY, T0);
    const first = exported.events[0];
    expect(first).toBeTruthy();
    expect(Object.keys(first ?? {}).sort((a, b) => a.localeCompare(b))).toEqual([
      "action",
      "actor",
      "at",
      "correlationId",
      "details",
      "entityRef",
      "id",
    ]);
  });

  it("respects the active filter and reports the honest match count", () => {
    const events = [
      makeEvent({ id: "e-1", actor: "ag-hunter" }),
      makeEvent({ id: "e-2", actor: "u-tzachi" }),
    ];
    const exported = buildAuditExport(events, q({ actor: "ag-hunter" }), T0);
    expect(exported.totalMatched).toBe(1);
    expect(exported.events).toHaveLength(1);
    expect(exported.events[0]?.id).toBe("e-1");
  });

  it("the full seeded audit trail exports clean of secret patterns", async () => {
    const fx = await bootedGovernance();
    const audit = await fx.stores.audit.list();
    const exported = buildAuditExport(audit, EMPTY_AUDIT_QUERY, T0);
    const serialized = JSON.stringify(exported);
    // W5-B scanner shapes must not appear
    expect(serialized).not.toMatch(/\bsk-[A-Za-z0-9_-]{4,}\b/);
    expect(serialized).not.toMatch(/\bAKIA[A-Z0-9]{12,}\b/);
    expect(serialized).not.toMatch(/\beyJ[A-Za-z0-9_-]{8,}\./);
    expect(serialized).not.toMatch(/\b[Bb]earer\s+[A-Za-z0-9._~+/=-]{8,}/);
  });
});
