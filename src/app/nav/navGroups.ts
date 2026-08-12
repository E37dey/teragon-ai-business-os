// Grouped RTL navigation model — Product V2 (S13.1): six calm primary groups.
// Everyday business first; academic/training/reference/submission stay reachable
// under "מערכת ומתקדם" (collapsed by default) so they don't dominate daily nav.
// Every item path MUST exist in APP_ROUTES (verified by tests/navGroups.test.ts).
//
// Deliberately NOT in the nav: "/customers/:id" (opened from a customer row) and
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
    id: "command",
    label: "מרכז השליטה",
    items: [
      { path: "/", label: "מרכז השליטה", icon: "home" },
      { path: "/analytics", label: "דוחות וניתוחים", icon: "gauge" },
    ],
  },
  {
    id: "customers",
    label: "לקוחות ואנשי קשר",
    items: [
      { path: "/crm", label: "לקוחות ולידים", icon: "users" },
      { path: "/customers", label: "לקוחות", icon: "users" },
      { path: "/contacts", label: "אנשי קשר", icon: "users" },
      { path: "/organizations", label: "ארגונים ומוסדות", icon: "building" },
      { path: "/sales", label: "מכירות והצעות מחיר", icon: "briefcase" },
      { path: "/documents", label: "מסמכים", icon: "doc" },
    ],
  },
  {
    id: "ai",
    label: "AI וסוכנים",
    items: [
      { path: "/ai-workspace", label: "מרחב AI", icon: "sparkle" },
      { path: "/agents", label: "סוכני AI", icon: "bot" },
      { path: "/agents/collaboration", label: "חדר התיאום", icon: "network" },
    ],
  },
  {
    id: "knowledge",
    label: "ידע וזיכרון",
    items: [
      { path: "/knowledge", label: "מאגר ידע", icon: "book" },
      { path: "/memory", label: "זיכרון מקומי", icon: "memory" },
    ],
  },
  {
    id: "operations",
    label: "תפעול ואוטומציה",
    items: [
      { path: "/automations", label: "אוטומציות", icon: "gear" },
      { path: "/tasks", label: "משימות ופגישות", icon: "clock" },
      { path: "/service", label: "שירות ותיקונים", icon: "wrench" },
      { path: "/printers", label: "מדפסות וציוד", icon: "printer" },
      { path: "/system-health", label: "בריאות המערכת", icon: "gauge" },
    ],
  },
  {
    // System & Advanced — everyday-secondary + all demoted academic/training/
    // reference/submission routes. Collapsed by default; reachable when needed.
    id: "system",
    label: "מערכת ומתקדם",
    items: [
      { path: "/settings", label: "הגדרות", icon: "gear" },
      { path: "/administration", label: "משתמשים והרשאות", icon: "users" },
      { path: "/governance", label: "ממשל ובקרת AI", icon: "shield" },
      { path: "/courses", label: "קורסים והכשרות", icon: "graduation" },
      { path: "/learning", label: "מרכז למידה ושיפור", icon: "sparkle" },
      { path: "/implementation", label: "תכנית ההטמעה", icon: "target" },
      { path: "/personas", label: "פרסונות ומסלולי הדרכה", icon: "users" },
      { path: "/stage-gates", label: "שערי מעבר וראיות", icon: "check" },
      { path: "/training-materials", label: "חומרי הדרכה", icon: "book" },
      { path: "/quick-start", label: "התחלה מהירה", icon: "sparkle" },
      { path: "/faq", label: "FAQ והתנגדויות", icon: "inbox" },
      { path: "/support", label: "תמיכה לאחר ההשקה", icon: "mail" },
      { path: "/submission", label: "מרכז ההגשה", icon: "evidence" },
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
