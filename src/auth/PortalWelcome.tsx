// TERAGON vNext — the demo portal welcome / login entry (Phase B).
//
// DEMO-ONLY entry: shows the three role portals as cards. "כניסה כדמו" PREFILLS
// the credentials for that account; the actual "כניסה" action still authenticates
// (authenticateDemo) before entering the portal. Selecting a card can never grant
// authorization — the role is loaded from the trusted account record on success.
// The cards + visible credentials render ONLY when isDemoMode() is true.
import { useState } from "react";
import type { ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { OsButton, Panel } from "@/design-system";
import { isDemoMode } from "@/app/demoMode";
import { DEMO_ACCOUNTS, authenticateDemo, type DemoAccount } from "./demoAccounts";
import { enterDemoPortal } from "@/authorization/portalSession";
import { PORTAL_META } from "@/authorization/portals";

export default function PortalWelcome(): ReactElement {
  const navigate = useNavigate();
  const demo = isDemoMode();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const prefill = (a: DemoAccount): void => {
    setEmail(a.email);
    setPassword(a.password);
    setError(null);
  };

  const enter = (): void => {
    const account = authenticateDemo(email, password);
    if (account === null) {
      setError("אימות דמו נכשל — בדקו את הדוא\"ל והסיסמה");
      return;
    }
    enterDemoPortal(account); // role from the trusted record — never the card/URL
    navigate(PORTAL_META[account.portal].landing, { replace: true });
  };

  return (
    <main className="portal-welcome" dir="rtl" role="main">
      <div className="portal-welcome__brand">
        <div className="portal-welcome__logo">TERAGON</div>
        <div className="portal-welcome__sub">AI BUSINESS OS</div>
      </div>

      {demo && (
        <section aria-label="כניסת דמו" className="portal-welcome__section">
          <h1 className="portal-welcome__title">כניסת דמו</h1>
          <p className="portal-welcome__hint">בחרו סביבת עבודה לצפייה בהדגמה</p>
          <div className="portal-welcome__cards">
            {DEMO_ACCOUNTS.map((a) => {
              const meta = PORTAL_META[a.portal];
              return (
                <Panel key={a.userId} variant="raised" className="portal-card" data-portal={a.portal}>
                  <div className="portal-card__label">{meta.labelHe}</div>
                  <div className="portal-card__tag">{meta.taglineHe}</div>
                  <div className="portal-card__name">{a.nameHe}</div>
                  <OsButton
                    variant="primary"
                    size="sm"
                    onClick={() => prefill(a)}
                    data-testid={`demo-prefill-${a.portal}`}
                  >
                    כניסה כדמו
                  </OsButton>
                </Panel>
              );
            })}
          </div>
        </section>
      )}

      <form
        className="portal-welcome__form"
        onSubmit={(e) => {
          e.preventDefault();
          enter();
        }}
      >
        <label className="portal-welcome__flabel" htmlFor="pw-email">
          דוא"ל
        </label>
        <input
          id="pw-email"
          type="email"
          className="portal-welcome__input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          data-testid="demo-email"
        />
        <label className="portal-welcome__flabel" htmlFor="pw-pass">
          סיסמה
        </label>
        <input
          id="pw-pass"
          type="password"
          className="portal-welcome__input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          data-testid="demo-password"
        />
        {error !== null && (
          <div role="alert" className="portal-welcome__error" data-testid="demo-login-error">
            {error}
          </div>
        )}
        <OsButton variant="primary" type="submit" data-testid="demo-login-submit">
          כניסה
        </OsButton>
      </form>

      {demo && (
        <details className="portal-welcome__creds" data-testid="demo-credentials">
          <summary>Demo credentials</summary>
          <ul>
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.userId} dir="ltr" className="os-num">
                {PORTAL_META[a.portal].labelHe}: {a.email} · {a.password}
              </li>
            ))}
          </ul>
          <p className="portal-welcome__creds-note">
            חשבונות הדגמה מקומיים בלבד — אינם סודות ייצור.
          </p>
        </details>
      )}
    </main>
  );
}
