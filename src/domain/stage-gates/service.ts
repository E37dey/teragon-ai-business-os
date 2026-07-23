// TERAGON AI BUSINESS OS — Stage Gate service (W7-C, 7.7+7.8): the idempotent
// V2 bridge over the six seeded records + every gate action, each one audited
// through the canonical auditEvents pattern (deterministic ids, Hebrew detail).
// Honesty guarantees:
//   * the bridge never fabricates evidence — it only attaches refs to records
//     that GENUINELY exist in the seed (personas, training materials);
//   * decideGo() re-runs the deterministic validator and REFUSES while any
//     blocking reason remains — incl. G4 without a real PilotResult record;
//   * there is no percentage input anywhere — no gate can pass from a number.
import type { AuditEvent, StageGate } from "@/domain/types";
import type { StageGateClock, StageGateStores } from "@/repositories/stageGateStores";
import {
  CANONICAL_STAGE_GATES,
  isStageGateV2,
  type StageGateDef,
  type StageGateEvidenceRef,
  type StageGateEvidenceRefType,
  type StageGateV2,
  type StageGateV2Fields,
} from "./types";
import { validateGate, type GateValidation, type StageGateContext } from "./validator";

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

export type StageGateErrorCode =
  | "STAGE_GATE_SEED_INVALID"
  | "STAGE_GATE_NOT_FOUND"
  | "STAGE_GATE_NOT_BRIDGED"
  | "STAGE_GATE_CRITERION_UNKNOWN"
  | "STAGE_GATE_REF_TYPE_INVALID"
  | "STAGE_GATE_RECORD_NOT_FOUND"
  | "STAGE_GATE_DUPLICATE_EVIDENCE"
  | "STAGE_GATE_NOTE_REQUIRED"
  | "STAGE_GATE_GO_BLOCKED"
  | "STAGE_GATE_STATE_INVALID"
  | "STAGE_GATE_USER_NOT_FOUND";

export class StageGateError extends Error {
  readonly code: StageGateErrorCode;
  readonly blockingReasonsHe: readonly string[];

  constructor(code: StageGateErrorCode, detailHe: string, blockingReasonsHe: string[] = []) {
    super(`${code}: ${detailHe}`);
    this.name = "StageGateError";
    this.code = code;
    this.blockingReasonsHe = blockingReasonsHe;
  }
}

// ---------------------------------------------------------------------------
// audit — canonical pattern (deterministic ids, correlationId per gate)
// ---------------------------------------------------------------------------

