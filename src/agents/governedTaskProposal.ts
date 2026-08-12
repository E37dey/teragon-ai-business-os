// Phase 9 — Governed Follow-up Task (משימת מעקב מבוקרת).
//
// A thin TRUSTED wrapper over the canonical ApprovalEngine that turns a REAL
// Phase-7 BusinessSignal into a human-approved, verified, persisted follow-up
// Task — and NOTHING else. It introduces no new canonical Agent action and no
// new approval-action type: it reuses the first-class `task-creation`
// ExecutionPayload kind. Governed Task Creation is a trusted SYSTEM capability,
// executed only after explicit human approval.
//
// Security invariants enforced here:
//  - AUTHORITY comes from trusted app/session context, NEVER from signal/Vault
//    text: the Task `id`, `ownerId`, `status`, collection and approval kind are
//    all set by trusted logic. Only `title`/`description` (display strings) are
//    derived from the signal (as untrusted DATA).
//  - ALLOWLIST: exactly the fields below may be written to the Task. No payload
//    spread, no caller-chosen handler, no caller-chosen owner/org.
//  - IDEMPOTENCY: the Task `id` is deterministic from trusted inputs, so a
//    replay hits DuplicateIdError and is reported truthfully as already-created
//    (never a second creation, never a fake success).
//  - VERIFICATION: an execution is VERIFIED only after the created Task is
//    re-read and its trusted fields match — never because create() returned.
//  - CREATE-ONLY: the originating CRM record is never mutated (no stale-write).
import type { BusinessSignal, SignalPriority } from "@/integration/command-center/businessSignals";
import type { ISODate, Task, TaskStatus } from "@/domain/types";
import type { TicketPriority } from "@/domain/types";
import type { ExecutionPayload, ApprovalRequiredAction } from "@/domain/agents";
import type { AgentStores } from "@/repositories/agentStores";
import type { ApprovalEngine } from "@/agents";
import { sha256Hex } from "@/governance/checksum";
import { writeAudit, type Clock } from "./runlog";

const TASK_COLLECTION = "tasks" as const;
// The follow-up task is executed via the first-class `task-creation` payload kind.
// The approval-record's action label reuses the existing "external-automation"
// category (the ApprovalRequiredAction registry stays frozen at 12 — no new action);
// the human-facing preview states plainly that ONE follow-up Task will be created.
const APPROVAL_ACTION: ApprovalRequiredAction = "external-automation";
const DEFAULT_INTENT = "follow-up";
const DUE_OFFSET_MS = 3 * 24 * 60 * 60 * 1000; // 3 days — trusted, deterministic offset

/** The EXACT set of Task fields this capability may propose. Deny-by-default. */
export const ALLOWED_TASK_FIELDS = Object.freeze(["id", "title", "description", "status", "priority", "due", "ownerId", "relatedRef", "sourceRecommendationId"] as const);

export interface GovernedTaskDeps {
  readonly stores: AgentStores;
  readonly approvalEngine: ApprovalEngine;
  readonly clock?: Clock;
}

/** A deterministic, side-effect-FREE follow-up recommendation. Recommendation ≠ proposal. */
export interface FollowUpRecommendation {
  readonly taskId: string; // deterministic from trusted inputs
  readonly recommendationId: string; // deterministic lineage id
  readonly signalId: string;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly priority: TicketPriority;
  readonly due: ISODate;
  readonly ownerId: string; // trusted session actor — never from the signal
  readonly relatedRef: string | null;
  readonly previewHe: string;
}

export interface FollowUpProposalRef {
  readonly runId: string;
  readonly approvalId: string;
  readonly recommendation: FollowUpRecommendation;
}

export type FollowUpOutcome = "created-verified" | "already-exists" | "rejected" | "failed";
export interface FollowUpResult {
  readonly outcome: FollowUpOutcome;
  readonly taskId: string;
  readonly detailHe: string;
}

function priorityFromSignal(p: SignalPriority): TicketPriority {
  return p === "דחוף" ? "גבוהה" : p === "אזהרה" ? "בינונית" : "נמוכה";
}

function relatedRefFromSignal(signal: BusinessSignal): string | null {
  if (signal.workflowRunId) return `workflow:${signal.workflowRunId}`;
  if (signal.proposalId) return `proposal:${signal.proposalId}`;
  return null;
}

// Deterministic identity: same trusted (actor, signal, intent) ⇒ same ids ⇒ idempotent.
// The id deliberately EXCLUDES display strings and the due date, so re-deriving the
// same logical intent always yields the same Task id (DuplicateIdError on replay).
function deterministic(prefix: string, actorId: string, signalId: string, intent: string): string {
  return `${prefix}-${sha256Hex(`${actorId}\n${signalId}\n${intent}`).slice(0, 16)}`;
}

/**
 * Derive the follow-up recommendation for a REAL business signal. Pure + deterministic
 * (no persistence, no approval) — this is a recommendation, not a proposal. The trusted
 * actor id MUST come from the session, never from the signal.
 */
