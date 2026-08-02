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
import type {
  ImplementationMilestone,
  MilestoneStatus,
  PilotResult,
} from "@/domain/adoption/types";
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

// ---------------------------------------------------------------------------
// overdueMilestones — explicit deadline/timezone boundary semantics.
// The rule is a pure date-string compare `dueDate < asOf` over YYYY-MM-DD
// values, so it is deterministic and timezone-independent (no Date/TZ math).
// A milestone is overdue only when it is still open (מתוכננת/בתהליך) AND its
// due date is STRICTLY before `asOf` — i.e. the due date itself is a grace day.
// ---------------------------------------------------------------------------
describe("overdueMilestones — deadline boundary", () => {
  function milestone(
    dueDate: string,
    status: MilestoneStatus,
    completedAt: string | null = null,
  ): ImplementationMilestone {
    return {
      id: "im-x",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      programmeId: "iprog-teragon",
      stageId: "as-1",
      title: "boundary milestone",
      dueDate,
      ownerId: "u-1",
      status,
      completedAt,
    };
  }
  const DUE = "2026-06-10";

  it("one day BEFORE the due date → not overdue", () => {
    expect(overdueMilestones([milestone(DUE, "מתוכננת")], "2026-06-09")).toEqual([]);
  });

  it("EXACTLY at the due date → not overdue (the deadline day is a grace day)", () => {
    expect(overdueMilestones([milestone(DUE, "מתוכננת")], DUE)).toEqual([]);
  });

  it("one day AFTER the due date → overdue", () => {
    expect(overdueMilestones([milestone(DUE, "בתהליך")], "2026-06-11")).toHaveLength(1);
  });

  it("completed / cancelled milestones are never overdue, even long past due", () => {
    expect(overdueMilestones([milestone(DUE, "הושלמה", "2026-06-05")], "2027-01-01")).toEqual([]);
    expect(overdueMilestones([milestone(DUE, "בוטלה")], "2027-01-01")).toEqual([]);
  });

  it("is timezone-independent — date-granularity strings compare identically", () => {
    // The same calendar day expressed for any locale resolves to the same
    // YYYY-MM-DD `asOf`, so the verdict does not depend on the runner's TZ.
    const open = milestone(DUE, "מתוכננת");
    expect(overdueMilestones([open], "2026-06-10")).toEqual([]); // on the day → not overdue
    expect(overdueMilestones([open], "2026-06-11")).toHaveLength(1); // next day → overdue
  });
});
