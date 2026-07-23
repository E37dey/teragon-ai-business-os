// W8-F shared e2e helpers — console-error collection (every spec asserts a
// clean console) + goto/wait patterns for the five Wave-8 routes.
import { expect, type Page } from "@playwright/test";

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

/** offline runs produce expected fetch-failure noise — everything else must be clean */
export function nonNetworkErrors(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      !e.includes("ERR_INTERNET_DISCONNECTED") &&
      !e.includes("Failed to load resource") &&
      !e.includes("net::"),
  );
}

export async function gotoAnalytics(page: Page): Promise<void> {
  await page.goto("/analytics");
  await expect(page.getByText("דוחות וניתוחים").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("מבקר המדדים").first()).toBeVisible({ timeout: 30_000 });
}

export async function gotoGovernance(page: Page): Promise<void> {
  await page.goto("/governance");
  await expect(page.getByText("ממשל ובקרת AI").first()).toBeVisible({ timeout: 30_000 });
  // the idempotent governance bootstrap settles (policies zone renders rows)
  await expect(page.getByTestId("zone-policies")).toBeVisible({ timeout: 30_000 });
}

export async function gotoAdministration(page: Page): Promise<void> {
  await page.goto("/administration");
  await expect(page.getByTestId("administration-page")).toBeVisible({ timeout: 30_000 });
  // default tab is "users" — assert a tab-independent anchor (KPI + the users
  // table testid the page always mounts)
  await expect(page.getByText("תפקידים קנוניים").first()).toBeVisible({ timeout: 30_000 });
}

export async function gotoSystemHealth(page: Page): Promise<void> {
  await page.goto("/system-health");
  await expect(page.getByText("בריאות המערכת").first()).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "הרצת בדיקת בריאות מקומית" }),
  ).toBeVisible({ timeout: 30_000 });
}

export async function gotoSettings(page: Page): Promise<void> {
  await page.goto("/settings");
  await expect(page.getByText("הגדרות מנוהלות").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("tablist", { name: "קבוצות ההגדרות" })).toBeVisible({
    timeout: 30_000,
  });
}
