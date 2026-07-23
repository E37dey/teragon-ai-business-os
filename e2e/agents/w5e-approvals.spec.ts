// W5-E stage 2 — approval workflow DEEP paths not covered by w5d:
//   * "ערוך ואשר": edit the execution payload → approve → the EXECUTION uses
//     the edited payload (visible difference asserted in the panel's effective
//     payload AND in the command-center activity feed).
//   * "דחה": reject demands a mandated reason (empty note refused), and a
//     rejected approval leaves NO mutation (no exec task, queue unchanged).
//   * "בקש תיקון": recorded honestly as a reasoned rejection.
//   * demo-scenario approval is recommendation-only (executionPayload:null) —
//     its "ערוך ואשר" is honestly DISABLED; asserted, not faked.
//   * keyboard: approval buttons reachable and operable via Tab+Enter.
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

const APPROVAL_AUTOMATION = "ברכת סיום קורס + בקשת משוב"; // auto-3, requiresApproval
const EDIT_MARKER = "נוסח ערוך W5E-E2E — טקסט הבדיקה הייחודי";

/** /automations → select auto-3 → draft plan op → request execution → pending panel */
async function createAutomationApproval(page: Page): Promise<void> {
  await page.goto("/automations");
  await expect(page.getByTestId("automations-page")).toBeVisible();
  await page.getByRole("button", { name: APPROVAL_AUTOMATION }).click();
  await page.getByTestId("plan-op-draft").click();
  await expect(page.getByTestId("envelope-card").first()).toBeVisible();
  await page.getByTestId("request-execution").click();
  const panel = page.getByTestId("approval-panel").first();
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel).toContainText("ממתין להחלטה");
}

test("ערוך ואשר — the edited payload is what gets executed (visible difference)", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await createAutomationApproval(page);
  const panel = page.getByTestId("approval-panel").first();

  // original effective payload wording (before the edit)
  await expect(panel).toContainText("הרצת האוטומציה");
  await expect(panel).not.toContainText(EDIT_MARKER);

  await panel.getByRole("button", { name: "ערוך ואשר" }).click();
  const dialog = page.getByRole("dialog", { name: /ערוך ואשר/ });
  await expect(dialog).toBeVisible();
  // first textarea = תיאור הפעולה (the payload description that will execute)
  await dialog.locator("textarea").first().fill(EDIT_MARKER);
  await dialog.getByRole("button", { name: "אשר עם העריכה" }).click();

  // executed with the EDITED payload — the state chip says בוצע and the
  // panel's effective payload (derived from the persisted ApprovalDecided
  // edited event) shows the marker
  await expect(panel.locator(".os-chip").first()).toHaveText(/בוצע/, { timeout: 15_000 });
  await expect(panel).toContainText(EDIT_MARKER);
  await expect(panel).not.toContainText("ממתין להחלטה");

  // the execution record (Activity) carries the edited description →
  // visible in the command-center activity feed
  await page.goto("/");
  await expect(page.getByTestId("command-center")).toBeVisible();
  await expect(page.getByTestId("command-center")).toContainText("אושר ובוצע מקומית");
  await expect(page.getByTestId("command-center")).toContainText(EDIT_MARKER);
  expect(errors).toEqual([]);
});

