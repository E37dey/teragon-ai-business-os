// W7-F e2e — the presenter experience on /submission/presentation (top-level
// route outside OsShell, per the requested wiring — the harness mounts it
// exactly as the integration queue asks). Every test asserts ZERO console
// errors (network-failure noise is filtered only in the offline spec).
import { test, expect, type Page } from "@playwright/test";

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

async function gotoPresentation(page: Page): Promise<void> {
  await page.goto("/submission/presentation");
  await expect(page.getByTestId("presentation-page")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("presentation-overview")).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(async ({ page }) => {
  // presentation session state must not leak between tests
  await page.addInitScript(() => {
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });
});

test("overview: the EXACTLY-5 canonical sections, honest טרם נמדד, keyboard legend — zero console errors", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoPresentation(page);

  for (const title of [
    "הבעיה והקהל",
    "שבע פרסונות ומסלולי ההדרכה",
    "תכנית הטמעה בשישה שלבים ו-Stage Gates",
    "הדגמת Quick Start או Microlearning",
    "שלוש רמות המדידה והסיכון המרכזי",
  ]) {
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  }
  // no structural problems + honest rehearsal state
  await expect(page.getByTestId("exactly5-problems")).toHaveCount(0);
  await expect(page.getByTestId("rehearsal-ps-1")).toContainText("טרם נמדד");
  await expect(page.getByTestId("rehearsal-total")).toContainText("טרם נמדד");
  // RTL keyboard legend documented on screen
  await expect(page.getByText("קדימה (חץ שמאלה — כיוון הקריאה ב-RTL)")).toBeVisible();
  expect(errors).toEqual([]);
});

test("full-screen present mode + RTL arrow navigation (ArrowLeft=קדימה, ArrowRight=אחורה) + Escape exits", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoPresentation(page);

  await page.getByTestId("start-presentation").click();
  await expect(page.getByTestId("present-mode")).toBeVisible();
  await expect(page.getByTestId("progress-indicator")).toContainText("1 / 5");
  await expect(page.getByTestId("active-section-title")).toHaveText("הבעיה והקהל");
  // the harness route is top-level — full-screen has no shell chrome around it
  await expect(page.getByTestId("present-mode")).toBeVisible();

  // RTL: ArrowLeft moves FORWARD
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("progress-indicator")).toContainText("2 / 5");
  await expect(page.getByTestId("active-section-title")).toHaveText("שבע פרסונות ומסלולי ההדרכה");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("progress-indicator")).toContainText("3 / 5");
  // RTL: ArrowRight moves BACK
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("progress-indicator")).toContainText("2 / 5");
  // Space also advances
  await page.keyboard.press("Space");
  await expect(page.getByTestId("progress-indicator")).toContainText("3 / 5");

  // Escape exits back to the overview
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("present-mode")).toHaveCount(0);
  await expect(page.getByTestId("presentation-overview")).toBeVisible();
  expect(errors).toEqual([]);
});

test("timers: 10-minute countdown ticks down, per-section timer counts, T pauses and resumes", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoPresentation(page);
  await page.getByTestId("start-presentation").click();
  await expect(page.getByTestId("present-mode")).toBeVisible();

  await expect(page.getByTestId("countdown")).toContainText("10:00");
  // ticks down within a few seconds
  await expect(page.getByTestId("countdown")).not.toContainText("10:00", { timeout: 5_000 });
  await expect(page.getByTestId("section-timer")).toContainText("/ 2:00");

  // pause via keyboard (T)
  await page.keyboard.press("KeyT");
  await expect(page.getByTestId("toggle-timer")).toContainText("המשך טיימר");
  const frozen = await page.getByTestId("countdown").textContent();
  await page.waitForTimeout(1_600);
  expect(await page.getByTestId("countdown").textContent()).toBe(frozen);
  // resume via the button
  await page.getByTestId("toggle-timer").click();
  await expect(page.getByTestId("toggle-timer")).toContainText("השהה טיימר");
  expect(errors).toEqual([]);
});

