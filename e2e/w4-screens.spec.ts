// Wave 4 — full-page screenshots of the six operations screens at three
// resolutions → docs/screenshots/wave4/. Run with: npx playwright test -c e2e/w4.config.ts e2e/w4-screens.spec.ts
import { test, expect } from "@playwright/test";

const ROUTES: [string, string][] = [
  ["/courses", "courses"],
  ["/service", "service"],
  ["/printers", "printers"],
  ["/organizations", "organizations"],
  ["/tasks", "tasks"],
  ["/support", "support"],
];

const SIZES: [number, number][] = [
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
];

for (const [route, name] of ROUTES) {
  for (const [w, h] of SIZES) {
    test(`${name} @ ${w}x${h}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(route);
      await expect(page.locator("nav.os-nav").first()).toBeVisible();
      // let queries resolve and fonts settle
      await page.waitForTimeout(1200);
      await page.screenshot({
        path: `docs/screenshots/wave4/${name}-${w}x${h}.png`,
        fullPage: false,
      });
    });
  }
}
