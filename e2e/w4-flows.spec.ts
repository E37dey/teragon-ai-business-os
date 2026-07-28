// Wave 4 e2e — real flows on the six operations screens.
// Runs against vite preview (playwright.config webServer). Fresh browser
// context per test ⇒ deterministic IndexedDB seed on every boot.
import { test, expect, type Page } from "@playwright/test";

const W4_ROUTES = ["/courses", "/service", "/printers", "/organizations", "/tasks", "/support"];

async function gotoReady(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator("nav.os-nav").first()).toBeVisible();
}

test.describe("console cleanliness", () => {
  for (const route of W4_ROUTES) {
    test(`no console errors on ${route}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      page.on("pageerror", (err) => errors.push(String(err)));
      await gotoReady(page, route);
      await page.waitForTimeout(800);
      expect(errors).toEqual([]);
    });
  }
});

test.describe("courses — assignment approval flow", () => {
  test("page loads with KPIs and the approvals queue approves a stage", async ({ page }) => {
    await gotoReady(page, "/courses");
    await expect(page.getByText("קורסים והכשרות").first()).toBeVisible();
    await expect(page.getByText("ממתינים לבדיקת מדריך").first()).toBeVisible();

    // approvals tab — seed has 3 stages awaiting the instructor
    await page.getByRole("tab", { name: /מטלות והגשות/ }).click();
    const reviewButtons = page.getByRole("button", { name: "לבדיקה ←" });
    await expect(reviewButtons.first()).toBeVisible();
    const before = await reviewButtons.count();
    expect(before).toBeGreaterThan(0);

    // open the first awaiting stage in the workbench and approve it
    await reviewButtons.first().click();
    const approve = page.getByRole("button", { name: "אישור השלמת השלב" }).first();
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(page.getByText("השלב אושר ונרשם ביומן הפעילות")).toBeVisible();

    // queue shrank by one
    await page.getByRole("tab", { name: /מטלות והגשות/ }).click();
    await expect(page.getByRole("button", { name: "לבדיקה ←" })).toHaveCount(before - 1);
  });
});

test.describe("service — ticket lifecycle", () => {
  test("create ticket → advance status → timeline grows", async ({ page }) => {
    await gotoReady(page, "/service");
    await page.getByRole("button", { name: "קריאה חדשה" }).click();

    await page.locator("#nt-customer").selectOption({ label: "סטודיו דגש" });
    // W9-A defect #2 fix split the printer control into two distinct ids
    // (select when the customer has a fleet, free-text input otherwise).
    await page.locator("#nt-printer-select").selectOption({ index: 1 });
    await page.locator("#nt-issue").fill("רעש חריג בציר X");
    await page.locator("#nt-desc").fill("רעש בזמן הדפסה מהירה בלבד");
    await page.getByRole("button", { name: "פתיחת קריאה" }).click();
    await expect(page.getByText("הקריאה נפתחה ונרשמה בציר הזמן")).toBeVisible();

    // the new ticket opens in the workbench at נפתחה; advance to אבחון
    await expect(page.getByText(/קריאה t-\d+ — סטודיו דגש/)).toBeVisible();
    await page.getByRole("button", { name: "העברה ל: בבדיקה" }).click();
    await expect(page.getByText(/עברה ל«בבדיקה»/)).toBeVisible();

    // VC-D: the full timeline/history opens on demand in a drawer — open it,
    // then verify the status-change event is recorded.
    await page.getByText(/ציר זמן והיסטוריה/).first().click();
    await expect(page.getByText(/עברה לסטטוס «בבדיקה»/)).toBeVisible();
  });
});

test.describe("printers — registry + derived maintenance", () => {
  test("fleet loads and the maintenance queue is derived", async ({ page }) => {
    await gotoReady(page, "/printers");
    await expect(page.getByText("מדפסות וציוד").first()).toBeVisible();
    await expect(page.getByText("תחזוקה נדרשת").first()).toBeVisible();
    // seed printers were purchased 55-85 days ago with no maintenance since seed
    // anchor + 180d interval; the reminders tab reflects the derived queue.
    await page.getByRole("tab", { name: /תזכורות תחזוקה/ }).click();
    // whether or not something is due, the tab renders a table or an honest empty state
    const table = page.locator(".os-table");
    await expect(table.first()).toBeVisible();
    // registry shows serial numbers
    await page.getByRole("tab", { name: /צי הלקוחות/ }).click();
    await expect(page.getByText("BL-A1-58201")).toBeVisible();
  });
});

test.describe("tasks — state change persists", () => {
  test("moving a task to ממתין לאישור survives reload", async ({ page }) => {
    await gotoReady(page, "/tasks");
    // VC-C: the per-card state control moved into the task detail drawer — open
    // the card first, then change state inside the drawer.
    await page.getByRole("button", { name: /פולואו-אפ: רותם פלד/ }).first().click();
    const select = page.getByLabel("שינוי מצב עבור פולואו-אפ: רותם פלד");
    await expect(select).toBeVisible();
    await select.selectOption("ממתין לאישור");
    await expect(page.getByText("המשימה עברה ל«ממתין לאישור»")).toBeVisible();

    await page.reload();
    await expect(page.locator("nav.os-nav").first()).toBeVisible();
    // re-open the drawer to read back the persisted state
    await page.getByRole("button", { name: /פולואו-אפ: רותם פלד/ }).first().click();
    await expect(page.getByLabel("שינוי מצב עבור פולואו-אפ: רותם פלד")).toHaveValue("ממתין לאישור");
  });
});

test.describe("support — tiers, escalation and SLA timer", () => {
  test("escalation moves the tier and the SLA timer renders real elapsed time", async ({
    page,
  }) => {
    await gotoReady(page, "/support");
    await expect(page.getByText("מודל תמיכה תלת-שלבי")).toBeVisible();
    await expect(page.getByText("Tier 1").first()).toBeVisible();
    await expect(page.getByText("Tier 3").first()).toBeVisible();

    // open the first open request (seed: sr-2 בטיפול / sr-3 פתוחה)
    await page.getByRole("cell", { name: /הסוכן Hunter לא מציע/ }).click();
    // SLA timer shows elapsed out of target
    await expect(page.getByText(/⏱ .+ מתוך \d+ שע'/)).toBeVisible();

    // escalate Tier 1 → Tier 2
    await page.getByRole("button", { name: "הסלמה ל-Tier 2" }).click();
    await expect(page.getByText("הפנייה הוסלמה ל-Tier 2")).toBeVisible();
    // drawer chip now shows Tier 2 and the next escalation targets Tier 3
    await expect(page.getByRole("button", { name: "הסלמה ל-Tier 3" })).toBeVisible();
  });
});
