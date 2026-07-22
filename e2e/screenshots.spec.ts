// Wave 2 visual-QA screenshots → docs/screenshots/wave2/
import { test, expect } from "@playwright/test";

const OUT = "docs/screenshots/wave2";
const SIZES = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "2560x1440", width: 2560, height: 1440 },
  { name: "3840x2160", width: 3840, height: 2160 },
] as const;

for (const size of SIZES) {
  test(`shell / at ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/");
    await expect(page.locator("nav.os-nav").first()).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/shell-home-${size.name}.png` });
  });
}

test("global search open (1920x1080)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("nav.os-nav").first()).toBeVisible();
  await page.getByRole("searchbox", { name: "חיפוש גלובלי" }).click();
  await page.getByRole("combobox", { name: "חיפוש בכל המערכת" }).fill("Bambu");
  await expect(page.locator(".os-palette__item--hit").first()).toBeVisible();
  await page.screenshot({ path: `${OUT}/search-open-1920x1080.png` });
});

test("command palette open (1920x1080)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("nav.os-nav").first()).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("combobox", { name: "חיפוש פקודה" })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/palette-open-1920x1080.png` });
});

test("notifications drawer open (1920x1080)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("nav.os-nav").first()).toBeVisible();
  await page.getByRole("button", { name: /^התראות/ }).click();
  await expect(page.locator(".os-ntf").first()).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/notifications-open-1920x1080.png` });
});