test("presenter-notes drawer (N): rewritten Hebrew notes incl. honesty notes; backup mode (B): real screenshot + honesty note", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoPresentation(page);
  await page.getByTestId("start-presentation").click();
  await expect(page.getByTestId("present-mode")).toBeVisible();

  // notes drawer
  await page.keyboard.press("KeyN");
  const drawer = page.getByTestId("notes-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("הערות מרצה — הבעיה והקהל");
  await expect(drawer).toContainText("מסר מרכזי");
  await expect(drawer).toContainText("הערת כנות");
  await expect(drawer).toContainText("טרם נמדד");
  await page.keyboard.press("KeyN");
  await expect(drawer).toHaveCount(0);

  // backup screenshot mode
  await page.keyboard.press("KeyB");
  const backup = page.getByTestId("backup-view");
  await expect(backup).toBeVisible();
  await expect(backup).toContainText("צילום גיבוי — לא רכיב חי");
  await expect(backup).toContainText("הערת כנות");
  await expect(backup).toContainText("docs/screenshots/wave3/command-center-1920x1080.png");
  // the bundled image actually loads (natural size > 0)
  const img = backup.locator("img");
  await expect(img).toBeVisible();
  const naturalWidth = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth);
  expect(naturalWidth).toBeGreaterThan(0);
  await page.keyboard.press("KeyB");
  await expect(backup).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("demo link (D) navigates out to the REAL route; floating חזרה למצגת returns and RESUMES the section", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoPresentation(page);
  await page.getByTestId("start-presentation").click();
  await expect(page.getByTestId("present-mode")).toBeVisible();

  // move to section 3 (demo link → /stage-gates)
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("progress-indicator")).toContainText("3 / 5");

  await page.keyboard.press("KeyD");
  await expect(page).toHaveURL(/\/stage-gates$/);
  // the real screen renders inside the shell
  await expect(page.getByText("Stage Gates", { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });

  // the floating return control is visible OUTSIDE the presentation
  const back = page.getByTestId("return-to-presentation");
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/\/submission\/presentation$/);
  // session state resumed: still presenting, still on section 3
  await expect(page.getByTestId("present-mode")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("progress-indicator")).toContainText("3 / 5");
  // the control is gone while ON the presentation
  await expect(page.getByTestId("return-to-presentation")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("rehearsal mode records REAL measured seconds (replacing טרם נמדד)", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await gotoPresentation(page);

  await page.getByTestId("toggle-rehearsal").click();
  await expect(page.getByTestId("toggle-rehearsal")).toContainText("מצב חזרה פעיל");
  await page.getByTestId("start-presentation").click();
  await expect(page.getByTestId("present-mode")).toBeVisible();
  // spend REAL time on section 1, then advance (records the measurement)
  await page.waitForTimeout(2_100);
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("progress-indicator")).toContainText("2 / 5");
  await page.keyboard.press("Escape");

  // the overview now shows a measured value for ps-1 — not fabricated:
  // ~2 seconds of real clock time
  const label = page.getByTestId("rehearsal-ps-1");
  await expect(label).not.toContainText("טרם נמדד");
  await expect(label).toContainText(/\((2|3) שנ׳\)/);
  expect(errors).toEqual([]);
});

test("print handout renders all 5 sections + notes in the print emulation", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await gotoPresentation(page);
  await page.getByRole("tab", { name: "דף מודפס" }).click();
  await expect(page.getByTestId("handout-view")).toBeVisible();

  await page.emulateMedia({ media: "print" });
  // in print media only the handout stays visible — and it holds all 5 sections
  const handout = page.getByTestId("handout-view");
  await expect(handout).toBeVisible();
  for (let i = 1; i <= 5; i += 1) {
    await expect(handout.getByText(new RegExp(`שקף ${i} `)).first()).toBeVisible();
  }
  await expect(handout.getByText("הערות מרצה:").first()).toBeVisible();
  // app chrome is hidden by the print rules
  await expect(page.getByTestId("start-presentation")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  expect(errors).toEqual([]);
});
