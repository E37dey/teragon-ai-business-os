// TERAGON AI BUSINESS OS — the ONE canonical approval engine (Wave 5, W5-C).
// Every mutating/outbound agent action flows through the approvals collection.
// Lifecycle: pending → approved | edited | rejected (+ expire / cancel) →
// execution → verification → audit. Rollback via inverse ops is implemented
// for task-creation and record-field-change; every other kind is honestly
// declared "rollback לא נתמך".
//
// The Wave-1 Approval record has exactly 3 statuses (ממתין/אושר/נדחה) and is
// frozen for W5-C, so the richer lifecycle is derived from persisted
// ApprovalRequested / ApprovalDecided / ExecutionCompleted events — the record
// status maps: approved+edited ⇒ "אושר"; rejected+expired+cancelled ⇒ "נדחה"
// (the note says which). GUARANTEE: there is NO execution path without an
// Approval record in state approved/edited — execute() throws a structured
// AGENT_EXECUTION_WITHOUT_APPROVAL error otherwise.
import type { BaseEntity, Approval } from "@/domain/types";
import type {
  AgentRun,
  ApprovalDecision,
  ApprovalRequiredAction,
  ExecutionPayload,
  FieldValue,
  InversePayload,
} from "@/domain/agents";
import { APPROVAL_ACTION_LABELS_HE, ROLLBACK_UNSUPPORTED_HE } from "@/domain/agents";
import type { AgentStores } from "@/repositories/agentStores";
import { AgentGovernanceError } from "./errors";
import { appendEvent, writeAudit, type Clock } from "./runlog";

// ---------------------------------------------------------------------------
// derived workflow state
// ---------------------------------------------------------------------------

export type ApprovalWorkflowState =
  | "pending"
  | "approved"
  | "edited"
  | "rejected"
  | "expired"
  | "cancelled"
  | "executed"
  | "execution-failed"
  | "rolled-back";

export interface ExecutionResult {
  outcome: "הצלחה" | "נכשל";
  resultRef: string | null;
  inverse: InversePayload | null;
  detailHe: string;
}

export interface RollbackResult {
  supported: boolean;
  detailHe: string;
}

/** Handler seam for "external" payloads — W5-D / UI injects real mutations. */
export type ExternalExecutionHandler = (
  payload: Extract<ExecutionPayload, { kind: "external" }>,
) => Promise<{ resultRef: string | null; detailHe: string }>;

export interface ApprovalEngineDeps {
  stores: AgentStores;
  clock?: Clock;
  externalHandlers?: Partial<Record<ApprovalRequiredAction, ExternalExecutionHandler>>;
}

export interface RequestApprovalInput {
  runId: string;
  subjectRef: string;
  action: ApprovalRequiredAction;
  requestedById: string;
  /** null ⇒ recommendation-only approval (no machine execution afterwards) */
  executionPayload: ExecutionPayload | null;
  previewHe: string;
}

export interface DecideInput {
  runId: string;
  approvalId: string;
  kind: "approve" | "edit" | "reject";
  decidedById: string;
  noteHe?: string;
  /** kind "edit" ⇒ the human-edited payload that will execute instead */
  editedPayload?: ExecutionPayload;
}

const ROLLBACK_MARKER = "rollback:";

export class ApprovalEngine {
  private readonly stores: AgentStores;
  private readonly clock: Clock;
  private readonly externalHandlers: Partial<
    Record<ApprovalRequiredAction, ExternalExecutionHandler>
  >;

  constructor(deps: ApprovalEngineDeps) {
    this.stores = deps.stores;
    this.clock = deps.clock ?? (() => new Date().toISOString());
    this.externalHandlers = deps.externalHandlers ?? {};
  }

  // -------------------------------------------------------------------------
  // request
  // -------------------------------------------------------------------------

