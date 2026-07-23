// W5-D — screenshots at 1920/2560/3840 → docs/screenshots/wave5/:
// /agents, /agents/collaboration (after the demo run), /automations,
// / (rewired command center), copilot-open, approval-panel.
import { test, expect, type Page } from "@playwright/test";

const SIZES: [number, number][] = [
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
];

async function shot(page: Page, name: string, w: number, h: number): Promise<void> {
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: `docs/screenshots/wave5/${name}-${w}x${h}.png`,
    fullPage: false,
  });
}

for (const [w, h] of SIZES) {
  test(`agents @ ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/agents");
    await expect(page.getByTestId("agent-fleet-card")).toHaveCount(7);
    await shot(page, "agents", w, h);
  });

  test(`collaboration @ ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/agents/collaboration");
    await page.getByTestId("run-demo").click();
    await expect(page.getByTestId("run-graph")).toBeVisible({ timeout: 20_000 });
    await shot(page, "collaboration", w, h);
  });

  test(`automations @ ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/automations");
    await expect(page.getByTestId("automations-page")).toBeVisible();
    await page.getByTestId("plan-op-classify").click();
    await shot(page, "automations", w, h);
  });

  test(`command-center @ ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/");
    await expect(page.getByTestId("agent-network-live")).toBeVisible();
    await shot(page, "command-center", w, h);
  });

  test(`copilot-open @ ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/");
    await page.getByTestId("open-copilot").click();
    await page
      .getByTestId("copilot-workspace")
      .getByRole("button", { name: "סכם את הפניות שהתקבלו השבוע" })
      .click();
    await expect(page.getByTestId("envelope-card").first()).toBeVisible({ timeout: 15_000 });
    await shot(page, "copilot-open", w, h);
  });

  test(`approval-panel @ ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/agents/collaboration");
    await page.getByTestId("run-demo").click();
    await expect(page.getByTestId("approval-panel")).toBeVisible({ timeout: 20_000 });
    await shot(page, "approval-panel", w, h);
  });
}
