// W6-F Phase 6.22 — /learning end-to-end: the governed learning loop UI.
// Honest scope: the demo seed derives ONE pending single-case proposal (whose
// approval is structurally blocked by the mandatory marker) and ONE
// multi-record proposal already approved by the named reviewer into the
// single active rule (with one recorded application). The e2e therefore
// proves: named-reviewer approval evidence, single-case approve-block,
// reason-mandatory reject/rollback, real rollback with surviving history.
// Every test asserts ZERO console errors.
import { test, expect, type Page } from "@playwright/test";

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

async function gotoLearning(page: Page): Promise<void> {
  await page.goto("/learning");
  await expect(page.getByTestId("learning-page")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("learning-metrics")).toBeVisible();
}

test("/learning loads: derived metrics, loop stepper, honest «טרם נמדד» — zero console errors", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoLearning(page);

  // four PRIMARY derived metrics (Visual Calm: ≤4 KPIs)
  const metrics = page.getByTestId("learning-metrics");
  for (const title of [
    "תובנות ממתינות לבדיקה",
    "במעקב (טרם נמדדו)",
    "כללים פעילים",
    "ביטולים (rollback)",
  ]) {
    await expect(metrics.getByText(title, { exact: true })).toBeVisible();
  }
  // analytical totals moved to the "מדדים נוספים" disclosure — still accessible
  const more = page.locator(".os-more-metrics");
  await more.locator("summary").click();
  for (const title of ["המלצות שאושרו", "המלצות שנדחו", "תוצאות שנמדדו"]) {
    await expect(more.getByText(title, { exact: true })).toBeVisible();
  }
  // honesty: unmeasured is never a number
  await expect(page.getByText("טרם נמדד").first()).toBeVisible();
  // the loop stepper renders with the manager-approval gate step
  await expect(page.getByText("לולאת הלמידה המנוהלת")).toBeVisible();
  await expect(page.getByTestId("learning-table")).toBeVisible();
  expect(errors).toEqual([]);
});

test("proposal review: named reviewer recorded; single-case approval is STRUCTURALLY blocked; reject demands a reason", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoLearning(page);

  // rail auto-selects the pending proposal (the single-case one in the seed)
  const rail = page.getByTestId("proposal-rail");
  await expect(rail).toBeVisible();
  await expect(rail).toContainText("מאשר בשם"); // the NAMED reviewer field
  await expect(rail).toContainText("צחי זוסטייהם");

  // the mandatory single-case marker is visible AND blocks approval honestly
  await expect(rail.getByTestId("single-case-marker")).toBeVisible();
  await expect(rail.getByTestId("approve-proposal")).toBeDisabled();

  // reject without a reason is refused (reason-mandatory contract)
  await expect(rail.getByTestId("reject-proposal")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("named approval evidence: the seeded multi-record proposal became the active rule via the named reviewer", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoLearning(page);

  // the table row joining recommendation → proposal → rule shows the approver
  const table = page.getByTestId("learning-table");
  await expect(table).toContainText("צחי זוסטייהם");

  // select the approved proposal's row (status «כלל פעיל») → the rail shows
  // the ACTIVE rule with its recorded application count (rule history)
  await table.getByRole("row").filter({ hasText: "כלל פעיל" }).first().click();
  const rail = page.getByTestId("proposal-rail");
  await expect(rail.getByText(/פעיל · גרסה \d+/)).toBeVisible({ timeout: 15_000 });
  await expect(rail).toContainText("יישומים:");
  await expect(rail).toContainText("אפקטיביות: טרם נמדד"); // honest, unmeasured
  expect(errors).toEqual([]);
});

test("rule rollback: reason-mandatory; rolled-back rule refuses revival and past applications stay visible", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoLearning(page);

  // select the row whose proposal carries the ACTIVE rule
  const table = page.getByTestId("learning-table");
  await table.getByRole("row").filter({ hasText: "כלל פעיל" }).first().click();
  const rail = page.getByTestId("proposal-rail");

  // rollback without a reason is refused
  await expect(rail.getByTestId("rollback-rule")).toBeVisible({ timeout: 15_000 });
  await expect(rail.getByTestId("rollback-rule")).toBeDisabled();

  // with a reason → the rule is deactivated, honestly labeled, history intact
  await rail.getByTestId("review-reason").fill("ביטול בדיקת W6F — נימוק מתועד");
  await rail.getByTestId("rollback-rule").click();
  await expect(
    page.getByText("הכלל בוטל — יישומי העבר נשארים גלויים").first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(rail.getByTestId("rule-rolled-back")).toBeVisible();
  await expect(rail.getByTestId("rule-rolled-back")).toContainText("יישומי העבר נשארים");
  // the rollback metric now counts 1 (derived, not invented)
  await expect(
    page
      .getByTestId("learning-metrics")
      .locator(".os-kpi")
      .filter({ hasText: "ביטולים (rollback)" })
      .locator(".os-kpi__value"),
  ).toHaveText("1");
  expect(errors).toEqual([]);
});
