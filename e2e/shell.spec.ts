// Wave 2 shell e2e — grouped nav, badges, global search, command palette,
// quick create, notifications, keyboard nav, console cleanliness, axe.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function gotoReady(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  // the shell is up once the grouped nav renders
  await expect(page.locator("nav.os-nav").first()).toBeVisible();
}

test.describe("grouped navigation", () => {
  test("groups expand/collapse and persist after reload", async ({ page }) => {
    await gotoReady(page);
    const serviceGroup = page.getByRole("button", { name: "שירות והדרכה" });
    await expect(serviceGroup).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("link", { name: /שירות ותיקונים/ })).toBeVisible();

    await serviceGroup.click();
    await expect(serviceGroup).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("link", { name: /שירות ותיקונים/ })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("button", { name: "שירות והדרכה" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    // restore for the following tests' default state
    await page.getByRole("button", { name: "שירות והדרכה" }).click();
    await expect(page.getByRole("link", { name: /שירות ותיקונים/ })).toBeVisible();
  });

  test("active route's group auto-expands and the item is highlighted", async ({ page }) => {
    await gotoReady(page);
    const serviceGroup = page.getByRole("button", { name: "שירות והדרכה" });
    // close the group, then deep-link into a route inside it
    if ((await serviceGroup.getAttribute("aria-expanded")) === "true") {
      await serviceGroup.click();
    }
    await page.goto("/service");
    await expect(page.getByRole("button", { name: "שירות והדרכה" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const active = page.getByRole("link", { name: /שירות ותיקונים/ });
    await expect(active).toHaveAttribute("aria-current", "page");
  });

  test("service badge shows the real open-ticket count from the seed", async ({ page }) => {
    await gotoReady(page);
    const serviceLink = page.getByRole("link", { name: /שירות ותיקונים/ });
    const badge = serviceLink.locator(".os-nav__badge");
    await expect(badge).toBeVisible();
    const text = (await badge.textContent())?.trim() ?? "";
    expect(Number.parseInt(text, 10)).toBeGreaterThan(0);
  });

  test("keyboard: arrows move between nav controls, Home/End jump", async ({ page }) => {
    await gotoReady(page);
    await page.getByRole("button", { name: "ניהול העסק" }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("link", { name: /מרכז השליטה/ })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(page.getByRole("button", { name: "ניהול העסק" })).toBeFocused();
    await page.keyboard.press("End");
    const last = page.locator('[data-nav-focusable="true"]').last();
    await expect(last).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.getByRole("button", { name: "ניהול העסק" })).toBeFocused();
  });
});

test.describe("global search", () => {
  test('"Bambu" finds a printer model and Enter opens its destination', async ({ page }) => {
    await gotoReady(page);
    await page.getByRole("searchbox", { name: "חיפוש גלובלי" }).click();
    const combo = page.getByRole("combobox", { name: "חיפוש בכל המערכת" });
    await expect(combo).toBeVisible();
    await combo.fill("Bambu");
    // a printer-model hit is present
    await expect(
      page.locator(".os-palette__hit-kind", { hasText: "דגם מדפסת" }).first(),
    ).toBeVisible();
    // keyboard: ArrowDown until the highlighted option IS the printer-model hit
    for (let i = 0; i < 15; i++) {
      const activeKind = await page
        .locator(".os-palette__item--active .os-palette__hit-kind")
        .textContent();
      if (activeKind?.trim() === "דגם מדפסת") break;
      await page.keyboard.press("ArrowDown");
    }
    await expect(page.locator(".os-palette__item--active .os-palette__hit-kind")).toHaveText(
      "דגם מדפסת",
    );
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/printers$/);
  });

  test("no-results state is honest and Escape closes", async ({ page }) => {
    await gotoReady(page);
    await page.getByRole("searchbox", { name: "חיפוש גלובלי" }).click();
    const combo = page.getByRole("combobox", { name: "חיפוש בכל המערכת" });
    await combo.fill("xyzzy-not-found-123");
    await expect(page.locator(".os-palette__empty")).toContainText("לא נמצאו תוצאות");
    await page.keyboard.press("Escape");
    await expect(combo).toHaveCount(0);
  });
});

test.describe("command palette + quick create", () => {
  test("Ctrl+K opens the palette and צור ליד חדש creates a lead with toast", async ({ page }) => {
    await gotoReady(page);
    await page.keyboard.press("Control+k");
    const combo = page.getByRole("combobox", { name: "חיפוש פקודה" });
    await expect(combo).toBeVisible();
    await combo.fill("צור ליד");
    await expect(page.getByRole("option", { name: /צור ליד חדש/ })).toBeVisible();
    await page.keyboard.press("Enter");

    // the zod-validated lead form opens
    const dialog = page.getByRole("dialog", { name: "ליד חדש" });
    await expect(dialog).toBeVisible();

    // submit empty first — Hebrew validation errors appear
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(dialog.getByText("שם הליד הוא שדה חובה")).toBeVisible();

    await dialog.locator("#qc-lead-name").fill("ליד בדיקת E2E");
    await dialog.locator("#qc-lead-phone").fill("050-7654321");
    await dialog.locator("#qc-lead-interest").fill("קורס Fusion 360");
    await dialog.getByRole("button", { name: "שמירה" }).click();

    await expect(page.locator(".os-toast")).toContainText("הליד נוצר בהצלחה");
    await expect(page).toHaveURL(/\/crm$/);

    // the new lead is immediately findable in global search
    await page.getByRole("searchbox", { name: "חיפוש גלובלי" }).click();
    await page.getByRole("combobox", { name: "חיפוש בכל המערכת" }).fill("ליד בדיקת E2E");
    await expect(page.locator(".os-palette__item--hit").first()).toContainText("ליד בדיקת E2E");
  });

  test("הצג קיצורי מקלדת opens the real shortcuts dialog", async ({ page }) => {
    await gotoReady(page);
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox", { name: "חיפוש פקודה" }).fill("קיצורי");
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "קיצורי מקלדת" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Ctrl+K / ⌘K")).toBeVisible();
  });
});

test.describe("notification center", () => {
  test("bell opens the drawer; mark-read persists across reload", async ({ page }) => {
    await gotoReady(page);
    const bell = page.getByRole("button", { name: /^התראות/ });
    const countBadge = bell.locator(".os-header__count");
    await expect(countBadge).toBeVisible();
    const before = Number.parseInt((await countBadge.textContent()) ?? "0", 10);
    expect(before).toBeGreaterThan(0);

    await bell.click();
    const drawer = page.getByRole("dialog", { name: /התראות/ });
    await expect(drawer).toBeVisible();
    await expect(drawer.locator(".os-ntf").first()).toBeVisible();

    // mark the first unread notification as read
    await drawer.locator(".os-ntf:not(.os-ntf--read) .os-ntf__read-toggle").first().click();
    await expect(bell.locator(".os-header__count")).toHaveText(String(before - 1));
    await page.keyboard.press("Escape");

    // persists (IndexedDB) after reload
    await page.reload();
    await expect(page.locator("nav.os-nav").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^התראות/ }).locator(".os-header__count"),
    ).toHaveText(String(before - 1));
  });

  test("unread-only filter and category filters work", async ({ page }) => {
    await gotoReady(page);
    await page.getByRole("button", { name: /^התראות/ }).click();
    const drawer = page.getByRole("dialog", { name: /התראות/ });
    await drawer.getByRole("button", { name: "משימות" }).click();
    const items = drawer.locator(".os-ntf");
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      await expect(items.nth(i).locator(".os-chip")).toHaveText("משימות");
    }
  });
});

test.describe("console cleanliness + accessibility", () => {
  for (const path of ["/", "/crm", "/agents"]) {
    test(`no console errors on ${path}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      page.on("pageerror", (err) => errors.push(String(err)));
      await gotoReady(page, path);
      await page.waitForTimeout(500);
      expect(errors).toEqual([]);
    });
  }

  test("axe on / — zero serious/critical violations", async ({ page }) => {
    await gotoReady(page);
    const results = await new AxeBuilder({ page }).analyze();
    const severe = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(severe.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }))).toEqual([]);
  });
});
