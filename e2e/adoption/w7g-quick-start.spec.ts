// W7-G e2e — /quick-start (W7-D): the 3 actions with honest schematic demos,
// "נסה זאת" navigates to the REAL route, the מותר/חובה לבדוק/אסור rules block,
// and the deterministic rail coach. Zero console errors.
import { test, expect } from "@playwright/test";
import { collectConsoleErrors, gotoQuickStart } from "./w7g-helpers";

test("3 actions render with honest live-schematic demos + the rules block — zero console errors", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoQuickStart(page);

  // exactly 3 "נסה זאת" actions
  await expect(page.getByRole("button", { name: "נסה זאת" })).toHaveCount(3);
  // each demo declares itself schematic — NOT a screenshot
  await expect(page.getByText(/הדגמה סכמטית חיה — לא צילום מסך/)).toHaveCount(3);
  // the correct-use rules block: all three columns
  await expect(page.getByText("מותר", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("חובה לבדוק", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("אסור", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("«נסה זאת» navigates to the action's REAL route inside the shell", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await gotoQuickStart(page);

  // the first action card displays its target route (dir=ltr span) — read it
  const routeLabel = await page.locator("span[dir='ltr']").first().textContent();
  expect(routeLabel?.startsWith("/")).toBe(true);

  await page.getByRole("button", { name: "נסה זאת" }).first().click();
  await expect(page).toHaveURL(new RegExp(`${routeLabel?.replace(/\//g, "\\/")}`));
  // the target screen actually renders (not a placeholder error)
  await expect(page.locator(".os-route-loading")).toHaveCount(0, { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("rail coach: a planned action gets a deterministic verdict against the policy", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoQuickStart(page);

  await page.locator("#qs-planned").fill("לשלוח ללקוח הצעת מחיר שה-AI הכין בלי לבדוק");
  await page.getByRole("button", { name: "בדיקה מול הנוהל" }).click();
  // a verdict renders + the honest "לא מודל" note
  await expect(page.getByText(/בדיקה דטרמיניסטית מול הנוהל — לא מודל/).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("view modes: print A4 + presentation views render", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await gotoQuickStart(page);

  await page.getByRole("tab", { name: "תצוגת הדפסה A4" }).click();
  await expect(page.getByRole("button", { name: "נסה זאת" }).first()).toBeVisible();

  await page.getByRole("tab", { name: "תצוגת מצגת" }).click();
  await expect(page.getByText("פתח לקוח או פנייה → בקש סיכום או המלצה → בדוק ראיות ואשר")).toBeVisible();
  await expect(page.getByText("1 / 4")).toBeVisible();
  await page.getByRole("button", { name: "הבא" }).click();
  await expect(page.getByText("2 / 4")).toBeVisible();
  expect(errors).toEqual([]);
});