  async requestApproval(input: RequestApprovalInput): Promise<Approval> {
    const ts = this.clock();
    const existing = await this.stores.approvals.list();
    let max = 0;
    const re = new RegExp(`^${input.runId}-ap-(\\d+)$`);
    for (const a of existing) {
      const m = re.exec(a.id);
      if (m?.[1]) {
        const n = Number.parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    const approval: Approval = {
      id: `${input.runId}-ap-${max + 1}`,
      createdAt: ts,
      updatedAt: ts,
      subjectRef: input.subjectRef,
      requestedById: input.requestedById,
      requestedAt: ts,
      status: "ממתין",
      decidedById: null,
      decidedAt: null,
      note: `${APPROVAL_ACTION_LABELS_HE[input.action]} — ${input.previewHe}`,
    };
    const created = await this.stores.approvals.create(approval);
    await appendEvent(this.stores, input.runId, this.clock, input.requestedById, {
      type: "ApprovalRequested",
      approvalId: created.id,
      action: input.action,
      executionPayload: input.executionPayload,
      previewHe: input.previewHe,
    });
    await writeAudit(this.stores, input.runId, this.clock, {
      actor: input.requestedById,
      action: "approval.request",
      entityRef: `approval:${created.id}`,
      detailsHe: `נוצרה בקשת אישור: ${APPROVAL_ACTION_LABELS_HE[input.action]}`,
    });
    // run linkage
    const run = await this.stores.runs.get(input.runId);
    if (run && !run.approvalIds.includes(created.id)) {
      await this.stores.runs.update(input.runId, {
        approvalIds: [...run.approvalIds, created.id],
        updatedAt: ts,
      });
    }
    return created;
  }

  // -------------------------------------------------------------------------
  // decide / expire / cancel
  // -------------------------------------------------------------------------

  async decide(input: DecideInput): Promise<Approval> {
    const approval = await this.requirePending(input.runId, input.approvalId);
    if (input.kind === "reject" && !input.noteHe) {
      throw new AgentGovernanceError("AGENT_APPROVAL_STATE_INVALID", {
        detail: "דחייה מחייבת נימוק (rejectionReason)",
        runId: input.runId,
      });
    }
    if (input.kind === "edit" && !input.editedPayload) {
      throw new AgentGovernanceError("AGENT_APPROVAL_STATE_INVALID", {
        detail: "עריכה מחייבת editedPayload — הנוסח שיבוצע בפועל",
        runId: input.runId,
      });
    }
    const decision: ApprovalDecision =
      input.kind === "approve" ? "approved" : input.kind === "edit" ? "edited" : "rejected";
    const ts = this.clock();
    const status = decision === "rejected" ? "נדחה" : "אושר";
    const noteSuffix = input.noteHe ? ` — ${input.noteHe}` : "";
    const decisionHe =
      decision === "approved" ? "אושר" : decision === "edited" ? "אושר עם עריכה" : "נדחה";
    const updated = await this.stores.approvals.update(input.approvalId, {
      status,
      decidedById: input.decidedById,
      decidedAt: ts,
      note: `${approval.note} | החלטה: ${decisionHe}${noteSuffix}`,
      updatedAt: ts,
    });
    await appendEvent(this.stores, input.runId, this.clock, input.decidedById, {
      type: "ApprovalDecided",
      approvalId: input.approvalId,
      decision,
      decidedById: input.decidedById,
      noteHe: input.noteHe ?? "",
      editedPayload: input.editedPayload ?? null,
    });
    await writeAudit(this.stores, input.runId, this.clock, {
      actor: input.decidedById,
      action: `approval.${decision}`,
      entityRef: `approval:${input.approvalId}`,
      detailsHe: `החלטת אישור: ${decisionHe}${noteSuffix}`,
    });
    // recommendation-only approvals (no payload) and rejections leave nothing
    // to execute — the run may finalize immediately.
    const payload = await this.effectivePayload(input.runId, input.approvalId);
    if (decision === "rejected" || payload === null) {
      await this.finalizeRunIfComplete(input.runId);
    }
    return updated;
  }

  async expire(runId: string, approvalId: string, actorId: string): Promise<Approval> {
    return this.terminate(runId, approvalId, actorId, "expired", "פג תוקף");
  }

  async cancel(runId: string, approvalId: string, actorId: string): Promise<Approval> {
    return this.terminate(runId, approvalId, actorId, "cancelled", "בוטל");
  }

  private async terminate(
    runId: string,
    approvalId: string,
    actorId: string,
    decision: Extract<ApprovalDecision, "expired" | "cancelled">,
    labelHe: string,
  ): Promise<Approval> {
    const approval = await this.requirePending(runId, approvalId);
    const ts = this.clock();
    const updated = await this.stores.approvals.update(approvalId, {
      status: "נדחה",
      decidedById: actorId,
      decidedAt: ts,
      note: `${approval.note} | ${labelHe}`,
      updatedAt: ts,
    });
    await appendEvent(this.stores, runId, this.clock, actorId, {
      type: "ApprovalDecided",
      approvalId,
      decision,
      decidedById: actorId,
      noteHe: labelHe,
      editedPayload: null,
    });
    await writeAudit(this.stores, runId, this.clock, {
      actor: actorId,
      action: `approval.${decision}`,
      entityRef: `approval:${approvalId}`,
      detailsHe: `בקשת האישור ${labelHe}`,
    });
    return updated;
  }

  // -------------------------------------------------------------------------
  // execution — NEVER without an approved/edited approval
  // -------------------------------------------------------------------------

  async execute(runId: string, approvalId: string, executorId: string): Promise<ExecutionResult> {
    const approval = await this.stores.approvals.get(approvalId);
    if (!approval) {
      throw new AgentGovernanceError("AGENT_EXECUTION_WITHOUT_APPROVAL", {
        detail: `אין רשומת אישור "${approvalId}" — הביצוע נחסם`,
        runId,
      });
    }
    const state = await this.workflowState(runId, approvalId);
    if (state === "executed" || state === "rolled-back") {
      throw new AgentGovernanceError("AGENT_APPROVAL_STATE_INVALID", {
        detail: `האישור "${approvalId}" כבר בוצע (מצב: ${state})`,
        runId,
      });
    }
    if (state !== "approved" && state !== "edited" && state !== "execution-failed") {
      throw new AgentGovernanceError("AGENT_EXECUTION_WITHOUT_APPROVAL", {
        detail: `מצב האישור "${approvalId}" הוא "${state}" — ביצוע מותר רק לאחר אישור/עריכה`,
        runId,
      });
    }
    const payload = await this.effectivePayload(runId, approvalId);
    if (!payload) {
      throw new AgentGovernanceError("AGENT_APPROVAL_STATE_INVALID", {
        detail: `לאישור "${approvalId}" אין executionPayload — אין מה לבצע (המלצה בלבד)`,
        runId,
      });
    }
    let result: ExecutionResult;
    try {
      result = await this.runHandler(payload);
    } catch (err) {
      const detailHe = err instanceof Error ? err.message : "שגיאה לא מזוהה";
      result = { outcome: "נכשל", resultRef: null, inverse: null, detailHe };
    }
    await appendEvent(this.stores, runId, this.clock, executorId, {
      type: "ExecutionCompleted",
      approvalId,
      outcome: result.outcome,
      resultRef: result.resultRef,
      inverse: result.inverse,
      detailHe: result.detailHe,
    });
    await writeAudit(this.stores, runId, this.clock, {
      actor: executorId,
      action: result.outcome === "הצלחה" ? "approval.execute" : "approval.execute-failed",
      entityRef: `approval:${approvalId}`,
      detailsHe: result.detailHe,
    });
    if (result.outcome === "הצלחה") {
      await this.finalizeRunIfComplete(runId);
    }
    return result;
  }

  /** Retry an execution whose previous attempt failed (still approved). */
  async retryFailedExecution(
    runId: string,
    approvalId: string,
    executorId: string,
  ): Promise<ExecutionResult> {
    const state = await this.workflowState(runId, approvalId);
    if (state !== "execution-failed") {
      throw new AgentGovernanceError("AGENT_APPROVAL_STATE_INVALID", {
        detail: `retry מותר רק לאחר ביצוע כושל (מצב נוכחי: ${state})`,
        runId,
      });
    }
    return this.execute(runId, approvalId, executorId);
  }

  // -------------------------------------------------------------------------
  // rollback — inverse ops where implemented, honest refusal elsewhere
  // -------------------------------------------------------------------------

  async rollback(runId: string, approvalId: string, actorId: string): Promise<RollbackResult> {
    const events = await this.approvalEvents(runId, approvalId);
    const executions = events.filter((e) => e.type === "ExecutionCompleted");
    const last = executions[executions.length - 1];
    if (!last || last.type !== "ExecutionCompleted" || last.outcome !== "הצלחה") {
      throw new AgentGovernanceError("AGENT_APPROVAL_STATE_INVALID", {
        detail: "אין ביצוע מוצלח להפוך",
        runId,
      });
    }
    if (last.detailHe.startsWith(ROLLBACK_MARKER)) {
      throw new AgentGovernanceError("AGENT_APPROVAL_STATE_INVALID", {
        detail: "כבר בוצע rollback לאישור זה",
        runId,
      });
    }
    const inverse = last.inverse;
    if (!inverse || inverse.kind === "unsupported") {
      throw new AgentGovernanceError("AGENT_ROLLBACK_UNSUPPORTED", {
        detail: inverse?.kind === "unsupported" ? inverse.reasonHe : ROLLBACK_UNSUPPORTED_HE,
        runId,
      });
    }
    let detailHe: string;
    if (inverse.kind === "delete-created") {
      await this.stores.collection(inverse.collection).remove(inverse.recordId);
      detailHe = `${ROLLBACK_MARKER} נמחקה הרשומה ${inverse.recordId} (${inverse.collection}) שנוצרה בביצוע`;
    } else {
      const ts = this.clock();
      await this.stores
        .collection(inverse.collection)
        .update(inverse.recordId, {
          [inverse.field]: inverse.previousValue,
          updatedAt: ts,
        } as Partial<Omit<BaseEntity, "id">>);
      detailHe = `${ROLLBACK_MARKER} הוחזר השדה "${inverse.field}" ברשומה ${inverse.recordId} לערכו הקודם`;
    }
    await appendEvent(this.stores, runId, this.clock, actorId, {
      type: "ExecutionCompleted",
      approvalId,
      outcome: "הצלחה",
      resultRef: null,
      inverse: null,
      detailHe,
    });
    await writeAudit(this.stores, runId, this.clock, {
      actor: actorId,
      action: "approval.rollback",
      entityRef: `approval:${approvalId}`,
      detailsHe: detailHe,
    });
    return { supported: true, detailHe };
  }

  // -------------------------------------------------------------------------
  // derived state
  // -------------------------------------------------------------------------

  async workflowState(runId: string, approvalId: string): Promise<ApprovalWorkflowState> {
    const events = await this.approvalEvents(runId, approvalId);
    let state: ApprovalWorkflowState = "pending";
    for (const e of events) {
      if (e.type === "ApprovalDecided") {
        state = e.decision;
      } else if (e.type === "ExecutionCompleted") {
        if (e.detailHe.startsWith(ROLLBACK_MARKER)) state = "rolled-back";
        else state = e.outcome === "הצלחה" ? "executed" : "execution-failed";
      }
    }
    return state;
  }

  private async approvalEvents(runId: string, approvalId: string) {
    const all = (await this.stores.events.list())
      .filter((r) => r.runId === runId)
      .sort((a, b) => a.seq - b.seq)
      .map((r) => r.event);
    return all.filter(
      (e) =>
        (e.type === "ApprovalRequested" ||
          e.type === "ApprovalDecided" ||
          e.type === "ExecutionCompleted") &&
        e.approvalId === approvalId,
    );
  }

  private async effectivePayload(
    runId: string,
    approvalId: string,
  ): Promise<ExecutionPayload | null> {
    const events = await this.approvalEvents(runId, approvalId);
    let payload: ExecutionPayload | null = null;
    for (const e of events) {
      if (e.type === "ApprovalRequested") payload = e.executionPayload;
      if (e.type === "ApprovalDecided" && e.decision === "edited" && e.editedPayload) {
        payload = e.editedPayload;
      }
    }
    return payload;
  }

  private async requirePending(runId: string, approvalId: string): Promise<Approval> {
    const approval = await this.stores.approvals.get(approvalId);
    if (!approval) {
      throw new AgentGovernanceError("AGENT_RUN_NOT_FOUND", {
        detail: `אישור "${approvalId}" לא נמצא`,
        runId,
      });
    }
    if (approval.status !== "ממתין") {
      throw new AgentGovernanceError("AGENT_APPROVAL_STATE_INVALID", {
        detail: `האישור "${approvalId}" כבר הוכרע (${approval.status})`,
        runId,
      });
    }
    return approval;
  }

  // -------------------------------------------------------------------------
  // handlers
  // -------------------------------------------------------------------------

  private async runHandler(payload: ExecutionPayload): Promise<ExecutionResult> {
    if (payload.kind === "task-creation") {
      const ts = this.clock();
      const record = {
        ...payload.record,
        createdAt: ts,
        updatedAt: ts,
      } as unknown as BaseEntity;
      if (!record.id) {
        throw new AgentGovernanceError("AGENT_INTERNAL_ERROR", {
          detail: "task-creation מחייב id דטרמיניסטי ברשומה",
        });
      }
      await this.stores.collection(payload.collection).create(record);
      return {
        outcome: "הצלחה",
        resultRef: `${payload.collection}:${record.id}`,
        inverse: { kind: "delete-created", collection: payload.collection, recordId: record.id },
        detailHe: `נוצרה משימה ${record.id} באוסף ${payload.collection}`,
      };
    }
    if (payload.kind === "record-field-change") {
      const repo = this.stores.collection(payload.collection);
      const current = await repo.get(payload.recordId);
      if (!current) {
        throw new AgentGovernanceError("AGENT_INTERNAL_ERROR", {
          detail: `רשומה ${payload.recordId} לא נמצאה באוסף ${payload.collection}`,
        });
      }
      const previousValue = (current as unknown as Record<string, FieldValue>)[payload.field] ?? null;
      const ts = this.clock();
      await repo.update(payload.recordId, {
        [payload.field]: payload.newValue,
        updatedAt: ts,
      } as Partial<Omit<BaseEntity, "id">>);
      return {
        outcome: "הצלחה",
        resultRef: `${payload.collection}:${payload.recordId}`,
        inverse: {
          kind: "restore-field",
          collection: payload.collection,
          recordId: payload.recordId,
          field: payload.field,
          previousValue,
        },
        detailHe: `עודכן השדה "${payload.field}" ברשומה ${payload.recordId}`,
      };
    }
    // external — injected handler required; rollback honestly unsupported
    const handler = this.externalHandlers[payload.action];
    if (!handler) {
      throw new AgentGovernanceError("AGENT_INTERNAL_ERROR", {
        detail: `לא הוזרק handler לפעולה חיצונית "${payload.action}" — הביצוע נחסם (אין הצלחה מזויפת)`,
      });
    }
    const outcome = await handler(payload);
    return {
      outcome: "הצלחה",
      resultRef: outcome.resultRef,
      inverse: { kind: "unsupported", reasonHe: ROLLBACK_UNSUPPORTED_HE },
      detailHe: outcome.detailHe,
    };
  }

  // -------------------------------------------------------------------------
  // run finalization
  // -------------------------------------------------------------------------

  /**
   * Complete a run that was waiting on approvals once none remain pending.
   * Emits AgentRunCompleted — the terminal event of a successful run.
   */
  async finalizeRunIfComplete(runId: string): Promise<AgentRun | null> {
    const run = await this.stores.runs.get(runId);
    if (!run || run.status !== "ממתין לאישור") return run ?? null;
    const approvals = await Promise.all(run.approvalIds.map((id) => this.stores.approvals.get(id)));
    const stillPending = approvals.some((a) => a?.status === "ממתין");
    if (stillPending) return run;
    const ts = this.clock();
    const updated = await this.stores.runs.update(runId, {
      status: "הושלם",
      endedAt: ts,
      updatedAt: ts,
    });
    const events = (await this.stores.events.list()).filter((e) => e.runId === runId);
    const envelopeIds: string[] = [];
    for (const e of events) {
      if (e.event.type === "SpecialistTaskCompleted") envelopeIds.push(e.event.envelope.id);
    }
    await appendEvent(this.stores, runId, this.clock, "system", {
      type: "AgentRunCompleted",
      status: "הושלם",
      envelopeIds,
    });
    await writeAudit(this.stores, runId, this.clock, {
      actor: "system",
      action: "run.complete",
      entityRef: `agent-run:${runId}`,
      detailsHe: "הריצה הושלמה לאחר הכרעת כל האישורים",
    });
    return updated;
  }
}