async function writeGateAudit(
  stores: StageGateStores,
  clock: StageGateClock,
  gateId: string,
  actor: string,
  action: string,
  detailsHe: string,
): Promise<AuditEvent> {
  const prefix = `sg2-${gateId}-aud-`;
  const existing = (await stores.audit.list()).filter((a) => a.id.startsWith(prefix));
  let max = 0;
  const re = /-aud-(\d+)$/;
  for (const a of existing) {
    const m = re.exec(a.id);
    if (m?.[1]) {
      const n = Number.parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  const ts = clock();
  return stores.audit.create({
    id: `${prefix}${max + 1}`,
    createdAt: ts,
    updatedAt: ts,
    at: ts,
    actor,
    action,
    entityRef: `stage-gate:${gateId}`,
    details: detailsHe,
    correlationId: `stage-gate-${gateId}`,
  });
}

// ---------------------------------------------------------------------------
// bootstrap evidence — ONLY refs whose records genuinely exist in the seed
// ---------------------------------------------------------------------------

interface BootstrapAttachment {
  criterionKey: string;
  refType: StageGateEvidenceRefType;
  refId: string;
  noteHe: string;
}

interface BootstrapPlan {
  ownerId: string | null;
  reviewerId: string | null;
  attachments: readonly BootstrapAttachment[];
}

/**
 * Honest initial wiring. G1: the 7 seeded personas (the Use-Case-Brief
 * criterion stays honestly unmet — no such record exists in the seed).
 * G2: the seeded training matrix (coverage per persona) + FAQ + support plan.
 * G3: owner + support material only — pilot definition and baselines do not
 * exist, so the gate honestly reads "חסרות ראיות". G4-G6: nothing — "לא התחיל".
 */
const BOOTSTRAP: Record<string, BootstrapPlan> = {
  G1: {
    ownerId: "u-tzachi",
    reviewerId: "u-noa",
    attachments: [1, 2, 3, 4, 5, 6, 7].map((n) => ({
      criterionKey: "g1-personas",
      refType: "persona" as const,
      refId: `per-${n}`,
      noteHe: "פרסונה ממופה מה-seed הקנוני",
    })),
  },
  G2: {
    ownerId: "u-oren",
    reviewerId: "u-tzachi",
    attachments: [
      { criterionKey: "g2-matrix", refType: "trainingMaterial", refId: "tm-1", noteHe: 'מכסה את המנכ"ל המתזמר' },
      { criterionKey: "g2-matrix", refType: "trainingMaterial", refId: "tm-2", noteHe: "מכסה את אשת המכירות" },
      { criterionKey: "g2-matrix", refType: "trainingMaterial", refId: "tm-4", noteHe: "מכסה את המדריך" },
      { criterionKey: "g2-matrix", refType: "trainingMaterial", refId: "tm-5", noteHe: "מכסה את איש התמיכה" },
      { criterionKey: "g2-matrix", refType: "trainingMaterial", refId: "tm-9", noteHe: "מכסה את מנהלת המערכת" },
      { criterionKey: "g2-matrix", refType: "trainingMaterial", refId: "tm-10", noteHe: "מכסה את התלמידה" },
      { criterionKey: "g2-core-materials", refType: "trainingMaterial", refId: "tm-12", noteHe: "FAQ והתנגדויות" },
      { criterionKey: "g2-core-materials", refType: "trainingMaterial", refId: "tm-13", noteHe: "נוהל תמיכה לאחר השקה" },
    ],
  },
  G3: {
    ownerId: "u-noa",
    reviewerId: null,
    attachments: [
      { criterionKey: "g3-support", refType: "trainingMaterial", refId: "tm-13", noteHe: "נוהל תמיכה זמין למשתתפי פיילוט" },
    ],
  },
};

// ---------------------------------------------------------------------------
// service
// ---------------------------------------------------------------------------

export interface StageGateServiceDeps {
  stores: StageGateStores;
  clock?: StageGateClock;
}

export interface BridgeResult {
  bridged: number;
  alreadyBridged: number;
}

export interface GateWithValidation {
  gate: StageGateV2;
  def: StageGateDef;
  validation: GateValidation;
}

export class StageGateService {
  private readonly stores: StageGateStores;
  private readonly clock: StageGateClock;

  constructor(deps: StageGateServiceDeps) {
    this.stores = deps.stores;
    this.clock = deps.clock ?? (() => new Date().toISOString());
  }

  // -------------------------------------------------------------------------
  // bridge — idempotent, exactly the 6 seeded records
  // -------------------------------------------------------------------------

  async ensureBridge(): Promise<BridgeResult> {
    let bridged = 0;
    let alreadyBridged = 0;
    for (const def of CANONICAL_STAGE_GATES) {
      const legacy = await this.stores.gates.get(def.legacyId);
      if (!legacy) {
        throw new StageGateError(
          "STAGE_GATE_SEED_INVALID",
          `רשומת השער "${def.legacyId}" (${def.gateKey}) חסרה ב-seed — הגשר מחייב בדיוק 6 שערים`,
        );
      }
      if (isStageGateV2(legacy)) {
        alreadyBridged += 1;
        continue;
      }
      const ts = this.clock();
      const plan = BOOTSTRAP[def.gateKey] ?? { ownerId: null, reviewerId: null, attachments: [] };
      const attachedEvidence: StageGateEvidenceRef[] = [];
      let n = 0;
      for (const a of plan.attachments) {
        // never fabricate: attach only refs whose record genuinely exists
        const exists = await this.recordExists(a.refType, a.refId);
        if (!exists) continue;
        n += 1;
        attachedEvidence.push({
          id: `sge-${def.legacyId}-${n}`,
          refType: a.refType,
          refId: a.refId,
          criterionKey: a.criterionKey,
          attachedAt: ts,
          attachedById: "system",
          noteHe: a.noteHe,
        });
      }
      const v2: StageGateV2Fields = {
        gateKey: def.gateKey,
        nameHe: def.nameHe,
        attachedEvidence,
        ownerId: plan.ownerId,
        reviewerId: plan.reviewerId,
        decision: null,
        decisionDate: null,
        decidedById: null,
        decisionNoteHe: "",
        reopened: false,
        reopenNoteHe: "",
        completionRequests: [],
        targetDecisionDate: null,
        bridgedAt: ts,
      };
      await this.stores.gates.update(def.legacyId, {
        v2,
        updatedAt: ts,
      } as Partial<Omit<StageGate, "id">>);
      await writeGateAudit(
        this.stores,
        this.clock,
        def.legacyId,
        "system",
        "stage-gate.bridge",
        `שער ${def.gateKey} «${def.nameHe}» גושר לרשומה הקיימת ${def.legacyId} (${attachedEvidence.length} ראיות אמת צורפו)`,
      );
      bridged += 1;
    }
    return { bridged, alreadyBridged };
  }

  // -------------------------------------------------------------------------
  // reads
  // -------------------------------------------------------------------------

  async loadContext(): Promise<StageGateContext> {
    const [
      personas,
      trainingMaterials,
      metricDefinitions,
      metricObservations,
      memoryRecords,
      knowledgeArticles,
      documents,
      implementationEvidence,
      pilotDefinitions,
      pilotResults,
      rolloutWaves,
      users,
    ] = await Promise.all([
      this.stores.personas.list(),
      this.stores.trainingMaterials.list(),
      this.stores.metricDefinitions.list(),
      this.stores.metricObservations.list(),
      this.stores.memoryRecords.list(),
      this.stores.knowledgeArticles.list(),
      this.stores.documents.list(),
      this.stores.implementationEvidence.list(),
      this.stores.pilotDefinitions.list(),
      this.stores.pilotResults.list(),
      this.stores.rolloutWaves.list(),
      this.stores.users.list(),
    ]);
    return {
      personas,
      trainingMaterials,
      metricDefinitions,
      metricObservations,
      memoryRecords,
      knowledgeArticles,
      documents,
      implementationEvidence,
      pilotDefinitions,
      pilotResults,
      rolloutWaves,
      users,
    };
  }

  /** All six gates (bridged) + deterministic validation, in G1..G6 order. */
  async validateAll(nowISO?: string): Promise<GateWithValidation[]> {
    const ctx = await this.loadContext();
    const ts = nowISO ?? this.clock();
    const out: GateWithValidation[] = [];
    for (const def of CANONICAL_STAGE_GATES) {
      const gate = await this.requireBridgedGate(def.legacyId);
      out.push({ gate, def, validation: validateGate(gate, def, ctx, ts) });
    }
    return out;
  }

  async validateOne(gateId: string, nowISO?: string): Promise<GateWithValidation> {
    const def = this.requireDef(gateId);
    const gate = await this.requireBridgedGate(gateId);
    const ctx = await this.loadContext();
    return { gate, def, validation: validateGate(gate, def, ctx, nowISO ?? this.clock()) };
  }

  // -------------------------------------------------------------------------
  // actions — each audited
  // -------------------------------------------------------------------------

  async assignOwner(gateId: string, userId: string, actorId: string): Promise<StageGateV2> {
    return this.assignRole(gateId, userId, actorId, "ownerId", "הוקצה אחראי");
  }

  /** "הקצה בודק" */
  async assignReviewer(gateId: string, userId: string, actorId: string): Promise<StageGateV2> {
    return this.assignRole(gateId, userId, actorId, "reviewerId", "הוקצה בודק");
  }

  private async assignRole(
    gateId: string,
    userId: string,
    actorId: string,
    field: "ownerId" | "reviewerId",
    labelHe: string,
  ): Promise<StageGateV2> {
    const gate = await this.requireBridgedGate(gateId);
    const user = await this.stores.users.get(userId);
    if (!user) {
      throw new StageGateError(
        "STAGE_GATE_USER_NOT_FOUND",
        `משתמש "${userId}" לא נמצא — אחראי/בודק חייב להיות משתמש אמיתי בשם`,
      );
    }
    const updated = await this.patchV2(gate, { [field]: userId });
    await writeGateAudit(
      this.stores,
      this.clock,
      gateId,
      actorId,
      field === "ownerId" ? "stage-gate.assign-owner" : "stage-gate.assign-reviewer",
      `${labelHe} לשער ${gate.v2.gateKey}: ${user.name}`,
    );
    return updated;
  }

  /** "פתח ראיה" — attach a typed ref to a REAL record. Refuses fakes. */
  async attachEvidence(
    gateId: string,
    input: { refType: StageGateEvidenceRefType; refId: string; criterionKey: string; noteHe?: string },
    actorId: string,
  ): Promise<StageGateV2> {
    const def = this.requireDef(gateId);
    const gate = await this.requireBridgedGate(gateId);
    const criterion = def.criteria.find((c) => c.key === input.criterionKey);
    if (!criterion) {
      throw new StageGateError(
        "STAGE_GATE_CRITERION_UNKNOWN",
        `קריטריון "${input.criterionKey}" אינו קיים בשער ${def.gateKey}`,
      );
    }
    if (!criterion.requiredRefTypes.includes(input.refType)) {
      throw new StageGateError(
        "STAGE_GATE_REF_TYPE_INVALID",
        `סוג ראיה "${input.refType}" אינו נדרש לקריטריון "${criterion.titleHe}"`,
      );
    }
    const exists = await this.recordExists(input.refType, input.refId);
    if (!exists) {
      throw new StageGateError(
        "STAGE_GATE_RECORD_NOT_FOUND",
        `רשומה "${input.refId}" לא נמצאה — ראיה חייבת להצביע על רשומה אמיתית`,
      );
    }
    const dup = gate.v2.attachedEvidence.some(
      (r) =>
        r.refType === input.refType &&
        r.refId === input.refId &&
        r.criterionKey === input.criterionKey,
    );
    if (dup) {
      throw new StageGateError(
        "STAGE_GATE_DUPLICATE_EVIDENCE",
        `הראיה "${input.refId}" כבר מצורפת לקריטריון זה`,
      );
    }
    let max = 0;
    const re = new RegExp(`^sge-${gateId}-(\\d+)$`);
    for (const r of gate.v2.attachedEvidence) {
      const m = re.exec(r.id);
      if (m?.[1]) {
        const n = Number.parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    const ts = this.clock();
    const ref: StageGateEvidenceRef = {
      id: `sge-${gateId}-${max + 1}`,
      refType: input.refType,
      refId: input.refId,
      criterionKey: input.criterionKey,
      attachedAt: ts,
      attachedById: actorId,
      noteHe: input.noteHe ?? "",
    };
    const updated = await this.patchV2(gate, {
      attachedEvidence: [...gate.v2.attachedEvidence, ref],
    });
    await writeGateAudit(
      this.stores,
      this.clock,
      gateId,
      actorId,
      "stage-gate.evidence.attach",
      `צורפה ראיה ${ref.id} (${ref.refType}:${ref.refId}) לקריטריון "${criterion.titleHe}"`,
    );
    return updated;
  }

  async detachEvidence(gateId: string, evidenceRefId: string, actorId: string): Promise<StageGateV2> {
    const gate = await this.requireBridgedGate(gateId);
    const ref = gate.v2.attachedEvidence.find((r) => r.id === evidenceRefId);
    if (!ref) {
      throw new StageGateError(
        "STAGE_GATE_RECORD_NOT_FOUND",
        `ראיה "${evidenceRefId}" אינה מצורפת לשער`,
      );
    }
    const updated = await this.patchV2(gate, {
      attachedEvidence: gate.v2.attachedEvidence.filter((r) => r.id !== evidenceRefId),
    });
    await writeGateAudit(
      this.stores,
      this.clock,
      gateId,
      actorId,
      "stage-gate.evidence.detach",
      `הוסרה ראיה ${evidenceRefId} (${ref.refType}:${ref.refId})`,
    );
    return updated;
  }

  /** "בקש השלמה" — record a completion request; note required. */
  async requestCompletion(gateId: string, noteHe: string, actorId: string): Promise<StageGateV2> {
    if (!noteHe.trim()) {
      throw new StageGateError("STAGE_GATE_NOTE_REQUIRED", "בקשת השלמה מחייבת נימוק");
    }
    const gate = await this.requireBridgedGate(gateId);
    const ts = this.clock();
    const updated = await this.patchV2(gate, {
      completionRequests: [
        ...gate.v2.completionRequests,
        { requestedAt: ts, requestedById: actorId, noteHe: noteHe.trim() },
      ],
    });
    await writeGateAudit(
      this.stores,
      this.clock,
      gateId,
      actorId,
      "stage-gate.request-completion",
      `בקשת השלמת ראיות: ${noteHe.trim()}`,
    );
    return updated;
  }

  /**
   * Go — ONLY through the deterministic validator. Any blocking reason
   * (missing/invalid/expired evidence, unnamed owner/reviewer, G4 without a
   * real PilotResult) refuses with the full Hebrew reason list. There is no
   * override and no percentage path.
   */
  async decideGo(gateId: string, actorId: string, noteHe = ""): Promise<StageGateV2> {
    const { gate, validation } = await this.validateOne(gateId);
    if (gate.v2.decision === "Go") {
      throw new StageGateError("STAGE_GATE_STATE_INVALID", "השער כבר הוכרע Go — לשינוי יש לפתוח מחדש");
    }
    if (!validation.readyForGo) {
      throw new StageGateError(
        "STAGE_GATE_GO_BLOCKED",
        `לא ניתן להכריע Go לשער ${gate.v2.gateKey}: ${validation.blockingReasonsHe.join(" · ")}`,
        [...validation.blockingReasonsHe],
      );
    }
    const ts = this.clock();
    const updated = await this.patchV2(
      gate,
      {
        decision: "Go",
        decisionDate: ts,
        decidedById: actorId,
        decisionNoteHe: noteHe.trim(),
        reopened: false,
      },
      { status: "עבר", decidedAt: ts, decidedById: actorId },
    );
    await writeGateAudit(
      this.stores,
      this.clock,
      gateId,
      actorId,
      "stage-gate.decide-go",
      `החלטת Go לשער ${gate.v2.gateKey} «${gate.v2.nameHe}»${noteHe.trim() ? ` — ${noteHe.trim()}` : ""} (כל הקריטריונים מולאו בראיות תקפות)`,
    );
    return updated;
  }

  /** No-Go — note required (a refusal without a reason is not honest). */
  async decideNoGo(gateId: string, actorId: string, noteHe: string): Promise<StageGateV2> {
    if (!noteHe.trim()) {
      throw new StageGateError("STAGE_GATE_NOTE_REQUIRED", "החלטת No-Go מחייבת נימוק");
    }
    const gate = await this.requireBridgedGate(gateId);
    const ts = this.clock();
    const updated = await this.patchV2(
      gate,
      {
        decision: "No-Go",
        decisionDate: ts,
        decidedById: actorId,
        decisionNoteHe: noteHe.trim(),
        reopened: false,
      },
      { status: "נכשל", decidedAt: ts, decidedById: actorId },
    );
    await writeGateAudit(
      this.stores,
      this.clock,
      gateId,
      actorId,
      "stage-gate.decide-no-go",
      `החלטת No-Go לשער ${gate.v2.gateKey}: ${noteHe.trim()}`,
    );
    return updated;
  }

  /** "פתח מחדש" — clears the decision; note required. */
  async reopen(gateId: string, actorId: string, noteHe: string): Promise<StageGateV2> {
    if (!noteHe.trim()) {
      throw new StageGateError("STAGE_GATE_NOTE_REQUIRED", "פתיחה מחדש מחייבת נימוק");
    }
    const gate = await this.requireBridgedGate(gateId);
    if (gate.v2.decision === null) {
      throw new StageGateError("STAGE_GATE_STATE_INVALID", "אין החלטה לפתוח מחדש — השער טרם הוכרע");
    }
    const updated = await this.patchV2(
      gate,
      {
        decision: null,
        decisionDate: null,
        decidedById: null,
        reopened: true,
        reopenNoteHe: noteHe.trim(),
      },
      { status: "בתהליך", decidedAt: null, decidedById: null },
    );
    await writeGateAudit(
      this.stores,
      this.clock,
      gateId,
      actorId,
      "stage-gate.reopen",
      `השער ${gate.v2.gateKey} נפתח מחדש: ${noteHe.trim()}`,
    );
    return updated;
  }

  /** Set/clear the planned decision date (null ⇒ "לא נקבע"). */
  async setTargetDecisionDate(
    gateId: string,
    dateISO: string | null,
    actorId: string,
  ): Promise<StageGateV2> {
    const gate = await this.requireBridgedGate(gateId);
    const updated = await this.patchV2(gate, { targetDecisionDate: dateISO });
    await writeGateAudit(
      this.stores,
      this.clock,
      gateId,
      actorId,
      "stage-gate.set-decision-date",
      dateISO ? `נקבע מועד החלטה: ${dateISO.slice(0, 10)}` : "מועד ההחלטה נוקה (לא נקבע)",
    );
    return updated;
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  private requireDef(gateId: string): StageGateDef {
    const def = CANONICAL_STAGE_GATES.find((d) => d.legacyId === gateId);
    if (!def) {
      throw new StageGateError(
        "STAGE_GATE_NOT_FOUND",
        `"${gateId}" אינו אחד מ-6 השערים הקנוניים (sg-1..sg-6)`,
      );
    }
    return def;
  }

  private async requireBridgedGate(gateId: string): Promise<StageGateV2> {
    this.requireDef(gateId);
    const gate = await this.stores.gates.get(gateId);
    if (!gate) {
      throw new StageGateError("STAGE_GATE_NOT_FOUND", `רשומת השער "${gateId}" לא נמצאה`);
    }
    if (!isStageGateV2(gate)) {
      throw new StageGateError(
        "STAGE_GATE_NOT_BRIDGED",
        `השער "${gateId}" טרם גושר ל-V2 — יש להריץ ensureBridge() קודם`,
      );
    }
    return gate;
  }

  private async patchV2(
    gate: StageGateV2,
    patch: Partial<StageGateV2Fields>,
    legacyPatch: Partial<Omit<StageGate, "id">> = {},
  ): Promise<StageGateV2> {
    const ts = this.clock();
    const v2: StageGateV2Fields = { ...gate.v2, ...patch };
    const updated = await this.stores.gates.update(gate.id, {
      ...legacyPatch,
      v2,
      updatedAt: ts,
    } as Partial<Omit<StageGate, "id">>);
    return updated as StageGateV2;
  }

  private async recordExists(refType: StageGateEvidenceRefType, refId: string): Promise<boolean> {
    const repoByType = {
      persona: this.stores.personas,
      trainingMaterial: this.stores.trainingMaterials,
      metricDefinition: this.stores.metricDefinitions,
      metricObservation: this.stores.metricObservations,
      memoryRecord: this.stores.memoryRecords,
      knowledgeArticle: this.stores.knowledgeArticles,
      implementationEvidence: this.stores.implementationEvidence,
      document: this.stores.documents,
      pilotDefinition: this.stores.pilotDefinitions,
      pilotResult: this.stores.pilotResults,
      rolloutWave: this.stores.rolloutWaves,
    } as const;
    const record = await repoByType[refType].get(refId);
    return record !== undefined;
  }
}
