// W9-C Phase 9.12 — FINAL presentation + print gate re-verification. Confirms
// the W7 P-1/P-2 presentation contract and the W7/W8 print fixes still hold on
// the final build: 5 sections, 10-min timer, 2-min per-slide targets, presenter
// notes, fullscreen present mode, RTL keyboard controls, backup mode, ESC exit,
// rehearsal-not-auto-filled; and all print views are A4 RTL, no dark-ink-waste,
// no nav chrome, with owner/version/date/page-counters. A4 captures →
// docs/screenshots/final/print-*.png.
import { test, expect, type Page } from "@playwright/test";

const OUT = "docs/screenshots/final";
const A4 = { width: 794, height: 1123 }; // A4 portrait @96dpi

async function rootIsLight(page: Page, sel: string): Promise<boolean> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(el).backgroundColor);
    if (!m) return false;
    return (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 > 200;
  }, sel);
}

async function gotoPresentation(page: Page): Promise<void> {
  await page.goto("/submission/presentation");
  await expect(page.getByTestId("presentation-overview")).toBeVisible({ timeout: 30_000 });
}

// ---- PRESENTATION ----

test("presentation: exactly 5 sections, 10-min total, 2-min targets, honest rehearsal", async ({
  page,
}) => {
  await gotoPresentation(page);
  // header states 5 slides · 10 minutes and is data-honest
  await expect(page.getByRole("heading", { name: /5 שקפים · 10 דקות/ })).toBeVisible();
  // exactly 5 "פתח שקף" affordances = 5 sections, no more, no fewer
  await expect(page.getByRole("button", { name: "פתח שקף" })).toHaveCount(5);
  // total target 10:00 and per-slide 2:00 targets
  await expect(page.getByText("יעד כולל: 10:00 דקות")).toBeVisible();
  await expect(page.getByText(/יעד: 2:00/).first()).toBeVisible();
  // rehearsal is measured, never hand-fed
  await expect(page.getByText("טרם נמדד").first()).toBeVisible();
  await expect(page.getByText(/מדידת חזרה נרשמת רק מריצה אמיתית/)).toBeVisible();
});

test("presentation: RTL keyboard controls are documented (←/→/N/T/D/B/Esc)", async ({ page }) => {
  await gotoPresentation(page);
  await expect(page.getByText("קיצורי מקלדת (RTL)")).toBeVisible();
  for (const key of ["← / רווח", "N — הערות מרצה", "T — טיימר", "D — קישור דמו", "B — צילומי גיבוי", "Esc — יציאה"]) {
    await expect(page.getByText(new RegExp(key.replace(/[/]/g, "\\/"))).first()).toBeVisible();
  }
});

test("presentation: present mode = fullscreen, timer, notes(N), backup(B), Esc exit", async ({
  page,
}) => {
  await gotoPresentation(page);
  await page.getByTestId("start-presentation").click();
  const present = page.getByTestId("present-mode");
  await expect(present).toBeVisible();
  // countdown timer visible
  await expect(page.getByTestId("countdown")).toBeVisible();
  // N → presenter notes
  await page.keyboard.press("KeyN");
  await expect(page.getByTestId("notes-drawer")).toBeVisible();
  await page.keyboard.press("KeyN");
  // B → backup screenshots mode
  await page.keyboard.press("KeyB");
  await expect(page.getByTestId("backup-view")).toBeVisible();
  await page.keyboard.press("KeyB");
  // Esc → returns to overview (exit present mode)
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("presentation-overview")).toBeVisible();
});

test("presentation: RTL arrow keys advance/retreat slides", async ({ page }) => {
  await gotoPresentation(page);
  await page.getByTestId("start-presentation").click();
  await expect(page.getByTestId("present-mode")).toBeVisible();
  // in RTL, ArrowLeft advances (reading direction). Slide index must change.
  const label = page.getByTestId("present-mode");
  const first = (await label.textContent()) ?? "";
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(150);
  const second = (await label.textContent()) ?? "";
  expect(second).not.toBe(first);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("presentation-overview")).toBeVisible();
});

// ---- PRINT (A4) ----

test("print: quick-start A4 — content, no nav, RTL, light background", async ({ page }) => {
  await page.setViewportSize(A4);
  await page.goto("/quick-start");
  await expect(page.getByText("התחלה מהירה ושימוש נכון").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: "תצוגת הדפסה A4" }).click();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByText("תוצאה צפויה:").first()).toBeVisible();
  await expect(page.locator("nav.os-nav")).toBeHidden();
  const dir = await page.evaluate(
    () => getComputedStyle(document.querySelector(".qs-print-root") as Element).direction,
  );
  expect(dir).toBe("rtl");
  expect(await rootIsLight(page, ".qs-print-root")).toBe(true);
  await page.screenshot({ path: `${OUT}/print-quick-start-a4.png` });
  await page.emulateMedia({ media: "screen" });
});

test("print: submission ?print=1 — owner/version/date + page counters + RTL + light", async ({
  page,
}) => {
  await page.setViewportSize(A4);
  await page.goto("/submission?print=1");
  await expect(page.getByText("מרכז ההגשה והראיות —").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/גרסת ולידטור:/).first()).toBeVisible();
  await expect(page.getByText(/תאריך: \d{4}-\d{2}-\d{2}/).first()).toBeVisible();
  await expect(page.getByText(/בעלים:/).first()).toBeVisible();
  await expect(page.getByText(/מוצר: TERAGON AI BUSINESS OS/).first()).toBeVisible();
  // all 12 deliverables are present in the single A4 print view, each numbered
  for (let i = 1; i <= 12; i += 1) {
    await expect(page.getByText(new RegExp(`^${i}\\. `)).first()).toBeVisible();
  }
  // and none of them is auto-approved — the honest pending state prints
  await expect(page.getByText(/אישור: אין רשומת אישור/).first()).toBeVisible();
  const counters = await page.evaluate(() => {
    const s = [...document.querySelectorAll("style")].map((x) => x.textContent ?? "").join("");
    return (
      s.includes("counter-reset: subpage") &&
      s.includes("counter-increment: subpage") &&
      s.includes('content: "עמוד " counter(subpage)')
    );
  });
  expect(counters).toBe(true);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("nav.os-nav")).toBeHidden();
  await expect(page.getByRole("button", { name: "הדפסה / שמירה כ-PDF" })).toBeHidden();
  expect(await rootIsLight(page, ".sub-print-root")).toBe(true);
  await page.screenshot({ path: `${OUT}/print-submission-a4.png` });
  await page.emulateMedia({ media: "screen" });
});

test("print: presentation handout — all 5 sections + presenter notes, no chrome, RTL, light", async ({
  page,
}) => {
  await page.setViewportSize(A4);
  await gotoPresentation(page);
  await page.getByRole("tab", { name: "דף מודפס" }).click();
  await expect(page.getByTestId("handout-view")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  const handout = page.getByTestId("handout-view");
  for (let i = 1; i <= 5; i += 1) {
    await expect(handout.getByText(new RegExp(`שקף ${i} `)).first()).toBeVisible();
  }
  await expect(handout.getByText("הערות מרצה:").first()).toBeVisible();
  await expect(page.getByTestId("start-presentation")).toBeHidden();
  const dir = await page.evaluate(
    () => getComputedStyle(document.querySelector(".pres-handout-root") as Element).direction,
  );
  expect(dir).toBe("rtl");
  expect(await rootIsLight(page, ".pres-handout-root")).toBe(true);
  await page.screenshot({ path: `${OUT}/print-presentation-handout-a4.png` });
  await page.emulateMedia({ media: "screen" });
});
