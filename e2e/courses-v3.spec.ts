// Courses Layout v3 rebuild — container-query workspace gate. Verifies (against a
// FULL shell — the right nav is never cropped): zero horizontal overflow at every
// audited width, no clipped KPI cards, the old 14-circle stepper is GONE, exactly
// two permanent workspace columns at 1440/1600 (insights is a drawer, not a
// permanent rail), three columns only when the container is wide enough (≥1920),
// mutually-exclusive drawers with focus restoration, axe cleanliness, and zero
// console errors. Produces the v3 AFTER screenshots.
// Run: npx playwright test -c e2e/courses-v3.config.ts
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";

const SHOTS = "docs/screenshots/courses-redesign";

// viewport → expected permanent workspace columns (container ≈ viewport − nav − pad):
//   ≥1920 → 3 (container ≥1500); 1440/1600 → 2; 1024 → 1 (nav is a hamburger).
const SIZES: { w: number; h: number; cols: number }[] = [
  { w: 3840, h: 2160, cols: 3 },
  { w: 2560, h: 1440, cols: 3 },
  { w: 1920, h: 1080, cols: 3 },
  { w: 1600, h: 900, cols: 2 },
  { w: 1440, h: 900, cols: 2 },
  { w: 1024, h: 768, cols: 1 },
];

async function gotoCourses(page: Page): Promise<void> {
  await page.goto("/courses");
  await expect(page.getByRole("heading", { name: "קורסים והכשרות" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".courses-kpi")).toBeVisible();
  await page.waitForTimeout(700); // queries resolve, fonts settle
}

/** Count workspace children that are actually laid out (not display:none). */
async function visiblePermanentColumns(page: Page): Promise<number> {
  return page.evaluate(() => {
    const ws = document.querySelector(".courses-workspace");
    if (!ws) return 0;
    return Array.from(ws.children).filter((c) => {
      const el = c as HTMLElement;
      return el.offsetParent !== null && el.getBoundingClientRect().width > 1;
    }).length;
  });
}

test.beforeAll(() => {
  mkdirSync(SHOTS, { recursive: true });
});

for (const { w, h, cols } of SIZES) {
  test(`/courses @ ${w}x${h} — zero overflow, no clipped KPI, no 14-circle stepper, ${cols} columns`, async ({
    page,
  }) => {
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

    // 2) no KPI card clipped by its container
    const kpiOverflow = await page.evaluate(() => {
      const grid = document.querySelector(".courses-kpi");
      if (!grid) return -1;
      const gr = grid.getBoundingClientRect();
      return Array.from(document.querySelectorAll(".courses-kpi .os-kpi")).filter((c) => {
        const r = c.getBoundingClientRect();
        return r.right > gr.right + 1 || r.left < gr.left - 1;
      }).length;
    });
    expect(kpiOverflow, "no KPI card clipped by its container").toBe(0);

    // 3) the old 14-circle stepper must NOT exist: no DS stepper circles at all,
    //    and no single group renders >= 14 step elements.
    const stepperCircles = await page.locator(".os-stepper__circle").count();
    expect(stepperCircles, "no legacy circle-stepper on the page").toBe(0);
    const maxStepsInGroup = await page.evaluate(() => {
      const groups = Array.from(document.querySelectorAll(".courses-phase-steps"));
      return groups.reduce(
        (max, g) => Math.max(max, g.querySelectorAll(".courses-phase-step").length),
        0,
      );
    });
    expect(maxStepsInGroup, "active-phase step list never shows all 14 steps").toBeLessThan(14);

    // 4) permanent workspace columns match the container breakpoint
    const permanent = await visiblePermanentColumns(page);
    expect(permanent, `${cols} permanent workspace columns @ ${w}`).toBe(cols);

    // insights is a permanent column ONLY in the 3-column mode
    const insightsColVisible = await page.evaluate(() => {
      const el = document.querySelector(".courses-insights-col") as HTMLElement | null;
      return !!el && el.offsetParent !== null && el.getBoundingClientRect().width > 1;
    });
    if (cols < 3) {
      expect(insightsColVisible, "insights is NOT a permanent column below 3-col").toBe(false);
      // …but its trigger is always available
      await expect(page.getByRole("button", { name: "תובנות והמשך" })).toBeVisible();
    } else {
      expect(insightsColVisible, "insights IS a permanent column at 3-col").toBe(true);
    }

    // 5) zero console errors
    expect(consoleErrors, "no console errors").toEqual([]);

    if (w === 1440 || w === 1600 || w === 1920 || w === 2560) {
      await page.screenshot({ path: `${SHOTS}/v3-${w}x${h}.png`, fullPage: false });
    }
  });
}

test("/courses — drawers are mutually exclusive with focus restoration @ 1440", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoCourses(page);

  // 1) open the learner drawer alone → clean screenshot
  const learnerTrigger = page.getByRole("button", { name: "רשימת הלומדים" });
  await learnerTrigger.click();
  await expect(page.getByRole("dialog", { name: "רשימת הלומדים" })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/v3-1440-learner-drawer.png`, fullPage: false });

  // 2) mutual exclusion: opening insights closes the learner drawer (single open
  //    state). The learner overlay covers the header, so dispatch to the trigger.
  await page.getByRole("button", { name: "תובנות והמשך" }).dispatchEvent("click");
  await expect(page.getByRole("dialog", { name: "תובנות והמשך" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "רשימת הלומדים" })).toHaveCount(0);

  // 3) ESC closes and focus returns to the trigger that opened it (insights).
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "תובנות והמשך" })).toHaveCount(0);
  const focusedText = await page.evaluate(() => document.activeElement?.textContent ?? "");
  expect(focusedText).toContain("תובנות והמשך");

  // 4) open the insights drawer alone → clean screenshot (never both drawers open)
  await page.getByRole("button", { name: "תובנות והמשך" }).click();
  await expect(page.getByRole("dialog", { name: "תובנות והמשך" })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/v3-1440-insights-drawer.png`, fullPage: false });
});

test("/courses — active-phase details + next-stage drawer @ 1440", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoCourses(page);

  // three phase segments exist (not a 14-circle strip); selecting one shows only
  // that phase's steps as a readable list.
  const segments = page.locator(".courses-phase-seg");
  await expect(segments).toHaveCount(3);
  await segments.nth(1).click();
  await expect(page.locator(".courses-phase-steps .courses-phase-step").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/v3-active-phase-details.png`, fullPage: false });

  // next-stage details open in a drawer (relocated from a rail)
  await page.getByRole("button", { name: "פרטים נוספים" }).first().click();
  await expect(page.getByRole("dialog", { name: "השלב הבא" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/v3-1440-nextstage-drawer.png`, fullPage: false });
});

for (const width of [1440, 1920]) {
  test(`/courses axe — no serious/critical @ ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1080 });
    await gotoCourses(page);
    const results = await new AxeBuilder({ page }).analyze();
    const seriousCritical = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(seriousCritical.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`)).toEqual([]);
  });
}
