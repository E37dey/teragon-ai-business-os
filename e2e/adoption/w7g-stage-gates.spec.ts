// W7-G e2e — /stage-gates (W7-C): select G2 → attach ELIGIBLE evidence via the
// picker until the criteria are genuinely satisfied → Go decision (audited via
// the toast contract) → the gate state derives to Go. G4 Go attempt stays
// honestly blocked with the Hebrew PilotResult reason. Zero console errors.
import { test, expect, type Page } from "@playwright/test";
import { collectConsoleErrors, gotoStageGates } from "./w7g-helpers";

async function selectGate(page: Page, gateKey: string, nameHe: string): Promise<void> {
  await page.getByRole("button", { name: `שער ${gateKey} — ${nameHe}` }).click();
  // the CENTER detail header shows the selected gate
  await expect(
    page.locator("b", { hasText: nameHe }).first(),
  ).toBeVisible();
}

/** criterion panel = the Panel that contains the criterion title */
function criterionPanel(page: Page, titleFragment: string) {
  return page
    .locator("div.os-panel", { has: page.locator("b", { hasText: titleFragment }) })
    .last();
}

/**
 * Attach eligible evidence to a criterion until it reports "מולא".
 * The picker offers ONLY eligible real records (deterministic evaluator) —
 * each attach closes the modal, so we loop. Bounded to avoid infinite loops.
 */
async function attachUntilSatisfied(page: Page, titleFragment: string): Promise<void> {
  const panel = criterionPanel(page, titleFragment);
  for (let i = 0; i < 15; i += 1) {
    const state = await panel.locator(".os-chip").first().textContent();
    if (state?.trim() === "מולא") return;
    await panel.getByRole("button", { name: "צרף ראיה…" }).click();
    const modal = page.getByRole("dialog").first();
    await expect(modal).toBeVisible();
    const attach = modal.getByRole("button", { name: "צרף", exact: true }).first();
    await expect(attach).toBeVisible({ timeout: 10_000 });
    await attach.click();
    // the attach is audited — the toast says so (יומן הביקורת)
    await expect(page.getByText("הראיה צורפה — נרשמה ביומן הביקורת").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(modal).toBeHidden({ timeout: 10_000 });
  }
  await expect(panel.locator(".os-chip").first()).toHaveText("מולא");
}

test("the six canonical gates render with KPI row and readiness rail — zero console errors", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoStageGates(page);

  for (const [key, name] of [
    ["G1", "מוכנות"],
    ["G2", "עיצוב הדרכה"],
    ["G3", "פיילוט מוכן"],
    ["G4", "הפיילוט הצליח"],
    ["G5", "מוכן להרחבה"],
    ["G6", "הפעלה שגרתית"],
  ] as const) {
    await expect(page.getByRole("button", { name: `שער ${key} — ${name}` })).toBeVisible();
  }
  await expect(page.getByText("שערי Go")).toBeVisible();
  await expect(page.getByText("מבקר המוכנות")).toBeVisible();
  await expect(
    page.getByText("כל המספרים נגזרים מהמאמת הדטרמיניסטי — אין שער שעובר על סמך אחוז."),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("G2: attach eligible evidence until satisfied → Go decision (audited) → derived state Go", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoStageGates(page);
  await selectGate(page, "G2", "עיצוב הדרכה");

  // satisfy BOTH G2 criteria with real eligible records via the picker
  await attachUntilSatisfied(page, "מטריצת הדרכה");
  await attachUntilSatisfied(page, "חומרי יסוד");

  // once genuinely ready — the Go action unblocks
  const goBtn = page.getByRole("button", { name: "Go", exact: true }).first();
  await expect(goBtn).toBeEnabled({ timeout: 15_000 });
  await goBtn.click();
  await expect(
    page.getByText("השער הוכרע Go — כל הקריטריונים מולאו בראיות תקפות").first(),
  ).toBeVisible({ timeout: 10_000 });

  // the derived state (validator, not a stored %) now shows Go on the navigator
  const g2Nav = page.getByRole("button", { name: "שער G2 — עיצוב הדרכה" });
  await expect(g2Nav.getByText("Go", { exact: true })).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});

test("G4: Go attempt is BLOCKED with the honest Hebrew PilotResult reason", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await gotoStageGates(page);
  await selectGate(page, "G4", "הפיילוט הצליח");

  // the blocking panel lists the honest reason
  await expect(page.getByText(/חוסם Go \(/).first()).toBeVisible();
  await expect(
    page.getByText("אין רשומת PilotResult אמיתית — לא ניתן לקבוע «הפיילוט הצליח»").first(),
  ).toBeVisible();

  // the Go button is disabled AND self-explains in Hebrew (wrapper tooltip)
  const goWrap = page.locator("span.os-btn-wrap[data-disabled-reason*='Go חסום']").first();
  await expect(goWrap).toBeVisible();
  const goBtn = goWrap.getByRole("button", { name: "Go", exact: true });
  await expect(goBtn).toBeDisabled();
  expect(errors).toEqual([]);
});

test("evidence viewer: clicking an attached evidence chip opens the REAL record preview", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoStageGates(page);
  await selectGate(page, "G1", "מוכנות");

  // G1 is bridge-bootstrapped with real attachments — open the first one
  const evidenceChip = page.getByRole("button", { name: /הצג ראיה/ }).first();
  await expect(evidenceChip).toBeVisible({ timeout: 15_000 });
  await evidenceChip.click();
  // the viewer shows the evaluated status + the real record behind the ref
  const viewer = page.locator("div.os-panel", {
    has: page.locator("b", { hasText: "מציג הראיות" }),
  }).last();
  await expect(viewer.getByText(/תקפה|פסולה|פג תוקף/).first()).toBeVisible();
  expect(errors).toEqual([]);
});
