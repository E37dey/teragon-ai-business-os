// S9.1-B2 — targeted tests: shell identity resolution, logout control behavior,
// and repository invalidation after logout. Deterministic (pure helpers + one
// small component + the pure composition classifier); no auth backend, no full
// shell. Explicit RTL cleanup (project runs Vitest with globals:false).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactElement } from "react";
import { AuthContext, type AuthContextValue } from "@/auth/authContext";
import type { ResolvedIdentity } from "@/auth/types";
import type { ShellUser } from "@/layout";
import { resolveShellUser, shellShowsLogout } from "@/app/shellAccount";
import { ShellLogoutButton } from "@/app/ShellLogoutButton";
import { classifyDomainAccess, DomainCompositionError } from "@/persistence/composition/domainComposition";

afterEach(cleanup);

const LOCAL_FALLBACK: ShellUser = { name: "צחי", role: 'מנכ"ל · טרגון' };
const IDENTITY: ResolvedIdentity = {
  userId: "u1", profileId: "u1", name: "מנהל בדיקה", email: "admin@example.com",
  organizationId: "org-teragon", organizationName: "טרגון",
  roleId: "crole-sysadmin", roleLabel: "מנהל מערכת", capabilities: [], membershipId: "m1",
};

function ctx(over: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    mode: "SUPABASE", status: "AUTHENTICATED", identity: IDENTITY, error: null,
    isInitializing: false, signIn: vi.fn(), signOut: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn(), ...over,
  };
}
function Probe(): ReactElement {
  return <span data-testid="loc">{useLocation().pathname}</span>;
}

describe("S9.1-B2 · resolveShellUser (safe identity)", () => {
  it("SUPABASE + AUTHENTICATED → real server-resolved user, only safe fields", () => {
    const u = resolveShellUser("SUPABASE", "AUTHENTICATED", IDENTITY, LOCAL_FALLBACK);
    expect(u).toEqual({ name: "מנהל בדיקה", role: "מנהל מערכת · טרגון" });
    expect(Object.keys(u).sort()).toEqual(["name", "role"]); // no token/session fields
    expect(`${u.name}${u.role}`).not.toMatch(/eyJ|token|secret|service_role/i);
  });
  it("SUPABASE without a session NEVER returns the static local user", () => {
    expect(resolveShellUser("SUPABASE", "SIGNED_OUT", IDENTITY, LOCAL_FALLBACK)).not.toBe(LOCAL_FALLBACK);
    expect(resolveShellUser("SUPABASE", "AUTHENTICATED", null, LOCAL_FALLBACK)).not.toBe(LOCAL_FALLBACK);
    expect(resolveShellUser("SUPABASE", "INITIALIZING", null, LOCAL_FALLBACK).role).toBe("מאמת חיבור…");
  });
  it("LOCAL mode keeps the approved local identity unchanged", () => {
    expect(resolveShellUser("LOCAL", "AUTHENTICATED", IDENTITY, LOCAL_FALLBACK)).toBe(LOCAL_FALLBACK);
  });
  it("shellShowsLogout only in SUPABASE + AUTHENTICATED", () => {
    expect(shellShowsLogout("SUPABASE", "AUTHENTICATED")).toBe(true);
    expect(shellShowsLogout("LOCAL", "AUTHENTICATED")).toBe(false);
    expect(shellShowsLogout("SUPABASE", "SIGNED_OUT")).toBe(false);
  });
});

describe("S9.1-B2 · ShellLogoutButton", () => {
  function mount(value: AuthContextValue) {
    return render(
      <MemoryRouter initialEntries={["/crm"]}>
        <AuthContext.Provider value={value}>
          <ShellLogoutButton />
          <Probe />
        </AuthContext.Provider>
      </MemoryRouter>,
    );
  }
  it("invokes signOut and routes to /login", async () => {
    const value = ctx();
    mount(value);
    fireEvent.click(screen.getByTestId("shell-logout"));
    await waitFor(() => expect(value.signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("/login"));
  });
  it("renders nothing in LOCAL mode or when not authenticated (no protected control)", () => {
    mount(ctx({ mode: "LOCAL" }));
    expect(screen.queryByTestId("shell-logout")).toBeNull();
    cleanup();
    mount(ctx({ status: "SIGNED_OUT" }));
    expect(screen.queryByTestId("shell-logout")).toBeNull();
  });
});

describe("S9.1-B2 · repository invalidation after logout", () => {
  it("SUPABASE with no active session → classifyDomainAccess throws AUTH_REQUIRED (no local fallback)", () => {
    expect(() =>
      classifyDomainAccess("customers", { provider: "SUPABASE", sessionActive: false, identity: null }),
    ).toThrow(DomainCompositionError);
    try {
      classifyDomainAccess("customers", { provider: "SUPABASE", sessionActive: false, identity: null });
    } catch (err) {
      expect((err as DomainCompositionError).code).toBe("AUTH_REQUIRED");
    }
  });
});
