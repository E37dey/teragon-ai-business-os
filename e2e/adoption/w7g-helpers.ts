// W7-G shared e2e helpers — console-error collection (every spec asserts a
// clean console) + common goto/wait patterns for the Wave-7 adoption screens.
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

export async function gotoImplementation(page: Page): Promise<void> {
  await page.goto("/implementation");
  await expect(page.getByTestId("stage-roadmap")).toBeVisible({ timeout: 30_000 });
}

export async function gotoPersonas(page: Page): Promise<void> {
  await page.goto("/personas");
  await expect(page.getByText("שבע הפרסונות — מסלול לכל קהל")).toBeVisible({ timeout: 30_000 });
}

export async function gotoStageGates(page: Page): Promise<void> {
  await page.goto("/stage-gates");
  await expect(page.getByText("Stage Gates · שערי מעבר וראיות")).toBeVisible({ timeout: 30_000 });
  // the idempotent V2 bridge must settle (KPI row derives from bridged gates)
  await expect(page.getByText("שערי Go")).toBeVisible({ timeout: 30_000 });
}

export async function gotoTrainingMaterials(page: Page): Promise<void> {
  await page.goto("/training-materials");
  await expect(page.getByText("מרכז חומרי ההדרכה").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("חומרי קריאה (7)")).toBeVisible({ timeout: 30_000 });
}

export async function gotoQuickStart(page: Page): Promise<void> {
  await page.goto("/quick-start");
  await expect(page.getByText("התחלה מהירה ושימוש נכון").first()).toBeVisible({ timeout: 30_000 });
}

export async function gotoFaq(page: Page): Promise<void> {
  await page.goto("/faq");
  await expect(page.getByText("FAQ והתנגדויות").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("התנגדויות מתועדות")).toBeVisible({ timeout: 30_000 });
}

export async function gotoSubmission(page: Page): Promise<void> {
  await page.goto("/submission");
  await expect(page.getByText("מרכז ההגשה והראיות").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/מוכנות להגשה:/)).toBeVisible({ timeout: 30_000 });
}
