// W7-A — Go/No-Go decision audit: Go is REFUSED while evidence is missing
// (no gate passes on a percentage); No-Go records with rationale; every
// decision appends an AuditEvent; double-deciding is rejected.
import { describe, expect, it } from "vitest";
import { GateDecisionError, decideGate } from "@/domain/adoption/decisions";
import { freshBootstrapped, NOW } from "./helpers";

describe("decideGate", () => {
  it("refuses Go while the stage has missing/ineligible evidence", async () => {
    const { stores, clock } = await freshBootstrapped();
    // idec-1 (G1) examines ie-1 (linked) + ie-2 (baseline — missing)
    await expect(
      decideGate(
        stores,
        { decisionId: "idec-1", decision: "Go", decidedById: "u-tzachi", rationaleHe: "מוכנים" },
        clock,
      ),
    ).rejects.toThrowError(GateDecisionError);
    const untouched = await stores.decisions.get("idec-1");
    expect(untouched?.decision).toBeNull();
  });

  it("lists the concrete blockers on a refused Go", async () => {
    const { stores, clock } = await freshBootstrapped();
    const err = await decideGate(
      stores,
      { decisionId: "idec-4", decision: "Go", decidedById: "u-tzachi", rationaleHe: "ניסיון" },
      clock,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GateDecisionError);
    expect((err as GateDecisionError).blockers.join(" ")).toContain("חסרה ראיה");
  });

  it("records No-Go with rationale + writes an AuditEvent", async () => {
    const { stores, clock } = await freshBootstrapped();
    const auditBefore = (await stores.audit.list()).length;
    const decided = await decideGate(
      stores,
      {
        decisionId: "idec-1",
        decision: "No-Go",
        decidedById: "u-tzachi",
        rationaleHe: "קו הבסיס טרם נמדד — אין מעבר בלי ראיות",
      },
      clock,
    );
    expect(decided.decision).toBe("No-Go");
    expect(decided.decidedById).toBe("u-tzachi");
    expect(decided.decidedAt).not.toBeNull();
    const audit = await stores.audit.list();
    expect(audit.length).toBe(auditBefore + 1);
    const event = audit.find((a) => a.entityRef === "implementationDecision:idec-1");
    expect(event?.action).toContain("No-Go");
    expect(event?.actor).toBe("u-tzachi");
  });

  it("allows Go when EVERY evidence requirement of the gate is eligible", async () => {
    const { stores, clock } = await freshBootstrapped();
    // make G1's missing baseline evidence eligible by linking a real record
    await stores.evidence.update("ie-2", {
      ref: { collection: "metricObservations", recordId: "mo-3", route: "/analytics" },
      capturedById: "u-tzachi",
      capturedAt: NOW,
    });
    const decided = await decideGate(
      stores,
      { decisionId: "idec-1", decision: "Go", decidedById: "u-tzachi", rationaleHe: "כל הראיות קבילות" },
      clock,
    );
    expect(decided.decision).toBe("Go");
    const audit = await stores.audit.list();
    expect(audit.some((a) => a.action.includes("Go") && a.entityRef?.includes("idec-1"))).toBe(true);
  });

  it("rejects deciding an already-decided gate (immutable decision audit)", async () => {
    const { stores, clock } = await freshBootstrapped();
    await decideGate(
      stores,
      { decisionId: "idec-1", decision: "No-Go", decidedById: "u-tzachi", rationaleHe: "אין קו בסיס" },
      clock,
    );
    await expect(
      decideGate(
        stores,
        { decisionId: "idec-1", decision: "Go", decidedById: "u-tzachi", rationaleHe: "בעצם כן" },
        clock,
      ),
    ).rejects.toThrow(/כבר הוכרע/);
  });

  it("rejects an empty rationale and an unknown decider", async () => {
    const { stores, clock } = await freshBootstrapped();
    await expect(
      decideGate(
        stores,
        { decisionId: "idec-1", decision: "No-Go", decidedById: "u-tzachi", rationaleHe: "  " },
        clock,
      ),
    ).rejects.toThrow(/נימוק/);
    await expect(
      decideGate(
        stores,
        { decisionId: "idec-1", decision: "No-Go", decidedById: "u-ghost", rationaleHe: "נימוק" },
        clock,
      ),
    ).rejects.toThrow(/משתמש בשם/);
  });
});
