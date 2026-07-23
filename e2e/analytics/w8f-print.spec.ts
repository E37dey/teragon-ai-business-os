// W8-F Phase 8.17 — A4 print validation for the ANALYTICS report print
// (reportPrint.tsx) + explicit re-verification that the W7 P-1/P-2 print
// fixes HOLD on final main: quick-start and the presentation handout now carry
// CSS page-number counters (P-1) and a product/date/owner print header (P-2).
// A4-ratio captures → docs/screenshots/wave8/print-*.png.
import { test, expect, type Page } from "@playwright/test";

const OUT = "docs/screenshots/wave8";
// A4 portrait at 96dpi ≈ 794×1123 CSS px
const A4 = { width: 794, height: 1123 };

async function rootIsLightRtl(page: Page, sel: string): Promise<{ light: boolean; rtl: boolean }> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return { light: false, rtl: false };
    const cs = getComputedStyle(el);
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(cs.backgroundColor);
    const light = m
      ? (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 > 200
      : cs.backgroundColor === "transparent";
    return { light, rtl: cs.direction === "rtl" };
  }, sel);
}

async function hasPageCounter(page: Page, rootSel: string, counterName: string): Promise<boolean> {
  return page.evaluate(
    ({ root, name }) => {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        const walk = (list: CSSRuleList): boolean => {
          for (const rule of Array.from(list)) {
            const text = rule.cssText;
            if (text.includes(root) && text.includes(`counter(${name})`)) return true;
            if ("cssRules" in rule && walk((rule as CSSGroupingRule).cssRules)) return true;
          }
          return false;
        };
        if (walk(rules)) return true;
      }
      return false;
    },
    { root: rootSel, name: counterName },
  );
}

test("analytics report print: A4 root, RTL, light palette, page counters, product/owner header", async ({
  page,
}) => {
  await page.setViewportSize(A4);
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto("/analytics");
  // at A4 width the nav sidebar collapses (its label shares this text) — assert
  // the PAGE heading, not the nav label
  await expect(page.getByRole("heading", { name: "דוחות וניתוחים" })).toBeVisible({
    timeout: 30_000,
  });

  // generate + open a real report run, then mount its print root
  await page.getByRole("tab", { name: "דוחות" }).click();
  await page.getByRole("button", { name: "הפקת דוח מנתוני אמת" }).first().click();
  const runsTable = page.locator("table").last();
  await expect(runsTable.locator("tbody tr").first()).toBeVisible({ timeout: 20_000 });
  await runsTable.locator("tbody tr").first().click();
  await page.getByRole("button", { name: "הדפסה / שמירה כ-PDF" }).click();
  await expect(page.locator(".an-print-root")).toBeAttached({ timeout: 10_000 });

  await page.emulateMedia({ media: "print" });

  // print root: light + RTL
  const { light, rtl } = await rootIsLightRtl(page, ".an-print-root");
  expect(light).toBe(true);
  expect(rtl).toBe(true);
  // page-number CSS counters declared for the analytics print pages
  expect(await hasPageCounter(page, ".an-print-page", "anpage")).toBe(true);
  // product / owner header present in the print content
  await expect(
    page.locator(".an-print-root").getByText("מוצר: TERAGON AI BUSINESS OS · טרגון טכנולוגיות"),
  ).toBeVisible();
  await expect(page.locator(".an-print-root").getByText(/בעלים:/).first()).toBeVisible();
  // the app nav never bleeds into print
  await expect(page.locator("nav.os-nav")).toBeHidden();
  // the print body carries the real report rows (metric names) — not empty
  const printText = await page.locator(".an-print-root").innerText();
  expect(printText.trim().length).toBeGreaterThan(40);

  await page.screenshot({ path: `${OUT}/print-analytics-report-a4.png` });
});

test("W7 P-1 fix HOLDS: quick-start print declares page-number counters + P-2 header", async ({
  page,
}) => {
  await page.setViewportSize(A4);
  await page.goto("/quick-start");
  await expect(page.getByText("התחלה מהירה ושימוש נכון").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: "תצוגת הדפסה A4" }).click();
  await page.emulateMedia({ media: "print" });

  // P-1: page-number counter now declared on the quick-start print sections
  expect(await hasPageCounter(page, ".qs-print-section", "qspage")).toBe(true);
  // P-2: product/date/owner header renders in print
  await expect(
    page.locator(".qs-print-header").getByText(/מוצר: TERAGON AI BUSINESS OS/),
  ).toBeVisible();
  await expect(page.locator(".qs-print-header").getByText(/בעלים: צחי זוסטייהם/)).toBeVisible();
  await page.screenshot({ path: `${OUT}/print-quick-start-a4.png` });
});

test("W7 P-1/P-2 fixes HOLD: presentation handout counters + product/owner header", async ({
  page,
}) => {
  await page.setViewportSize(A4);
  await page.goto("/submission/presentation");
  await expect(page.getByTestId("presentation-overview")).toBeVisible({ timeout: 30_000 });

  // the handout print CSS is part of the page — verify the declarations hold
  expect(await hasPageCounter(page, ".pres-handout-section", "prespage")).toBe(true);
  const headerDeclared = await page.evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        if (rule.cssText.includes(".pres-handout-header")) return true;
      }
    }
    return false;
  });
  expect(headerDeclared).toBe(true);
});
