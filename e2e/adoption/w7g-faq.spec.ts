// W7-G e2e — /faq (W7-D): 7 objections, full LACE detail, and the
// deterministic conversation simulator: dismissive input → warnings; good
// input → constructive feedback; NO numeric score anywhere. Zero console errors.
import { test, expect } from "@playwright/test";
import { collectConsoleErrors, gotoFaq } from "./w7g-helpers";

test("7 objections render; selecting one opens the full LACE detail — zero console errors", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoFaq(page);

  // 7 mandated objections in the list (quoted surface statements)
  const list = page.locator("button.os-panel");
  await expect(list).toHaveCount(7);

  await list.nth(1).click();
  // full LACE — all four steps with a proposed sentence each
  await expect(page.getByText("מענה LACE — משפט מוצע לכל שלב")).toBeVisible();
  for (const step of ["Listen", "Acknowledge", "Confirm", "Explore"]) {
    await expect(page.getByText(new RegExp(`· ${step}$`)).first()).toBeVisible();
  }
  await expect(page.getByText("החשש שמתחת").first()).toBeVisible();
  await expect(page.getByText("שאלת המשך מומלצת")).toBeVisible();
  expect(errors).toEqual([]);
});

// S13.1 "Product V2 context-rail reduction": the deterministic conversation simulator is a
// rail-ONLY surface and the permanent rail is no longer rendered on /faq (limited to
// /memory, /agents and the Coordination Room). Kept so they run unchanged if restored.
test.skip("simulator: DISMISSIVE input triggers phrasing warnings (deterministic rules)", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoFaq(page);

  // the honesty label is on screen before anything runs
  await expect(page.getByText(/הערכה דטרמיניסטית מבוססת כללים/).first()).toBeVisible();

  await page.locator("#sim-response").fill("שטויות, אין לך מה לדאוג. המערכת תמיד צודקת ואתה סתם מגזים.");
  await page.getByRole("button", { name: "בדיקת הנוסח" }).click();
  await expect(page.getByText(/אזהרות ניסוח \(\d+\)/)).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});

test.skip("simulator: GOOD input gets constructive feedback and NO numeric score", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await gotoFaq(page);

  await page
    .locator("#sim-response")
    .fill("אני מבין למה זה מדאיג אותך, ובוא נבדוק יחד את הראיות — האם הבנתי נכון שהחשש הוא מהאמינות?");
  await page.getByRole("button", { name: "בדיקת הנוסח" }).click();

  // constructive: strengths and/or suggestions render
  await expect(
    page.getByText("חוזקות שזוהו").or(page.getByText("הצעות לשיפור")).first(),
  ).toBeVisible({ timeout: 10_000 });
  // honesty: the confidence line is a LABEL, not an invented numeric score
  const confidence = page.getByText(/רמת ביטחון:/);
  await expect(confidence).toBeVisible();
  await expect(confidence).not.toContainText(/רמת ביטחון: ?\d/);
  await expect(page.getByText(/ציון|נקודות|score/i)).toHaveCount(0);
  expect(errors).toEqual([]);
});
