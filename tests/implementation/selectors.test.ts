// W7-A — pure selectors: honest pilot state ("טרם נמדד" / "חסרות ראיות"),
// programme health, blocking risk, next decision, overdue owners.
import { describe, expect, it } from "vitest";
import {
  MISSING_EVIDENCE_HE,
  UNMEASURED_HE,
  blockingRisk,
  missingEvidence,
  nextDecision,
  nextRequiredAction,
  overdueMilestones,
  pilotReadiness,
  programmeHealth,
  stageGoNoGo,
} from "@/domain/adoption/selectors";
import { resolveEvidence } from "@/domain/adoption/decisions";
import type { PilotResult } from "@/domain/adoption/types";
import { freshBootstrapped, NOW, TODAY } from "./helpers";

async function bootstrappedView() {
  const fx = await freshBootstrapped();
  const [evidence, risks, decisions, milestones, pilot, results] = await Promise.all([
    fx.stores.evidence.list().then((rows) => resolveEvidence(fx.stores, rows)),
    fx.stores.risks.list(),
    fx.stores.decisions.list(),
    fx.stores.milestones.list(),
    fx.stores.pilotDefinitions.get("pd-teragon").then((p) => p ?? null),
    fx.stores.pilotResults.list(),
  ]);
  return { ...fx, evidence, risks, decisions, milestones, pilot, results };
}

describe("pilotReadiness — honest", () => {
  it("with no results and missing stage-4 evidence ⇒ 'חסרות ראיות', all criteria 'טרם נמדד'", async () => {
    const v = await bootstrappedView();
    const stage4 = v.evidence.filter((e) => e.evidence.stageId === "as-4");
    const r = pilotReadiness(v.pilot, v.results, stage4);
    expect(r.statusHe).toBe(MISSING_EVIDENCE_HE);
    expect(r.measuredCriteria).toBe(0);
    for (const d of r.detailsHe) expect(d).toContain(UNMEASURED_HE);
  });

  it("with no results and NO missing evidence ⇒ 'טרם נמדד' (never success)", async () => {
    const v = await bootstrappedView();
    const r = pilotReadiness(v.pilot, v.results, []);
    expect(r.statusHe).toBe(UNMEASURED_HE);
  });

  it("counts only actually-measured criteria when results exist", async () => {
    const v = await bootstrappedView();
    const result: PilotResult = {
      id: "pr-1",
      createdAt: NOW,
      updatedAt: NOW,
      pilotId: "pd-teragon",
      metricKey: "wau",
      measuredValue: 40,
      unit: "%",
      measuredAt: TODAY,
      methodHe: "לוגים שבועיים",
      measuredById: "u-tzachi",
    };
    const r = pilotReadiness(v.pilot, [result], []);
    expect(r.measuredCriteria).toBe(1);
    expect(r.statusHe).toContain("1/4");
  });

  it("no pilot definition ⇒ honest 'לא הוגדר פיילוט'", () => {
    const r = pilotReadiness(null, [], []);
    expect(r.statusHe).toBe("לא הוגדר פיילוט");
  });
});

describe("programmeHealth + roadmap derivations", () => {
  it("derives counts from records (nothing hardcoded)", async () => {
    const v = await bootstrappedView();
    const h = programmeHealth(v.programme, v.evidence, v.risks, v.decisions);
    expect(h.stagesTotal).toBe(6);
    expect(h.stagesDone).toBe(3);
    expect(h.currentStageName).toBe("פיילוט מבוקר");
    expect(h.evidenceTotal).toBe(12);
    expect(h.evidenceEligible).toBe(v.evidence.filter((e) => e.eligibility.eligible).length);
    expect(h.evidenceEligible).toBeLessThan(h.evidenceTotal); // honest gap
    expect(h.decisionsPending).toBe(6);
    expect(h.openRisks).toBe(6);
  });

  it("stageGoNoGo is 'ממתין' for every stage after bootstrap", async () => {
    const v = await bootstrappedView();
    for (const s of v.programme.stages) {
      expect(stageGoNoGo(s, v.decisions)).toBe("ממתין");
    }
  });

  it("missingEvidence lists exactly the unlinked/ineligible rows", async () => {
    const v = await bootstrappedView();
    const missing = missingEvidence(v.evidence);
    expect(missing.map((m) => m.evidence.id)).toContain("ie-2");
    expect(missing.map((m) => m.evidence.id)).toContain("ie-8");
    expect(missing.every((m) => !m.eligibility.eligible)).toBe(true);
  });

  it("blockingRisk picks the most severe OPEN risk deterministically", async () => {
    const v = await bootstrappedView();
    const top = blockingRisk(v.risks);
    // ir-4: גבוהה × גבוהה is the highest product in the bootstrap register
    expect(top?.id).toBe("ir-4");
    expect(blockingRisk([])).toBeNull();
  });

  it("nextDecision returns the earliest pending gate", async () => {
    const v = await bootstrappedView();
    const d = nextDecision(v.decisions);
    expect(d?.id).toBe("idec-1"); // week-1 target is the earliest planned date
    expect(nextDecision([])).toBeNull();
  });

  it("overdueMilestones is date-honest", async () => {
    const v = await bootstrappedView();
    expect(overdueMilestones(v.milestones, "2026-07-23")).toEqual([]);
    const far = overdueMilestones(v.milestones, "2027-01-01");
    expect(far.length).toBe(v.milestones.length); // all planned ones are past due by then
  });

  it("nextRequiredAction comes from the current stage", async () => {
    const v = await bootstrappedView();
    expect(nextRequiredAction(v.programme)).toContain("פיילוט");
  });
});
