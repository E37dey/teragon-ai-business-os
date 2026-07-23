// W7-F — the floating "חזרה למצגת" control (7.22). Rendered app-wide (wiring
// request in docs/integration-requests-w7f.md; the W7-F e2e harness mounts it
// the same way). Visible only while the presenter is OUT on a demo link
// (sessionStorage flag) and never on the presentation route itself. Clicking
// navigates back — the persisted session state resumes the exact section.
import { useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  hasPresentationReturn,
  PRESENTATION_RETURN_EVENT,
  PRESENTATION_ROUTE,
} from "@/presentation";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", onChange);
  window.addEventListener(PRESENTATION_RETURN_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PRESENTATION_RETURN_EVENT, onChange);
  };
}

export function ReturnToPresentation(): ReactElement | null {
  const location = useLocation();
  const navigate = useNavigate();
  const pending = useSyncExternalStore(subscribe, hasPresentationReturn, () => false);

  if (!pending || location.pathname === PRESENTATION_ROUTE) return null;

  return (
    <button
      type="button"
      data-testid="return-to-presentation"
      onClick={() => navigate(PRESENTATION_ROUTE)}
      style={{
        position: "fixed",
        insetBlockEnd: 20,
        insetInlineStart: 20,
        zIndex: 1000,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 18px",
        borderRadius: "var(--os-radius-full)",
        border: "1px solid var(--os-cyan)",
        background: "var(--os-panel)",
        color: "var(--os-cyan)",
        fontWeight: 700,
        fontSize: "var(--os-text-sm)",
        cursor: "pointer",
        boxShadow: "0 4px 24px rgba(32,196,232,0.35)",
      }}
    >
      ◀ חזרה למצגת
    </button>
  );
}
