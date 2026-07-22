// OsShell — Wave 1→2 integration: wires the Design agent's AppShell (src/layout)
// to react-router. Owned by Architecture & Integration. Replaces MinimalShell.
import { Link, Outlet, useLocation } from "react-router-dom";
import { AppShell, LeftIntelligenceRail, type NavItem } from "@/layout";
import { ToastProvider } from "@/design-system";
import type { IconName } from "@/design-system/icons";
import { APP_ROUTES } from "./routes";
import { MODE_LABEL, useAppMode } from "./mode";

/** Canonical identity — the single place the app injects it (docs/DECISION_LOG D-005). */
export const CANONICAL_USER = { name: "צחי זוסטייהם", role: 'מנכ"ל · טרגון טכנולוגיות' } as const;

const ROUTE_ICONS: Record<string, IconName> = {
  "/": "home",
  "/crm": "users",
  "/customers": "users",
  "/sales": "briefcase",
  "/courses": "graduation",
  "/service": "wrench",
  "/printers": "printer",
  "/organizations": "building",
  "/tasks": "clock",
  "/documents": "doc",
  "/automations": "gear",
  "/agents": "bot",
  "/agents/collaboration": "network",
  "/memory": "memory",
  "/knowledge": "book",
  "/learning": "sparkle",
  "/analytics": "gauge",
  "/governance": "shield",
  "/implementation": "target",
  "/personas": "users",
  "/stage-gates": "check",
  "/training-materials": "book",
  "/quick-start": "sparkle",
  "/faq": "inbox",
  "/support": "mail",
  "/administration": "gear",
  "/submission": "evidence",
  "/submission/presentation": "doc",
};

const NAV_ITEMS: readonly NavItem[] = APP_ROUTES.filter((r) => r.inNav).map((r) => ({
  id: r.path,
  label: r.title,
  icon: ROUTE_ICONS[r.path] ?? "dot",
  href: r.navPath,
}));

/** Honest default rail until each screen ships its contextual rail (PAGE_CONTRACT). */
function DefaultRail() {
  const location = useLocation();
  const mode = useAppMode();
  const route = APP_ROUTES.find(
    (r) => r.navPath === location.pathname || r.path === location.pathname,
  );
  return (
    <LeftIntelligenceRail title="לוח הקשר">
      <div style={{ display: "grid", gap: "0.5rem", fontSize: "var(--os-font-13, 13px)" }}>
        <div>{MODE_LABEL[mode]}</div>
        {route ? (
          <div style={{ color: "var(--os-muted)" }}>
            ה-rail ההקשרי של «{route.title}» ייבנה יחד עם המסך (גל {route.wave}).
          </div>
        ) : null}
      </div>
    </LeftIntelligenceRail>
  );
}

export default function OsShell() {
  const location = useLocation();
  return (
    <ToastProvider>
      <AppShell
        navItems={NAV_ITEMS}
        activeRoute={location.pathname}
        user={CANONICAL_USER}
        renderLink={({ item, content, className, active }) => (
          <Link to={item.href} className={className} aria-current={active ? "page" : undefined}>
            {content}
          </Link>
        )}
        railContent={<DefaultRail />}
      >
        <Outlet />
      </AppShell>
    </ToastProvider>
  );
}
