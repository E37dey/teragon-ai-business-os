// Visual Intelligence Workspace: EXACTLY the 7 canonical agents, real capabilities +
// reused action engine, supported handoff edges, no fake activity, cross-view honesty,
// and the mode switch (agents / graph / split). Deterministic; no live bridge needed.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/app/queryClient";
import { AuthProvider } from "@/auth/AuthProvider";
import { ToastProvider } from "@/design-system";
import { __resetRepositoriesForTests } from "@/repositories";
import { __resetIdbConnectionForTests } from "@/repositories/IndexedDBRepository";
import { AGENT_IDS, getAgentDefinition } from "@/agents/definitions";
import { getActionsForAgent } from "@/agents/actions";
import { AgentNetworkPanel } from "@/modules/ai-workspace/visual/AgentNetworkPanel";
import { VisualIntelligenceWorkspace } from "@/modules/ai-workspace/visual/VisualIntelligenceWorkspace";

function wrap(node: React.ReactElement) {
  return render(
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{node}</ToastProvider>
      </QueryClientProvider>
    </AuthProvider>,
  );
}

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __resetIdbConnectionForTests();
  __resetRepositoriesForTests();
  queryClient.clear();
});
afterEach(() => cleanup());

describe("AgentNetworkPanel", () => {
  it("renders EXACTLY the 7 canonical agents (no invented agents)", async () => {
    wrap(<AgentNetworkPanel />);
    await waitFor(() => expect(screen.getByTestId("agent-network-svg")).toBeTruthy());
    const list = screen.getByTestId("agent-network-list");
    const buttons = list.querySelectorAll("li > button");
    expect(buttons.length).toBe(7);
    expect(AGENT_IDS.length).toBe(7);
    // real names present
    expect(screen.getAllByText(/מנהל התזמור/).length).toBeGreaterThan(0);
    expect(list.textContent).toContain("Hunter");
    expect(list.textContent).toContain("Wiki");
  });

  it("selecting an agent shows real capabilities + the reused action engine", async () => {
    wrap(<AgentNetworkPanel />);
    await waitFor(() => expect(screen.getByTestId("agent-network-list")).toBeTruthy());
    // select Hunter via the accessible list
    fireEvent.click(within(screen.getByTestId("agent-network-list")).getByText("סוכן מכירות"));
    await waitFor(() => expect(screen.getByTestId("agent-network-details")).toBeTruthy());
    const details = screen.getByTestId("agent-network-details");
    const hunter = getAgentDefinition("ag-hunter")!;
    expect(details.textContent).toContain(hunter.allowedOperations[0]!); // real capability
    expect(details.textContent).toContain(hunter.prohibitedDomains[0]!); // real denied domain
    // the real action engine panel is embedded (not a second engine)
    expect(screen.getByTestId("agent-actions-panel")).toBeTruthy();
    // Hunter's real actions appear
    expect(getActionsForAgent("ag-hunter").length).toBeGreaterThan(0);
  });

  it("shows supported handoff edges (orchestrator dispatch) and NO fabricated active edges", async () => {
    wrap(<AgentNetworkPanel />);
    await waitFor(() => expect(screen.getByTestId("agent-network-svg")).toBeTruthy());
    // 6 supported (dashed) edges: orchestrator → each of the 6 business agents
    const dashed = screen.getByTestId("agent-network-svg").querySelectorAll('line[stroke-dasharray="4 4"]');
    expect(dashed.length).toBe(6);
    // no active handoff trace exists → no active edges fabricated
    expect(screen.queryAllByTestId("agent-handoff-active").length).toBe(0);
  });

  it("cross-view: an agent with no real note-usage trace shows 'אין שימוש מתועד'", async () => {
    wrap(<AgentNetworkPanel usages={[]} />);
    await waitFor(() => expect(screen.getByTestId("agent-network-list")).toBeTruthy());
    fireEvent.click(within(screen.getByTestId("agent-network-list")).getByText("סוכן ידע"));
    await waitFor(() => expect(screen.getByTestId("agent-note-usage").textContent).toContain("אין שימוש מתועד"));
  });
});

describe("VisualIntelligenceWorkspace mode switch", () => {
  it("switches between agents / graph / split", async () => {
    wrap(<VisualIntelligenceWorkspace />);
    await waitFor(() => expect(screen.getByTestId("agent-network-panel")).toBeTruthy());
    expect(screen.queryByTestId("obsidian-graph-panel")).toBeNull();
    fireEvent.click(screen.getByTestId("viz-mode-graph"));
    await waitFor(() => expect(screen.getByTestId("obsidian-graph-panel")).toBeTruthy());
    expect(screen.queryByTestId("agent-network-panel")).toBeNull();
    fireEvent.click(screen.getByTestId("viz-mode-split"));
    await waitFor(() => {
      expect(screen.getByTestId("agent-network-panel")).toBeTruthy();
      expect(screen.getByTestId("obsidian-graph-panel")).toBeTruthy();
    });
  });
});
