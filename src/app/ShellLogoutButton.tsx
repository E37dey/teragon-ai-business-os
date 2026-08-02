// TERAGON AI BUSINESS OS — Gate S9.1-B2: shell logout control.
//
// Renders a logout button ONLY for a real authenticated Supabase session. On
// click it calls the real Auth provider's signOut() — which clears the canonical
// identity and session — then redirects to /login with `replace` so browser
// back/refresh cannot restore protected content without a valid session. After
// sign-out the composition/getRepository gates fail closed (AUTH_REQUIRED), so
// repository access is invalidated. In LOCAL mode (or when not authenticated) it
// renders nothing.
import type { ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { shellShowsLogout } from "./shellAccount";

export function ShellLogoutButton(): ReactElement | null {
  const { mode, status, signOut } = useAuth();
  const navigate = useNavigate();
  if (!shellShowsLogout(mode, status)) return null;
  return (
    <button
      type="button"
      className="os-header__iconbtn"
      aria-label="התנתקות"
      title="התנתקות"
      data-testid="shell-logout"
      onClick={() => {
        void signOut().then(() => navigate("/login", { replace: true }));
      }}
    >
      התנתקות
    </button>
  );
}
