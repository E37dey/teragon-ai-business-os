// TERAGON AI BUSINESS OS — DETERMINISTIC stage-gate validator (W7-C, 7.8).
// Pure functions over loaded records: same inputs ⇒ same outputs, no model,
// no randomness, and NO percentage-based pass path — there is no numeric
// "progress" input anywhere in this module. A gate is Go-able only when every
// criterion is genuinely satisfied by VALID typed evidence refs to real
// records, an owner AND a reviewer are named, and nothing expired.
import type {
  Document,
  ISODate,
  MemoryRecord,
  MetricDefinition,
  MetricObservation,
  Persona,
  TrainingMaterial,
  User,
} from "@/domain/types";
import type { KnowledgeArticleV2 } from "@/domain/knowledge";
import { mayUseAsEvidence } from "@/knowledge/evidenceEligibility";
import {
  EVIDENCE_REF_TYPE_LABELS_HE,
  type StageGateCriterionDef,
  type StageGateDecision,
  type StageGateDef,
  type StageGateEvidenceRef,
  type StageGateEvidenceRefType,
  type StageGateV2,
  type StageGateV2State,
  type W7RecordLike,
} from "./types";

/** A metric observation older than this is no longer current evidence. */
export const METRIC_FRESHNESS_DAYS = 90;

/** "ללא —" training tracks (e.g. השותף החיצוני) are exempt from coverage. */
const NO_TRACK_PREFIX = "ללא";

// ---------------------------------------------------------------------------
// context — the loaded canonical records the validator reads
// ---------------------------------------------------------------------------

export interface StageGateContext {
  personas: readonly Persona[];
  trainingMaterials: readonly TrainingMaterial[];
  metricDefinitions: readonly MetricDefinition[];
  metricObservations: readonly MetricObservation[];
  memoryRecords: readonly MemoryRecord[];
  knowledgeArticles: readonly KnowledgeArticleV2[];
  documents: readonly Document[];
  implementationEvidence: readonly W7RecordLike[];
  pilotDefinitions: readonly W7RecordLike[];
  pilotResults: readonly W7RecordLike[];
  rolloutWaves: readonly W7RecordLike[];
  users: readonly User[];
}

// ---------------------------------------------------------------------------
// evaluation results
// ---------------------------------------------------------------------------

export type EvidenceRefStatus = "תקפה" | "פסולה" | "פג תוקף";

export interface EvaluatedEvidenceRef {
  ref: StageGateEvidenceRef;
  status: EvidenceRefStatus;
  /** Hebrew reason when NOT valid; null when valid */
  reasonHe: string | null;
  /** display title of the referenced record ("רשומה לא נמצאה" when missing) */
  recordTitleHe: string;
}

export type CriterionState = "מולא" | "חסרות ראיות" | "לא התחיל";

export interface CriterionValidation {
  def: StageGateCriterionDef;
  state: CriterionState;
  /** human description of what evidence is required */
  requiredEvidenceHe: string;
  attachedEvidence: EvaluatedEvidenceRef[];
  validCount: number;
  invalidCount: number;
  expiredCount: number;
  /** Hebrew descriptions of what is still missing (empty when satisfied) */
  missingHe: string[];
}

export interface GateValidation {
  gateId: string;
  gateKey: StageGateDef["gateKey"];
  nameHe: string;
  state: StageGateV2State;
  criteria: CriterionValidation[];
  ownerId: string | null;
  ownerNameHe: string | null;
  reviewerId: string | null;
  reviewerNameHe: string | null;
  decision: StageGateDecision | null;
  decisionDate: ISODate | null;
  decidedById: string | null;
  /** planned next decision date — null ⇒ "לא נקבע" */
  nextDecisionDate: ISODate | null;
  /** every reason the gate cannot receive Go right now (empty ⇒ ready) */
  blockingReasonsHe: string[];
  readyForGo: boolean;
  invalidCount: number;
  expiredCount: number;
  missingCount: number;
}

// ---------------------------------------------------------------------------
// single-ref evaluation
// ---------------------------------------------------------------------------

function titleOf(refType: StageGateEvidenceRefType, record: unknown): string {
  const r = record as {
    name?: string;
    title?: string;
    titleHe?: string;
    metricKey?: string;
    observedAt?: string;
  };
  if (refType === "metricObservation" && r.metricKey) {
    return `תצפית ${r.metricKey} (${(r.observedAt ?? "").slice(0, 10)})`;
  }
  return r.titleHe ?? r.title ?? r.name ?? "רשומה ללא כותרת";
}

/** Optional approval extension some Wave-7 material records carry. */
interface MaterialApprovalLike {
  approvalState?: string;
  approval?: string | { state?: string };
}

function materialRejectionReasonHe(m: TrainingMaterial): string | null {
  const ext = m as TrainingMaterial & MaterialApprovalLike;
  const state =
    ext.approvalState ??
    (typeof ext.approval === "string" ? ext.approval : ext.approval?.state) ??
    null;
  if (state === "נדחה") return "חומר הדרכה שנדחה אינו כשיר כראיה";
  return null;
}

