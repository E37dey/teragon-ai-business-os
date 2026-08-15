// vNext Phase F — UI-level record-scope WIRING test.
//
// recordScope.rbac.test.ts proves the policy in isolation. This proves the BINDING
// the UI actually uses: authenticating a demo account (the trusted session) flows
// through useScopeContext() into scopeRecords() so a component receives ONLY the
// authenticated subject's rows — and switching accounts never widens the scope.
import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { enterDemoPortal, exitDemoPortal } from "@/authorization/portalSession";
import { useScopeContext } from "@/authorization/useScope";
import { scopeRecords } from "@/authorization/recordScope";
import { findDemoAccount } from "@/auth/demoAccounts";

const student = findDemoAccount("student@teragon.demo")!;
const technician = findDemoAccount("technician@teragon.demo")!;

const row = (id: string, extra: Record<string, unknown>) =>
  ({ id, createdAt: "", updatedAt: "", ...extra }) as never;

afterEach(() => act(() => exitDemoPortal()));

describe("scope wiring — the authenticated account drives the record scope", () => {
  it("student session → useScopeContext yields the student portal + st-1 identity", () => {
    const { result } = renderHook(() => useScopeContext());
    act(() => enterDemoPortal(student));
    expect(result.current.portal).toBe("student");
    expect(result.current.scope).toEqual({ studentId: "st-1" });
  });

  it("technician session → only u-ran's tickets reach the component", () => {
    const { result } = renderHook(() => useScopeContext());
    act(() => enterDemoPortal(technician));
    const { portal, scope } = result.current;
    const tickets = [row("s-1", { ownerId: "u-ran" }), row("s-2", { ownerId: "u-maya" })];
    const visible = scopeRecords("serviceTickets", portal, scope, tickets);
    expect(visible.map((t) => (t as { id: string }).id)).toEqual(["s-1"]);
  });

  it("switching technician → student never widens: enrollment scope replaces job scope", () => {
    const { result } = renderHook(() => useScopeContext());
    act(() => enterDemoPortal(technician));
    expect(result.current.portal).toBe("technician");
    act(() => enterDemoPortal(student));
    const { portal, scope } = result.current;
    // as a student, technician tickets are no longer visible at all…
    expect(scopeRecords("serviceTickets", portal, scope, [row("s-1", { ownerId: "u-ran" })])).toEqual([]);
    // …and only st-1's enrollment is.
    const ens = [row("en-1", { studentId: "st-1" }), row("en-2", { studentId: "st-2" })];
    expect(scopeRecords("enrollments", portal, scope, ens).map((e) => (e as { id: string }).id)).toEqual(["en-1"]);
  });

  it("exiting the portal returns to the broad default operator (manager)", () => {
    const { result } = renderHook(() => useScopeContext());
    act(() => enterDemoPortal(student));
    act(() => exitDemoPortal());
    expect(result.current.portal).toBe("manager");
    expect(result.current.scope).toBeNull();
  });
});
