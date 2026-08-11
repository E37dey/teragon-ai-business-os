// S17 Phase 7 — Business Operations Command Center: the deterministic BusinessSignal model.
//
// A BusinessSignal is a REAL, deterministically-derived condition from existing TERAGON state —
// never fabricated urgency, risk, or activity. Phase 7 surfaces the AI-OPERATIONS layer (Phase-5
// workflows, Phase-6 governed proposals/actions, and live Obsidian connectivity) that is not
// otherwise on the Command Center. Business/CRM attention (leads, tickets, approvals) and pending
// memory proposals already have their own persistent surfaces and are intentionally NOT duplicated
// here (see deferred note below).
//
// PERSISTENCE TRUTH: workflow/proposal/action signals derive from the Phase-5 event log, which is
// RUNTIME-ONLY (in-memory, bounded to the last ~20 runs, wiped on reload). This is a live
// current-session view, NOT a persistent historical daily report. Obsidian connectivity is
// LIVE-derived. Nothing here is persisted or fabricated.
import type { WorkflowEvent, WorkflowEventType } from "@/agents/workflow/workflowEvents";

export type BusinessSignalType =
  | "workflow_waiting_for_user"
  | "workflow_failed"
  | "proposal_pending"
  | "proposal_conflict"
  | "action_verified"
  | "obsidian_unavailable";

/** Reuses the product-wide NotificationSeverity vocabulary + its canonical sort order. */
export type SignalPriority = "דחוף" | "אזהרה" | "מידע";
const PRIORITY_ORDER: Record<SignalPriority, number> = { דחוף: 0, אזהרה: 1, מידע: 2 };

/** actionable = belongs in the Action Inbox (a human decision/step is valid). info = recent activity. */
export type SignalStatus = "actionable" | "info";

export interface BusinessSignal {
  readonly id: string; // deterministic: `sig-${type}-${sourceId}`
  readonly type: BusinessSignalType;
  readonly sourceType: "workflow" | "proposal" | "obsidian";
  readonly sourceId: string; // workflowRunId, or "obsidian"
  readonly titleHe: string;
  readonly detailHe: string; // "why am I seeing this?" — deterministic provenance, never chain-of-thought
  readonly status: SignalStatus;
  readonly priority: SignalPriority;
  readonly at: number; // timestamp of the driving event
  readonly workflowRunId?: string;
  readonly proposalId?: string;
  readonly agentId?: string;
  readonly notePath?: string;
  readonly recommendedNextStepHe: string; // the exact next human action / CTA label
  readonly deepLink: string; // route that opens the real deep context
}

const META: Record<BusinessSignalType, { titleHe: string; priority: SignalPriority; status: SignalStatus; ctaHe: string }> = {
  workflow_failed: { titleHe: "תהליך נכשל", priority: "דחוף", status: "actionable", ctaHe: "התחבר מחדש ונסה שוב" },
  proposal_conflict: { titleHe: "התנגשות בהצעה", priority: "דחוף", status: "actionable", ctaHe: "בדוק שינוי וצור הצעה חדשה" },
  obsidian_unavailable: { titleHe: "Obsidian אינו מחובר", priority: "דחוף", status: "actionable", ctaHe: "התחבר מחדש" },
  proposal_pending: { titleHe: "הצעה ממתינה לאישור", priority: "אזהרה", status: "actionable", ctaHe: "בדוק הצעה" },
  workflow_waiting_for_user: { titleHe: "תהליך ממתין להחלטה", priority: "אזהרה", status: "actionable", ctaHe: "פתח תהליך" },
  action_verified: { titleHe: "פעולה בוצעה ואומתה", priority: "מידע", status: "info", ctaHe: "" },
};

/** The dominant condition for a single workflow run, from the presence of its canonical events.
 *  A run is append-only and has at most one governed-action outcome, so presence checks are
 *  deterministic. Returns null when the run needs no signal (e.g. accepted read-only recommendation). */
function classifyRun(types: ReadonlySet<WorkflowEventType>): BusinessSignalType | null {
  const has = (t: WorkflowEventType): boolean => types.has(t);
  if (has("ACTION_VERIFIED")) return "action_verified";
  if (has("ACTION_CONFLICT")) return "proposal_conflict";
  if (has("PROPOSAL_REVIEW_REQUIRED") && !has("PROPOSAL_APPROVED") && !has("PROPOSAL_REJECTED") && !has("ACTION_FAILED")) return "proposal_pending";
  if (has("WORKFLOW_FAILED")) return "workflow_failed";
  if (has("USER_DECISION_REQUIRED") && !has("WORKFLOW_COMPLETED") && !has("WORKFLOW_CANCELLED") && !has("PROPOSAL_CREATED")) return "workflow_waiting_for_user";
  return null;
}

export interface DeriveSignalsInput {
  readonly events: readonly WorkflowEvent[];
  /** live Obsidian connectivity (null when unknown/never checked — no signal is invented). */
  readonly obsidian: { readonly connected: boolean } | null;
  readonly now: number;
}

function last<T>(arr: readonly T[], pred: (x: T) => boolean): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i]!)) return arr[i];
  return undefined;
}

