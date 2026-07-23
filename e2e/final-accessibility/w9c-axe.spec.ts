// W9-C Phase 9.10 — FINAL accessibility axe gate across ALL 31 canonical routes
// plus major drawers/modals. Contract: ZERO serious/critical violations on every
// surface (same no-baseline contract as the W6/W7/W8 axe gates). Minor/moderate
// findings are surveyed separately (w9c-a11y-survey.spec.ts) and reported
// honestly in docs/FINAL_ACCESSIBILITY_REPORT.md.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ROUTES, gotoRoute, settleOverlays } from "../final-regression/w9c-helpers";

interface ViolationSummary {
  id: string;
  impact: string;
  help: string;
  nodes: string[];
}

async function seriousViolations(page: Page): Promise<ViolationSummary[]> {
  const results = await new AxeBuilder({ page }).analyze();
  const out: ViolationSummary[] = [];
  for (const v of results.violations) {
    if (v.impact !== "serious" && v.impact !== "critical") continue;
    out.push({
      id: v.id,
      impact: v.impact ?? "",
      help: v.help,
      nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 5),
    });
  }
  return out;
}

// ---- axe on every route ----
for (const row of ROUTES) {
  test(`axe: ${row.path} — ZERO serious/critical`, async ({ page }) => {
    await gotoRoute(page, row);
    await page.waitForTimeout(300);
    await settleOverlays(page);
    expect(await seriousViolations(page)).toEqual([]);
  });
}

// ---- axe on major overlays (drawers / modals / dialogs) ----
test("axe: notifications drawer open — ZERO serious/critical", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^התראות/ }).click();
  await expect(page.getByRole("dialog", { name: /התראות/ })).toBeVisible();
  await settleOverlays(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("axe: command palette open — ZERO serious/critical", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("combobox", { name: "חיפוש פקודה" })).toBeVisible();
  await settleOverlays(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("axe: quick-create lead dialog open — ZERO serious/critical", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "חיפוש פקודה" }).fill("צור ליד");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "ליד חדש" })).toBeVisible();
  await settleOverlays(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("axe: global search results open — ZERO serious/critical", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("searchbox", { name: "חיפוש גלובלי" }).click();
  await page.getByRole("combobox", { name: "חיפוש בכל המערכת" }).fill("Bambu");
  await expect(page.locator(".os-palette__item--hit").first()).toBeVisible();
  await settleOverlays(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("axe: presentation examiner mode — ZERO serious/critical", async ({ page }) => {
  await page.goto("/submission/presentation");
  await expect(page.getByText(/מצגת ההגשה/).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: "מצב הדגמה לבוחן" }).click();
  await page.waitForTimeout(300);
  await settleOverlays(page);
  expect(await seriousViolations(page)).toEqual([]);
});
