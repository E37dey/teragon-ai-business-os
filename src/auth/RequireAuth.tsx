// TERAGON AI BUSINESS OS — Gate S8.1: route protection.
//
// Wraps the protected app subtree. Behaviour:
//   * LOCAL mode          → always authenticated → renders children (the default
//                           local experience is unchanged; no login gate).
//   * SUPABASE, restoring → a neutral placeholder (NEVER protected content — no
//                           flash — and no premature redirect that could loop).
//   * SUPABASE, no session→ redirect to /login, PRESERVING the intended route in
//                           navigation state so login can restore it.
//   * SUPABASE, authed    → renders children.
import type { ReactElement, ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";

export function RequireAuth({ children }: { children: ReactNode }): ReactElement {
  const { status, isInitializing } = useAuth();
  const location = useLocation();

  if (isInitializing) {
    // No protected content, no redirect — avoids both flashes and redirect loops.
    return (
      <div className="auth-gate-loading" aria-busy="true" role="status">
        <span className="auth-gate-loading__label">טוען…</span>
      </div>
    );
  }

  if (status !== "AUTHENTICATED") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
