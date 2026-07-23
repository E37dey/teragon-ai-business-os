// W5-E stage 2 — command-center agent-event propagation + IndexedDB
// persistence: a demo run started in the collaboration room is reflected on
// the command center (pending-approval count, open conflict), and SURVIVES a
// full browser refresh (records live in IndexedDB, not component state).
// Also: the collaboration selected-conflict state (graph node selection).
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

async function liveCount(page: Page, labelHe: string): Promise<number> {
  const text = (await page.getByTestId("agent-network-live").textContent()) ?? "";
  const m = new RegExp(`${labelHe}: (\\d+)`).exec(text);
  if (!m?.[1]) throw new Error(`count "${labelHe}" not found on the live band`);
  return Number.parseInt(m[1], 10);
}

test("demo run → command center reflects the pending approval + conflict, and persists across refresh", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);

  // baseline BEFORE the run — the seed already contains pending approvals,
  // so the assertion is a DELTA (+1 approval, +1 open conflict), not a fixed 1
  await page.goto("/");
  await expect(page.getByTestId("agent-network-live")).toBeVisible();
  const approvalsBefore = await liveCount(page, "אישורים ממתינים");
  const conflictsBefore = await liveCount(page, "קונפליקטים פתוחים");

  // create the run through the REAL engine
  await page.goto("/agents/collaboration");
  await expect(page.getByTestId("collaboration-page")).toBeVisible();
  await page.getByTestId("run-demo").click();
  await expect(page.getByTestId("run-graph")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("conflict-rail")).toBeVisible();

  // command center shows the live engine state
  await page.goto("/");
  const live = page.getByTestId("agent-network-live");
  await expect(live).toBeVisible();
  await expect(live).toContainText(`אישורים ממתינים: ${approvalsBefore + 1}`);
  await expect(live).toContainText(`קונפליקטים פתוחים: ${conflictsBefore + 1}`);
  await expect(
    page.getByTestId("engine-approvals").getByTestId("approval-panel").first(),
  ).toBeVisible({ timeout: 15_000 });

  // browser refresh — the state derives from IndexedDB records, not memory
  await page.reload();
  const liveAfter = page.getByTestId("agent-network-live");
  await expect(liveAfter).toBeVisible();
  await expect(liveAfter).toContainText(`אישורים ממתינים: ${approvalsBefore + 1}`);
  await expect(liveAfter).toContainText(`קונפליקטים פתוחים: ${conflictsBefore + 1}`);
  await expect(
    page.getByTestId("engine-approvals").getByTestId("approval-panel").first(),
  ).toBeVisible({ timeout: 15_000 });
  // provider honesty on the live band survives the refresh too
  await expect(liveAfter.getByTestId("provider-state-badge")).toContainText(
    "מנוע מקומי מבוסס כללים",
  );
  expect(errors).toEqual([]);
});

test("collaboration — selecting the conflict graph node shows its detail in the rail", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/agents/collaboration");
  await expect(page.getByTestId("collaboration-page")).toBeVisible();
  await page.getByTestId("run-demo").click();
  await expect(page.getByTestId("run-graph")).toBeVisible({ timeout: 20_000 });

  const conflictNode = page.locator('[data-testid="graph-node"][data-node-kind="conflict"]');
  await expect(conflictNode).toHaveCount(1);
  await conflictNode.click();

  // the rail's selected-node card reflects the conflict selection
  // (PageRail portals OUTSIDE the page container — assert at page level)
  await expect(page.getByText("נבחר: קונפליקט")).toBeVisible();
  // the conflict rail shows the claims + 5 human resolution actions
  await expect(page.getByTestId("conflict-rail")).toBeVisible();
  await expect(page.getByTestId("conflict-action")).toHaveCount(5);
  expect(errors).toEqual([]);
});
