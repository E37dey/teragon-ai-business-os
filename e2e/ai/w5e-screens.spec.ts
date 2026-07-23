// W5-E stage 2 — Phase 5.17 screenshots at 1920/2560/3840 →
// docs/screenshots/wave5/*-e2-*.png (suffix -e2: never overwrites W5-D files).
// States: copilot opened FROM THE SHELL on /crm, approval drawer in EDIT mode,
// /agents provider-state health area, collaboration selected-conflict state.
// fallback-notice: honestly N/A — Mode A serves local as PRIMARY, so a
// fallback disclosure never legitimately renders (documented in
// docs/WAVE_5_VISUAL_QA.md); no screenshot is faked for it.
import { test, expect, type Page } from "@playwright/test";

const SIZES: [number, number][] = [
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
];

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

async function shot(page: Page, name: string, w: number, h: number): Promise<void> {
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: `docs/screenshots/wave5/${name}-${w}x${h}.png`,
    fullPage: false,
  });
}

for (const [w, h] of SIZES) {
  test(`copilot-open-e2 (shell card on /crm) @ ${w}x${h}`, async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/crm");
    await expect(page.getByTestId("crm-page")).toBeVisible();
    await page.getByTestId("shell-open-copilot").click();
    await page
      .getByTestId("copilot-workspace")
      .getByRole("button", { name: "מי מהלקוחות עדיין לא קיבל מענה?" })
      .click();
    await expect(page.getByTestId("envelope-card").first()).toBeVisible({ timeout: 15_000 });
    await shot(page, "copilot-open-e2", w, h);
    expect(errors).toEqual([]);
  });

  test(`approval-drawer-e2 (edit mode) @ ${w}x${h}`, async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/automations");
    await expect(page.getByTestId("automations-page")).toBeVisible();
    await page.getByRole("button", { name: "ברכת סיום קורס + בקשת משוב" }).click();
    await page.getByTestId("plan-op-draft").click();
    await page.getByTestId("request-execution").click();
    const panel = page.getByTestId("approval-panel").first();
    await expect(panel).toContainText("ממתין להחלטה", { timeout: 15_000 });
    await panel.getByRole("button", { name: "ערוך ואשר" }).click();
    await expect(page.getByRole("dialog", { name: /ערוך ואשר/ })).toBeVisible();
    await shot(page, "approval-drawer-e2", w, h);
    expect(errors).toEqual([]);
  });

  test(`provider-state-e2 (/agents health area) @ ${w}x${h}`, async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/agents");
    await expect(page.getByTestId("agent-fleet-card")).toHaveCount(7);
    // the health area lives in the shell rail (PageRail portal)
    await expect(
      page.locator('[data-testid="provider-state-badge"][data-provider="local-rules"]').first(),
    ).toBeVisible();
    await shot(page, "provider-state-e2", w, h);
    expect(errors).toEqual([]);
  });

  test(`collaboration-conflict-e2 (selected conflict) @ ${w}x${h}`, async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/agents/collaboration");
    await expect(page.getByTestId("collaboration-page")).toBeVisible();
    await page.getByTestId("run-demo").click();
    await expect(page.getByTestId("run-graph")).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-testid="graph-node"][data-node-kind="conflict"]').click();
    // the selected-node card renders in the shell rail (PageRail portal)
    await expect(page.getByText("נבחר: קונפליקט")).toBeVisible();
    await shot(page, "collaboration-conflict-e2", w, h);
    expect(errors).toEqual([]);
  });
}
