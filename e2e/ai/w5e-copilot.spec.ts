// W5-E stage 2 — Copilot local mode driven from the SHELL nav card
// (data-testid="shell-open-copilot") on a NON-command-center route, proving
// the app-wide OsShell mount. Covers: local command → honest envelope +
// provider badge, in-flight cancellation control visibility (deterministic —
// an IndexedDB write-lock holds the local op busy long enough to observe),
// unmapped-input refusal, and keyboard access (Tab→Enter open, ESC close).
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

const LOCAL_COMMAND = "מי מהלקוחות עדיין לא קיבל מענה?";
const LOCAL_BADGE = "מנוע מקומי מבוסס כללים";

/**
 * Hold a readwrite IndexedDB transaction over customers+leads for ~durationMs.
 * IDB serializes overlapping-scope transactions, so the copilot's readonly
 * list() calls queue behind it — the busy state (and its cancel button)
 * stays observable deterministically instead of racing a <30ms local op.
 */
async function holdDataLock(page: Page, durationMs: number): Promise<void> {
  await page.evaluate((duration) => {
    return new Promise<void>((resolveOuter, rejectOuter) => {
      const req = window.indexedDB.open("teragon-os");
      req.onerror = () => rejectOuter(new Error("indexedDB open failed"));
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(["customers", "leads"], "readwrite");
        const store = tx.objectStore("customers");
        const end = Date.now() + duration;
        const spin = (): void => {
          if (Date.now() > end) {
            db.close();
            return;
          }
          const r = store.getAll();
          r.onsuccess = spin;
        };
        spin();
        resolveOuter(); // resolve now; the tx keeps holding the lock
      };
    });
  }, durationMs);
}

test("copilot opens from the SHELL nav card on /crm (app-wide mount) — local command → envelope + badge", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/crm"); // NOT the command center — proves the OsShell mount
  await expect(page.getByTestId("crm-page")).toBeVisible();

  await page.getByTestId("shell-open-copilot").click();
  await expect(page.getByTestId("copilot-workspace")).toBeVisible();

  // type the mapped local command through the real input (not the quick button)
  await page.getByTestId("copilot-input").fill(LOCAL_COMMAND);
  await page.getByTestId("copilot-workspace").getByRole("button", { name: "שלח" }).click();

  const envelope = page.getByTestId("envelope-card").first();
  await expect(envelope).toBeVisible({ timeout: 15_000 });
  await expect(envelope.getByTestId("provider-state-badge")).toContainText(LOCAL_BADGE);
  await expect(envelope.getByTestId("provider-state-badge")).toHaveAttribute(
    "data-provider",
    "local-rules",
  );
  // honesty: no fallback notice is fabricated in Mode A (local is PRIMARY)
  await expect(page.getByTestId("fallback-notice")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("copilot — cancellation button is visible while a command is in flight", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/crm");
  await expect(page.getByTestId("crm-page")).toBeVisible();
  await page.getByTestId("shell-open-copilot").click();
  await expect(page.getByTestId("copilot-workspace")).toBeVisible();
  // let the copilot's own mount-time collection reads finish first
  await expect(
    page.getByTestId("copilot-workspace").getByRole("button", { name: LOCAL_COMMAND }),
  ).toBeVisible();

  await holdDataLock(page, 2500);
  await page.getByTestId("copilot-input").fill(LOCAL_COMMAND);
  await page.getByTestId("copilot-workspace").getByRole("button", { name: "שלח" }).click();

  // busy row: "הפקודה רצה…" + the cancel button
  const workspace = page.getByTestId("copilot-workspace");
  await expect(workspace.getByRole("button", { name: "בטל בקשה" })).toBeVisible({
    timeout: 2_000,
  });
  await expect(workspace).toContainText("הפקודה רצה…");

  // after the lock releases the command completes honestly
  await expect(page.getByTestId("envelope-card").first()).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("copilot — unmapped free text is refused honestly (never forwarded)", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/crm");
  await expect(page.getByTestId("crm-page")).toBeVisible();
  await page.getByTestId("shell-open-copilot").click();
  await expect(page.getByTestId("copilot-workspace")).toBeVisible();

  await page.getByTestId("copilot-input").fill("תעשה לי קפה");
  await page.getByTestId("copilot-workspace").getByRole("button", { name: "שלח" }).click();
  await expect(page.getByTestId("copilot-unsupported")).toContainText("הפקודה אינה נתמכת עדיין");
  // no envelope was produced for the unmapped input
  await expect(page.getByTestId("envelope-card")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("keyboard — Tab reaches the shell nav card, Enter opens the copilot, ESC closes it", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/crm");
  await expect(page.getByTestId("crm-page")).toBeVisible();

  // walk the tab order until the nav copilot card has focus (bounded loop)
  let reached = false;
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press("Tab");
    const testid = await page.evaluate(() =>
      document.activeElement?.getAttribute("data-testid"),
    );
    if (testid === "shell-open-copilot") {
      reached = true;
      break;
    }
  }
  expect(reached, "shell-open-copilot must be reachable by Tab").toBe(true);

  await page.keyboard.press("Enter");
  await expect(page.getByTestId("copilot-workspace")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("copilot-workspace")).toBeHidden();
  expect(errors).toEqual([]);
});
