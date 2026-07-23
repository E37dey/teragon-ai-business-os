// TERAGON AI BUSINESS OS — adoption / implementation-programme domain
// (Wave 7, W7-A, Phase 7.1). The ONE Teragon implementation programme:
// 6 mandated adoption stages, milestones, NAMED owners (seed users only),
// risks, typed evidence refs to REAL records, Go/No-Go decisions, 5 rollout
// waves, pilot definition and measured-only pilot results.
//
// Honesty contract (docs/WAVE_7_BASELINE.md):
// - nothing here invents completion, baselines, ROI or pilot success;
// - unmeasured ⇒ null + "טרם נמדד" at the UI layer;
// - missing baseline ⇒ "לא הוגדר קו בסיס"; missing evidence ⇒ "חסרה ראיה";
// - a PilotResult record EXISTS only when something was actually measured.
import type { BaseEntity, ISODate } from "@/domain/types";
import type { CollectionKey } from "@/repositories/collections";

// ---------------------------------------------------------------------------
// vocabularies
// ---------------------------------------------------------------------------

/** The 6 mandated adoption-stage names (SCREEN_SPECS_HE.md chapter 12). */
export const ADOPTION_STAGE_NAMES = [
  "בעיה ותוצאה עסקית",
  "מפת AS-IS-TO-BE וגבולות אדם-AI",
  "שבע פרסונות ותכנית הדרכה",
  "פיילוט מבוקר",
  "הרחבה בגלים",
  "שגרה בקרה ושיפור מתמשך",
] as const;

export type AdoptionStageName = (typeof ADOPTION_STAGE_NAMES)[number];

/** The 5 mandated rollout-wave names (chapter 12 — exactly these, in order). */
export const ROLLOUT_WAVE_NAMES = [
  "Champions",
  "Early Adopters",
  "מחלקה ראשונה",
  "מחלקות נוספות",
  "הפעלה שגרתית",
] as const;

export type RolloutWaveName = (typeof ROLLOUT_WAVE_NAMES)[number];

export type AdoptionStageStatus = "לא התחיל" | "בתהליך" | "הושלם";

/** Gate decision state — "ממתין" until a real decision record is decided. */
export type GoNoGoState = "Go" | "No-Go" | "ממתין";

/** Programme approval workflow — bootstrap creates a draft, never "מאושר". */
export type ProgrammeApprovalState = "טיוטה" | "ממתין לאישור" | "מאושר";

/** Honest aggregate baseline state — derived from the baseline metrics. */
export type BaselineState = "לא הוגדר קו בסיס" | "קו בסיס חלקי" | "קו בסיס מתועד";

export type MilestoneStatus = "מתוכננת" | "בתהליך" | "הושלמה" | "בוטלה";

export type RiskLevel = "נמוכה" | "בינונית" | "גבוהה";

export type ImplementationRiskStatus = "פתוח" | "בטיפול" | "סגור";

export type PilotStatus = "מוגדר" | "רץ" | "הסתיים";

/** Owner roles inside the programme (embedded, always a NAMED seed user). */
export type ImplementationOwnerRole = "ספונסר" | "בעלים עסקי" | "מטמיע" | "אחראי שלב";

// ---------------------------------------------------------------------------
// embedded structures
// ---------------------------------------------------------------------------

/** A named person (seed users collection) holding a programme role. */
export interface ImplementationOwner {
  userId: string;
  /** denormalized display name — MUST match the seed user record */
  name: string;
  role: ImplementationOwnerRole;
  /** what the owner owns, e.g. "programme" or an adoption-stage id */
  scopeRef: string;
}

/** One baseline metric — value null ⇒ honestly not yet measured. */
export interface BaselineMetric {
  metricKey: string;
  nameHe: string;
  unit: string;
  /** null ⇒ "לא הוגדר קו בסיס" for this metric — never invented */
  value: number | null;
  capturedAt: ISODate | null;
  /** how the value was (or will be) measured */
  methodHe: string;
}

/**
 * Typed reference to a REAL record: collection + record id + in-app route.
 * Evidence eligibility = the referenced record exists (and is approved
 * where the record type carries approval semantics).
 */
export interface EvidenceRef {
  collection: CollectionKey;
  recordId: string;
  route: string;
}

/** One of the six adoption stages — embedded in the programme record. */
export interface AdoptionStage {
  /** stable id "as-1".."as-6" */
  id: string;
  order: number;
  name: AdoptionStageName;
  /** the mandated objective of the stage */
  objective: string;
  /** NAMED seed user id */
  ownerId: string;
  startPlanned: ISODate;
  /** target date — a יעד (plan), never presented as fact */
  targetDate: ISODate;
  status: AdoptionStageStatus;
  deliverables: string[];
  /** what evidence the stage gate requires (matched by ImplementationEvidence.requirementHe) */
  evidenceRequirements: string[];
  nextAction: string;
  /** the gate guarding EXIT from this stage, e.g. "G4 — הפיילוט הצליח" */
  nextGate: string;
  /** bridge to the seeded implementationStages record ("is-1".."is-6") */
  seedStageId: string;
}

