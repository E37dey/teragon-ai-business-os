// S17 Phase 7 — the Operations Brief + Action Inbox UI is driven by REAL recorded workflow events
// only: honest empty state, actionable inbox items, counts that match, verified action in recent
// activity (not the inbox), and the runtime-only persistence-truth footnote.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/integration/obsidian/obsidianCredential", async (o) => ({
  ...(await o<typeof import("@/integration/obsidian/obsidianCredential")>()),
  getObsidianToken: vi.fn(() => null), // unpaired → no network, no invented obsidian signal
}));

import { OperationsBrief } from "@/modules/command-center/OperationsBrief";
import { recordWorkflowEvent, __resetWorkflowEventsForTests, type WorkflowEventType } from "@/agents/workflow/workflowEvents";

let seq = 0;
const rec = (runId: string, type: WorkflowEventType, extra: Record<string, unknown> = {}) =>
  recordWorkflowEvent({ id: `e${seq++}`, workflowRunId: runId, type, at: 1000 + seq, detailHe: (extra.detailHe as string) ?? "", success: (extra.success as boolean) ?? true, ...extra });

function waiting(id: string) {
  rec(id, "WORKFLOW_STARTED"); rec(id, "AGENT_STARTED", { actorAgentId: "ag-wiki" });
  rec(id, "VAULT_NOTE_READ", { actorAgentId: "ag-wiki", notePath: "AI Operations.md" });
  rec(id, "RESULT_CREATED", { actorAgentId: "ag-orchestrator" }); rec(id, "USER_DECISION_REQUIRED");
}
function verified(id: string) {
  waiting(id); rec(id, "PROPOSAL_CREATED", { proposalId: "owp-9" }); rec(id, "PROPOSAL_REVIEW_REQUIRED", { proposalId: "owp-9" });
  rec(id, "PROPOSAL_APPROVED"); rec(id, "ACTION_STAGED"); rec(id, "NATIVE_CONFIRMATION_REQUIRED");
  rec(id, "ACTION_EXECUTED", { proposalId: "owp-9" }); rec(id, "ACTION_VERIFIED", { proposalId: "owp-9" });
}
const wrap = () => render(<MemoryRouter><OperationsBrief /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  __resetWorkflowEventsForTests();
});
afterEach(() => {
  cleanup();
  __resetWorkflowEventsForTests();
});

describe("OperationsBrief", () => {
  it("honest empty state when there are no real signals", () => {
    wrap();
    expect(screen.getByTestId("action-inbox").textContent).toContain("אין כרגע פריטים הדורשים החלטה");
    expect(screen.getByTestId("recent-activity").textContent).toContain("אין פעילות מאומתת");
    // runtime-only persistence truth is stated
    expect(screen.getByTestId("operations-brief").textContent).toContain("תצוגה חיה של ההפעלה הנוכחית");
    // a11y: an empty inbox must NOT render a childless role="list" (aria-required-children)
    expect(screen.getByTestId("action-inbox").querySelector('[role="list"]')).toBeNull();
  });

  it("a waiting-for-user run appears as ONE actionable inbox item with its CTA + real run id", () => {
    waiting("wf-77");
    wrap();
    const items = screen.getAllByTestId("inbox-item");
    expect(items).toHaveLength(1);
    expect(items[0]!.getAttribute("data-type")).toBe("workflow_waiting_for_user");
    expect(items[0]!.textContent).toContain("wf-77");
    expect(screen.getByTestId("inbox-cta").textContent).toContain("פתח תהליך");
    // count matches
    expect(screen.getByTestId("count-awaiting").textContent).toContain("1");
  });

  it("a verified action shows in RECENT ACTIVITY, not the Action Inbox", () => {
    verified("wf-88");
    wrap();
    expect(screen.queryByTestId("inbox-item")).toBeNull(); // not actionable
    expect(screen.getByTestId("action-inbox").textContent).toContain("אין כרגע פריטים הדורשים החלטה");
    expect(screen.getAllByTestId("recent-item")).toHaveLength(1);
    expect(screen.getByTestId("count-completed").textContent).toContain("1");
  });

  it("filtering by 'failed' hides awaiting items and shows only failures", () => {
    waiting("wf-a");
    rec("wf-b", "WORKFLOW_STARTED"); rec("wf-b", "VAULT_UNAVAILABLE", { success: false }); rec("wf-b", "WORKFLOW_FAILED", { success: false, detailHe: "Obsidian אינו זמין" });
    wrap();
    expect(screen.getAllByTestId("inbox-item")).toHaveLength(2);
    fireEvent.click(screen.getByTestId("count-failed"));
    const after = screen.getAllByTestId("inbox-item");
    expect(after).toHaveLength(1);
    expect(after[0]!.getAttribute("data-type")).toBe("workflow_failed");
  });
});
