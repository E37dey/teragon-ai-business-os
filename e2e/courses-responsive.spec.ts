// Courses responsive redesign — measured zero-horizontal-overflow gate + no
// clipped cards + drawer-not-a-4th-column behaviour + axe + AFTER screenshots.
// Run: npx playwright test -c e2e/courses-responsive.config.ts
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";

const SHOTS = "docs/screenshots/courses-redesign";

// The six audited widths. ≥1800 → learner list is a permanent column; below →
// the learner list is a top selector + drawer (never a 4th column).
const SIZES: [number, number][] = [
  [3840, 2160],
  [2560, 1440],
  [1920, 1080],
  [1600, 900],
  [1440, 900],
  [1024, 768],
];

async function gotoCourses(page: Page): Promise<void> {
  await page.goto("/courses");
  // The right nav collapses to a hamburger at ≤1064px, so gate on page content
  // (present at every width) rather than nav visibility.
  await expect(page.getByRole("heading", { name: "קורסים והכשרות" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".courses-kpi-grid")).toBeVisible();
  await page.waitForTimeout(700); // queries resolve, fonts settle
}

test.beforeAll(() => {
  mkdirSync(SHOTS, { recursive: true });
});

for (const [w, h] of SIZES) {
  test(`/courses @ ${w}x${h} — zero horizontal overflow, no clipped cards`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    await page.setViewportSize({ width: w, height: h });
    await gotoCourses(page);

    // 1) measured: no horizontal page overflow
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement?.scrollWidth ?? 0,
      clientWidth: document.scrollingElement?.clientWidth ?? 0,
    }));
    expect(
      scrollWidth,
      `scrollWidth(${scrollWidth}) <= clientWidth(${clientWidth})+1`,
    ).toBeLessThanOrEqual(clientWidth + 1);

    // 2) no KPI card clipped — every card sits inside its grid container
    const kpiOverflow = await page.evaluate(() => {
      const grid = document.querySelector(".courses-kpi-grid");
      if (!grid) return "no-grid";
      const gr = grid.getBoundingClientRect();
      const cards = Array.from(document.querySelectorAll(".os-kpi"));
      const bad = cards.filter((c) => {
        const r = c.getBoundingClientRect();
        return r.right > gr.right + 1 || r.left < gr.left - 1;
      });
      return bad.length;
    });
    expect(kpiOverflow, "no KPI card clipped by its container").toBe(0);

    // 3) no learner card clipped — any rendered learner card stays within viewport
    const learnerOverflow = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".courses-learner-card"));
      const cw = document.scrollingElement?.clientWidth ?? window.innerWidth;
      return cards.filter((c) => {
        const r = c.getBoundingClientRect();
        return r.right > cw + 1 || r.left < -1;
      }).length;
    });
    expect(learnerOverflow, "no learner card clipped").toBe(0);

    // 4) breakpoint behaviour: at 1440 & 1024 the learner list is NOT a permanent
    //    4th column — a drawer/selector trigger is present instead.
    if (w <= 1799) {
      await expect(page.locator(".courses-workbench--wide")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "רשימת הלומדים" })).toBeVisible();
    } else {
      await expect(page.locator(".courses-workbench--wide")).toHaveCount(1);
    }

    // 5) zero console errors
    expect(consoleErrors, "no console errors").toEqual([]);

    await page.screenshot({ path: `${SHOTS}/after-${w}x${h}.png`, fullPage: false });
  });
}

test("/courses @ 1440x900 — learner drawer + next-stage detail drawer open", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoCourses(page);

  // Open the next-stage detail drawer, then the learner-list drawer. Both live
  // behind page-level overlays, so dispatch the click directly to each trigger
  // (React onClick fires regardless of the other drawer's overlay).
  await page.getByRole("button", { name: "פרטים נוספים" }).dispatchEvent("click");
  await expect(page.getByRole("dialog", { name: "השלב הבא" })).toBeVisible();

  await page.getByRole("button", { name: "רשימת הלומדים" }).dispatchEvent("click");
  await expect(page.getByRole("dialog", { name: "רשימת הלומדים" })).toBeVisible();

  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/after-1440-drawer-open.png`, fullPage: false });
});

for (const width of [1440, 1920]) {
  test(`/courses axe — no serious/critical @ ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoCourses(page);
    const results = await new AxeBuilder({ page }).analyze();
    const seriousCritical = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(seriousCritical.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`)).toEqual([]);
  });
}
