// W8-B — risk register: the 10 canonical risks bootstrapped פתוח with named
// owners; guarded lifecycle transitions incl. reopen; audit on every move.
import { describe, expect, it } from "vitest";
import { CANONICAL_RISKS, transitionRisk } from "@/governance";
import { APPROVER, bootedGovernance } from "./helpers";

describe("bootstrap — the 10 canonical risks", () => {
  it("creates exactly 10 risks, all פתוח with named owners", async () => {
    const fx = await bootedGovernance();
    const risks = await fx.stores.risks.list();
    expect(risks).toHaveLength(10);
    expect(CANONICAL_RISKS).toHaveLength(10);
    for (const r of risks) {
      expect(r.status).toBe("פתוח");
      expect(r.ownerId.length).toBeGreaterThan(0);
      expect(r.ownerName.length).toBeGreaterThan(0);
      expect(r.history).toHaveLength(0);
    }
  });

  it("includes the critical sensitive-data-leak risk with a real source ref", async () => {
    const fx = await bootedGovernance();
    const leak = await fx.stores.risks.get("gr-sensitive-data-leak");
    expect(leak?.severity).toBe("קריטית");
    expect(leak?.sourceRef).toBe("src/server/redact.ts");
    expect(leak?.controlIds).toContain("ctl-3"); // real seeded Control record
  });
});

describe("lifecycle transitions", () => {
  it("פתוח → בטיפול → הופחת → נסגר → נפתח מחדש works with audit trail", async () => {
    const fx = await bootedGovernance();
    const id = "gr-prompt-injection";
    const step = (to: Parameters<typeof transitionRisk>[1]["to"], extra = {}) =>
      transitionRisk(
        fx.stores,
        {
          riskId: id,
          to,
          byId: APPROVER.id,
          byName: APPROVER.name,
          reasonHe: `מעבר ל-${to}`,
          ...extra,
        },
        fx.clock,
      );
    let risk = await step("בטיפול");
    expect(risk.status).toBe("בטיפול");
    risk = await step("הופחת", { mitigationHe: "הוספת שער אישור כפול" });
    expect(risk.status).toBe("הופחת");
    expect(risk.mitigationHe).toBe("הוספת שער אישור כפול");
    risk = await step("נסגר");
    expect(risk.status).toBe("נסגר");
    risk = await step("נפתח מחדש");
    expect(risk.status).toBe("נפתח מחדש");
    expect(risk.history).toHaveLength(4);
    expect(risk.history.map((h) => h.to)).toEqual(["בטיפול", "הופחת", "נסגר", "נפתח מחדש"]);
    // every move audited
    const audit = await fx.stores.audit.list();
    const moves = audit.filter(
      (a) => a.action === "governance.risk-transition" && a.correlationId === id,
    );
    expect(moves).toHaveLength(4);
  });

  it("blocks illegal transitions (פתוח → נסגר) with a structured error", async () => {
    const fx = await bootedGovernance();
    await expect(
      transitionRisk(
        fx.stores,
        {
          riskId: "gr-prompt-injection",
          to: "נסגר",
          byId: APPROVER.id,
          byName: APPROVER.name,
          reasonHe: "קיצור דרך",
        },
        fx.clock,
      ),
    ).rejects.toThrow(/אינו חוקי/);
  });

  it("requires a reason and a named actor", async () => {
    const fx = await bootedGovernance();
    await expect(
      transitionRisk(
        fx.stores,
        {
          riskId: "gr-prompt-injection",
          to: "בטיפול",
          byId: APPROVER.id,
          byName: APPROVER.name,
          reasonHe: "  ",
        },
        fx.clock,
      ),
    ).rejects.toThrow(/נימוק/);
    await expect(
      transitionRisk(
        fx.stores,
        {
          riskId: "gr-prompt-injection",
          to: "בטיפול",
          byId: "",
          byName: "",
          reasonHe: "סיבה",
        },
        fx.clock,
      ),
    ).rejects.toThrow(/בשם/);
  });

  it('transition to "הופחת" requires a mitigation description', async () => {
    const fx = await bootedGovernance();
    await transitionRisk(
      fx.stores,
      {
        riskId: "gr-budget-overrun",
        to: "בטיפול",
        byId: APPROVER.id,
        byName: APPROVER.name,
        reasonHe: "טיפול",
      },
      fx.clock,
    );
    await expect(
      transitionRisk(
        fx.stores,
        {
          riskId: "gr-budget-overrun",
          to: "הופחת",
          byId: APPROVER.id,
          byName: APPROVER.name,
          reasonHe: "הופחת",
        },
        fx.clock,
      ),
    ).rejects.toThrow(/mitigation|הפחתה/);
  });

  it("unknown risk throws", async () => {
    const fx = await bootedGovernance();
    await expect(
      transitionRisk(
        fx.stores,
        { riskId: "gr-none", to: "בטיפול", byId: APPROVER.id, byName: APPROVER.name, reasonHe: "x" },
        fx.clock,
      ),
    ).rejects.toThrow(/לא נמצא/);
  });
});
