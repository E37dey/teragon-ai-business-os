// vNext Phase F — accessibility axe gate on the NEW portal surfaces.
// Contract (same as the W6/W7/W8/W9 gates): ZERO serious/critical violations on
// /welcome, each of the three role homes, the AccessDenied surface, and the
// onboarding card open. Absolute BASE so it is independent of the RC2 webServer.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE = "http://localhost:4180";

async function serious(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.impact}:${v.id} (${v.nodes.length})`);
}

async function login(page: Page, portal: "manager" | "student" | "technician") {
  await page.goto(`${BASE}/welcome`);
  await page.getByTestId(`demo-prefill-${portal}`).click();
  await page.getByTestId("demo-login-submit").click();
  await expect(page).toHaveURL(`${BASE}/home`);
}

test("axe: /welcome — ZERO serious/critical", async ({ page }) => {
  await page.goto(`${BASE}/welcome`);
  await expect(page.getByTestId("demo-prefill-manager")).toBeVisible();
  expect(await serious(page)).toEqual([]);
});

for (const portal of ["manager", "student", "technician"] as const) {
  test(`axe: ${portal} home (+ onboarding open) — ZERO serious/critical`, async ({ page }) => {
    await login(page, portal);
    await expect(page.getByTestId("portal-onboarding")).toBeVisible(); // first visit
    expect(await serious(page)).toEqual([]);
  });
}

test("axe: AccessDenied surface — ZERO serious/critical", async ({ page }) => {
  await login(page, "student");
  await page.goto(`${BASE}/analytics`);
  await expect(page.getByTestId("authz-access-denied")).toBeVisible();
  expect(await serious(page)).toEqual([]);
});
