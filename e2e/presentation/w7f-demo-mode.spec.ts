// W7-F e2e — evaluator demo mode (7.23): the 11-step deterministic path,
// repository-persisted progress that survives reload, the destructive-change
// guard banner, and a full OFFLINE pass (IndexedDB + client routes only).
import { test, expect, type Page, type BrowserContext } from "@playwright/test";

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

/** offline runs produce expected fetch-failure noise — everything else must be clean */
function nonNetworkErrors(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      !e.includes("ERR_INTERNET_DISCONNECTED") &&
      !e.includes("Failed to load resource") &&
      !e.includes("net::"),
  );
}

async function openDemoMode(page: Page): Promise<void> {
  await page.goto("/submission/presentation");
  await expect(page.getByTestId("presentation-overview")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: "מצב הדגמה לבוחן" }).click();
  await expect(page.getByTestId("demo-mode-view")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });
});

test("the 11-step list renders with the next-action chip; a step navigates to its REAL route and progress persists across reload", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await openDemoMode(page);

  const list = page.getByTestId("demo-steps-list");
  await expect(list.getByText("מרכז הפיקוד")).toBeVisible();
  await expect(list.getByText("ראיות G3 / G4")).toBeVisible();
  await expect(list.getByText("חזרה למצגת")).toBeVisible();
  const chip = page.getByTestId("demo-next-chip");
  await expect(chip).toContainText("הצעד הבא (1/11): מרכז הפיקוד");
  await expect(chip).toContainText("הושלמו 0/11");

  // walk step 1 — marks done + navigates to "/" (the real command center)
  await chip.getByRole("button", { name: "עבור לצעד" }).click();
  await expect(page).toHaveURL(/\/$/);
  // the floating return control shows while out on the path
  await expect(page.getByTestId("return-to-presentation")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("return-to-presentation").click();
  await expect(page.getByTestId("presentation-page")).toBeVisible({ timeout: 30_000 });

  // progress persisted in the repository (demoSteps collection)
  await page.getByRole("tab", { name: "מצב הדגמה לבוחן" }).click();
  await expect(page.getByTestId("demo-next-chip")).toContainText("הושלמו 1/11");
  await expect(page.getByTestId("demo-next-chip")).toContainText("(2/11): הבעיה העסקית");

  // SURVIVES RELOAD — IndexedDB, not component state
  await page.reload();
  await expect(page.getByTestId("presentation-overview")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: "מצב הדגמה לבוחן" }).click();
  await expect(page.getByTestId("demo-next-chip")).toContainText("הושלמו 1/11", {
    timeout: 15_000,
  });
  expect(errors).toEqual([]);
});

test("demo-mode guard: activating shows the destructive-change block reason; reset flow demands a confirm dialog", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await openDemoMode(page);

  await page.getByRole("button", { name: "הפעלת מצב הדגמה" }).click();
  await expect(page.getByText("מצב הדגמה פעיל")).toBeVisible();
  await expect(page.getByText(/חסומה כדי לשמור על נתוני הדגמה דטרמיניסטיים/)).toBeVisible();

  // reset-deterministic-data opens a CONFIRM dialog (no silent wipe)
  await page.getByRole("button", { name: "איפוס נתוני הדגמה דטרמיניסטיים…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("seedIfEmpty");
  await dialog.getByRole("button", { name: "ביטול" }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "כיבוי מצב הדגמה" }).click();
  await expect(page.getByText("מצב הדגמה כבוי")).toBeVisible();
  expect(errors).toEqual([]);
});

test("OFFLINE: the demo path keeps working with zero network — navigation, data and return control", async ({
  page,
  context,
}: {
  page: Page;
  context: BrowserContext;
}) => {
  const errors = collectConsoleErrors(page);

  // WARM PASS (online, client-side navigation only): loads the lazy chunks
  // and populates the query cache for the exact walk repeated offline.
  await openDemoMode(page);
  const list = page.getByTestId("demo-steps-list");
  await expect(list.getByText("שבע הפרסונות")).toBeVisible();
  // step 3 (שבע הפרסונות) is the 3rd row — client-side navigate out
  await list.getByRole("button", { name: "פתח" }).nth(2).click();
  await expect(page).toHaveURL(/\/personas$/);
  await expect(page.getByText("פרסונות ומסלולי הדרכה").first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("return-to-presentation").click();
  await expect(page.getByTestId("presentation-page")).toBeVisible({ timeout: 30_000 });

  // OFFLINE PASS — zero network from here on
  await context.setOffline(true);

  await page.getByRole("tab", { name: "מצב הדגמה לבוחן" }).click();
  await expect(page.getByTestId("demo-mode-view")).toBeVisible();
  await expect(list.getByText("שבע הפרסונות")).toBeVisible();

  // the same walk still works: routes + IndexedDB, no network calls
  await list.getByRole("button", { name: "פתח" }).nth(2).click();
  await expect(page).toHaveURL(/\/personas$/);
  await expect(page.getByText("פרסונות ומסלולי הדרכה").first()).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("return-to-presentation").click();
  await expect(page.getByTestId("presentation-page")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("presentation-overview")).toBeVisible();

  await context.setOffline(false);
  expect(nonNetworkErrors(errors)).toEqual([]);
});
