// W5-D — end-to-end flows: /agents fleet + drawer, collaboration demo
// scenario → conflict resolution → approval → run completion, copilot command
// → honest envelope, automations AI plan → approval gate, command center live
// approvals. Every test asserts ZERO console errors.
import { test, expect, type Page } from "@playwright/test";

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

test("/agents — 7 agents load with a working detail drawer (7 tabs)", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/agents");
  await expect(page.getByTestId("agents-page")).toBeVisible();
  await expect(page.getByTestId("agent-fleet-card")).toHaveCount(7);
  // usage honesty on the cards
  await expect(page.getByTestId("agents-page")).toContainText("טרם נמדד");
  // open the detail drawer
  await page.getByTestId("agent-card-open").first().click();
  await expect(page.getByTestId("agent-detail-drawer")).toBeVisible();
  for (const tab of ["סקירה", "משימות", "הרשאות", "כלים", "ריצות", "שגיאות", "Audit"]) {
    await expect(
      page.getByTestId("agent-detail-drawer").getByRole("tab", { name: new RegExp(tab) }),
    ).toBeVisible();
  }
  await page
    .getByTestId("agent-detail-drawer")
    .getByRole("tab", { name: /הרשאות/ })
    .click();
  await expect(page.getByTestId("agent-detail-drawer")).toContainText("deny-by-default");
  expect(errors).toEqual([]);
});

test("collaboration — demo scenario → graph → resolve conflict → approve → run completes", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/agents/collaboration");
  await expect(page.getByTestId("collaboration-page")).toBeVisible();

  // run the REAL engine demo scenario
  await page.getByTestId("run-demo").click();
  await expect(page.getByTestId("run-graph")).toBeVisible({ timeout: 20_000 });
  const nodeCount = await page.getByTestId("graph-node").count();
  expect(nodeCount).toBeGreaterThanOrEqual(9); // run + 4 agents + 3 tasks + conflict + approval

  // the Hunter/Fixer conflict appears with the 5 human actions
  await expect(page.getByTestId("conflict-rail")).toBeVisible();
  await expect(page.getByTestId("conflict-action")).toHaveCount(5);

  // resolve: approve the exception (audited engine function)
  await page.getByTestId("conflict-action").filter({ hasText: "אשר חריגה" }).click();
  await expect(page.getByTestId("conflict-rail")).toContainText("הוכרע: אשר חריגה", {
    timeout: 15_000,
  });

  // approve through the canonical ApprovalPanel — the run completes
  const panel = page.getByTestId("approval-panel");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "אשר", exact: true }).click();
  await expect(page.getByTestId("collaboration-page")).toContainText("הושלם", { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test("copilot — open, run a mapped command, get an honest envelope with a provider badge", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/");
  await page.getByTestId("open-copilot").click();
  await expect(page.getByTestId("copilot-workspace")).toBeVisible();

  // run the first spec command via its quick button
  await page
    .getByTestId("copilot-workspace")
    .getByRole("button", { name: "סכם את הפניות שהתקבלו השבוע" })
    .click();
  const envelope = page.getByTestId("envelope-card").first();
  await expect(envelope).toBeVisible({ timeout: 15_000 });
  await expect(envelope.getByTestId("provider-state-badge")).toContainText(
    "מנוע מקומי מבוסס כללים",
  );
  await expect(envelope).toContainText("טרם נמדד"); // confidence + usage honesty

  // unmapped input is refused honestly
  await page.getByTestId("copilot-input").fill("תעשה לי קפה");
  await page.getByTestId("copilot-workspace").getByRole("button", { name: "שלח" }).click();
  await expect(page.getByTestId("copilot-unsupported")).toContainText("הפקודה אינה נתמכת עדיין");
  expect(errors).toEqual([]);
});

test("automations — AI plan draft requires approval and opens the approval panel", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/automations");
  await expect(page.getByTestId("automations-page")).toBeVisible();

  // select the approval-required automation (auto-3)
  await page.getByRole("button", { name: "ברכת סיום קורס + בקשת משוב" }).click();
  await page.getByTestId("plan-op-draft").click();
  const envelope = page.getByTestId("envelope-card").first();
  await expect(envelope).toBeVisible();
  await expect(envelope).toContainText("מחייב אישור אנושי לפני ביצוע");

  // request execution → the canonical approval panel appears, pending
  await page.getByTestId("request-execution").click();
  const panel = page.getByTestId("approval-panel").first();
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel).toContainText("ממתין להחלטה");
  // approve → execution via the injected handler (creates Task+Activity)
  await panel.getByRole("button", { name: "אשר", exact: true }).click();
  await expect(panel).toContainText("בוצע", { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("command center — live engine pending approvals appear after a demo run", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  // create the pending approval through the REAL engine
  await page.goto("/agents/collaboration");
  await page.getByTestId("run-demo").click();
  await expect(page.getByTestId("run-graph")).toBeVisible({ timeout: 20_000 });

  await page.goto("/");
  await expect(page.getByTestId("agent-network-live")).toBeVisible();
  await expect(page.getByTestId("agent-network-live")).toContainText("אישורים ממתינים");
  const engineApprovals = page.getByTestId("engine-approvals");
  await expect(engineApprovals).toBeVisible();
  await expect(engineApprovals.getByTestId("approval-panel")).toBeVisible({ timeout: 15_000 });
  // provider honesty badge on the live band
  await expect(
    page.getByTestId("agent-network-live").getByTestId("provider-state-badge"),
  ).toContainText("מנוע מקומי מבוסס כללים");
  expect(errors).toEqual([]);
});
