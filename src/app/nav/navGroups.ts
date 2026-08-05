// Grouped RTL navigation model — the 5 canonical groups of the TERAGON shell.
// Every item path MUST exist in APP_ROUTES (verified by tests/navGroups.test.ts).
//
// Deliberately NOT in the nav: "/customers" (reachable from the /crm screen and
// by direct URL — docs/WAVE_2_INTEGRATION_REPORT.md documents this) and
// "/submission/presentation" (opened from the submission center itself).
import type { IconName } from "@/design-system/icons";

export interface NavGroupItem {
  /** route path (also the nav item id) */
  path: string;
  label: string;
  icon: IconName;
}

export interface NavGroup {
  id: string;
  label: string;
  items: readonly NavGroupItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: "business",
    label: "ניהול העסק",
    items: [
      { path: "/", label: "מרכז השליטה", icon: "home" },
      { path: "/crm", label: "לקוחות ולידים", icon: "users" },
      { path: "/sales", label: "מכירות והתאמת מדפסות", icon: "briefcase" },
      { path: "/organizations", label: "ארגונים ומוסדות", icon: "building" },
      { path: "/tasks", label: "משימות ופגישות", icon: "clock" },
      { path: "/documents", label: "מסמכים והצעות מחיר", icon: "doc" },
    ],
  },
  {
    id: "service",
    label: "שירות והדרכה",
    items: [
      { path: "/courses", label: "קורסים והכשרות", icon: "graduation" },
      { path: "/service", label: "שירות ותיקונים", icon: "wrench" },
      { path: "/printers", label: "מדפסות וציוד", icon: "printer" },
      { path: "/support", label: "תמיכה לאחר ההשקה", icon: "mail" },
    ],
  },
  {
    // AI Lab — all deterministic AI surfaces grouped under one honest "local demo"
    // area (S11.2-B). id kept as "knowledge" for stable persisted state + tests.
    id: "knowledge",
    label: "מעבדת AI · דמו מקומי",
    items: [
      { path: "/agents", label: "סוכני AI", icon: "bot" },
      { path: "/agents/collaboration", label: "חדר התיאום", icon: "network" },
      { path: "/automations", label: "אוטומציות", icon: "gear" },
      { path: "/memory", label: "זיכרון Obsidian", icon: "memory" },
      { path: "/knowledge", label: "מאגר ידע", icon: "book" },
      { path: "/learning", label: "מרכז למידה ושיפור", icon: "sparkle" },
      { path: "/governance", label: "ממשל ובקרת AI", icon: "shield" },
    ],
  },
  {
    id: "adoption",
    label: "הטמעה והגשה",
    items: [
      { path: "/implementation", label: "תכנית ההטמעה", icon: "target" },
      { path: "/personas", label: "פרסונות ומסלולי הדרכה", icon: "users" },
      { path: "/stage-gates", label: "שערי מעבר וראיות", icon: "check" },
      { path: "/training-materials", label: "חומרי הדרכה", icon: "book" },
      { path: "/quick-start", label: "התחלה מהירה", icon: "sparkle" },
      { path: "/faq", label: "FAQ והתנגדויות", icon: "inbox" },
      { path: "/analytics", label: "דוחות וניתוחים", icon: "gauge" },
      { path: "/submission", label: "מרכז ההגשה", icon: "evidence" },
    ],
  },
  {
    // Secondary / reference area — renamed "עוד" (S11.2-B). Governance moved to the
    // AI Lab group above; the remaining system pages stay reachable here.
    id: "system",
    label: "עוד",
    items: [
      { path: "/administration", label: "משתמשים והרשאות", icon: "users" },
      { path: "/system-health", label: "בריאות המערכת", icon: "gauge" },
      { path: "/settings", label: "הגדרות", icon: "gear" },
    ],
  },
] as const;

/** the group containing a given route path (exact, then longest prefix) */
export function groupOfPath(path: string): NavGroup | undefined {
  const exact = NAV_GROUPS.find((g) => g.items.some((i) => i.path === path));
  if (exact) return exact;
  let best: { group: NavGroup; len: number } | undefined;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.path !== "/" && path.startsWith(item.path) && item.path.length > (best?.len ?? 0)) {
        best = { group, len: item.path.length };
      }
    }
  }
  return best?.group;
}

/** the active nav item id for a route path (exact, then longest prefix) */
export function activeItemForPath(path: string): string | undefined {
  for (const group of NAV_GROUPS) {
    const exact = group.items.find((i) => i.path === path);
    if (exact) return exact.path;
  }
  let best: { id: string; len: number } | undefined;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.path !== "/" && path.startsWith(item.path) && item.path.length > (best?.len ?? 0)) {
        best = { id: item.path, len: item.path.length };
      }
    }
  }
  return best?.id;
}
