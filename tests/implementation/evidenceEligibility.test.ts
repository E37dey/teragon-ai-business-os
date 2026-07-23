// W7-A — evidence-eligibility gate: missing ref / missing record / draft /
// pending / rejected / archived all BLOCK; existing (approved) records pass.
import { describe, expect, it } from "vitest";
import { evidenceEligibility } from "@/domain/adoption";
import { resolveEvidence } from "@/domain/adoption/decisions";
import type { ImplementationEvidence } from "@/domain/adoption/types";
import { freshBootstrapped, NOW } from "./helpers";

const REF = { collection: "personas" as const, recordId: "per-1", route: "/personas" };
const base = { id: "b", createdAt: NOW, updatedAt: NOW };

describe("evidenceEligibility (pure)", () => {
  it("missing ref ⇒ חסרה ראיה", () => {
    const r = evidenceEligibility({ ref: null }, null);
    expect(r.eligible).toBe(false);
    expect(r.statusHe).toBe("חסרה ראיה");
  });

  it("ref to a non-existent record ⇒ blocked", () => {
    const r = evidenceEligibility({ ref: REF }, null);
    expect(r.eligible).toBe(false);
    expect(r.statusHe).toBe("הרשומה לא נמצאה");
  });

  it("draft record blocks (approval.state)", () => {
    const r = evidenceEligibility({ ref: REF }, { ...base, approval: { state: "טיוטה" } } as never);
    expect(r).toEqual({ eligible: false, statusHe: "לא קבילה — טיוטה" });
  });

  it("pending record blocks (approvalState)", () => {
    const r = evidenceEligibility({ ref: REF }, { ...base, approvalState: "ממתין לאישור" } as never);
    expect(r).toEqual({ eligible: false, statusHe: "לא קבילה — ממתין לאישור" });
  });

  it("rejected record blocks (status field, e.g. quotation נדחתה)", () => {
    const r = evidenceEligibility({ ref: REF }, { ...base, status: "נדחתה" } as never);
    expect(r).toEqual({ eligible: false, statusHe: "לא קבילה — נדחתה" });
  });

  it("archived record blocks", () => {
    const r = evidenceEligibility({ ref: REF }, { ...base, archived: true } as never);
    expect(r).toEqual({ eligible: false, statusHe: "לא קבילה — בארכיון" });
  });

  it("approved record passes", () => {
    const r = evidenceEligibility({ ref: REF }, { ...base, approval: { state: "מאושר" } } as never);
    expect(r).toEqual({ eligible: true, statusHe: "ראיה קבילה" });
  });

  it("plain existing record (no approval semantics) passes", () => {
    const r = evidenceEligibility({ ref: REF }, base);
    expect(r.eligible).toBe(true);
  });
});

describe("resolveEvidence against real collections", () => {
  it("bootstrap evidence: linked refs resolve, missing rows stay חסרה ראיה", async () => {
    const { stores } = await freshBootstrapped();
    const rows = await stores.evidence.list();
    const resolved = await resolveEvidence(stores, rows);
    const byId = new Map(resolved.map((r) => [r.evidence.id, r.eligibility]));
    // ie-5 → personas per-1 exists in seed ⇒ eligible
    expect(byId.get("ie-5")?.eligible).toBe(true);
    // ie-2 (baseline observations) has no ref ⇒ honestly missing
    expect(byId.get("ie-2")).toEqual({ eligible: false, statusHe: "חסרה ראיה" });
    // ie-8 (pilot metrics) missing ⇒ pilot can never look measured
    expect(byId.get("ie-8")?.eligible).toBe(false);
  });

  it("a ref to a deleted record turns ineligible (record exists check is live)", async () => {
    const { stores } = await freshBootstrapped();
    const row: ImplementationEvidence = {
      id: "ie-t-del",
      createdAt: NOW,
      updatedAt: NOW,
      programmeId: "iprog-teragon",
      stageId: "as-1",
      requirementHe: "בדיקה",
      ref: { collection: "personas", recordId: "per-999", route: "/personas" },
      capturedById: "u-tzachi",
      capturedAt: NOW,
      noteHe: "",
    };
    const [resolved] = await resolveEvidence(stores, [row]);
    expect(resolved?.eligibility).toEqual({ eligible: false, statusHe: "הרשומה לא נמצאה" });
  });
});
