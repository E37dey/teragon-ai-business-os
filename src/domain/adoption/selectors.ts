// TERAGON AI BUSINESS OS — pure adoption selectors (W7-A, 7.2).
// Everything the page and the "מבקר ההטמעה" rail show is DERIVED here from
// real records — no fabricated completion, no invented numbers.
import type { EvidenceWithEligibility } from "./decisions";
import type {
  AdoptionStage,
  GoNoGoState,
  ImplementationDecision,
  ImplementationMilestone,
  ImplementationProgramme,
  ImplementationRisk,
  PilotDefinition,
  PilotResult,
} from "./types";

export const UNMEASURED_HE = "טרם נמדד";
export const MISSING_EVIDENCE_HE = "חסרות ראיות";

/** Go/No-Go display state of a stage — from its (single) gate decision. */
export function stageGoNoGo(
  stage: AdoptionStage,
  decisions: ImplementationDecision[],
): GoNoGoState {
  const d = decisions.find((x) => x.stageId === stage.id);
  return d?.decision ?? "ממתין";
}

export interface ProgrammeHealth {
  stagesDone: number;
  stagesTotal: number;
  evidenceEligible: number;
  evidenceTotal: number;
  openRisks: number;
  decisionsPending: number;
  currentStageName: string;
}

export function programmeHealth(
  programme: ImplementationProgramme,
  evidence: EvidenceWithEligibility[],
  risks: ImplementationRisk[],
  decisions: ImplementationDecision[],
): ProgrammeHealth {
  const current = programme.stages.find((s) => s.id === programme.currentStageId);
  return {
    stagesDone: programme.stages.filter((s) => s.status === "הושלם").length,
    stagesTotal: programme.stages.length,
    evidenceEligible: evidence.filter((e) => e.eligibility.eligible).length,
    evidenceTotal: evidence.length,
    openRisks: risks.filter((r) => r.status !== "סגור").length,
    decisionsPending: decisions.filter((d) => d.decision === null).length,
    currentStageName: current?.name ?? "לא הוגדר שלב נוכחי",
  };
}

const RISK_RANK: Record<string, number> = { גבוהה: 3, בינונית: 2, נמוכה: 1 };

/** The most severe OPEN risk (probability×impact rank, honest tie by id). */
export function blockingRisk(risks: ImplementationRisk[]): ImplementationRisk | null {
  const open = risks.filter((r) => r.status !== "סגור");
  if (open.length === 0) return null;
  const score = (r: ImplementationRisk): number =>
    (RISK_RANK[r.probability] ?? 0) * (RISK_RANK[r.impact] ?? 0);
  return [...open].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0] ?? null;
}

/** Evidence rows that are NOT eligible — the honest "missing evidence" list. */
export function missingEvidence(evidence: EvidenceWithEligibility[]): EvidenceWithEligibility[] {
  return evidence.filter((e) => !e.eligibility.eligible);
}

/** Milestones past due and not completed/cancelled ⇒ the overdue owners. */
export function overdueMilestones(
  milestones: ImplementationMilestone[],
  todayISO: string,
): ImplementationMilestone[] {
  return milestones.filter(
    (m) => (m.status === "מתוכננת" || m.status === "בתהליך") && m.dueDate < todayISO,
  );
}

/** Earliest planned date among still-undecided gate decisions. */
export function nextDecision(decisions: ImplementationDecision[]): ImplementationDecision | null {
  const pending = decisions.filter((d) => d.decision === null);
  if (pending.length === 0) return null;
  return (
    [...pending].sort(
      (a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.id.localeCompare(b.id),
    )[0] ?? null
  );
}

export interface PilotReadiness {
  /** honest headline, e.g. "חסרות ראיות" / "טרם נמדד" */
  statusHe: string;
  measuredCriteria: number;
  totalCriteria: number;
  detailsHe: string[];
}

/**
 * Honest pilot readiness: results exist ⇒ count measured criteria; otherwise
 * "טרם נמדד". Missing stage-4 evidence keeps the headline at "חסרות ראיות".
 */
export function pilotReadiness(
  pilot: PilotDefinition | null,
  results: PilotResult[],
  stage4Evidence: EvidenceWithEligibility[],
): PilotReadiness {
  if (!pilot) {
    return {
      statusHe: "לא הוגדר פיילוט",
      measuredCriteria: 0,
      totalCriteria: 0,
      detailsHe: ["אין רשומת PilotDefinition"],
    };
  }
  const measuredKeys = new Set(results.filter((r) => r.pilotId === pilot.id).map((r) => r.metricKey));
  const measured = pilot.successCriteria.filter((c) => measuredKeys.has(c.metricKey)).length;
  const missing = missingEvidence(stage4Evidence);
  const detailsHe = pilot.successCriteria.map((c) =>
    measuredKeys.has(c.metricKey) ? `${c.nameHe}: נמדד` : `${c.nameHe}: ${UNMEASURED_HE}`,
  );
  const statusHe =
    missing.length > 0
      ? MISSING_EVIDENCE_HE
      : measured === 0
        ? UNMEASURED_HE
        : `${measured}/${pilot.successCriteria.length} קריטריונים נמדדו`;
  return { statusHe, measuredCriteria: measured, totalCriteria: pilot.successCriteria.length, detailsHe };
}

/**
 * Static mapping: adoption stage → the submission deliverables (V4 12-item
 * map) it affects. Static reference data, not derived state.
 */
export const STAGE_TO_SUBMISSION_DELIVERABLES: Readonly<Record<string, readonly string[]>> = {
  "as-1": ["One-Pager לפתרון", "מדדי הצלחה — 3 רמות"],
  "as-2": ["מפת תהליך TO-BE", "נוהל שימוש נכון"],
  "as-3": ["מפת 7 פרסונות", "Training Matrix", "Quick Start", "FAQ + התנגדויות (LACE)"],
  "as-4": ["Stage Gates + ראיות", "תסריט הדרכה 10 דק׳"],
  "as-5": ["תכנית הטמעה 6 שלבים + Owners", "רעיון לסרטון Microlearning"],
  "as-6": ["תכנית תמיכה Tier-3"],
};

/** The honest "הפעולה הבאה הנדרשת" — the current stage's nextAction. */
export function nextRequiredAction(programme: ImplementationProgramme): string {
  const current = programme.stages.find((s) => s.id === programme.currentStageId);
  return current?.nextAction ?? "לא הוגדרה פעולה הבאה";
}
