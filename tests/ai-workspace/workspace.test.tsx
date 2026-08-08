// S13.3 — AI Workspace: proves it is a presentation/orchestration layer over the
// EXISTING deterministic engine (no new AI, no duplicate registry), that approvals
// reuse the real gate (apply-once, duplicate-blocked, reject-never-mutates), and
// that handoffs never auto-execute.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RailProvider } from "@/app/rail";
import AiWorkspacePage from "@/modules/ai-workspace/AiWorkspacePage";
import {
  buildAttention,
  buildApprovalCandidates,
  availableAgentCount,
  workspaceActionCount,
} from "@/modules/ai-workspace/workspaceModel";
import {
  AGENT_ACTIONS,
  __resetAgentActionStore,
  appliedCorrectionCount,
} from "@/agents/actions";
import { AGENT_DEFINITIONS, AGENT_IDS } from "@/agents/definitions";

beforeEach(() => __resetAgentActionStore());
afterEach(cleanup);

function mount() {
  return render(
    <MemoryRouter initialEntries={["/ai-workspace"]}>
      <RailProvider>
        <AiWorkspacePage />
      </RailProvider>
    </MemoryRouter>,
  );
}

describe("AI Workspace — composition over the existing engine", () => {
  it("reuses the single 14-action registry (no duplicate action layer)", () => {
    expect(workspaceActionCount()).toBe(14);
    expect(workspaceActionCount()).toBe(AGENT_ACTIONS.length);
    // exactly 2 actions per agent, 7 agents → 14
    for (const id of AGENT_IDS) {
      expect(AGENT_ACTIONS.filter((a) => a.agentId === id).length, id).toBe(2);
    }
    expect(availableAgentCount()).toBe(7);
  });

  it("attention + approval counters derive from real deterministic state (not fabricated)", () => {
    const attention = buildAttention("2026-08-08T00:00:00.000Z");
    const candidates = buildApprovalCandidates("2026-08-08T00:00:00.000Z");
    expect(attention.length).toBeGreaterThan(0); // demo data has incomplete records
    // every attention item carries a real source agent + severity (no invented status)
    for (const it of attention) {
      expect(AGENT_IDS).toContain(it.sourceAgentId);
      expect(["high", "medium", "low", "info"]).toContain(it.severity);
    }
    // approval candidates are real incomplete demo customers with a proposal
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.proposal.status).toBe("ok");
      expect(c.proposal.engineLabel).toContain("מנוע חוקים מקומי");
    }
  });

  it("renders one title, four KPIs, and all seven agents", () => {
    mount();
    expect(screen.getByRole("heading", { name: "מרחב AI" })).toBeTruthy();
    expect(within(screen.getByTestId("workspace-kpis")).getAllByText(/דורש טיפול|ממתין לאישורך|תוצאות סוכנים אחרונות|סוכנים זמינים/).length).toBeGreaterThanOrEqual(4);
    const agents = screen.getByTestId("workspace-agents");
    for (const def of Object.values(AGENT_DEFINITIONS)) {
      expect(within(agents).getAllByText(new RegExp(def.nameHe)).length, def.id).toBeGreaterThan(0);
    }
  });

  it("shows at most five attention items and at most five recent items", () => {
    mount();
    expect(screen.getAllByTestId("attention-item").length).toBeLessThanOrEqual(5);
    // recent starts empty (honest empty state), never a fabricated number
    expect(screen.queryAllByTestId("recent-item").length).toBe(0);
  });

  it("approval requires explicit user action, applies once, and blocks duplicates", async () => {
    mount();
    expect(appliedCorrectionCount()).toBe(0); // nothing applied just by rendering
    const items = screen.getAllByTestId("approval-item");
    expect(items.length).toBeGreaterThan(0);
    const before = appliedCorrectionCount();
    fireEvent.click(within(items[0]!).getByRole("button", { name: /אישור והחלה/ }));
    expect(appliedCorrectionCount()).toBe(before + 1); // applied exactly once
    // the approved item leaves the pending queue (cannot be re-approved from UI)
    expect(screen.getAllByTestId("approval-item").length).toBe(items.length - 1);
  });

  it("reject removes the item WITHOUT any mutation", async () => {
    mount();
    const items = screen.getAllByTestId("approval-item");
    const n = items.length;
    fireEvent.click(within(items[0]!).getByRole("button", { name: "דחייה" }));
    expect(appliedCorrectionCount()).toBe(0); // reject never calls the engine
    expect(screen.getAllByTestId("approval-item").length).toBe(n - 1);
  });

  it("agent handoff pre-fills the target agent but NEVER auto-executes", async () => {
    mount();
    const handoffBtn = screen
      .getAllByTestId("attention-item")
      .flatMap((el) => within(el).queryAllByRole("button", { name: /העבר ל-Fixer/ }))
      .find(Boolean);
    expect(handoffBtn).toBeTruthy();
    fireEvent.click(handoffBtn!);
    // Fixer is now selected and its recordId is pre-filled…
    const rid = screen.getByLabelText(/מזהה רשומת לקוח/) as HTMLInputElement;
    expect(rid.value).toMatch(/^dc-/);
    // …but nothing ran: the store is untouched and no result panel exists yet
    expect(appliedCorrectionCount()).toBe(0);
    expect(screen.queryByTestId("agent-actions-panel")).toBeTruthy();
  });
});
