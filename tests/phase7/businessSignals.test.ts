// S17 Phase 7 — BusinessSignal derivation: only REAL state produces signals; deterministic ids +
// dedup + priority; counts equal the displayed items; actionable vs info classification.
import { describe, expect, it } from "vitest";
import {
  actionableSignals,
  countSignals,
  deriveBusinessSignals,
  infoSignals,
} from "@/integration/command-center/businessSignals";
import type { WorkflowEvent, WorkflowEventType } from "@/agents/workflow/workflowEvents";

let seq = 0;
const ev = (runId: string, type: WorkflowEventType, extra: Partial<WorkflowEvent> = {}): WorkflowEvent => ({
  id: `e${seq++}`, workflowRunId: runId, type, at: extra.at ?? 1000 + seq, detailHe: extra.detailHe ?? "", success: extra.success ?? true, ...extra,
});

// canonical event runs
const waitingRun = (id: string): WorkflowEvent[] => [
  ev(id, "WORKFLOW_STARTED"), ev(id, "AGENT_STARTED", { actorAgentId: "ag-wiki" }),
  ev(id, "VAULT_NOTE_READ", { actorAgentId: "ag-wiki", notePath: "AI Operations.md" }),
  ev(id, "RESULT_CREATED", { actorAgentId: "ag-orchestrator" }), ev(id, "USER_DECISION_REQUIRED"),
];
const failedRun = (id: string): WorkflowEvent[] => [
  ev(id, "WORKFLOW_STARTED"), ev(id, "VAULT_SEARCH_STARTED", { actorAgentId: "ag-wiki" }),
  ev(id, "VAULT_UNAVAILABLE", { success: false }), ev(id, "WORKFLOW_FAILED", { success: false, detailHe: "Obsidian אינו זמין" }),
];
const proposalPendingRun = (id: string): WorkflowEvent[] => [
  ...waitingRun(id), ev(id, "PROPOSAL_CREATED", { proposalId: "owp-1", notePath: "AI Operations.md" }), ev(id, "PROPOSAL_REVIEW_REQUIRED", { proposalId: "owp-1" }),
];
const conflictRun = (id: string): WorkflowEvent[] => [
  ...proposalPendingRun(id), ev(id, "PROPOSAL_APPROVED", { proposalId: "owp-1" }), ev(id, "ACTION_STAGED", { proposalId: "owp-1" }),
  ev(id, "NATIVE_CONFIRMATION_REQUIRED", { proposalId: "owp-1" }), ev(id, "ACTION_CONFLICT", { proposalId: "owp-1", success: false }),
];
const verifiedRun = (id: string): WorkflowEvent[] => [
  ...proposalPendingRun(id), ev(id, "PROPOSAL_APPROVED", { proposalId: "owp-1" }), ev(id, "ACTION_STAGED"),
  ev(id, "NATIVE_CONFIRMATION_REQUIRED"), ev(id, "ACTION_EXECUTED", { proposalId: "owp-1" }), ev(id, "ACTION_VERIFIED", { proposalId: "owp-1" }),
];
const acceptedRun = (id: string): WorkflowEvent[] => [...waitingRun(id), ev(id, "USER_CONTINUED"), ev(id, "WORKFLOW_COMPLETED")];

