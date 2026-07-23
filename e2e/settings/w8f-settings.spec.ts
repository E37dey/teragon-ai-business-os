// W8-F e2e — /settings (W8-D): a valid update applies for real (density /
// page-size), an invalid value is rejected with a Hebrew error, the RTL toggle
// simply does not exist (read-only with reason), there is NO key/secret input
// anywhere, a sensitive change goes to approval instead of applying, and the
// evaluator reset asks for the typed double-confirm. Zero console errors.
import { test, expect, type Page, type Locator } from "@playwright/test";
import { collectConsoleErrors, gotoSettings } from "../analytics/w8f-helpers";

/** the SettingRow panel that owns a given labelled control */
function settingRow(page: Page, label: string): Locator {
  return page.locator(".os-panel", { has: page.getByLabel(label) }).first();
}

/** fill a number/text setting and click its own שמירה button */
async function saveSetting(page: Page, label: string, value: string): Promise<void> {
  const row = settingRow(page, label);
  await row.getByLabel(label).fill(value);
  await row.getByRole("button", { name: "שמירה" }).click();
}

test("valid update applies: density צפוף scales the UI and table page-size persists", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoSettings(page);

  await page.getByRole("tab", { name: /ממשק/ }).click();

  // density select — apply צפוף, the ROOT font-size actually changes
  const before = await page.evaluate(() => document.documentElement.style.fontSize);
  await page.getByLabel("צפיפות תצוגה").selectOption("צפוף");
  await expect(page.getByText(/«צפיפות תצוגה» עודכן/)).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.style.fontSize))
    .not.toBe(before);

  // page size number input — valid value applies with lastChanged metadata
  await saveSetting(page, "שורות בעמוד טבלה", "25");
  await expect(page.getByText(/«שורות בעמוד טבלה» עודכן/)).toBeVisible({ timeout: 15_000 });

  // persists across reload (IndexedDB meta record)
  await page.reload();
  await expect(page.getByRole("tablist", { name: "קבוצות ההגדרות" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("tab", { name: /ממשק/ }).click();
  await expect(page.getByLabel("שורות בעמוד טבלה")).toHaveValue("25");
  expect(errors).toEqual([]);
});

test("invalid value is rejected with the Hebrew allowed-range error — nothing applies", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoSettings(page);

  await page.getByRole("tab", { name: /ממשק/ }).click();
  await saveSetting(page, "שורות בעמוד טבלה", "9999");
  await expect(page.getByText(/ערך לא חוקי עבור «שורות בעמוד טבלה»/)).toBeVisible({
    timeout: 15_000,
  });
  expect(errors).toEqual([]);
});

test("RTL is not a toggle — read-only with its Hebrew reason; NO key inputs anywhere", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoSettings(page);

  // walk all 7 groups: no password inputs, no key-shaped placeholders/labels
  for (const tab of await page.getByRole("tablist", { name: "קבוצות ההגדרות" }).getByRole("tab").all()) {
    await tab.click();
    await expect(page.locator("input[type='password']")).toHaveCount(0);
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/API[ -]?key|מפתח API|סוד(?:ות)? API/i);
  }

  // interface group: RTL is NOT an operable toggle — it renders permanently
  // disabled+checked with the product-contract reason (cannot be switched off)
  await page.getByRole("tab", { name: /ממשק/ }).click();
  await expect(page.getByText(/RTL אינו ניתן לכיבוי/)).toBeVisible();
  const rtl = page.getByLabel("כיווניות עברית (RTL)");
  await expect(rtl).toBeDisabled();
  await expect(rtl).toBeChecked();

  // AI group: keys live server-side only — the page says so explicitly
  await page.getByRole("tab", { name: /AI/ }).click();
  await expect(page.getByText(/אין ולא יהיה שדה מפתח\s*בדפדפן/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("sensitive change requires approval — value does NOT apply, pending chip appears", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoSettings(page);

  await page.getByRole("tab", { name: /אבטחה/ }).click();
  await expect(page.getByLabel("יעד SLA לתגובה (שעות)")).toBeVisible();
  await saveSetting(page, "יעד SLA לתגובה (שעות)", "24");

  await expect(page.getByText(/ממתין לאישור במרכז האישורים/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/ממתין לאישור: 24/)).toBeVisible();
  // the change did NOT apply — the control is now LOCKED awaiting the decision
  // (its own reason references the pending approval run id), proving nothing
  // took effect. After a reload the effective value is still the default (8).
  await expect(page.getByLabel("יעד SLA לתגובה (שעות)")).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("tablist", { name: "קבוצות ההגדרות" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("tab", { name: /אבטחה/ }).click();
  await expect(page.getByLabel("יעד SLA לתגובה (שעות)")).toHaveValue("8");
  expect(errors).toEqual([]);
});

test("evaluator reset demands the typed double-confirm — locked until «אפס» is typed", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoSettings(page);

  await page.getByRole("tab", { name: /הדגמה/ }).click();
  await page.getByRole("button", { name: "איפוס נתוני הדגמה דטרמיניסטי" }).click();

  await expect(page.getByText("אישור כפול — איפוס נתוני הדגמה")).toBeVisible();
  // locked until the exact word is typed
  await expect(page.getByRole("button", { name: "איפוס עכשיו" })).toBeDisabled();
  await page.getByLabel("מילת אישור").fill("לא-הנכון");
  await expect(page.getByRole("button", { name: "איפוס עכשיו" })).toBeDisabled();
  await page.getByLabel("מילת אישור").fill("אפס");
  await expect(page.getByRole("button", { name: "איפוס עכשיו" })).toBeEnabled();
  // do NOT reset — close instead (the reset itself is covered by unit tests)
  await page.getByRole("button", { name: "ביטול" }).click();
  await expect(page.getByText("אישור כפול — איפוס נתוני הדגמה")).toHaveCount(0);
  expect(errors).toEqual([]);
});
