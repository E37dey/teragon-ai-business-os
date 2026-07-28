// W6-F Phase 6.22 — cross-domain wiring e2e:
//   * Customer-360 "זיכרון לקוח" tab: approved-only + sensitivity gate with a
//     mandatory reveal reason;
//   * Copilot "הצג הצעות זיכרון שממתינות לאישור" — honest derived answer with
//     navigable evidence routes;
//   * Command-Center memory band — derived rows, click-through to /memory.
// Every test asserts ZERO console errors.
import { test, expect, type Page } from "@playwright/test";
import { collectConsoleErrors } from "./w6-helpers";

const DAGESH = "סטודיו דגש"; // seeded customer cu-2 with a legacy memory note

async function gotoMemory(page: Page): Promise<void> {
  await page.goto("/memory");
  await expect(page.getByTestId("memory-page")).toBeVisible({ timeout: 20_000 });
}

async function submitProposalForDagesh(page: Page, title: string, body: string): Promise<void> {
  await page.getByLabel("כותרת", { exact: true }).fill(title);
  await page.getByLabel("תוכן (Markdown)", { exact: true }).fill(body);
  await page.getByLabel("מקור: לקוח").selectOption({ label: DAGESH });
  await page.getByTestId("submit-proposal").click();
  await expect(page.getByTestId("memory-proposal-card").first()).toBeVisible({ timeout: 15_000 });
}

test("Customer-360 memory tab: approved-only view + sensitive body gated behind a mandatory reveal reason", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);

  // 1 — create a SENSITIVE approved memory for the customer through the
  //     governed queue (mark רגיש → approve by the named human)
  await gotoMemory(page);
  await submitProposalForDagesh(page, "תנאים מסחריים רגישים W6F", "הנחה מיוחדת 22% — רגיש");
  const card = page.getByTestId("memory-proposal-card");
  await card.getByLabel("רגישות").selectOption("רגיש");
  await page.getByTestId("proposal-mark-sensitive").click();
  await expect(page.getByText("הרגישות עודכנה בהצעה").first()).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("proposal-approve").click();
  await expect(page.getByText("ההצעה אושרה ונכתבה לזיכרון (גרסה חתומה)").first()).toBeVisible({
    timeout: 15_000,
  });

  // 2 — open the customer 360 memory tab
  await page.goto("/customers/cu-2");
  await page.getByRole("tab", { name: "זיכרון לקוח" }).click();
  const tab = page.getByTestId("c360-memory-tab");
  await expect(tab).toBeVisible({ timeout: 20_000 });

  // approved-only section shows the seeded legacy note AND the new record
  const approvedSection = tab.getByTestId("c360-approved");
  await expect(approvedSection).toContainText(DAGESH);
  await expect(approvedSection).toContainText("תנאים מסחריים רגישים W6F");

  // 3 — the sensitive body is HIDDEN; reveal demands a reason
  const item = tab
    .getByTestId("c360-memory-item")
    .filter({ hasText: "תנאים מסחריים רגישים W6F" });
  const gate = item.getByTestId("c360-sensitive-gate");
  await expect(gate).toBeVisible();
  await expect(item).not.toContainText("הנחה מיוחדת 22%");
  await expect(gate.getByRole("button", { name: "חשוף עם נימוק" })).toBeDisabled();

  // 4 — reveal WITH a reason ⇒ body appears
  await gate.getByLabel(/נימוק חשיפה/).fill("בדיקת W6F — נימוק חשיפה מתועד");
  await gate.getByRole("button", { name: "חשוף עם נימוק" }).click();
  await expect(item.getByTestId("c360-memory-body")).toContainText("הנחה מיוחדת 22%");
  expect(errors).toEqual([]);
});

test("Copilot: «הצג הצעות זיכרון שממתינות לאישור» answers from records with navigable routes", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);

  // create one pending proposal so the answer is non-empty and derived
  await gotoMemory(page);
  await submitProposalForDagesh(page, "הצעה לקופיילוט W6F", "תוכן להצגה בפקודת הקופיילוט");

  // open the app-wide copilot drawer and run the mandated command
  await page.getByTestId("shell-open-copilot").click();
  const workspace = page.getByTestId("copilot-workspace");
  await expect(workspace).toBeVisible();
  await workspace
    .getByRole("button", { name: "הצג הצעות זיכרון שממתינות לאישור" })
    .first()
    .click();

  // honest derived answer: counts + the proposal title + a real /memory route
  const answer = page.getByTestId("copilot-msg-assistant").last();
  await expect(answer).toContainText("הצעות זיכרון ממתינות", { timeout: 20_000 });
  await expect(answer).toContainText("הצעה לקופיילוט W6F");
  const routeLink = answer.getByRole("link", { name: /הצעה לקופיילוט W6F/ });
  await expect(routeLink).toHaveAttribute("href", /\/memory\?proposal=/);
  expect(errors).toEqual([]);
});

test("Command-Center memory band: derived rows only, click-through lands on /memory", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/");
  // VC density round-2: the Command-Center memory band moved into the
  // "פירוט נוסף" disclosure — open it before asserting the band.
  await page.getByTestId("cc-secondary").locator("summary").click();
  const band = page.getByTestId("cc-memory-band");
  await expect(band).toBeVisible({ timeout: 20_000 });

  // seeded data ⇒ the approved-records row exists with a non-zero derived count
  const approvedRow = page.getByTestId("cc-memory-item-approved");
  await expect(approvedRow).toBeVisible();
  await expect(approvedRow).toContainText("פריטי זיכרון מאושרים");
  const value = await approvedRow.locator(".os-num").innerText();
  expect(Number.parseInt(value, 10)).toBeGreaterThan(0);

  // click-through: the row is a real route into /memory
  await approvedRow.click();
  await expect(page).toHaveURL(/\/memory/);
  await expect(page.getByTestId("memory-page")).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});
