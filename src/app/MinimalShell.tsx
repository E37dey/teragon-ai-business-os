// Minimal neutral dark placeholder shell — Wave 1 only. The Design agent's
// RightPrimaryNavigation / CompactTopHeader / LeftIntelligenceRail replace this
// in the Wave 2 integration. Right-side nav (RTL), main outlet, inline styles only.
import { Link, Outlet, useLocation } from "react-router-dom";
import { APP_ROUTES } from "./routes";
import { MODE_LABEL, useAppMode } from "./mode";

export default function MinimalShell() {
  const location = useLocation();
  const mode = useAppMode();

  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "row",
        background: "#030812",
        color: "#98A8BD",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* right-side navigation (first in RTL row = right edge) */}
      <nav
        aria-label="ניווט ראשי"
        style={{
          width: "230px",
          flexShrink: 0,
          background: "#050B15",
          borderInlineEnd: "1px solid rgba(112,158,220,.17)",
          padding: "1rem 0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.15rem",
          overflowY: "auto",
        }}
      >
        <div style={{ color: "#F5F8FD", fontWeight: 700, padding: "0.25rem 0.5rem" }}>
          TERAGON AI BUSINESS OS
        </div>
        <div style={{ fontSize: "0.7rem", color: "#65758B", padding: "0 0.5rem 0.75rem" }}>
          {MODE_LABEL[mode]} · shell זמני (גל 1)
        </div>
        {APP_ROUTES.filter((r) => r.inNav).map((r) => {
          const active = location.pathname === r.navPath;
          return (
            <Link
              key={r.path}
              to={r.navPath}
              style={{
                display: "block",
                padding: "0.35rem 0.5rem",
                borderRadius: "6px",
                fontSize: "0.85rem",
                textDecoration: "none",
                color: active ? "#F5F8FD" : "#98A8BD",
                background: active ? "#0C1C31" : "transparent",
              }}
            >
              {r.title}
            </Link>
          );
        })}
      </nav>

      <main style={{ flexGrow: 1, background: "#030812" }}>
        <Outlet />
      </main>
    </div>
  );
}
