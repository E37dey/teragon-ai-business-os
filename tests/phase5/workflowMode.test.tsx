// S15 Phase 5 — the live-workflow UI: start → real timeline → recommendation + source →
// human accept, and the "תהליך חי" mode switch in the Visual Intelligence Workspace.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/app/queryClient";
import { AuthProvider } from "@/auth/AuthProvider";
import { ToastProvider } from "@/design-system";
import { __resetRepositoriesForTests } from "@/repositories";
import { __resetIdbConnectionForTests } from "@/repositories/IndexedDBRepository";

vi.mock("@/integration/obsidian/obsidianCredential", async (o) => ({ ...(await o<typeof import("@/integration/obsidian/obsidianCredential")>()), getObsidianToken: vi.fn() }));
vi.mock("@/integration/obsidian/vaultBridgeClient", async (o) => ({ ...(await o<typeof import("@/integration/obsidian/vaultBridgeClient")>()), getConnectionInfo: vi.fn(), searchNotes: vi.fn(), readNote: vi.fn(), getVaultGraph: vi.fn(), probeHealth: vi.fn() }));

import { getObsidianToken } from "@/integration/obsidian/obsidianCredential";
import { getConnectionInfo, searchNotes, readNote, getVaultGraph } from "@/integration/obsidian/vaultBridgeClient";
import { WorkflowMode } from "@/modules/ai-workspace/visual/WorkflowMode";
import { VisualIntelligenceWorkspace } from "@/modules/ai-workspace/visual/VisualIntelligenceWorkspace";
import { __resetWorkflowEventsForTests } from "@/agents/workflow/workflowEvents";
import { __resetRetrievalTraceForTests } from "@/agents/obsidian/retrievalTrace";

const conn = { ok: true as const, code: "OK" as const, status: 200, data: { connected: true, vaultName: "TERAGON OS", version: "v", readonly: true, writeEnabled: false } };

function wrap(node: React.ReactElement) {
  // WorkflowMode now reads the ?run= deep-link param (Phase 7), so it needs a Router context.
  return render(<MemoryRouter><AuthProvider><QueryClientProvider client={queryClient}><ToastProvider>{node}</ToastProvider></QueryClientProvider></AuthProvider></MemoryRouter>);
}

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __resetIdbConnectionForTests();
  __resetRepositoriesForTests();
  queryClient.clear();
  vi.clearAllMocks();
  __resetWorkflowEventsForTests();
  __resetRetrievalTraceForTests();
  vi.mocked(getObsidianToken).mockReturnValue("tok");
  vi.mocked(getConnectionInfo).mockResolvedValue(conn);
  vi.mocked(getVaultGraph).mockResolvedValue({ ok: true, code: "OK", status: 200, data: { nodes: [], edges: [], count: 0, edgeCount: 0, truncated: false } });
  vi.mocked(searchNotes).mockResolvedValue({ ok: true, code: "OK", status: 200, data: { results: [{ path: "AI Operations.md", basename: "AI Operations", snippet: "s", mtime: 1 }], count: 1, truncated: false } });
  vi.mocked(readNote).mockResolvedValue({ ok: true, code: "OK", status: 200, data: { path: "AI Operations.md", basename: "AI Operations", frontmatter: null, mtime: 1, content: "# AI Operations\n\nBridge note connecting [[AI]], [[Automation]], [[Operations]].", truncated: false } });
});
afterEach(() => {
  cleanup();
  __resetWorkflowEventsForTests();
  __resetRetrievalTraceForTests();
});

describe("WorkflowMode (live workflow UI)", () => {
  it("starts → renders a real timeline, a recommendation with source, then human accept completes it", async () => {
    wrap(<WorkflowMode />);
    fireEvent.click(screen.getByTestId("workflow-start"));
    // real ordered timeline appears with the true event sequence
    await waitFor(() => expect(screen.getAllByTestId("workflow-event").length).toBeGreaterThanOrEqual(10));
    const types = screen.getAllByTestId("workflow-event").map((e) => e.getAttribute("data-type"));
    expect(types[0]).toBe("WORKFLOW_STARTED");
    expect(types).toContain("VAULT_NOTE_READ");
    expect(types).toContain("RESULT_CREATED");
    expect(types[types.length - 1]).toBe("USER_DECISION_REQUIRED");
    // recommendation + honest source attribution (not memoryRecords)
    expect(screen.getByTestId("workflow-result").textContent).toContain("AI Operations");
    expect(screen.getByTestId("workflow-source").textContent).toContain("TERAGON OS");
    // human accept → COMPLETED (no write, no approval)
    fireEvent.click(screen.getByTestId("workflow-accept"));
    await waitFor(() => expect(screen.queryByTestId("workflow-accept")).toBeNull());
    expect(screen.getByTestId("workflow-timeline").textContent).toContain("התהליך הושלם");
  });

  it("selecting a timeline event marks it active (drives graph cross-highlight)", async () => {
    wrap(<WorkflowMode />);
    fireEvent.click(screen.getByTestId("workflow-start"));
    await waitFor(() => expect(screen.getAllByTestId("workflow-event").length).toBeGreaterThan(5));
    const readEvent = screen.getAllByTestId("workflow-event").find((e) => e.getAttribute("data-type") === "VAULT_NOTE_READ")!;
    fireEvent.click(readEvent);
    expect(readEvent.textContent).toContain("קרא"); // the real "Wiki read <note>" event
  });
});

describe("VisualIntelligenceWorkspace — תהליך חי mode", () => {
  it("switches to the workflow mode", async () => {
    wrap(<VisualIntelligenceWorkspace />);
    fireEvent.click(screen.getByTestId("viz-mode-workflow"));
    await waitFor(() => expect(screen.getByTestId("workflow-controls")).toBeTruthy());
    expect(screen.getByTestId("workflow-timeline")).toBeTruthy();
  });
});