/**
 * Derive the current, deduplicated set of BusinessSignals from REAL state. One signal per workflow
 * run (its dominant condition) + at most one system-wide Obsidian signal. Pure + deterministic:
 * same events + connectivity + now ⇒ same signals. Sorted by priority then recency.
 */
export function deriveBusinessSignals(input: DeriveSignalsInput): BusinessSignal[] {
  const byRun = new Map<string, WorkflowEvent[]>();
  for (const e of input.events) {
    const arr = byRun.get(e.workflowRunId) ?? [];
    arr.push(e);
    byRun.set(e.workflowRunId, arr);
  }

  const signals: BusinessSignal[] = [];
  for (const [runId, evs] of byRun) {
    const types = new Set(evs.map((e) => e.type));
    const type = classifyRun(types);
    if (!type) continue;
    const meta = META[type];
    // real provenance pulled from the run's actual events (metadata only — never a body/secret)
    const readEv = last(evs, (e) => e.type === "VAULT_NOTE_READ");
    const proposalEv = last(evs, (e) => !!e.proposalId);
    const failEv = last(evs, (e) => e.type === "WORKFLOW_FAILED" || e.type === "ACTION_FAILED");
    const drivingEv = evs[evs.length - 1]!;
    signals.push({
      id: `sig-${type}-${runId}`,
      type,
      sourceType: type.startsWith("proposal") ? "proposal" : "workflow",
      sourceId: runId,
      titleHe: meta.titleHe,
      detailHe: buildWhyHe(type, runId, { failDetail: failEv?.detailHe, notePath: readEv?.notePath, proposalId: proposalEv?.proposalId }),
      status: meta.status,
      priority: meta.priority,
      at: drivingEv.at,
      workflowRunId: runId,
      proposalId: proposalEv?.proposalId,
      agentId: last(evs, (e) => !!e.actorAgentId)?.actorAgentId,
      notePath: readEv?.notePath,
      recommendedNextStepHe: meta.ctaHe,
      deepLink: `/ai-workspace?run=${encodeURIComponent(runId)}`,
    });
  }

  // System-wide Obsidian connectivity — only when we actually know it is disconnected.
  if (input.obsidian && input.obsidian.connected === false) {
    const meta = META.obsidian_unavailable;
    signals.push({
      id: "sig-obsidian_unavailable-obsidian",
      type: "obsidian_unavailable",
      sourceType: "obsidian",
      sourceId: "obsidian",
      titleHe: meta.titleHe,
      detailHe: "החיבור ל-Obsidian אינו פעיל — תהליכי ידע חיים אינם זמינים עד לחיבור מחדש.",
      status: meta.status,
      priority: meta.priority,
      at: input.now,
      recommendedNextStepHe: meta.ctaHe,
      deepLink: "/memory",
    });
  }

  return signals.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.at - a.at || a.id.localeCompare(b.id));
}

function buildWhyHe(type: BusinessSignalType, runId: string, ctx: { failDetail?: string; notePath?: string; proposalId?: string }): string {
  switch (type) {
    case "workflow_failed":
      return `התהליך ${runId} נעצר: ${ctx.failDetail ?? "כשל תלות חיצונית"}.`;
    case "proposal_conflict":
      return `ההצעה ${ctx.proposalId ?? runId} נחסמה — הקובץ השתנה מאז ההצעה; נדרשת סקירה מחדש.`;
    case "proposal_pending":
      return `ההצעה ${ctx.proposalId ?? runId} ממתינה לאישור אנושי (מבוססת על ${ctx.notePath ?? "מקור ידע"}).`;
    case "workflow_waiting_for_user":
      return `התהליך ${runId} הפיק המלצה וממתין להחלטתך (מבוסס על ${ctx.notePath ?? "מקור ידע"}).`;
    case "action_verified":
      return `פעולה מתוך התהליך ${runId} בוצעה ואומתה בקריאה חוזרת.`;
    default:
      return "";
  }
}

/** Deterministic counts, computed from the SAME signals shown to the user (no count/card drift). */
export interface SignalCounts {
  readonly awaitingDecision: number; // ממתין להחלטה
  readonly failed: number; // נכשל
  readonly recentlyCompleted: number; // הושלם לאחרונה
  readonly needsReconnect: number; // דורש חיבור מחדש
}

export function countSignals(signals: readonly BusinessSignal[]): SignalCounts {
  return {
    awaitingDecision: signals.filter((s) => s.type === "workflow_waiting_for_user" || s.type === "proposal_pending").length,
    failed: signals.filter((s) => s.type === "workflow_failed" || s.type === "proposal_conflict").length,
    recentlyCompleted: signals.filter((s) => s.type === "action_verified").length,
    needsReconnect: signals.filter((s) => s.type === "obsidian_unavailable").length,
  };
}

export function actionableSignals(signals: readonly BusinessSignal[]): BusinessSignal[] {
  return signals.filter((s) => s.status === "actionable");
}

export function infoSignals(signals: readonly BusinessSignal[]): BusinessSignal[] {
  return signals.filter((s) => s.status === "info");
}
