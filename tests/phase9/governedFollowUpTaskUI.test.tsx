// Phase 9 — Governed Follow-up Task UI: the modal flow (recommendation → explicit proposal
// → approve/verify or reject) against the REAL ApprovalEngine, and the Command Center CTA wiring.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/design-system";
import type { BusinessSignal } from "@/integration/command-center/businessSignals";
import type { Task } from "@/domain/types";

const SIGNAL: BusinessSignal = {
  id: "sig-workflow_failed-wf-9",
  type: "workflow_failed",
  sourceType: "workflow",
  sourceId: "wf-9",
  titleHe: "תהליך נכשל",
  detailHe: "התהליך wf-9 נכשל ודורש מעקב.",
  status: "actionable",
  priority: "דחוף",
  at: 1_700_000_000_000,
  workflowRunId: "wf-9",
  recommendedNextStepHe: "התחבר מחדש ונסה שוב",
  deepLink: "/ai-workspace?run=wf-9",
};

// Command Center derives signals from real workflow events; force one actionable signal.
vi.mock("@/integration/command-center/businessSignals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/integration/command-center/businessSignals")>();
  return {
    ...actual,
    deriveBusinessSignals: vi.fn(() => [SIGNAL]),
    actionableSignals: vi.fn(() => [SIGNAL]),
    infoSignals: vi.fn(() => []),
    countSignals: vi.fn(() => ({ awaitingDecision: 0, failed: 1, recentlyCompleted: 0, needsReconnect: 0 })),
  };
});

import { __resetRepositoriesForTests } from "@/repositories";
import { __resetAgentEngineForTests, getAgentEngine } from "@/components/ai/engine";
import { CEO_USER_ID } from "@/repositories/seed/seedData";
import { deriveFollowUpRecommendation } from "@/agents/governedTaskProposal";
import { GovernedFollowUpTaskModal } from "@/modules/command-center/GovernedFollowUpTaskModal";
import { OperationsBrief } from "@/modules/command-center/OperationsBrief";

function wrap(node: React.ReactElement) {
  return render(
    <MemoryRouter>
      <ToastProvider>{node}</ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  __resetRepositoriesForTests();
  __resetAgentEngineForTests();
});
afterEach(() => cleanup());

async function approvalsForSignal(): Promise<number> {
  const { stores } = getAgentEngine();
  return (await stores.approvals.list()).filter((a) => a.subjectRef === SIGNAL.id).length;
}
async function myTask(): Promise<Task | undefined> {
  const taskId = deriveFollowUpRecommendation(SIGNAL, CEO_USER_ID).taskId;
  return getAgentEngine().stores.collection<Task>("tasks").get(taskId);
}

describe("GovernedFollowUpTaskModal", () => {
  it("recommendation ≠ proposal — opening the modal creates NO approval until explicit action", async () => {
    wrap(<GovernedFollowUpTaskModal signal={SIGNAL} onClose={() => {}} />);
    expect(screen.getByTestId("gft-preview")).toBeTruthy();
    expect(screen.getByTestId("gft-create-proposal")).toBeTruthy();
    expect(await approvalsForSignal()).toBe(0); // nothing created just by viewing
  });

  it("Create Proposal → Approve → VERIFIED, exactly one task, 'פתח משימה' offered", async () => {
    wrap(<GovernedFollowUpTaskModal signal={SIGNAL} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("gft-create-proposal"));
    await waitFor(() => expect(screen.getByTestId("gft-approve")).toBeTruthy());
    expect(await approvalsForSignal()).toBe(1); // one proposal now exists
    expect(await myTask()).toBeUndefined(); // still no task before approval
    fireEvent.click(screen.getByTestId("gft-approve"));
    await waitFor(() => expect(screen.getByTestId("gft-verified")).toBeTruthy());
    expect(screen.getByTestId("gft-open-task")).toBeTruthy();
    const task = await myTask();
    expect(task).toBeTruthy();
    expect(task?.ownerId).toBe(CEO_USER_ID);
  });

  it("Create Proposal → Reject → no task created", async () => {
    wrap(<GovernedFollowUpTaskModal signal={SIGNAL} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("gft-create-proposal"));
    await waitFor(() => expect(screen.getByTestId("gft-reject")).toBeTruthy());
    fireEvent.click(screen.getByTestId("gft-reject"));
    await waitFor(() => expect(screen.getByTestId("gft-rejected")).toBeTruthy());
    expect(await myTask()).toBeUndefined();
  });
});

describe("OperationsBrief — Governed Follow-up Task CTA", () => {
  it("shows a 'צור משימת מעקב' CTA on an actionable signal and opens the modal", async () => {
    wrap(<OperationsBrief />);
    await waitFor(() => expect(screen.getByTestId("inbox-followup-cta")).toBeTruthy());
    fireEvent.click(screen.getByTestId("inbox-followup-cta"));
    await waitFor(() => expect(screen.getByTestId("gft-modal")).toBeTruthy());
    // the modal is a proposal preview — not an auto-created task
    expect(screen.getByTestId("gft-create-proposal")).toBeTruthy();
  });
});