// ---------------------------------------------------------------------------
// collection records
// ---------------------------------------------------------------------------

/** THE Teragon implementation programme (collection implementationProgrammes). */
export interface ImplementationProgramme extends BaseEntity {
  name: string;
  /** the business problem, WITH a number (donor: rewritten, not embedded HTML) */
  businessProblem: string;
  /** the target business outcome — a יעד, not an achievement */
  businessOutcome: string;
  sponsorId: string;
  businessOwnerId: string;
  implementerId: string;
  owners: ImplementationOwner[];
  /** programme start — the seed anchor (fact) */
  startDate: ISODate;
  /** target end — יעד */
  targetEndDate: ISODate;
  baselineMetrics: BaselineMetric[];
  /** derived-at-write aggregate of baselineMetrics — kept consistent by the domain layer */
  baselineState: BaselineState;
  approvalState: ProgrammeApprovalState;
  /** id of the canonical Approval record when approvalState !== "טיוטה"; else null */
  approvalId: string | null;
  version: number;
  /** the honest current stage — bootstrap: "as-4" (פיילוט מבוקר, NOT completed) */
  currentStageId: string;
  stages: AdoptionStage[];
  /** labeled demo/bootstrap content */
  demo: boolean;
}

export interface ImplementationMilestone extends BaseEntity {
  programmeId: string;
  /** adoption stage id ("as-1".."as-6") */
  stageId: string;
  title: string;
  dueDate: ISODate;
  ownerId: string;
  status: MilestoneStatus;
  completedAt: ISODate | null;
}

export interface ImplementationRisk extends BaseEntity {
  programmeId: string;
  /** null ⇒ programme-wide risk */
  stageId: string | null;
  title: string;
  description: string;
  probability: RiskLevel;
  impact: RiskLevel;
  mitigation: string;
  ownerId: string;
  status: ImplementationRiskStatus;
  reviewDate: ISODate;
}

/**
 * An evidence REQUIREMENT of a stage gate + its (possibly missing) typed ref.
 * ref === null ⇒ honest "חסרה ראיה". Eligibility is derived by
 * evidenceEligibility(), never stored as a fabricated "uploaded" flag.
 */
export interface ImplementationEvidence extends BaseEntity {
  programmeId: string;
  stageId: string;
  requirementHe: string;
  ref: EvidenceRef | null;
  /** who captured / linked the evidence (named user) or null when missing */
  capturedById: string | null;
  capturedAt: ISODate | null;
  noteHe: string;
}

/** A Go/No-Go gate decision — decision null ⇒ "טרם התקבלה החלטה". */
export interface ImplementationDecision extends BaseEntity {
  programmeId: string;
  stageId: string;
  gateName: string;
  /** planned decision date (חוק התאריך — every gate has one in advance) */
  plannedDate: ISODate;
  decision: "Go" | "No-Go" | null;
  decidedById: string | null;
  decidedAt: ISODate | null;
  rationaleHe: string;
  /** ImplementationEvidence ids examined for the decision */
  evidenceIds: string[];
}

export interface RolloutWave extends BaseEntity {
  programmeId: string;
  order: number;
  name: RolloutWaveName;
  /** who is in the wave, in Teragon terms */
  audienceHe: string;
  plannedStart: ISODate | null;
  status: AdoptionStageStatus;
  entryCriteria: string[];
}

export interface PilotSuccessCriterion {
  metricKey: string;
  nameHe: string;
  /** the target, as text — e.g. "WAU ≥ 70%" */
  targetHe: string;
}

export interface PilotDefinition extends BaseEntity {
  programmeId: string;
  scopeHe: string;
  /** null ⇒ the pilot has not started */
  startDate: ISODate | null;
  /** the pre-committed decision date (חוק התאריך) */
  decisionDate: ISODate;
  successCriteria: PilotSuccessCriterion[];
  status: PilotStatus;
}

/**
 * A MEASURED pilot observation. Every field is a measurement fact — there is
 * no nullable value here on purpose: an absent record IS the honest
 * "טרם נמדד" state. Fabricating results is impossible by construction.
 */
export interface PilotResult extends BaseEntity {
  pilotId: string;
  metricKey: string;
  measuredValue: number;
  unit: string;
  measuredAt: ISODate;
  /** how the measurement was produced */
  methodHe: string;
  measuredById: string;
}