function daysBetween(fromISO: string, toISO: string): number {
  return (Date.parse(toISO) - Date.parse(fromISO)) / 86_400_000;
}

function evaluateMetricObservation(
  obs: MetricObservation,
  all: readonly MetricObservation[],
  needsBaseline: boolean,
  nowISO: string,
): { status: EvidenceRefStatus; reasonHe: string | null } {
  if (obs.value === null) {
    return { status: "פסולה", reasonHe: "טרם נמדד — תצפית ללא ערך אינה ראיה" };
  }
  if (daysBetween(obs.observedAt, nowISO) > METRIC_FRESHNESS_DAYS) {
    return {
      status: "פג תוקף",
      reasonHe: `התצפית ישנה מ-${METRIC_FRESHNESS_DAYS} יום — אינה עדכנית`,
    };
  }
  if (needsBaseline) {
    const baseline = all.some(
      (o) =>
        o.id !== obs.id &&
        o.metricKey === obs.metricKey &&
        o.value !== null &&
        Date.parse(o.observedAt) < Date.parse(obs.observedAt),
    );
    if (!baseline) {
      return {
        status: "פסולה",
        reasonHe: `לא הוגדר קו בסיס למדד "${obs.metricKey}" — טענה מבוססת-מדד חסומה`,
      };
    }
  }
  return { status: "תקפה", reasonHe: null };
}

/** Evaluate one attached ref against the real records. Deterministic. */
export function evaluateEvidenceRef(
  ref: StageGateEvidenceRef,
  criterion: StageGateCriterionDef,
  ctx: StageGateContext,
  nowISO: string,
): EvaluatedEvidenceRef {
  if (!criterion.requiredRefTypes.includes(ref.refType)) {
    return {
      ref,
      status: "פסולה",
      reasonHe: `סוג ראיה "${EVIDENCE_REF_TYPE_LABELS_HE[ref.refType]}" אינו נדרש לקריטריון זה`,
      recordTitleHe: "—",
    };
  }
  const lists: Record<StageGateEvidenceRefType, readonly { id: string }[]> = {
    persona: ctx.personas,
    trainingMaterial: ctx.trainingMaterials,
    metricDefinition: ctx.metricDefinitions,
    metricObservation: ctx.metricObservations,
    memoryRecord: ctx.memoryRecords,
    knowledgeArticle: ctx.knowledgeArticles,
    implementationEvidence: ctx.implementationEvidence,
    document: ctx.documents,
    pilotDefinition: ctx.pilotDefinitions,
    pilotResult: ctx.pilotResults,
    rolloutWave: ctx.rolloutWaves,
  };
  const record = lists[ref.refType].find((r) => r.id === ref.refId);
  if (!record) {
    return {
      ref,
      status: "פסולה",
      reasonHe: `הרשומה "${ref.refId}" לא נמצאה באוסף — ראיה ללא רשומה אמיתית פסולה`,
      recordTitleHe: "רשומה לא נמצאה",
    };
  }
  const recordTitleHe = titleOf(ref.refType, record);
  if (ref.refType === "knowledgeArticle") {
    const gate = mayUseAsEvidence(record as KnowledgeArticleV2, nowISO);
    if (!gate.eligible) return { ref, status: "פסולה", reasonHe: gate.reasonHe, recordTitleHe };
  }
  if (ref.refType === "trainingMaterial") {
    const rejection = materialRejectionReasonHe(record as TrainingMaterial);
    if (rejection) return { ref, status: "פסולה", reasonHe: rejection, recordTitleHe };
  }
  if (ref.refType === "metricObservation") {
    const result = evaluateMetricObservation(
      record as MetricObservation,
      ctx.metricObservations,
      criterion.needsBaseline,
      nowISO,
    );
    return { ref, status: result.status, reasonHe: result.reasonHe, recordTitleHe };
  }
  return { ref, status: "תקפה", reasonHe: null, recordTitleHe };
}

// ---------------------------------------------------------------------------
// criterion validation
// ---------------------------------------------------------------------------

export function requiredEvidenceHe(def: StageGateCriterionDef): string {
  const kinds = def.requiredRefTypes.map((t) => EVIDENCE_REF_TYPE_LABELS_HE[t]).join(" / ");
  const coverage = def.personaCoverage ? " · כיסוי כל פרסונה בעלת מסלול" : "";
  const baseline = def.needsBaseline ? " · מול קו בסיס קיים" : "";
  return `לפחות ${def.minCount} × ${kinds}${coverage}${baseline} (דוגמאות: ${def.evidenceExamplesHe.join(", ")})`;
}

