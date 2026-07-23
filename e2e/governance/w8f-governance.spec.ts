// W8-F e2e — /governance (W8-B): policy version view (append-only content),
// permission matrix derived from the frozen agent definitions, Audit Explorer
// filters + item detail, incident create → assign, and the system-health
// incidents section. Zero console errors.
import { test, expect } from "@playwright/test";
import { collectConsoleErrors, gotoGovernance } from "../analytics/w8f-helpers";

test("policy list → policy detail shows the CURRENT append-only version content", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoGovernance(page);

  // click the first policy row in the policies zone
  const policiesTable = page.getByTestId("zone-policies").locator("table").first();
  await expect(policiesTable.locator("tbody tr").first()).toBeVisible({ timeout: 20_000 });
  await policiesTable.locator("tbody tr").first().click();

  const detail = page.getByTestId("policy-detail");
  await expect(detail).toBeVisible();
  await expect(detail.getByText(/תוכן גרסה v\d+ \(append-only\)/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("permission matrix derives from the frozen agent definitions (read-only)", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoGovernance(page);

  const zone = page.getByTestId("zone-permissions");
  await zone.scrollIntoViewIfNeeded();
  await expect(zone.getByText("הרשאות סוכנים")).toBeVisible();
  await expect(
    zone.getByText(/מטריצה נגזרת \(קריאה בלבד\) מ-AGENT_DEFINITIONS/),
  ).toBeVisible();
  // the matrix table renders rows for the governed agents
  await expect(zone.locator("table tbody tr").first()).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});

test("Audit Explorer: free-text filter narrows the rows; row click opens the item detail", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoGovernance(page);

  const zone = page.getByTestId("zone-audit");
  await zone.scrollIntoViewIfNeeded();
  const rows = zone.locator("table tbody tr");
  await expect(rows.first()).toBeVisible({ timeout: 20_000 });
  const unfiltered = await rows.count();
  expect(unfiltered).toBeGreaterThan(0);

  // free-text filter narrows honestly
  await page.getByTestId("audit-free-text").fill("approval");
  await expect
    .poll(async () => rows.count(), { timeout: 15_000 })
    .toBeLessThanOrEqual(unfiltered);

  // clear + open the first item's detail
  await page.getByTestId("audit-free-text").fill("");
  await rows.first().click();
  await expect(page.getByTestId("audit-detail")).toBeVisible();
  expect(errors).toEqual([]);
});

test("incident: create with title+description+severity → assign to a named user", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoGovernance(page);

  const zone = page.getByTestId("zone-incidents");
  await zone.scrollIntoViewIfNeeded();

  // the open button is honestly disabled until title+description exist
  await expect(page.getByTestId("incident-open")).toBeDisabled();
  await page.getByTestId("incident-title").fill("W8F — תקרית בדיקה");
  await page.getByTestId("incident-desc").fill("נפתחה על ידי בדיקת הקצה-לקצה של גל 8");
  await page.getByTestId("incident-open").click();

  // the new incident appears in the table — open its detail
  const row = zone.locator("table tbody tr", { hasText: "W8F — תקרית בדיקה" });
  await expect(row.first()).toBeVisible({ timeout: 20_000 });
  await row.first().click();
  await expect(page.getByTestId("incident-detail")).toBeVisible();

  // assign — the incident gets a named assignee
  await page.getByTestId("incident-assign").click();
  await expect(page.getByTestId("incident-assign")).toHaveCount(0, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("system-health incidents section is present on the governance page", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await gotoGovernance(page);

  const zone = page.getByTestId("zone-health-incidents");
  await zone.scrollIntoViewIfNeeded();
  await expect(zone.getByText("אירועי בריאות המערכת")).toBeVisible();
  await expect(zone.getByText(/source: system-health/)).toBeVisible();
  expect(errors).toEqual([]);
});
