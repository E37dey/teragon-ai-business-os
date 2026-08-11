// S16 Phase 6 — the governed action UI seam: recommendation → [הפוך להצעה] → proposal preview
// (provenance + diff) → [אשר]/[דחה]. Reject is terminal (no write); approve drives the two-gate
// execution to a verified result. Bridge is mocked; the append block (runtime timestamp) is
// captured from the write call so the read-back verification is deterministic.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/integration/obsidian/obsidianCredential", async (o) => ({
  ...(await o<typeof import("@/integration/obsidian/obsidianCredential")>()),
  getObsidianToken: vi.fn(),
  getObsidianWriteKey: vi.fn(),
}));
vi.mock("@/integration/obsidian/vaultBridgeClient", async (o) => ({
  ...(await o<typeof import("@/integration/obsidian/vaultBridgeClient")>()),
  appendNote: vi.fn(),
  readNote: vi.fn(),
}));

import { getObsidianToken, getObsidianWriteKey } from "@/integration/obsidian/obsidianCredential";
import { appendNote, readNote, sha256Hex } from "@/integration/obsidian/vaultBridgeClient";
import { GovernedActionPanel, PHASE6_TARGET } from "@/modules/ai-workspace/visual/GovernedActionPanel";
import { __resetGovernedActionsForTests } from "@/agents/workflow/governedAction";
import { __resetWorkflowEventsForTests } from "@/agents/workflow/workflowEvents";
import type { WorkflowState } from "@/agents/workflow/knowledgeWorkflow";

const BASE = "# Phase6 Governed Action Proof\n";
function mkWf(runId: string): WorkflowState {
  const sources = [{ sourceType: "obsidian", vaultName: "TERAGON OS", path: "AI Operations.md", title: "AI Operations" }];
  return {
    workflowRunId: runId, correlationId: `${runId}-corr`, intent: "x", status: "WAITING_FOR_USER",
    currentAgentId: null, contributingAgents: ["ag-orchestrator", "ag-wiki"], sources,
    result: { answer: "המלצה מבוססת-ידע", sources, contributingAgents: ["ag-orchestrator", "ag-wiki"] },
    stepCount: 5, vaultReads: 1, startedAt: 0, updatedAt: 0, completedAt: null, stopReason: null, nextActionHe: null,
  } as unknown as WorkflowState;
}
const ok = <T,>(data: T) => ({ ok: true as const, code: "OK" as const, status: 200, data });

beforeEach(() => {
  vi.clearAllMocks();
  __resetWorkflowEventsForTests();
  __resetGovernedActionsForTests();
  vi.mocked(getObsidianToken).mockReturnValue("tok");
  vi.mocked(getObsidianWriteKey).mockReturnValue("wk");
  // Dynamic mock: capture the append block so the read-back reflects base+block deterministically.
  let capturedBlock = "";
  vi.mocked(appendNote).mockImplementation(async (_p, block) => {
    capturedBlock = block;
    return ok({ applied: true, op: "append", path: PHASE6_TARGET, hash: await sha256Hex(BASE + block) });
  });
  vi.mocked(readNote).mockImplementation(async () =>
    ok({ path: PHASE6_TARGET, basename: "Phase6 Governed Action Proof", frontmatter: null, mtime: 1, content: BASE + capturedBlock, truncated: false }),
  );
});
afterEach(() => {
  cleanup();
  __resetWorkflowEventsForTests();
  __resetGovernedActionsForTests();
});

describe("GovernedActionPanel", () => {
  it("[הפוך להצעה] creates a proposal preview with real provenance + diff; nothing is written yet", async () => {
    render(<GovernedActionPanel wf={mkWf("wf-ui1")} />);
    fireEvent.click(screen.getByTestId("governed-create"));
    await waitFor(() => expect(screen.getByTestId("governed-proposal")).toBeTruthy());
    expect(screen.getByTestId("governed-provenance").textContent).toContain("wf-ui1"); // real run id
    expect(screen.getByTestId("governed-diff").textContent).toContain("המלצה מבוססת-ידע"); // the real recommendation as data
    expect(appendNote).not.toHaveBeenCalled(); // creating a proposal performs NO write
    expect(screen.getByTestId("governed-approve")).toBeTruthy();
    expect(screen.getByTestId("governed-reject")).toBeTruthy();
  });

  it("דחה is terminal — no write, shows rejected", async () => {
    render(<GovernedActionPanel wf={mkWf("wf-ui2")} />);
    fireEvent.click(screen.getByTestId("governed-create"));
    await waitFor(() => expect(screen.getByTestId("governed-reject")).toBeTruthy());
    fireEvent.click(screen.getByTestId("governed-reject"));
    await waitFor(() => expect(screen.getByTestId("governed-result").textContent).toContain("נדחתה"));
    expect(appendNote).not.toHaveBeenCalled();
  });

  it("אשר → exactly one bounded append → read-back verified → success", async () => {
    render(<GovernedActionPanel wf={mkWf("wf-ui3")} />);
    fireEvent.click(screen.getByTestId("governed-create"));
    await waitFor(() => expect(screen.getByTestId("governed-approve")).toBeTruthy());
    fireEvent.click(screen.getByTestId("governed-approve"));
    await waitFor(() => expect(screen.getByTestId("governed-result").textContent).toContain("אומת"));
    expect(appendNote).toHaveBeenCalledTimes(1); // exactly one write
  });
});
