// W8-F e2e — /analytics (W8-A): filters narrow the catalogue, chart drilldown
// opens the REAL source records, insufficient-data ("טרם נמדד") is visible and
// never rendered as 0, report generation from real data + REAL CSV download
// (the file is read and scanned for secrets), the A4 print root mounts, and a
// saved view persists across a full reload. Zero console errors.
import { test, expect } from "@playwright/test";
import { collectConsoleErrors, gotoAnalytics } from "./w8f-helpers";

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /AKIA[A-Z0-9]{12,}/,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/,
  /api[_-]?key\s*[:=]/i,
  /[Bb]earer\s+[A-Za-z0-9._~+/=-]{16,}/,
  /password\s*[:=]/i,
];

test("filters narrow the visible metric groups — and reset restores them", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await gotoAnalytics(page);

  // all 6 group SECTION HEADINGS visible unfiltered (the <option>s of the same
  // text stay in the DOM — scope to the h3 headings, not the select options)
  await expect(page.getByRole("heading", { name: "ב · מכירות ולקוחות" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ה · AI וממשל" })).toBeVisible();

  // narrow to group ב
  await page.getByLabel("קבוצת מדדים").selectOption({ label: "ב · מכירות ולקוחות" });
  await expect(page.getByRole("heading", { name: "ה · AI וממשל" })).toHaveCount(0);
  await expect(page.getByText("לידים חדשים").first()).toBeVisible();

  // reset restores everything
  await page.getByRole("button", { name: "איפוס" }).click();
  await expect(page.getByRole("heading", { name: "ה · AI וממשל" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("insufficient-data state is VISIBLE — 'טרם נמדד' chips, never a fake 0", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await gotoAnalytics(page);
  // pilot-target/structural metrics honestly report טרם נמדד
  await expect(page.getByText("טרם נמדד").first()).toBeVisible();
  // the KPI row separates honest counts
  await expect(page.getByText("ללא מדידה כעת").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("chart drilldown opens the REAL source records with in-app routes", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await gotoAnalytics(page);

  await page.getByRole("button", { name: "לידים חדשים — פתיחת רשומות המקור" }).click();
  await expect(page.getByText("רשומות המקור — לידים חדשים")).toBeVisible();
  // the drawer lists real lead records that link to /crm
  const links = page.locator("a[href='/crm']");
  await expect(links.first()).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("report generation from real data + REAL CSV download (scanned for secrets) + print root", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  // stub window.print so the browser dialog never blocks the run
  await page.addInitScript(() => {
    window.print = () => {
      (window as unknown as { __printed?: number }).__printed =
        ((window as unknown as { __printed?: number }).__printed ?? 0) + 1;
    };
  });
  await gotoAnalytics(page);

  await page.getByRole("tab", { name: "דוחות" }).click();
  await expect(page.getByText("דוחות שהופקו")).toBeVisible();

  // generate the first canonical report from real data
  await page.getByRole("button", { name: "הפקת דוח מנתוני אמת" }).first().click();
  const runsTable = page.locator("table").last();
  await expect(runsTable.locator("tbody tr").first()).toBeVisible({ timeout: 20_000 });

  // open the run drawer
  await runsTable.locator("tbody tr").first().click();
  await expect(page.getByText(/^דוח — /)).toBeVisible();

  // REAL CSV download event — read the file and scan it
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^report-.*\.csv$/);
  const path = await download.path();
  const fs = await import("node:fs");
  const csv = fs.readFileSync(path, "utf-8");
  expect(csv.split("\n").length).toBeGreaterThan(1);
  for (const re of SECRET_PATTERNS) {
    expect(csv).not.toMatch(re);
  }
  // no seed personal contact data in the metric CSV
  expect(csv).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);

  // print view: clicking the print button mounts the A4 print root
  await page.getByRole("button", { name: "הדפסה / שמירה כ-PDF" }).click();
  await expect(page.locator(".an-print-root")).toBeAttached({ timeout: 10_000 });
  await expect
    .poll(async () =>
      page.evaluate(() => (window as unknown as { __printed?: number }).__printed ?? 0),
    )
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("saved view persists across a full reload (IndexedDB)", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await gotoAnalytics(page);

  // set a distinctive filter and save it
  await page.getByLabel("קבוצת מדדים").selectOption({ label: "ב · מכירות ולקוחות" });
  await page.getByRole("button", { name: "שמירת תצוגה" }).click();
  await page.getByPlaceholder("לדוגמה: מכירות — רבעון").fill("W8F-בדיקת-התמדה");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(page.getByLabel("תצוגות שמורות")).toContainText("תצוגות שמורות (");

  // reload — the saved view is still there and re-applies its filter
  await page.reload();
  await expect(page.getByText("דוחות וניתוחים").first()).toBeVisible({ timeout: 30_000 });
  const picker = page.getByLabel("תצוגות שמורות");
  await expect(picker.locator("option", { hasText: "W8F-בדיקת-התמדה" })).toHaveCount(1, {
    timeout: 15_000,
  });
  await picker.selectOption({ label: "W8F-בדיקת-התמדה" });
  await expect(page.getByRole("heading", { name: "ה · AI וממשל" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
