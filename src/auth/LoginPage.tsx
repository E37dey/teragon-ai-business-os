// TERAGON AI BUSINESS OS — Gate S8.1: Hebrew RTL login / session screen.
//
// Enterprise UI (Light Enterprise Hybrid default + Quiet Enterprise Dark) via
// design tokens only — no neon/glow, system Hebrew font stack, visible focus
// rings, natural tab order, responsive. Surfaces ONLY the safe Hebrew error from
// the auth context (never which field was wrong, nor any raw provider text).
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactElement } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { OsButton } from "@/design-system/OsButton";
import { useAuth } from "./useAuth";
import "./login.css";

interface FromState {
  from?: { pathname?: string };
}

function intendedPath(state: unknown): string {
  const from = (state as FromState | null)?.from?.pathname;
  return from && from !== "/login" ? from : "/";
}

export function LoginPage(): ReactElement {
  const { status, mode, error, isInitializing, signIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const target = intendedPath(location.state);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  // Focus the first field once the form is interactable.
  useEffect(() => {
    if (!isInitializing && status !== "AUTHENTICATED") emailRef.current?.focus();
  }, [isInitializing, status]);

  // Already authenticated (or local mode, which is always authenticated) →
  // never show the login form; go to the intended route.
  if (status === "AUTHENTICATED" || mode === "LOCAL") {
    return <Navigate to={target} replace />;
  }

  const busy = status === "SIGNING_IN";

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (busy) return;
    await signIn(email.trim(), password);
    // Navigation happens reactively: when status flips to AUTHENTICATED the guard
    // above redirects on the next render. We also nudge it here for immediacy.
    navigate(target, { replace: true });
  };

  const errorId = "auth-login-error";

  return (
    <div className="auth-login" dir="rtl" lang="he">
      <main className="auth-login__card" role="main">
        <header className="auth-login__head">
          <h1 className="auth-login__title">TERAGON AI BUSINESS OS</h1>
          <p className="auth-login__subtitle">התחברות למערכת</p>
        </header>

        {isInitializing ? (
          <div className="auth-login__status" role="status" aria-busy="true">
            משחזר חיבור…
          </div>
        ) : (
          <form className="auth-login__form" onSubmit={onSubmit} noValidate>
            <div className="auth-login__field">
              <label className="auth-login__label" htmlFor="auth-email">
                כתובת אימייל
              </label>
              <input
                id="auth-email"
                ref={emailRef}
                className="auth-login__input"
                type="email"
                name="email"
                autoComplete="username"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error?.category === "INVALID_CREDENTIALS" || undefined}
                aria-describedby={error ? errorId : undefined}
                disabled={busy}
                required
              />
            </div>

            <div className="auth-login__field">
              <label className="auth-login__label" htmlFor="auth-password">
                סיסמה
              </label>
              <input
                id="auth-password"
                className="auth-login__input"
                type="password"
                name="password"
                autoComplete="current-password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error?.category === "INVALID_CREDENTIALS" || undefined}
                aria-describedby={error ? errorId : undefined}
                disabled={busy}
                required
              />
            </div>

            {error && (
              <p id={errorId} className="auth-login__error" role="alert">
                {error.message}
              </p>
            )}

            <div className="auth-login__actions">
              <OsButton type="submit" variant="primary" size="lg" className="auth-login__submit">
                {busy ? "מתחבר…" : "התחברות"}
              </OsButton>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

export default LoginPage;
