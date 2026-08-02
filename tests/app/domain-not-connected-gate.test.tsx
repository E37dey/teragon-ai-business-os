// S9.1-B1 / S9.2-A1b — targeted tests for the pure, route-aware gate decision
// (DomainNotConnectedGateView). Deterministic (prop-driven provider + pathname;
// no auth backend, no Router, no full shell). Explicit cleanup because this
// project runs Vitest with globals:false (RTL auto-cleanup is not registered).
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DomainNotConnectedGateView } from "@/persistence/composition/DomainNotConnectedGate";

afterEach(cleanup);

describe("S9.2-A1b · DomainNotConnectedGateView", () => {
  it("SUPABASE + unconnected route: the page never mounts — Hebrew notice + typed marker", () => {
    render(
      <DomainNotConnectedGateView provider="SUPABASE" pathname="/leads">
        <div data-testid="page">PAGE</div>
      </DomainNotConnectedGateView>,
    );
    expect(screen.queryByTestId("page")).toBeNull();
    expect(screen.getByText("תצוגה מקדימה פנימית")).toBeTruthy();
    expect(screen.getByText("DOMAIN_NOT_CONNECTED")).toBeTruthy();
  });

  it("SUPABASE + connected customer LIST route: the page renders (no notice)", () => {
    render(
      <DomainNotConnectedGateView provider="SUPABASE" pathname="/customers">
        <div data-testid="page">PAGE</div>
      </DomainNotConnectedGateView>,
    );
    expect(screen.getByTestId("page")).toBeTruthy();
    expect(screen.queryByText("DOMAIN_NOT_CONNECTED")).toBeNull();
  });

  it("LOCAL mode: the page renders unchanged on any route (no notice)", () => {
    render(
      <DomainNotConnectedGateView provider="LOCAL_INDEXEDDB" pathname="/leads">
        <div data-testid="page">PAGE</div>
      </DomainNotConnectedGateView>,
    );
    expect(screen.getByTestId("page")).toBeTruthy();
    expect(screen.queryByText("DOMAIN_NOT_CONNECTED")).toBeNull();
  });
});
