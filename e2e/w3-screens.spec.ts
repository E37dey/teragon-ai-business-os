// Wave 3 — screenshots of the five screens at three resolutions
// → docs/screenshots/wave3/ (visual QA input).
import { test, expect, type Page } from "@playwright/test";

const SCREENS = [
  { path: "/", name: "command-center" },
  { path: "/crm", name: "crm" },
  { path: "/customers/cu-2", name: "customer-360" },
  { path: "/sales", name: "sales" },
  { path: "/documents", name: "documents" },
] as const;

const SIZES = [
  { w: 1920, h: 1080 },
  { w: 2560, h: 1440 },
  { w: 3840, h: 2160 },
] as const;

async function ready(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator("nav.os-nav").first()).toBeVisible();
  await page.waitForTimeout(600); // let async collections settle
}

for (const screen of SCREENS) {
  for (const size of SIZES) {
    test(`${screen.name} @ ${size.w}x${size.h}`, async ({ page }) => {
      await page.setViewportSize({ width: size.w, height: size.h });
      await ready(page, screen.path);
      await page.screenshot({
        path: `docs/screenshots/wave3/${screen.name}-${size.w}x${size.h}.png`,
        fullPage: false,
      });
    });
  }
}
