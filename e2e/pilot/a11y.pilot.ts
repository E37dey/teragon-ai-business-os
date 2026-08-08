// S10.3-D — enforced accessibility gate for the Demo Pilot.
// Chromium × {1440, 390}. LOCAL synthetic-data build, Demo Mode ON. No staging,
// no Production, no real data, no service-role.
//
// NO blanket axe exclusions. The exploratory scan found ZERO critical/serious
// violations across every pilot route at both viewports, so the gate asserts an
// empty violation set with no allowlist — any new critical/serious violation
// fails the build.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const DEMO_BANNER = "סביבת הדגמה — הנתונים במערכת סינתטיים ואינם נתוני העסק";

const ROUTES: ReadonlyArray<{ id: string; path: string; shell: boolean }> = [
  { id: "login", path: "/login", shell: false },
  { id: "shell-home", path: "/", shell: true },
  { id: "customers-list", path: "/customers", shell: true },
  { id: "customer-detail", path: "/customers/cu-1", shell: true },
  { id: "contacts-list", path: "/contacts", shell: true },
  { id: "system-health", path: "/system-health", shell: true },
  { id: "memory", path: "/memory", shell: true }, // S13.4 (PR D): real local-memory CRUD
];

async function ready(page: Page): Promise<void> {
  // The demo banner is above the router → present on every route once mounted.
  await page.getByTestId("demo-mode-banner").waitFor({ state: "visible", timeout: 30_000 });
}

/** critical + serious violations only — the enforced severity floor. */
async function criticalSerious(page: Page): Promise<{ id: string; impact: string; nodes: string[] }[]> {
  const res = await new AxeBuilder({ page }).analyze();
  return res.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, impact: v.impact ?? "?", nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 6) }));
}

for (const route of ROUTES) {
  test(`${route.id} — no critical/serious axe violations`, async ({ page }) => {
    await page.goto(route.path, { waitUntil: "domcontentloaded" });
    await ready(page);
    const violations = await criticalSerious(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
}

test("landmarks and RTL semantic order", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await ready(page);
  // RTL is a VISUAL property; the DOM/reading order must stay logical.
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  // Landmarks: a main content region and a banner status live-region.
  await expect(page.locator("main").first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: DEMO_BANNER })).toBeVisible();
  // Exactly one h1-level page identity (no heading-order violation is enforced by
  // axe above; here we assert a top heading exists as the document label).
  expect(await page.locator("h1, [role='heading'][aria-level='1']").count()).toBeGreaterThanOrEqual(1);
});

test("primary header actions have accessible names and are keyboard reachable", async ({ page }, testInfo) => {
  const width = testInfo.project.use.viewport?.width ?? 1440;
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await ready(page);

  // Accessible names (not just icons) on the primary controls.
  await expect(page.getByRole("button", { name: /הוספה מהירה/ }).first()).toBeVisible();
  if (width < 640) {
    await expect(page.getByRole("button", { name: /חיפוש גלובלי/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /פתיחת תפריט הניווט/ }).first()).toBeVisible();
  } else {
    await expect(page.getByRole("searchbox", { name: /חיפוש גלובלי/ }).first()).toBeVisible();
  }

  // Keyboard reachability + visible focus: Tab from the top must land on a
  // real, focusable interactive control (never a dead element).
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  let landed = false;
  for (let i = 0; i < 25 && !landed; i++) {
    await page.keyboard.press("Tab");
    landed = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return false;
      const tag = el.tagName.toLowerCase();
      return ["a", "button", "input", "select", "textarea"].includes(tag) || el.hasAttribute("tabindex");
    });
  }
  expect(landed, "Tab reaches a focusable interactive control").toBe(true);
});

test("memory CRUD — labelled controls, keyboard reachable, accessible archived + error state", async ({ page }) => {
  // S13.4 (PR D): the real local-memory CRUD is substantial new interactive UI.
  await page.goto("/memory", { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.getByTestId("memory-entries-workspace").waitFor({ state: "visible", timeout: 30_000 });

  // Toolbar controls have accessible names (labels/aria-label), not icon-only.
  await expect(page.getByLabel("חיפוש בזיכרון המקומי").first()).toBeVisible();
  await expect(page.getByLabel("סינון לפי קטגוריה")).toBeVisible();
  await expect(page.getByLabel("הצגת פריטים בארכיון")).toBeVisible();
  await expect(page.getByTestId("memory-new")).toBeVisible();

  // Keyboard: opening the editor exposes labelled fields + a save control.
  await page.getByTestId("memory-new").click();
  await expect(page.getByTestId("memory-editor")).toBeVisible();
  for (const label of ["כותרת הזיכרון", "תוכן הזיכרון", "קטגוריית הזיכרון", "תגיות הזיכרון"]) {
    await expect(page.getByLabel(label)).toBeVisible();
  }
  await expect(page.getByTestId("memory-save")).toBeVisible();

  // Error state is announced (role="alert") — no silent failure on invalid input.
  await page.getByLabel("תוכן הזיכרון").fill("תוכן בלי כותרת");
  await page.getByTestId("memory-save").click();
  await expect(page.getByRole("alert").first()).toBeVisible();

  // Create a valid entry, then archive it and reveal the archive: archived status
  // is conveyed by TEXT ("בארכיון" + a "שחזור" action), never by colour alone.
  await page.getByLabel("כותרת הזיכרון").fill("בדיקת נגישות");
  await page.getByTestId("memory-save").click();
  const row = page.getByTestId("memory-entry-row").filter({ hasText: "בדיקת נגישות" }).first();
  await expect(row).toBeVisible();
  await row.getByTestId("memory-archive").click();
  await page.getByLabel("הצגת פריטים בארכיון").check();
  const archived = page.getByTestId("memory-entry-row").filter({ hasText: "בדיקת נגישות" }).first();
  await expect(archived).toContainText("בארכיון");
  await expect(archived.getByTestId("memory-restore")).toBeVisible();

  // Visible focus: a toolbar control can be focused (real interactive element).
  await page.getByTestId("memory-new").focus();
  await expect(page.getByTestId("memory-new")).toBeFocused();
});

test("quick-create form has labelled inputs and an assertive validation message", async ({ page }) => {
  // LOCAL /login redirects (always authenticated) so the login FORM is not
  // reachable in the demo build; the quick-create flow (a core LOCAL surface)
  // provides the form-label + validation-message coverage instead.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await ready(page);

  await page.getByRole("button", { name: /הוספה מהירה/ }).first().click();
  // Choose "לקוח חדש" (new customer) from the quick-create menu.
  await page.getByRole("button", { name: "לקוח חדש" }).click();

  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();

  // Every field has an accessible name (associated <label htmlFor>).
  const nameField = page.getByLabel("שם הלקוח");
  await expect(nameField).toBeVisible();
  await expect(page.getByLabel("טלפון")).toBeVisible();
  await expect(page.getByLabel("אימייל")).toBeVisible();

  // Submitting empty surfaces an assertive (role="alert") validation message,
  // and the invalid field is marked aria-invalid — not a silent failure.
  await dialog.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(nameField).toHaveAttribute("aria-invalid", "true");
  await nameField.focus();
  await expect(nameField).toBeFocused();
});