describe("Phase 7 — deriveBusinessSignals (real state only)", () => {
  it("no events + unknown connectivity ⇒ NO signals (honest empty)", () => {
    expect(deriveBusinessSignals({ events: [], obsidian: null, now: 5000 })).toEqual([]);
  });

  it("a run at the human gate ⇒ one actionable workflow_waiting_for_user with real provenance + deep link", () => {
    const s = deriveBusinessSignals({ events: waitingRun("wf-1"), obsidian: { connected: true }, now: 5000 });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ id: "sig-workflow_waiting_for_user-wf-1", type: "workflow_waiting_for_user", status: "actionable", priority: "אזהרה", workflowRunId: "wf-1", notePath: "AI Operations.md", deepLink: "/ai-workspace?run=wf-1" });
    expect(s[0]!.recommendedNextStepHe).toBe("פתח תהליך");
  });

  it("a failed run ⇒ actionable workflow_failed (דחוף) carrying the real failure reason", () => {
    const s = deriveBusinessSignals({ events: failedRun("wf-2"), obsidian: { connected: true }, now: 5000 });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ type: "workflow_failed", priority: "דחוף", status: "actionable" });
    expect(s[0]!.detailHe).toContain("Obsidian אינו זמין");
  });

  it("proposal pending ⇒ proposal_pending (not workflow_waiting) — the dominant state wins (dedup)", () => {
    const s = deriveBusinessSignals({ events: proposalPendingRun("wf-3"), obsidian: { connected: true }, now: 5000 });
    expect(s.map((x) => x.type)).toEqual(["proposal_pending"]); // exactly one signal per run
    expect(s[0]).toMatchObject({ sourceType: "proposal", proposalId: "owp-1", recommendedNextStepHe: "בדוק הצעה" });
  });

  it("conflict ⇒ proposal_conflict (דחוף), never proposal_pending", () => {
    const s = deriveBusinessSignals({ events: conflictRun("wf-4"), obsidian: { connected: true }, now: 5000 });
    expect(s.map((x) => x.type)).toEqual(["proposal_conflict"]);
    expect(s[0]!.priority).toBe("דחוף");
  });

  it("verified action ⇒ INFO recent activity, NOT actionable (belongs in recent activity, not the inbox)", () => {
    const s = deriveBusinessSignals({ events: verifiedRun("wf-5"), obsidian: { connected: true }, now: 5000 });
    expect(s.map((x) => x.type)).toEqual(["action_verified"]);
    expect(s[0]!.status).toBe("info");
    expect(actionableSignals(s)).toHaveLength(0);
    expect(infoSignals(s)).toHaveLength(1);
  });

  it("an accepted read-only recommendation (no write) ⇒ NO signal (resolved, nothing to fabricate)", () => {
    expect(deriveBusinessSignals({ events: acceptedRun("wf-6"), obsidian: { connected: true }, now: 5000 })).toEqual([]);
  });

  it("obsidian disconnected ⇒ one system signal; null connectivity ⇒ none (no invented signal)", () => {
    expect(deriveBusinessSignals({ events: [], obsidian: { connected: false }, now: 5000 }).map((s) => s.type)).toEqual(["obsidian_unavailable"]);
    expect(deriveBusinessSignals({ events: [], obsidian: null, now: 5000 })).toEqual([]);
    expect(deriveBusinessSignals({ events: [], obsidian: { connected: true }, now: 5000 })).toEqual([]);
  });

  it("deterministic + deduped: one signal per run, sorted by priority; ids stable across calls", () => {
    const events = [...failedRun("wf-a"), ...waitingRun("wf-b"), ...verifiedRun("wf-c")];
    const a = deriveBusinessSignals({ events, obsidian: { connected: false }, now: 5000 });
    const b = deriveBusinessSignals({ events, obsidian: { connected: false }, now: 5000 });
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id)); // deterministic
    // 3 runs + obsidian = 4 signals, one per source, sorted דחוף first
    expect(a).toHaveLength(4);
    expect(a[0]!.priority).toBe("דחוף");
    expect(new Set(a.map((s) => s.sourceId)).size).toBe(4); // no duplicate source
  });

  it("counts equal the displayed underlying items (no drift)", () => {
    const events = [...waitingRun("w1"), ...proposalPendingRun("p1"), ...failedRun("f1"), ...conflictRun("c1"), ...verifiedRun("v1")];
    const signals = deriveBusinessSignals({ events, obsidian: { connected: false }, now: 5000 });
    const counts = countSignals(signals);
    expect(counts.awaitingDecision).toBe(signals.filter((s) => s.type === "workflow_waiting_for_user" || s.type === "proposal_pending").length);
    expect(counts.awaitingDecision).toBe(2); // w1 + p1
    expect(counts.failed).toBe(2); // f1 + c1
    expect(counts.recentlyCompleted).toBe(1); // v1
    expect(counts.needsReconnect).toBe(1); // obsidian
    // the inbox (actionable) excludes the verified info item
    expect(actionableSignals(signals)).toHaveLength(signals.length - 1);
  });
});