export function validateCriterion(
  def: StageGateCriterionDef,
  attached: readonly StageGateEvidenceRef[],
  ctx: StageGateContext,
  nowISO: string,
): CriterionValidation {
  const refs = attached.filter((r) => r.criterionKey === def.key);
  const evaluated = refs.map((r) => evaluateEvidenceRef(r, def, ctx, nowISO));
  const valid = evaluated.filter((e) => e.status === "תקפה");
  const invalidCount = evaluated.filter((e) => e.status === "פסולה").length;
  const expiredCount = evaluated.filter((e) => e.status === "פג תוקף").length;
  const missingHe: string[] = [];

  if (valid.length < def.minCount) {
    missingHe.push(
      `נדרשות ${def.minCount} ראיות תקפות — קיימות ${valid.length} (${requiredEvidenceHe(def)})`,
    );
  }

  if (def.personaCoverage) {
    const tracked = ctx.personas.filter((p) => !p.trainingTrack.startsWith(NO_TRACK_PREFIX));
    const validMaterialIds = new Set(
      valid.filter((e) => e.ref.refType === "trainingMaterial").map((e) => e.ref.refId),
    );
    const materials = ctx.trainingMaterials.filter((m) => validMaterialIds.has(m.id));
    for (const p of tracked) {
      const covered = materials.some((m) => m.audiencePersonaIds.includes(p.id));
      if (!covered) missingHe.push(`אין חומר הדרכה מצורף לפרסונה "${p.name}"`);
    }
  }

  const state: CriterionState =
    missingHe.length === 0 ? "מולא" : refs.length === 0 ? "לא התחיל" : "חסרות ראיות";

  return {
    def,
    state,
    requiredEvidenceHe: requiredEvidenceHe(def),
    attachedEvidence: evaluated,
    validCount: valid.length,
    invalidCount,
    expiredCount,
    missingHe,
  };
}

// ---------------------------------------------------------------------------
// full gate validation + the deterministic 7-state derivation
// ---------------------------------------------------------------------------

export function validateGate(
  gate: StageGateV2,
  def: StageGateDef,
  ctx: StageGateContext,
  nowISO: string,
): GateValidation {
  const v2 = gate.v2;
  const criteria = def.criteria.map((c) =>
    validateCriterion(c, v2.attachedEvidence, ctx, nowISO),
  );
  const invalidCount = criteria.reduce((n, c) => n + c.invalidCount, 0);
  const expiredCount = criteria.reduce((n, c) => n + c.expiredCount, 0);
  const missingCount = criteria.reduce((n, c) => n + c.missingHe.length, 0);
  const allSatisfied = criteria.every((c) => c.state === "מולא");

  const blockingReasonsHe: string[] = [];
  for (const c of criteria) {
    for (const m of c.missingHe) blockingReasonsHe.push(`${c.def.titleHe}: ${m}`);
  }
  if (v2.ownerId === null) blockingReasonsHe.push("לא הוקצה אחראי (בעלים בשם) לשער");
  if (v2.reviewerId === null) blockingReasonsHe.push("לא הוקצה בודק לשער");
  if (expiredCount > 0) blockingReasonsHe.push(`${expiredCount} ראיות פגות תוקף — נדרש רענון`);

  // THE key honesty rule: "הפיילוט הצליח" is unsupportable without a real
  // PilotResult record — explicit belt even beyond the g4-pilot-result criterion.
  if (def.gateKey === "G4") {
    const validPilotResults = criteria
      .flatMap((c) => c.attachedEvidence)
      .filter((e) => e.ref.refType === "pilotResult" && e.status === "תקפה");
    if (ctx.pilotResults.length === 0 || validPilotResults.length === 0) {
      const msg = "אין רשומת PilotResult אמיתית — לא ניתן לקבוע «הפיילוט הצליח»";
      if (!blockingReasonsHe.includes(msg)) blockingReasonsHe.push(msg);
    }
  }

  const readyForGo = blockingReasonsHe.length === 0;

  // deterministic state machine
  let state: StageGateV2State;
  if (v2.reopened && v2.decision === null) {
    state = "נפתח מחדש";
  } else if (v2.decision === "No-Go") {
    state = "No-Go";
  } else if (v2.decision === "Go") {
    // a Go whose evidence no longer resolves is honestly expired
    state = allSatisfied && expiredCount === 0 ? "Go" : "פג תוקף";
  } else if (
    v2.attachedEvidence.length === 0 &&
    v2.ownerId === null &&
    v2.completionRequests.length === 0
  ) {
    state = "לא התחיל";
  } else if (readyForGo) {
    state = "בבדיקה";
  } else {
    state = "חסרות ראיות";
  }

  const userName = (id: string | null): string | null =>
    id === null ? null : (ctx.users.find((u) => u.id === id)?.name ?? id);

  return {
    gateId: gate.id,
    gateKey: def.gateKey,
    nameHe: def.nameHe,
    state,
    criteria,
    ownerId: v2.ownerId,
    ownerNameHe: userName(v2.ownerId),
    reviewerId: v2.reviewerId,
    reviewerNameHe: userName(v2.reviewerId),
    decision: v2.decision,
    decisionDate: v2.decisionDate,
    decidedById: v2.decidedById,
    nextDecisionDate: v2.targetDecisionDate,
    blockingReasonsHe,
    readyForGo,
    invalidCount,
    expiredCount,
    missingCount,
  };
}
