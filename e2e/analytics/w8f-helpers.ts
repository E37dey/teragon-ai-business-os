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
  // wait on a stable primary KPI (the rail title renders non-exactly and a
  // like-named metric was moved into a collapsed disclosure by Visual Calm).
  await expect(page.getByText("לידים חדשים").first()).toBeVisible({ timeout: 30_000 });
}

export async function gotoGovernance(page: Page): Promise<void> {
  await page.goto("/governance");
  await expect(page.getByText("ממשל ובקרת AI").first()).toBeVisible({ timeout: 30_000 });
  // S13.2 declutter: the governed reference zones (policies, boundaries,
  // permissions, protected prompts, audit) render inside a collapsed-by-default
  // disclosure ("opens on demand"). Open it so the bootstrap-settled zones —
  // incl. zone-policies — are visible for assertions and screenshots. This is
  // the real cause of the earlier "zone-policies hidden" timeouts, not a slow boot.
  const reference = page.getByTestId("governance-reference");
  await expect(reference).toBeVisible({ timeout: 30_000 });
  const alreadyOpen = await reference.evaluate((el) => (el as HTMLDetailsElement).open);
  if (!alreadyOpen) await reference.locator("summary").click();
  // the idempotent governance bootstrap settles (policies zone renders rows)
  await expect(page.getByTestId("zone-policies")).toBeVisible({ timeout: 30_000 });
}

/** Open the on-demand incidents disclosure (S13.2 declutter collapses it) so
 *  zone-incidents and the incident form are interactable. */
export async function openGovernanceIncidents(page: Page): Promise<void> {
  const disclosure = page.getByTestId("governance-incidents-d");
  await expect(disclosure).toBeVisible({ timeout: 30_000 });
  const alreadyOpen = await disclosure.evaluate((el) => (el as HTMLDetailsElement).open);
  if (!alreadyOpen) await disclosure.locator("summary").click();
  await expect(page.getByTestId("zone-incidents")).toBeVisible({ timeout: 30_000 });
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
