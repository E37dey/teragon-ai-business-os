// W8-F e2e — cross-cutting flows: the Command-Center management band derives
// from real records and clicks through to its owning screens, the /submission
// pending-approval state is honest (DEFECT note: the mandated string "ממתין
// לאישור אנושי בשם" [WAVE8_PENDING_APPROVAL_HE] is defined in
// src/domain/submission/wave8Evidence.ts but is NOT yet wired into the
// SubmissionPage — reported in docs/WAVE_8_TEST_RESULTS.md; the spec pins the
// honest state that IS rendered), refresh persistence, and an offline warm
// walk across the five Wave-8 routes. Zero (non-network) console errors.
import { test, expect, type Page } from "@playwright/test";
import { collectConsoleErrors, nonNetworkErrors } from "../analytics/w8f-helpers";

/**
 * The submission bootstraps (bridge/objections/materials/programme) settle
 * asynchronously — the blocker counter DRIFTS as each idempotent bootstrap
 * completes (the summary line and the auditor rail update together, so they
 * agree even mid-settle). The count is only trustworthy once it has STOPPED
 * changing. Returns the stable settled blocker count (summary==rail AND
 * unchanged across two samples ~1s apart).
 */
async function settledBlockers(page: Page): Promise<number> {
  const read = async (): Promise<number> => {
    const summary = (await page.getByText(/חוסמים פתוחים:/).textContent()) ?? "";
    const rail = (await page.getByText(/חוסמים ·/).first().textContent()) ?? "";
    const s = Number(/חוסמים פתוחים:\s*(\d+)/.exec(summary)?.[1] ?? "-1");
    const r = Number(/(\d+)\s*חוסמים/.exec(rail)?.[1] ?? "-2");
    return s === r ? s : -1;
  };
  let stable = -1;
  await expect(async () => {
    const first = await read();
    await page.waitForTimeout(1_000);
    const second = await read();
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBe(first);
    stable = second;
  }).toPass({ timeout: 45_000 });
  return stable;
}

test("management band: 7 derived items, honest counts, click-through navigates", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/");
  const band = page.getByTestId("management-band");
  await band.scrollIntoViewIfNeeded();
  await expect(band.getByText("רצועת הניהול")).toBeVisible({ timeout: 30_000 });

  // the 7 derived items are all present
  for (const key of [
    "operational-risks",
    "critical-incidents",
    "pending-access-reviews",
    "health-attention",
    "missing-baselines",
    "expiring-policies",
    "submission-approvals",
  ]) {
    await expect(page.getByTestId(`management-band-${key}`)).toBeVisible({ timeout: 30_000 });
  }

  // health item is honestly unmeasured before any snapshot — "טרם נבדק", not 0
  await expect(page.getByTestId("management-band-health-attention")).toContainText("טרם נבדק");

  // click-through: the risks card navigates to /governance
  await page.getByTestId("management-band-operational-risks").click();
  await expect(page).toHaveURL(/\/governance$/, { timeout: 15_000 });
  await expect(page.getByText("ממשל ובקרת AI").first()).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("submission pending-approval state is honest (no auto-מלא) + refresh persistence", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/submission");
  await expect(page.getByText("מרכז ההגשה והראיות").first()).toBeVisible({ timeout: 30_000 });

  // honest pending state: deliverables await a NAMED human approval — the
  // summary line never fakes 12/12 and the readiness chip is not green
  await expect(page.getByText(/מצב כן — אין 12\/12 מאולץ/)).toBeVisible();
  const chip = page.getByText(/מוכנות להגשה:/).first();
  await expect(chip).toBeVisible();
  expect(((await chip.textContent()) ?? "").trim()).not.toBe("מוכנות להגשה: מוכן להגשה");

  // refresh persistence — the SETTLED derived state is identical after reload
  const before = await settledBlockers(page);
  await page.reload();
  await expect(page.getByText("מרכז ההגשה והראיות").first()).toBeVisible({ timeout: 30_000 });
  const after = await settledBlockers(page);
  expect(after).toBe(before);
  expect(errors).toEqual([]);
});

test("offline warm walk: the five Wave-8 routes render from the local stores with no network", async ({
  page,
  context,
}) => {
  const errors = collectConsoleErrors(page);
  const routes = [
    ["/analytics", "דוחות וניתוחים"],
    ["/governance", "ממשל ובקרת AI"],
    ["/administration", "תפקידים קנוניים"],
    ["/system-health", "בריאות המערכת"],
    ["/settings", "הגדרות מנוהלות"],
  ] as const;

  // WARM phase (online): load the app + every lazy route chunk once
  await page.goto("/");
  await expect(page.getByText("רצועת הניהול")).toBeVisible({ timeout: 30_000 });
  for (const [path, anchor] of routes) {
    await page.locator(`a[href="${path}"]`).first().click();
    await expect(page.getByText(anchor).first()).toBeVisible({ timeout: 30_000 });
  }

  // OFFLINE phase: client-side re-walk — every route renders from the already
  // loaded bundle + the local IndexedDB stores, no network required
  await context.setOffline(true);
  for (const [path, anchor] of routes) {
    await page.locator(`a[href="${path}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`${path}$`), { timeout: 15_000 });
    await expect(page.getByText(anchor).first()).toBeVisible({ timeout: 30_000 });
  }
  await context.setOffline(false);
  expect(nonNetworkErrors(errors)).toEqual([]);
});