export function deriveFollowUpRecommendation(signal: BusinessSignal, trustedActorId: string, opts: { intent?: string; clock?: Clock } = {}): FollowUpRecommendation {
  const intent = opts.intent ?? DEFAULT_INTENT;
  const clock = opts.clock ?? (() => new Date().toISOString());
  const taskId = deterministic("task-flw", trustedActorId, signal.id, intent);
  const recommendationId = deterministic("rec-flw", trustedActorId, signal.id, intent);
  const nowMs = Date.parse(clock());
  const due = new Date((Number.isNaN(nowMs) ? Date.now() : nowMs) + DUE_OFFSET_MS).toISOString();
  const title = `מעקב: ${signal.titleHe}`;
  const description = `${signal.detailHe}\n\nהמלצת מעקב שנגזרה דטרמיניסטית מאות עסקי (${signal.type}). מקור: ${signal.sourceType}:${signal.sourceId}.`;
  return {
    taskId,
    recommendationId,
    signalId: signal.id,
    title,
    description,
    status: "פתוחה",
    priority: priorityFromSignal(signal.priority),
    due,
    ownerId: trustedActorId,
    relatedRef: relatedRefFromSignal(signal),
    previewHe: `יצירת משימת מעקב מבוקרת אחת: "${title}". תיווצר משימה חדשה בלבד — רשומת המקור אינה משתנה.`,
  };
}

/** Build the allowlisted Task record. NOTHING outside ALLOWED_TASK_FIELDS is written. */
function buildAllowedRecord(rec: FollowUpRecommendation): Record<string, string | null> {
  return {
    id: rec.taskId,
    title: rec.title,
    description: rec.description,
    status: rec.status,
    priority: rec.priority,
    due: rec.due,
    ownerId: rec.ownerId,
    relatedRef: rec.relatedRef,
    sourceRecommendationId: rec.recommendationId,
  };
}

function newRunId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `gft-${uuid ?? sha256Hex(String(performanceNowSafe())).slice(0, 24)}`;
}
function performanceNowSafe(): number {
  try {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  } catch {
    return Date.now();
  }
}

/**
 * EXPLICIT proposal creation (recommendation → proposal). Creates ONE ApprovalEngine
 * approval carrying the allowlisted `task-creation` payload. No task is created yet.
 * Must be called explicitly by a human action — never automatically from a signal.
 */
export async function createFollowUpTaskProposal(deps: GovernedTaskDeps, rec: FollowUpRecommendation, trustedActorId: string): Promise<FollowUpProposalRef> {
  const runId = newRunId();
  const record = buildAllowedRecord(rec);
  const executionPayload: ExecutionPayload = { kind: "task-creation", collection: TASK_COLLECTION, record };
  const approval = await deps.approvalEngine.requestApproval({
    runId,
    subjectRef: rec.signalId,
    action: APPROVAL_ACTION,
    requestedById: trustedActorId, // trusted session actor, never the signal
    executionPayload,
    previewHe: rec.previewHe,
  });
  return { runId, approvalId: approval.id, recommendation: rec };
}

/** Reject a proposal — zero Task created; the rejection is recorded by the engine. */
export async function rejectFollowUpTaskProposal(deps: GovernedTaskDeps, ref: FollowUpProposalRef, trustedActorId: string, noteHe: string): Promise<void> {
  await deps.approvalEngine.decide({ runId: ref.runId, approvalId: ref.approvalId, kind: "reject", decidedById: trustedActorId, noteHe });
}

/**
 * Approve → execute (existing task-creation handler) → READ-BACK VERIFY. Verified only
 * after the created Task is re-read and its trusted fields match. A deterministic-id
 * clash (a second proposal for the same logical intent) is reported truthfully as
 * already-exists, never as a second creation.
 */
export async function approveAndExecuteFollowUpTask(deps: GovernedTaskDeps, ref: FollowUpProposalRef, trustedActorId: string): Promise<FollowUpResult> {
  const { approvalEngine, stores } = deps;
  const clock = deps.clock ?? (() => new Date().toISOString());
  const taskId = ref.recommendation.taskId;

  await approvalEngine.decide({ runId: ref.runId, approvalId: ref.approvalId, kind: "approve", decidedById: trustedActorId });
  const result = await approvalEngine.execute(ref.runId, ref.approvalId, trustedActorId);

  const tasks = stores.collection<Task>(TASK_COLLECTION);
  if (result.outcome === "נכשל") {
    // A create failure on a deterministic id is idempotency working: if the task already
    // exists (from an earlier approved intent) report already-exists truthfully.
    const existing = await tasks.get(taskId);
    if (existing) return { outcome: "already-exists", taskId, detailHe: `משימת מעקב עם המזהה ${taskId} כבר קיימת — לא נוצרה כפילות` };
    return { outcome: "failed", taskId, detailHe: result.detailHe };
  }

  // READ-BACK VERIFICATION (mandatory): re-read the exact Task and check trusted fields.
  const task = await tasks.get(taskId);
  const rec = ref.recommendation;
  const verified =
    !!task &&
    task.id === taskId &&
    task.ownerId === trustedActorId &&
    task.title === rec.title &&
    task.status === rec.status &&
    task.sourceRecommendationId === rec.recommendationId;
  if (!verified) {
    return { outcome: "failed", taskId, detailHe: `הכתיבה לא אומתה בקריאה חוזרת — המשימה ${taskId} אינה תואמת את ההצעה המאושרת` };
  }
  await writeAudit(stores, ref.runId, clock, {
    actor: trustedActorId,
    action: "task.verified",
    entityRef: `${TASK_COLLECTION}:${taskId}`,
    detailsHe: `משימת המעקב ${taskId} נוצרה ואומתה בקריאה חוזרת (בעלים: ${trustedActorId}, מקור: ${rec.signalId})`,
  });
  return { outcome: "created-verified", taskId, detailHe: `נוצרה משימת מעקב ${taskId} ואומתה` };
}
