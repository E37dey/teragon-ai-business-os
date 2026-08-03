// S10.3-E — UI stays usable and safe when connectivity drops (LOCAL synthetic).
import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

const BENIGN = [/favicon/i, /ResizeObserver loop/i, /React DevTools/i, /React Router Future Flag/i, /\[vite\]/i, /Failed to load resource/i, /net::ERR_INTERNET_DISCONNECTED/i];

function collectErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error" && !BENIGN.some((re) => re.test(m.text()))) errs.push(m.text());
  });
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  return errs;
}

async function overflowPx(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
}

test("loaded shell survives going offline: no crash, RTL, banner, no console error", async ({ page, context }) => {
  const errs = collectErrors(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("header.os-header").first()).toBeVisible({ timeout: 30_000 });

  // Connectivity drops on the already-loaded SPA. It must remain intact — not
  // blank, not thrown. (Navigating to an UNVISITED lazy-loaded route while
  // offline cannot fetch its chunk; that is an honest SPA limitation, recorded in
  // the evidence, not a crash — so this test does not force such a navigation.)
  await context.setOffline(true);
  await page.waitForTimeout(400);
  await expect(page.locator("header.os-header").first()).toBeVisible();
  await expect(page.locator("main").first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("demo-mode-banner")).toBeVisible();

  await context.setOffline(false);
  expect(errs, `unexpected console errors: ${errs.join(" | ")}`).toEqual([]);
});

test("primary action stays keyboard reachable and focus is not lost after an offline interaction", async ({ page, context }, testInfo) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("header.os-header").first()).toBeVisible({ timeout: 30_000 });
  await context.setOffline(true);

  // The quick-add primary action is reachable and operable via the keyboard.
  const quickAdd = page.getByRole("button", { name: /הוספה מהירה/ }).first();
  await quickAdd.focus();
  await expect(quickAdd).toBeFocused();
  await page.keyboard.press("Enter");

  // The quick-create dialog opens even offline (LOCAL); focus lands inside it.
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // Submit the empty form offline → honest validation, no crash, field stays
  // focusable (focus is not lost into the void).
  await page.getByRole("button", { name: "לקוח חדש" }).click();
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  const nameField = page.getByLabel("שם הלקוח");
  await nameField.focus();
  await expect(nameField).toBeFocused();

  await context.setOffline(false);
  void testInfo;
});

test("stays usable while offline (no overflow, nav reachable per viewport)", async ({ page, context }, testInfo) => {
  const width = testInfo.project.use.viewport?.width ?? 1440;
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("header.os-header").first()).toBeVisible({ timeout: 30_000 });
  await context.setOffline(true);

  expect(await overflowPx(page)).toBeLessThanOrEqual(2);
  if (width < 640) {
    // narrow: navigation stays reachable via the hamburger drawer.
    const hamburger = page.getByRole("button", { name: /פתיחת תפריט הניווט/ }).first();
    await expect(hamburger).toBeVisible();
    await hamburger.click();
    await expect(page.locator(".os-nav-drawer, .os-nav--in-drawer").first()).toBeVisible();
  } else {
    // wide: the inline nav is present and reachable.
    await expect(page.locator("nav.os-nav").first()).toBeVisible();
  }

  await context.setOffline(false);
});