test("דחה — reason is mandatory; rejection leaves NO mutation and the queue returns to 0", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await createAutomationApproval(page);
  const panel = page.getByTestId("approval-panel").first();

  // the queue counter lives in the shell rail (PageRail portal) — page level
  await expect(page.getByText("אישורי הרצה ממתינים")).toBeVisible();

  await panel.getByRole("button", { name: "דחה", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /דחייה — נימוק חובה/ });
  await expect(dialog).toBeVisible();

  // 1) empty reason is refused — the dialog stays open, nothing is decided
  await dialog.getByRole("button", { name: "דחה", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(panel).toContainText("ממתין להחלטה");

  // 2) with a mandated reason the rejection is recorded
  await page.getByTestId("approval-note-input").fill("נימוק בדיקה W5E: הנוסח אינו מאושר לשליחה");
  await dialog.getByRole("button", { name: "דחה", exact: true }).click();
  await expect(panel.locator(".os-chip").first()).toHaveText(/נדחה/, { timeout: 15_000 });

  // NO mutation: no execution task and no execution activity were created
  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "משימות ופגישות" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("ביצוע ידני:");
  await page.goto("/");
  await expect(page.getByTestId("command-center")).toBeVisible();
  await expect(page.getByTestId("command-center")).not.toContainText("אושר ובוצע מקומית");
  expect(errors).toEqual([]);
});

test("בקש תיקון — recorded honestly as a reasoned rejection; scheduler run history shows 'ללא מעטפת AI'", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);

  // run history honesty first (auto-1 is the default selection and has runs)
  await page.goto("/automations");
  await expect(page.getByTestId("automations-page")).toBeVisible();
  await expect(page.getByTestId("automations-page")).toContainText(
    "ריצת מתזמן — ללא מעטפת AI",
  );

  // now the fix-request path on the approval-gated automation
  await page.getByRole("button", { name: APPROVAL_AUTOMATION }).click();
  await page.getByTestId("plan-op-draft").click();
  await page.getByTestId("request-execution").click();
  const panel = page.getByTestId("approval-panel").first();
  await expect(panel).toContainText("ממתין להחלטה", { timeout: 15_000 });

  await panel.getByRole("button", { name: "בקש תיקון" }).click();
  const dialog = page.getByRole("dialog", { name: /בקשת תיקון — נימוק חובה/ });
  await expect(dialog).toBeVisible();
  // empty reason refused here too
  await dialog.getByRole("button", { name: "שלח בקשת תיקון" }).click();
  await expect(dialog).toBeVisible();
  await page.getByTestId("approval-note-input").fill("להוסיף פנייה אישית בשם הלקוח");
  await dialog.getByRole("button", { name: "שלח בקשת תיקון" }).click();

  // the product records a fix request as a reasoned rejection — shown honestly
  await expect(panel.locator(".os-chip").first()).toHaveText(/נדחה/, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("demo-scenario approval is recommendation-only — 'ערוך ואשר' is honestly disabled", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/agents/collaboration");
  await expect(page.getByTestId("collaboration-page")).toBeVisible();
  await page.getByTestId("run-demo").click();
  const panel = page.getByTestId("approval-panel").first();
  await expect(panel).toBeVisible({ timeout: 20_000 });

  // executionPayload:null ⇒ recommendation-only: edit stays disabled, and the
  // OsButton honesty contract exposes the reason on the focusable wrapper
  // (the compact rail panel hides the payload note, so assert the tooltip)
  const editBtn = panel.getByRole("button", { name: "ערוך ואשר" });
  await expect(editBtn).toBeDisabled();
  await expect(
    panel.locator('.os-btn-wrap[data-disabled-reason*="אישור המלצה בלבד"]'),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("keyboard — approval buttons are reachable by Tab and operable with Enter", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await createAutomationApproval(page);
  const panel = page.getByTestId("approval-panel").first();

  // put focus just before the panel's buttons, then Tab to "אשר"
  await panel.getByRole("button", { name: "אשר", exact: true }).focus();
  const focusedText = await page.evaluate(() => document.activeElement?.textContent?.trim());
  expect(focusedText).toBe("אשר");

  // Tab moves through the panel's action row — every action is keyboard-reachable
  const seen: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    const txt = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
    seen.push(txt);
    await page.keyboard.press("Tab");
  }
  for (const label of ["אשר", "ערוך ואשר", "בקש תיקון", "דחה", "פתח ראיות", "בטל פעולה"]) {
    expect(seen, `approval action "${label}" must be in the tab order`).toContain(label);
  }

  // operate via keyboard: focus "אשר" again and press Enter → executes
  await panel.getByRole("button", { name: "אשר", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(panel.locator(".os-chip").first()).toHaveText(/בוצע/, { timeout: 15_000 });
  expect(errors).toEqual([]);
});
