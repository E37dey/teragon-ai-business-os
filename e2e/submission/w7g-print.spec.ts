// W7-G Phase 7.20 — print-emulation QA: the quick-start print view, the
// submission deliverable print (?print=1) and the presentation handout.
// Asserts: content present, no nav sidebar, RTL correct, page-number CSS
// counters where implemented (submission — the only surface that declares
// them; the honest absence elsewhere is reported in WAVE_7_PRINT_QA.md),
// light print background, title/version/date/owner present.
// A4-ratio captures → docs/screenshots/wave7/print-*.png.
import { test, expect, type Page } from "@playwright/test";

const OUT = "docs/screenshots/wave7";
// A4 portrait at 96dpi ≈ 794×1123 CSS px
const A4 = { width: 794, height: 1123 };

async function bodyBackgroundIsLight(page: Page, rootSelector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const bg = getComputedStyle(el).backgroundColor;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
    if (!m) return false;
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return (r + g + b) / 3 > 200; // white/light
  }, rootSelector);
}

test("quick-start print view: content, no nav, RTL, light background", async ({ page }) => {
  await page.setViewportSize(A4);
  await page.goto("/quick-start");
  await expect(page.getByText("התחלה מהירה ושימוש נכון").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: "תצוגת הדפסה A4" }).click();
  await page.emulateMedia({ media: "print" });

  // content present — the three actions survive into print
  await expect(page.getByText("תוצאה צפויה:").first()).toBeVisible();
  await expect(page.getByText("מותר", { exact: true })).toBeVisible();
  // no nav sidebar in print
  await expect(page.locator("nav.os-nav")).toBeHidden();
  // RTL correct (the app root is rtl; the print root inherits it)
  const dir = await page.evaluate(
    () => getComputedStyle(document.querySelector(".qs-print-root") as Element).direction,
  );
  expect(dir).toBe("rtl");
  // dark-background-free: the print root flips to white
  expect(await bodyBackgroundIsLight(page, ".qs-print-root")).toBe(true);

  await page.screenshot({ path: `${OUT}/print-quick-start-a4.png`, fullPage: false });
  await page.emulateMedia({ media: "screen" });
});

test("submission deliverable print (?print=1): title/version/date/owner + CSS page counters + RTL + light", async ({
  page,
}) => {
  await page.setViewportSize(A4);
  await page.goto("/submission?print=1");
  await expect(page.getByText("מרכז ההגשה והראיות —").first()).toBeVisible({ timeout: 30_000 });

  // title / version / date / owner on the printed sections
  await expect(page.getByText(/גרסת ולידטור:/).first()).toBeVisible();
  await expect(page.getByText(/תאריך: \d{4}-\d{2}-\d{2}/).first()).toBeVisible();
  await expect(page.getByText(/בעלים:/).first()).toBeVisible();
  await expect(page.getByText(/מוצר: TERAGON AI BUSINESS OS/).first()).toBeVisible();

  // page-number CSS counters are DECLARED in the active stylesheet
  const counters = await page.evaluate(() => {
    const styles = [...document.querySelectorAll("style")].map((s) => s.textContent ?? "").join("");
    return (
      styles.includes("counter-reset: subpage") &&
      styles.includes("counter-increment: subpage") &&
      styles.includes('content: "עמוד " counter(subpage)')
    );
  });
  expect(counters).toBe(true);

  await page.emulateMedia({ media: "print" });
  // print keeps ONLY the print root — nav + app chrome hidden
  await expect(page.locator("nav.os-nav")).toBeHidden();
  await expect(page.getByRole("button", { name: "הדפסה / שמירה כ-PDF" })).toBeHidden();
  const dir = await page.evaluate(
    () => getComputedStyle(document.querySelector(".sub-print-root") as Element).direction,
  );
  expect(dir).toBe("rtl");
  expect(await bodyBackgroundIsLight(page, ".sub-print-root")).toBe(true);

  await page.screenshot({ path: `${OUT}/print-submission-a4.png`, fullPage: false });
  await page.emulateMedia({ media: "screen" });
});

test("presentation handout print: all 5 sections + notes, no chrome, RTL, light", async ({
  page,
}) => {
  await page.setViewportSize(A4);
  await page.goto("/submission/presentation");
  await expect(page.getByTestId("presentation-overview")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: "דף מודפס" }).click();
  await expect(page.getByTestId("handout-view")).toBeVisible();

  await page.emulateMedia({ media: "print" });
  const handout = page.getByTestId("handout-view");
  await expect(handout).toBeVisible();
  for (let i = 1; i <= 5; i += 1) {
    await expect(handout.getByText(new RegExp(`שקף ${i} `)).first()).toBeVisible();
  }
  await expect(handout.getByText("הערות מרצה:").first()).toBeVisible();
  await expect(page.getByTestId("start-presentation")).toBeHidden();
  const dir = await page.evaluate(
    () => getComputedStyle(document.querySelector(".pres-handout-root") as Element).direction,
  );
  expect(dir).toBe("rtl");
  expect(await bodyBackgroundIsLight(page, ".pres-handout-root")).toBe(true);

  await page.screenshot({ path: `${OUT}/print-presentation-handout-a4.png`, fullPage: false });
  await page.emulateMedia({ media: "screen" });
});
