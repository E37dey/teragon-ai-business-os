// W9-B — demo role-switch cannot silently escalate. Switching the demo role
// re-evaluates ALL guards (no cached grants): the same <RequirePermission>
// subtree flips from denied to allowed the instant the role changes, and
// LAYER (b) usePermission tracks the switch too.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import {
  RequirePermission,
  usePermission,
  useCurrentRole,
  getCurrentRole,
  setCurrentRole,
  DEFAULT_DEMO_ROLE,
  DEMO_ROLE_KEY,
} from "@/authorization";

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

describe("W9-B — demo role store", () => {
  it("defaults to מנהל מערכת and validates the stored value", () => {
    expect(getCurrentRole()).toBe(DEFAULT_DEMO_ROLE);
    sessionStorage.setItem(DEMO_ROLE_KEY, "not-a-role");
    expect(getCurrentRole()).toBe(DEFAULT_DEMO_ROLE); // junk ⇒ default, never escalates
    setCurrentRole("crole-viewer");
    expect(getCurrentRole()).toBe("crole-viewer");
  });
});

function GatedScreen() {
  return (
    <RequirePermission permission="user.manage">
      <div data-testid="admin-body">מסך ניהול</div>
    </RequirePermission>
  );
}

describe("W9-B — RequirePermission re-evaluates on role switch (LAYER a)", () => {
  it("flips denied→allowed with NO reload when the demo role changes", () => {
    setCurrentRole("crole-viewer");
    render(<GatedScreen />);
    expect(screen.queryByTestId("admin-body")).toBeNull();
    expect(screen.getByTestId("authz-access-denied")).toBeTruthy();

    act(() => setCurrentRole("crole-sysadmin"));
    expect(screen.getByTestId("admin-body")).toBeTruthy();
    expect(screen.queryByTestId("authz-access-denied")).toBeNull();

    // and back — escalation is not sticky
    act(() => setCurrentRole("crole-viewer"));
    expect(screen.queryByTestId("admin-body")).toBeNull();
  });
});

function ActionButton() {
  const role = useCurrentRole();
  const { allowed, reasonHe } = usePermission("discount.approve");
  return (
    <button type="button" disabled={!allowed} data-testid="approve-btn" data-role={role}>
      {allowed ? "אשר הנחה" : reasonHe}
    </button>
  );
}

describe("W9-B — usePermission tracks the live role (LAYER b)", () => {
  it("disables the control with an honest reason for an unauthorized role", () => {
    setCurrentRole("crole-service");
    render(<ActionButton />);
    const btn = screen.getByTestId("approve-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain("סימולציית הרשאות במצב הדגמה");

    act(() => setCurrentRole("crole-ceo"));
    expect((screen.getByTestId("approve-btn") as HTMLButtonElement).disabled).toBe(false);
  });
});
