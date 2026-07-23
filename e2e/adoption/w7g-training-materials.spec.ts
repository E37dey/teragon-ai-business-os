// W7-G e2e — /training-materials (W7-D): 13 canonical cards (7 reading +
// 6 teaching), real structured preview opens, canonical approval flow works
// through the UI and SURVIVES a refresh (IndexedDB persistence). Zero console
// errors.
import { test, expect } from "@playwright/test";
import { collectConsoleErrors, gotoTrainingMaterials } from "./w7g-helpers";

test("13 canonical cards render in two sections (7 קריאה + 6 הוראה) — zero console errors", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoTrainingMaterials(page);

  await expect(page.getByText("חומרי קריאה (7)")).toBeVisible();
  await expect(page.getByText("חומרי הוראה ותרגול (6)")).toBeVisible();
  // 13 preview-openable cards (each card is a role=button panel)
  await expect(page.getByRole("button", { name: /פתיחת תצוגה מקדימה:/ })).toHaveCount(13);
  expect(errors).toEqual([]);
});

test("material preview opens with the REAL structured content", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await gotoTrainingMaterials(page);

  await page.getByRole("button", { name: /פתיחת תצוגה מקדימה:/ }).first().click();
  const drawer = page.getByRole("dialog").first();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("תצוגה מקדימה — התוכן המלא")).toBeVisible();
  await expect(drawer.getByText("זרימת אישור")).toBeVisible();
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("canonical approval flow via the UI: request → approve → status מאושר → persists across refresh", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoTrainingMaterials(page);

  // open the first card that still allows requesting approval
  await page.getByRole("button", { name: /פתיחת תצוגה מקדימה:/ }).first().click();
  const drawer = page.getByRole("dialog").first();
  await expect(drawer).toBeVisible();

  const request = drawer.getByRole("button", { name: "שליחה לאישור" });
  if (await request.isVisible().catch(() => false)) {
    await request.click();
    await expect(page.getByText("בקשת האישור נוצרה — ממתינה להחלטת מאשר/ת")).toBeVisible({
      timeout: 10_000,
    });
  }
  // decide via the canonical Approval record (never auto-approved)
  const approve = drawer.getByRole("button", { name: "אישור החומר" });
  await expect(approve).toBeVisible({ timeout: 10_000 });
  await approve.click();
  await expect(page.getByText("החומר אושר ונרשם")).toBeVisible({ timeout: 10_000 });
  await expect(drawer.getByText("אושר בזרימה הקנונית")).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");

  // REFRESH PERSISTENCE — the decision lives in IndexedDB, not component state
  await page.reload();
  await gotoTrainingMaterials(page);
  await page.getByRole("button", { name: /פתיחת תצוגה מקדימה:/ }).first().click();
  await expect(page.getByRole("dialog").first().getByText("אושר בזרימה הקנונית")).toBeVisible({
    timeout: 15_000,
  });
  expect(errors).toEqual([]);
});
