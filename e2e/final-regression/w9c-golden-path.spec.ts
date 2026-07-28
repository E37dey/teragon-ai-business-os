// W9-C Phase 9.8 — FINAL cross-module golden path. Dense end-to-end chains that
// mutate one module and verify the change propagates to OTHER modules (cross-
// module update verification), plus honest-envelope invariants. These do NOT
// duplicate the per-module wave specs (w3/w4/w5*/w6/w7*/w8*) — they chain across
// modules and assert propagation the single-module specs cannot.
import { test, expect, type Page } from "@playwright/test";
import { collectConsoleErrors } from "./w9c-helpers";

async function shell(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".os-route-loading")).toHaveCount(0, { timeout: 30_000 });
}

// GP-1 — lead creation propagates to the table, the command-center follow-up
// queue AND global search (three modules react to one mutation).
test("GP-1: new lead → CRM table + command-center queue + global search", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  const name = `W9C ליד ${Date.now()}`;
  await shell(page, "/crm");
  await expect(page.getByTestId("leads-table")).toBeVisible();

  await page.getByRole("button", { name: "ליד חדש" }).click();
  await page.locator("#crm-create-name").fill(name);
  await page.locator("#crm-create-phone").fill("050-9990001");
  await page.locator("#crm-create-interest").fill("קורס W9C");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.locator(".os-toast").first()).toContainText("נוצר");

  // module 1: appears in the CRM table (filter to it — pagination may otherwise
  // place a newly-created lead on a later page)
  await page.getByLabel("חיפוש חופשי בלידים").fill(name);
  await expect(page.getByTestId("leads-table")).toContainText(name);

  // module 2: appears on the command center follow-up queue (query invalidation)
  await shell(page, "/");
  await expect(page.getByTestId("command-center")).toContainText(name);

  // module 3: findable in cross-module global search
  await page.getByRole("searchbox", { name: "חיפוש גלובלי" }).click();
  await page.getByRole("combobox", { name: "חיפוש בכל המערכת" }).fill(name);
  await expect(page.locator(".os-palette__item--hit").first()).toContainText(name);
  expect(errors).toEqual([]);
});

// GP-2 — sales stage advance persists across reload (revenue journey mutation).
test("GP-2: sales journey advance persists across reload", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await shell(page, "/sales");
  const stepCell = page.getByTestId("journey-step-opp-4");
  await expect(stepCell).toBeVisible();
  const before = (await stepCell.textContent())?.trim() ?? "";
  await page.getByTestId("advance-opp-4").click();
  await expect(page.locator(".os-toast").first()).toContainText("קודמה לשלב");
  const after = (await stepCell.textContent())?.trim() ?? "";
  expect(after).not.toBe(before);
  await page.reload();
  await expect(page.getByTestId("journey-step-opp-4")).toHaveText(after);
  expect(errors).toEqual([]);
});

// GP-3 — command-center AI recommendation approval (HITL) writes an approval.
test("GP-3: approve AI recommendation (HITL) → toast + honest envelope", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await shell(page, "/");
  await expect(page.getByTestId("command-center")).toBeVisible();
  // honest envelope: measurement is never faked green
  await expect(page.getByText("טרם נמדד").first()).toBeVisible();
  await expect(page.getByText("מצב הדגמה מקומי · נתוני הדגמה")).toBeVisible();
  const approve = page.getByTestId("command-center").getByRole("button", { name: "אשר" }).first();
  await expect(approve).toBeVisible();
  await approve.click();
  await expect(page.locator(".os-toast").first()).toContainText("אושרה");
  expect(errors).toEqual([]);
});

// GP-4 — customer 360 aggregates data from many modules for one customer.
test("GP-4: customer 360 aggregates cross-module records + honest empties", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await shell(page, "/customers/cu-2");
  await expect(page.getByTestId("customer-detail")).toBeVisible();
  const tabs = [
    "פרטי קשר",
    "מדפסות",
    "קורסים",
    "הצעות מחיר",
    "קריאות שירות",
    "מסמכים",
    "משימות",
    "זיכרון לקוח",
    "ציר זמן",
  ];
  for (const t of tabs) {
    await page.getByRole("tab", { name: t }).click();
    await expect(page.getByRole("tab", { name: t })).toHaveAttribute("aria-selected", "true");
  }
  await page.getByRole("tab", { name: "זיכרון לקוח" }).click();
  await expect(page.getByTestId("customer-detail")).toContainText("העדפות תקשורת");
  expect(errors).toEqual([]);
});

// GP-5 — quotation editor governance rule: over-discount blocked (CEO approval).
test("GP-5: quotation over-discount blocked with Hebrew CEO-approval rule", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await shell(page, "/documents");
  const editRow = page.locator("tr", { hasText: "q-2" });
  await editRow.getByRole("button", { name: "עריכה" }).click();
  await expect(page.getByTestId("quote-totals")).toBeVisible();
  await expect(page.getByTestId("vat")).toContainText("₪");
  await page.getByTestId("discount-input").fill("45");
  await expect(page.getByTestId("discount-error")).toContainText('דורשת אישור מנכ"ל');
  expect(errors).toEqual([]);
});

// GP-6 — submission readiness is DERIVED and never faked green while blockers
// exist; deliverables are NOT auto-approved (the gate contract).
test("GP-6: submission readiness derived + deliverables NOT auto-approved", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await shell(page, "/submission");
  await expect(page.getByText("מרכז ההגשה והראיות").first()).toBeVisible();
  // no forced 12/12; blockers surfaced honestly
  await expect(page.getByText(/מצב כן — אין 12\/12 מאולץ/)).toBeVisible();
  await expect(page.getByText(/חוסמים פתוחים:/)).toBeVisible();
  // a fresh context: the one-pager deliverable has NO approval record (not auto-approved)
  const onePager = page.locator("div.os-panel", { has: page.getByText(/^1\. /) }).first();
  await expect(onePager.getByText(/אישור: אין רשומת אישור/)).toBeVisible();
  expect(errors).toEqual([]);
});

// GP-7 — global command palette quick-create is a cross-module entry point.
test("GP-7: Ctrl+K palette creates a lead and lands on /crm", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await shell(page, "/");
  await page.keyboard.press("Control+k");
  const combo = page.getByRole("combobox", { name: "חיפוש פקודה" });
  await expect(combo).toBeVisible();
  await combo.fill("צור ליד");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "ליד חדש" });
  await expect(dialog).toBeVisible();
  // zod validation fires on empty submit (form integrity)
  await dialog.getByRole("button", { name: "שמירה" }).click();
  await expect(dialog.getByText("שם הליד הוא שדה חובה")).toBeVisible();
  await dialog.locator("#qc-lead-name").fill(`W9C פלטה ${Date.now()}`);
  await dialog.locator("#qc-lead-phone").fill("050-9990002");
  await dialog.locator("#qc-lead-interest").fill("Fusion 360");
  await dialog.getByRole("button", { name: "שמירה" }).click();
  await expect(page.locator(".os-toast")).toContainText("הליד נוצר בהצלחה");
  await expect(page).toHaveURL(/\/crm$/);
  expect(errors).toEqual([]);
});
