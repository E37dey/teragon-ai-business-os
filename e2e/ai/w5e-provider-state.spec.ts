// W5-E stage 2 — provider outage / fallback-disclosure honesty in Mode A.
//
// HONEST SCOPING (do not "fix" this by faking): the app ships Mode A —
// remoteEnabled:false, localFallbackPermitted:true (src/components/ai/engine.ts).
// The LOCAL rules engine is the PRIMARY provider, so:
//   * no remote provider state may be shown as connected ("ספק AI מרוחק מחובר"
//     must appear NOWHERE),
//   * no fallback notice may be fabricated (fallback is defined as
//     remote→local substitution; in Mode A local is primary, not a fallback),
//   * the health badge/state that IS shown belongs to the local engine and
//     says so explicitly ("מנוע מקומי — פועל ללא רשת וללא ספק חיצוני").
// A genuinely remote-connected / remote-outage UI state is NOT testable in
// e2e without a real provider; that path is covered headlessly by the
// TestAdapter suites (tests/ai/integration/fallbackFlow.test.ts).
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

test("/agents — provider health area shows the honest LOCAL state, never a fabricated remote", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/agents");
  await expect(page.getByTestId("agents-page")).toBeVisible();

  // the health area ("בריאות הספק") renders in the shell rail (PageRail
  // portals OUTSIDE the page container) — assert at page level
  const badge = page
    .locator('[data-testid="provider-state-badge"][data-provider="local-rules"]')
    .first();
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("מנוע מקומי מבוסס כללים");

  // the health detail names the local engine explicitly — no network, no external provider
  await expect(page.getByText("מנוע מקומי — פועל ללא רשת וללא ספק חיצוני")).toBeVisible();

  // honesty: the remote-connected label is fabricated NOWHERE on the page
  await expect(page.locator("body")).not.toContainText("ספק AI מרוחק מחובר");
  // honesty: no fallback notice is invented (Mode A: local is primary)
  await expect(page.getByTestId("fallback-notice")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("copilot answer in Mode A — provider badge is local and carries no fallback disclosure", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/agents"); // another non-command-center route for the shell card
  await expect(page.getByTestId("agents-page")).toBeVisible();
  await page.getByTestId("shell-open-copilot").click();
  await expect(page.getByTestId("copilot-workspace")).toBeVisible();

  await page
    .getByTestId("copilot-workspace")
    .getByRole("button", { name: "הצג הצעות מחיר ללא תגובה" })
    .click();
  const envelope = page.getByTestId("envelope-card").first();
  await expect(envelope).toBeVisible({ timeout: 15_000 });
  await expect(envelope.getByTestId("provider-state-badge")).toHaveAttribute(
    "data-provider",
    "local-rules",
  );
  await expect(envelope.getByTestId("provider-state-badge")).toContainText(
    "מנוע מקומי מבוסס כללים",
  );
  await expect(envelope.getByTestId("fallback-notice")).toHaveCount(0);
  await expect(page.getByTestId("copilot-workspace")).not.toContainText("ספק AI מרוחק מחובר");
  expect(errors).toEqual([]);
});
