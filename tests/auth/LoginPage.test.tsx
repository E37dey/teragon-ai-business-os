// Gate S8.1 — login screen: states, safe error, and success → redirect.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/auth/AuthProvider";
import { LoginPage } from "@/auth/LoginPage";
import { safeAuthError } from "@/auth/authError";
import type { AuthState } from "@/auth/types";
import { FakeBoundary, makeIdentity } from "./fakeBoundary";

afterEach(cleanup);

function renderLogin(state: AuthState, configure?: (b: FakeBoundary) => void) {
  const boundary = new FakeBoundary(state);
  configure?.(boundary);
  render(
    <AuthProvider boundary={boundary}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>HOME</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
  return boundary;
}

const SIGNED_OUT: AuthState = { mode: "SUPABASE", status: "SIGNED_OUT", identity: null, error: null };

describe("LoginPage", () => {
  it("renders the Hebrew RTL form when signed out", () => {
    renderLogin(SIGNED_OUT);
    expect(screen.getByLabelText("כתובת אימייל")).toBeTruthy();
    expect(screen.getByLabelText("סיסמה")).toBeTruthy();
    expect(screen.getByRole("button", { name: "התחברות" })).toBeTruthy();
  });

  it("shows a safe error message on invalid credentials", () => {
    renderLogin({ ...SIGNED_OUT, status: "ERROR", error: safeAuthError("INVALID_CREDENTIALS") });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(safeAuthError("INVALID_CREDENTIALS").message);
  });

  it("shows the inactive-account message distinctly", () => {
    renderLogin({ ...SIGNED_OUT, status: "ERROR", error: safeAuthError("INACTIVE_ACCOUNT") });
    expect(screen.getByRole("alert").textContent).toBe(safeAuthError("INACTIVE_ACCOUNT").message);
  });

  it("redirects to the intended route on successful sign-in", async () => {
    renderLogin(SIGNED_OUT, (b) => {
      b.signInImpl = () => ({
        mode: "SUPABASE",
        status: "AUTHENTICATED",
        identity: makeIdentity(),
        error: null,
      });
    });
    fireEvent.change(screen.getByLabelText("כתובת אימייל"), {
      target: { value: "admin@teragon.test" },
    });
    fireEvent.change(screen.getByLabelText("סיסמה"), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: "התחברות" }));
    await waitFor(() => expect(screen.getByText("HOME")).toBeTruthy());
  });

  it("never shows the form in LOCAL mode (redirects home)", () => {
    renderLogin({ mode: "LOCAL", status: "AUTHENTICATED", identity: makeIdentity(), error: null });
    expect(screen.getByText("HOME")).toBeTruthy();
    expect(screen.queryByLabelText("כתובת אימייל")).toBeNull();
  });
});
