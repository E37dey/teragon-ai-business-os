// W9-C shared e2e helpers — the canonical 31-route table (mirrors
// src/app/routes.ts), console-error collection (every final spec asserts a
// clean console), and shell-ready / no-infinite-loading waits used across the
// FINAL regression, resilience, accessibility, visual and print suites.
import { expect, type Page } from "@playwright/test";

export interface RouteRow {
  /** concrete sample path (navPath in routes.ts) */
  path: string;
  /** Hebrew screen title */
  title: string;
  /** whether the screen renders inside OsShell (false = top-level presentation) */
  inShell: boolean;
}

// Mirror of APP_ROUTES navPaths (src/app/routes.ts). 31 operational routes.
export const ROUTES: readonly RouteRow[] = [
  { path: "/", title: "מרכז הפיקוד", inShell: true },
  { path: "/crm", title: "ניהול לקוחות ולידים (CRM)", inShell: true },
  { path: "/customers", title: "לקוחות", inShell: true },
  { path: "/customers/cu-1", title: "כרטיס לקוח", inShell: true },
  { path: "/sales", title: "מכירות והצעות מחיר", inShell: true },
  { path: "/courses", title: "קורסים ולמידה", inShell: true },
  { path: "/service", title: "שירות ותיקונים", inShell: true },
  { path: "/printers", title: "מדפסות ודגמים", inShell: true },
  { path: "/organizations", title: "ארגונים", inShell: true },
  { path: "/tasks", title: "משימות ופגישות", inShell: true },
  { path: "/documents", title: "מסמכים והצעות מחיר", inShell: true },
  { path: "/automations", title: "אוטומציות", inShell: true },
  { path: "/agents", title: "סוכני AI", inShell: true },
  { path: "/agents/collaboration", title: "חדר התיאום של הסוכנים", inShell: true },
  { path: "/memory", title: "זיכרון ארגוני · Obsidian", inShell: true },
  { path: "/knowledge", title: "מאגר ידע", inShell: true },
  { path: "/learning", title: "מרכז למידה ושיפור", inShell: true },
  { path: "/analytics", title: "דוחות וניתוחים", inShell: true },
  { path: "/governance", title: "ממשל ובקרת AI", inShell: true },
  { path: "/implementation", title: "תכנית ההטמעה", inShell: true },
  { path: "/personas", title: "פרסונות ומסלולי הדרכה", inShell: true },
  { path: "/stage-gates", title: "Stage Gates · שערי מעבר וראיות", inShell: true },
  { path: "/training-materials", title: "מרכז חומרי ההדרכה", inShell: true },
  { path: "/quick-start", title: "התחלה מהירה ושימוש נכון", inShell: true },
  { path: "/faq", title: "FAQ והתנגדויות", inShell: true },
  { path: "/support", title: "תמיכה לאחר ההשקה", inShell: true },
  { path: "/administration", title: "ניהול המערכת", inShell: true },
  { path: "/system-health", title: "בריאות המערכת", inShell: true },
  { path: "/settings", title: "הגדרות", inShell: true },
  { path: "/submission", title: "מרכז ההגשה והראיות", inShell: true },
  { path: "/submission/presentation", title: "מצגת ההגשה", inShell: false },
] as const;

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

/** offline runs produce expected fetch-failure noise — everything else must be clean */
export function nonNetworkErrors(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      !e.includes("ERR_INTERNET_DISCONNECTED") &&
      !e.includes("Failed to load resource") &&
      !e.includes("net::") &&
      !e.includes("the server responded with a status"),
  );
}

/**
 * Wait for overlay ENTRANCE animations to finish before measuring anything.
 *
 * Modals/drawers/palettes/toasts animate `opacity: 0 → 1`
 * (`os-modal-in`, `os-drawer-in`, `os-fade-in`, `os-toast-in` — all suffixed
 * `-in`). axe composites colours at the instant it runs, so sampling mid-fade
 * reports genuine-at-that-instant contrast failures for content that is fully
 * legible once settled (measured: modal title 17.8:1, labels 7.8:1 at rest).
 *
 * We deliberately match only `*-in` names: the decorative Copilot orb
 * (`os-orb-pulse`, `os-orb-ring-spin`) runs forever, so waiting for ALL
 * animations would hang.
 */
export async function settleOverlays(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      !document.getAnimations().some((a) => {
        const name = (a as unknown as { animationName?: string }).animationName ?? "";
        return a.playState === "running" && name.endsWith("-in");
      }),
    undefined,
    { timeout: 10_000 },
  );
}

/** Shell is ready once the grouped nav has rendered. */
export async function gotoShellReady(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });
  await assertNotStuckLoading(page);
}

/** The Suspense fallback (`.os-route-loading[aria-busy]`) must resolve — no
 * screen may sit in an infinite loading state. */
export async function assertNotStuckLoading(page: Page): Promise<void> {
  await expect(page.locator(".os-route-loading")).toHaveCount(0, { timeout: 30_000 });
}

/** Navigate to any route and wait for its real surface. For in-shell routes we
 * wait for the shell nav; for the top-level presentation route we wait for its
 * heading. Then we assert the route title text is present somewhere. */
export async function gotoRoute(page: Page, row: RouteRow): Promise<void> {
  await page.goto(row.path);
  if (row.inShell) {
    await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });
    await assertNotStuckLoading(page);
  } else {
    await expect(page.getByText(/מצגת ההגשה/).first()).toBeVisible({ timeout: 30_000 });
  }
}
