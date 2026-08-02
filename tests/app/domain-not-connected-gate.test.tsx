// S9.1-B1 — targeted tests for the central DomainNotConnectedGate. Deterministic
// (prop-driven provider; no auth backend, no full shell). Explicit cleanup because
// this project runs Vitest with globals:false (RTL auto-cleanup is not registered).
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DomainNotConnectedGate } from "@/persistence/composition/DomainNotConnectedGate";

afterEach(cleanup);

describe("S9.1-B1 · DomainNotConnectedGate", () => {
  it("SUPABASE mode: the page never mounts — shows the Hebrew internal-preview notice", () => {
    render(
      <DomainNotConnectedGate provider="SUPABASE">
        <div data-testid="page">PAGE</div>
      </DomainNotConnectedGate>,
    );
    // legacy page (and any mutation controls it carries) is absent
    expect(screen.queryByTestId("page")).toBeNull();
    // clear Hebrew notice + the typed marker are shown instead
    expect(screen.getByText("תצוגה מקדימה פנימית")).toBeTruthy();
    expect(screen.getByText("DOMAIN_NOT_CONNECTED")).toBeTruthy();
  });

  it("LOCAL mode: the page renders unchanged (no notice)", () => {
    render(
      <DomainNotConnectedGate provider="LOCAL_INDEXEDDB">
        <div data-testid="page">PAGE</div>
      </DomainNotConnectedGate>,
    );
    expect(screen.getByTestId("page")).toBeTruthy();
    expect(screen.queryByText("DOMAIN_NOT_CONNECTED")).toBeNull();
  });
});
