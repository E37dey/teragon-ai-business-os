// Gate S8.1 — route protection behaviour across modes/states.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/auth/AuthProvider";
import { RequireAuth } from "@/auth/RequireAuth";
import type { AuthState } from "@/auth/types";
import { FakeBoundary, makeIdentity } from "./fakeBoundary";

afterEach(cleanup);

function renderAt(state: AuthState) {
  const boundary = new FakeBoundary(state);
  render(
    <AuthProvider boundary={boundary}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route
            path="/"
            element={
              <RequireAuth>
                <div>PROTECTED</div>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<div>LOGIN</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const S = (over: Partial<AuthState>): AuthState => ({
  mode: "SUPABASE",
  status: "SIGNED_OUT",
  identity: null,
  error: null,
  ...over,
});

describe("RequireAuth", () => {
  it("LOCAL mode always renders protected content (no login gate)", () => {
    renderAt({ mode: "LOCAL", status: "AUTHENTICATED", identity: makeIdentity(), error: null });
    expect(screen.getByText("PROTECTED")).toBeTruthy();
  });

  it("SUPABASE + authenticated renders protected content", () => {
    renderAt(S({ status: "AUTHENTICATED", identity: makeIdentity() }));
    expect(screen.getByText("PROTECTED")).toBeTruthy();
  });

  it("SUPABASE + signed out redirects to /login (no protected flash)", () => {
    renderAt(S({ status: "SIGNED_OUT" }));
    expect(screen.queryByText("PROTECTED")).toBeNull();
    expect(screen.getByText("LOGIN")).toBeTruthy();
  });

  it("SUPABASE + initializing shows a neutral loader (no redirect, no content)", () => {
    renderAt(S({ status: "INITIALIZING" }));
    expect(screen.queryByText("PROTECTED")).toBeNull();
    expect(screen.queryByText("LOGIN")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
