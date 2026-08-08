// S13.5 (PR E) — AgentLoopPanel UI: proves every transition is an explicit click
// (no autonomy), the approval gate holds, stop is always available while active,
// and controls are accessible + distinct.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AuthProvider } from "@/auth/AuthProvider";
import { AgentLoopPanel } from "@/modules/ai-workspace/AgentLoopPanel";
import { __resetAgentActionStore, appliedCorrectionCount } from "@/agents/actions";

beforeEach(() => __resetAgentActionStore());
afterEach(cleanup);

function mount() {
  return render(
    <AuthProvider>
      <AgentLoopPanel />
    </AuthProvider>,
  );
}
const next = () => fireEvent.click(screen.getByTestId("loop-next"));

describe("AgentLoopPanel — human-controlled, no autonomy", () => {
  it("renders the bounded/honest framing and the start control", () => {
    mount();
    expect(screen.getByText(/תהליך דמו מקומי ומוגבל/)).toBeTruthy();
    expect(screen.getByText(/4 שלבים לכל היותר/)).toBeTruthy();
    expect(screen.getByText(/ממתינה לאישור שלך בין שלבים/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "התחל תהליך" })).toBeTruthy();
    expect(screen.queryAllByTestId("loop-step").length).toBe(0);
  });

  it("advances ONE explicit step per click; nothing chains automatically", () => {
    mount();
    next(); // start → PLANNED (no agent ran)
    expect(screen.queryAllByTestId("loop-step").length).toBe(0);
    expect(appliedCorrectionCount()).toBe(0);
    next(); // Step 1 — Hunter only
    expect(screen.getAllByTestId("loop-step").length).toBe(1);
    expect(appliedCorrectionCount()).toBe(0); // Fixer did NOT run
    next(); // Step 2 — Fixer proposal
    expect(screen.getAllByTestId("loop-step").length).toBe(2);
    expect(appliedCorrectionCount()).toBe(0); // proposal never mutates
    next(); // stage → AWAITING_APPROVAL (no mutation)
    expect(screen.getByTestId("loop-approve")).toBeTruthy();
    expect(screen.getByTestId("loop-reject")).toBeTruthy();
    expect(screen.queryByTestId("loop-next")).toBeNull(); // no next until human decides
    expect(appliedCorrectionCount()).toBe(0);
    fireEvent.click(screen.getByTestId("loop-approve")); // approve → applies once
    expect(appliedCorrectionCount()).toBe(1);
    expect(screen.getByTestId("loop-next")).toBeTruthy(); // "סכם תהליך" — Orchestrator NOT auto-run
    expect(screen.getAllByTestId("loop-step").length).toBe(3);
    next(); // Step 4 — Orchestrator → COMPLETED
    expect(screen.getAllByTestId("loop-step").length).toBe(4);
    expect(screen.getByText(/הושלם/)).toBeTruthy();
    expect(screen.getByTestId("loop-reset")).toBeTruthy();
  });

  it("reject applies no mutation and ends the loop honestly", () => {
    mount();
    next(); next(); next(); next(); // start → hunter → proposal → stage(awaiting)
    fireEvent.click(screen.getByTestId("loop-reject"));
    expect(appliedCorrectionCount()).toBe(0);
    expect(screen.getByTestId("loop-stop-reason").textContent).toMatch(/נדחה/);
    expect(screen.getAllByText(/נדחה/).length).toBeGreaterThan(0);
  });

  it("stop is available while active and halts continuation", () => {
    mount();
    next(); next(); // start → hunter (active)
    expect(screen.getByTestId("loop-stop")).toBeTruthy();
    fireEvent.click(screen.getByTestId("loop-stop"));
    expect(screen.getByTestId("loop-stop-reason").textContent).toMatch(/נעצר/);
    expect(screen.queryByTestId("loop-next")).toBeNull(); // no further step after stop
    expect(screen.queryByTestId("loop-stop")).toBeNull();
    expect(screen.getByTestId("loop-reset")).toBeTruthy();
  });

  it("approve / reject / stop are distinct, named, and never NO_OP", () => {
    mount();
    next(); next(); next(); next();
    // three clearly distinguished actions with accessible names
    expect(screen.getByRole("button", { name: /אשר והחל/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "דחה" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "עצור תהליך" })).toBeTruthy();
  });
});
