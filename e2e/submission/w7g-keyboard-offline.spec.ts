// W7-G e2e — keyboard navigation on the stage-gates evidence picker,
// zero-console-error sweep across EVERY Wave-7 surface, and the offline
// warm-walk (same pattern as W6/W7-F: warm pass loads the lazy chunks, the
// offline pass repeats the exact walk with zero network).
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import {
  collectConsoleErrors,
  gotoStageGates,
  gotoSubmission,
  nonNetworkErrors,
} from "../adoption/w7g-helpers";

test("keyboard nav: the evidence picker opens, focuses and attaches with keys only", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoStageGates(page);

  // reach the first "צרף ראיה…" by keyboard: focus + Enter (no mouse click)
  const attachOpener = page.getByRole("button", { name: "צרף ראיה…" }).first();
  await attachOpener.focus();
  await page.keyboard.press("Enter");
  const modal = page.getByRole("dialog").first();
  await expect(modal).toBeVisible();

  // Tab until an attach button ("צרף") holds focus, then Enter attaches
  let attached = false;
  for (let i = 0; i < 20 && !attached; i += 1) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(
      () => document.activeElement?.textContent?.trim() ?? "",
    );
    if (label === "צרף") {
      await page.keyboard.press("Enter");
      attached = true;
    }
  }
  if (attached) {
    await expect(
      page.getByText("הראיה צורפה — נרשמה ביומן הביקורת").first(),
    ).toBeVisible({ timeout: 10_000 });
  } else {
    // honest fallback: no eligible record for this criterion — the empty
    // state must say so, and Escape must close the dialog
    await expect(
      modal.getByText("אין רשומות כשירות לצירוף"),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
  }
  expect(errors).toEqual([]);
});

const W7_ROUTES: { path: string; marker: string }[] = [
  { path: "/implementation", marker: "תכנית ההטמעה" },
  { path: "/personas", marker: "פרסונות ומסלולי הדרכה" },
  { path: "/stage-gates", marker: "Stage Gates · שערי מעבר וראיות" },
  { path: "/training-materials", marker: "מרכז חומרי ההדרכה" },
  { path: "/quick-start", marker: "התחלה מהירה ושימוש נכון" },
  { path: "/faq", marker: "FAQ והתנגדויות" },
  { path: "/submission", marker: "מרכז ההגשה והראיות" },
  { path: "/submission/presentation", marker: "מצגת ההגשה" },
];

test("zero console errors on EVERY Wave-7 surface (fresh direct-URL loads)", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  for (const r of W7_ROUTES) {
    await page.goto(r.path);
    await expect(page.getByText(r.marker).first()).toBeVisible({ timeout: 30_000 });
    // let lazy content settle before moving on
    await page.waitForTimeout(300);
  }
  expect(errors).toEqual([]);
});

async function clientWalk(page: Page): Promise<void> {
  // client-side navigation through the shell nav — no full page loads
  for (const r of W7_ROUTES.slice(0, 7)) {
    await page.locator(`nav a[href='${r.path}']`).first().click();
    await expect(page.getByText(r.marker).first()).toBeVisible({ timeout: 30_000 });
  }
}

test("offline warm-walk: the warmed Wave-7 walk repeats fully offline", async ({
  page,
  context,
}: {
  page: Page;
  context: BrowserContext;
}) => {
  const errors = collectConsoleErrors(page);

  // WARM PASS (online): full load once, then client-side walk to warm chunks
  await gotoSubmission(page);
  await clientWalk(page);

  // OFFLINE PASS — zero network from here on
  await context.setOffline(true);
  await clientWalk(page);
  await context.setOffline(false);

  expect(nonNetworkErrors(errors)).toEqual([]);
});
