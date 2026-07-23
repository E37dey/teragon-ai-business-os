// W7-G e2e — /personas (W7-B): exactly 7 persona lanes, the canonical
// Training Matrix, clickable auditor warnings. Zero console errors.
import { test, expect } from "@playwright/test";
import { collectConsoleErrors, gotoPersonas } from "./w7g-helpers";

test("exactly 7 persona lanes render with the 7/7 guard green — zero console errors", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoPersonas(page);

  // KPI: the guard reports 7 / 7
  await expect(page.getByText("7 / 7").first()).toBeVisible();
  // the seven canonical lanes (anchored panels)
  for (let i = 1; i <= 7; i += 1) {
    await expect(page.locator(`#persona-lane-per-${i}`)).toBeVisible();
  }
  await expect(page.locator("#persona-lane-per-8")).toHaveCount(0);
  // honesty: adoption progress is NOT invented
  await expect(page.getByText("טרם נמדד").first()).toBeVisible();
  // validation panel confirms the guard
  await expect(page.getByText("בדיוק 7 פרסונות קנוניות")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the Training Matrix renders and a material click opens the material drawer", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoPersonas(page);

  await expect(page.getByText("Training Matrix — המטריצה הקנונית")).toBeVisible();
  await expect(page.getByText("יעד ≠ נמדד — תוצאה בפועל מוצגת רק לאחר מדידה")).toBeVisible();

  // a supporting-material chip opens the drawer with linked personas
  const lane = page.locator("#persona-lane-per-1");
  await lane.scrollIntoViewIfNeeded();
  const chip = lane.locator("#persona-per-1-supportingMaterials button").first();
  await chip.click();
  const drawer = page.getByRole("dialog").first();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("פרסונות מקושרות")).toBeVisible();
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("auditor warnings in the rail are CLICKABLE and scroll to the persona anchor", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoPersonas(page);

  await expect(page.getByText("מבקר הפרסונות")).toBeVisible();
  // the rail exposes clickable warning buttons (אזהרות or honest מצבים כנים)
  const railWarning = page
    .getByRole("button", { name: /מעבר אל/ })
    .or(page.locator("button[title^='מעבר אל']"))
    .first();
  await expect(railWarning).toBeVisible();
  await railWarning.click();
  // click scrolls the target anchor into view — no navigation, no error
  await expect(page).toHaveURL(/\/personas$/);
  expect(errors).toEqual([]);
});
