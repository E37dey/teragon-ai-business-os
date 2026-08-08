// S13.3 — AI Workspace: proves it is a presentation/orchestration layer over the
// EXISTING deterministic engine (no new AI, no duplicate registry), and that the
// approval queue is TRUTHFUL — it holds ONLY real awaiting_approval instances,
// never fabricated pending state from findings/candidates. Approvals reuse the
// real gate (apply-once, duplicate-blocked, reject-never-mutates); handoffs never
// auto-execute.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "@/auth/AuthProvider";
import { RailProvider } from "@/app/rail";
import AiWorkspacePage from "@/modules/ai-workspace/AiWorkspacePage";
import {
  buildAttention,
  availableAgentCount,
  workspaceActionCount,
} from "@/modules/ai-workspace/workspaceModel";
import {
  AGENT_ACTIONS,
  runAgentAction,
  __resetAgentActionStore,
  appliedCorrectionCount,
} from "@/agents/actions";
import { AGENT_DEFINITIONS, AGENT_IDS } from "@/agents/definitions";

beforeEach(() => __resetAgentActionStore());
afterEach(cleanup);

function mount() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/ai-workspace"]}>
        <RailProvider>
          <AiWorkspacePage />
        </RailProvider>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("AI Workspace — composition over the existing engine", () => {
  it("reuses the single 14-action registry (no duplicate action layer)", () => {
    expect(workspaceActionCount()).toBe(14);
    expect(workspaceActionCount()).toBe(AGENT_ACTIONS.length);
    for (const id of AGENT_IDS) {
      expect(AGENT_ACTIONS.filter((a) => a.agentId === id).length, id).toBe(2);
    }
    expect(availableAgentCount()).toBe(7);
  });

  it("attention derives from real deterministic state (findings, not fabricated status)", () => {
    const attention = buildAttention("2026-08-08T00:00:00.000Z");
    expect(attention.length).toBeGreaterThan(0);
    for (const it of attention) {
      expect(AGENT_IDS).toContain(it.sourceAgentId);
      expect(["high", "medium", "low", "info"]).toContain(it.severity);
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
    expect(screen.queryAllByTestId("recent-item").length).toBe(0);
  });

  it("APPROVAL TRUTH: the queue is empty on load (no fabricated pending)", () => {
    mount();
    expect(screen.queryAllByTestId("approval-item").length).toBe(0);
    expect(appliedCorrectionCount()).toBe(0);
    // the KPI reflects zero real pending approvals
    const kpis = screen.getByTestId("workspace-kpis");
    expect(within(kpis).getByText("ממתין לאישורך")).toBeTruthy();
  });

  it("only a real awaiting_approval run populates the queue; approve applies once", async () => {
    mount();
    // user-triggered handoff → pre-fills Fixer apply-correction (never auto-runs)
    const handoffBtn = screen
      .getAllByTestId("attention-item")
      .flatMap((el) => within(el).queryAllByRole("button", { name: /העבר ל-Fixer/ }))
      .find(Boolean);
    expect(handoffBtn).toBeTruthy();
    fireEvent.click(handoffBtn!);
    expect(screen.queryAllByTestId("approval-item").length).toBe(0); // still nothing ran
    // explicit run → awaiting_approval (NO mutation), which enters the queue
    fireEvent.click(screen.getByRole("button", { name: "הרצה" }));
    const item = await screen.findByTestId("approval-item");
    expect(appliedCorrectionCount()).toBe(0); // staging did not mutate
    // approve reuses the gate → applies exactly once and clears the queue
    fireEvent.click(within(item).getByRole("button", { name: /אישור והחלה/ }));
    expect(appliedCorrectionCount()).toBe(1);
    expect(screen.queryAllByTestId("approval-item").length).toBe(0);
  });

  it("the reused engine applies once, blocks duplicates, and never mutates without approval", () => {
    const rid = "dc-2"; // a known incomplete demo customer
    expect(runAgentAction("fixer.apply-correction", { recordId: rid }, {}).status).toBe("awaiting_approval");
    expect(appliedCorrectionCount()).toBe(0); // no approval → no mutation
    expect(runAgentAction("fixer.apply-correction", { recordId: rid }, { approved: true }).status).toBe("applied");
    expect(appliedCorrectionCount()).toBe(1);
    runAgentAction("fixer.apply-correction", { recordId: rid }, { approved: true }); // duplicate
    expect(appliedCorrectionCount()).toBe(1); // blocked
  });

  it("reject removes a real pending item WITHOUT any mutation", async () => {
    mount();
    const handoffBtn = screen
      .getAllByTestId("attention-item")
      .flatMap((el) => within(el).queryAllByRole("button", { name: /העבר ל-Fixer/ }))
      .find(Boolean);
    fireEvent.click(handoffBtn!);
    fireEvent.click(screen.getByRole("button", { name: "הרצה" }));
    const item = await screen.findByTestId("approval-item");
    fireEvent.click(within(item).getByRole("button", { name: "דחייה" }));
    expect(appliedCorrectionCount()).toBe(0); // reject never calls the engine
    expect(screen.queryAllByTestId("approval-item").length).toBe(0);
  });

  it("agent handoff pre-fills the target agent but NEVER auto-executes", () => {
    mount();
    const handoffBtn = screen
      .getAllByTestId("attention-item")
      .flatMap((el) => within(el).queryAllByRole("button", { name: /העבר ל-Fixer/ }))
      .find(Boolean);
    fireEvent.click(handoffBtn!);
    const rid = screen.getByLabelText(/מזהה רשומת לקוח/) as HTMLInputElement;
    expect(rid.value).toMatch(/^dc-/);
    expect(appliedCorrectionCount()).toBe(0); // nothing ran
    expect(screen.queryAllByTestId("approval-item").length).toBe(0);
    expect(screen.queryByTestId("agent-actions-panel")).toBeTruthy();
  });
});
