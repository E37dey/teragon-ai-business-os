// W8-F (8.15) GAP-FILL — audit-event tampering.
//
// GAP ANALYSIS (existing, NOT re-tested): tests/governance/auditExplorer.test.ts
// pins the redacted export (masking, truncation, summary-only fields);
// tests/governance/checksum.test.ts + policyVersions.test.ts pin the policy
// tamper-evidence checksums and the append-only policy-version flow.
// NOT covered anywhere before this file:
//   (a) a TAMPERED audit event (secrets injected into every string field
//       post-hoc) still cannot leak through the export — redaction runs at
//       EXPORT time, per field, not at write time;
//   (b) HONEST STATE pinned: the repository layer does NOT enforce
//       append-only on the auditEvents collection — update()/remove() exist
//       and succeed. There is no auth model (single-CEO demo), so this is a
//       documented limitation, not a silent claim of immutability. What IS
//       enforced: policy versions carry SHA-256 tamper-evidence (covered
//       elsewhere) and exports are redacted+truncated regardless of history.
import { beforeEach, describe, expect, it } from "vitest";
import type { AuditEvent } from "@/domain/types";
import { EMPTY_AUDIT_QUERY } from "@/domain/governance";
import { buildAuditExport } from "@/governance";
import { REDACTED } from "@/server/redact";
import { __resetRepositoriesForTests, getRepository } from "@/repositories";

const T0 = "2026-07-23T12:00:00.000Z";
const SECRET = "sk-W8FtamperedSecret1234567890";
const PASSWORD_LINE = 'password = "w8f-tampered-hunter2"';

function tamperedEvent(): AuditEvent {
  return {
    id: "aud-w8f-tampered",
    createdAt: T0,
    updatedAt: T0,
    at: T0,
    actor: `u-tzachi token=${SECRET}`,
    action: `approval.approved ${PASSWORD_LINE}`,
    entityRef: `approval:ap-1 api_key=${SECRET}`,
    details: `פרטים שנערכו בזדון: ${SECRET} · ${PASSWORD_LINE}`,
    correlationId: `corr ${SECRET}`,
  };
}

beforeEach(() => __resetRepositoriesForTests());

describe("W8-F 8.15 — tampered audit events cannot leak secrets through the export", () => {
  it("secrets injected into EVERY string field are redacted at export time", () => {
    const exported = buildAuditExport([tamperedEvent()], EMPTY_AUDIT_QUERY, T0);
    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain("w8f-tampered-hunter2");
    expect(serialized).toContain(REDACTED);
    expect(exported.redacted).toBe(true);
  });

  it("export stays summary-only even for a tampered event (closed field set)", () => {
    const exported = buildAuditExport([tamperedEvent()], EMPTY_AUDIT_QUERY, T0);
    expect(Object.keys(exported.events[0]!).sort()).toEqual([
      "action",
      "actor",
      "at",
      "correlationId",
      "details",
      "entityRef",
      "id",
    ]);
  });
});

describe("W8-F 8.15 — HONEST STATE: auditEvents store is NOT append-only", () => {
  it("update() and remove() on auditEvents succeed — pinned as a documented limitation", async () => {
    const repo = getRepository<AuditEvent>("auditEvents");
    const created = await repo.create(tamperedEvent());
    // update succeeds — the store does NOT refuse mutation of history
    const updated = await repo.update(created.id, { details: "שונה בדיעבד" });
    expect(updated.details).toBe("שונה בדיעבד");
    // remove succeeds — the store does NOT refuse deletion of history
    await repo.remove(created.id);
    expect(await repo.get(created.id)).toBeUndefined();
    // If a future wave makes the audit store append-only, these expectations
    // flip and docs/WAVE_8_SECURITY_REPORT.md item 3 upgrades from LIMITATION
    // to ENFORCED. Until then this pin keeps the claim honest.
  });
});
