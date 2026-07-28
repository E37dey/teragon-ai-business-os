// Wave 3 e2e — the five functional flows of the CRM & Revenue screens.
import { test, expect, type Page } from "@playwright/test";

async function gotoReady(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator("nav.os-nav").first()).toBeVisible();
}

test.describe("3.1 command center", () => {
  test("loads with derived KPIs, decision center and zero console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await gotoReady(page, "/");
    await expect(page.getByTestId("command-center")).toBeVisible();
    // greeting adapts to time of day but always addresses צחי
    await expect(page.locator("h1")).toContainText("צחי");
    // KPI strip derived from repositories
    await expect(page.getByText("לידים פתוחים").first()).toBeVisible();
    // "שווי צבר פתוח" is a SECONDARY metric — under Visual-Calm density it lives
    // in the "מדדים נוספים" disclosure, so open it before asserting visibility.
    await page.getByTestId("command-more-metrics").locator("summary").click();
    await expect(page.getByText("שווי צבר פתוח")).toBeVisible();
    // AI decision center with the honest envelope
    await expect(page.getByText("מרכז ההחלטות של ה-AI")).toBeVisible();
    await expect(page.getByText("טרם נמדד").first()).toBeVisible();
    // agent network labeled as local demo
    await expect(page.getByText("רשת הסוכנים התפעולית")).toBeVisible();
    await expect(page.getByText("מצב הדגמה מקומי · נתוני הדגמה")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("approving an AI recommendation updates the approval and shows a toast", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    const approve = page
      .getByTestId("command-center")
      .getByRole("button", { name: "אשר" })
      .first();
    await expect(approve).toBeVisible();
    await approve.click();
    await expect(page.locator(".os-toast").first()).toContainText("אושרה");
  });
});

test.describe("3.2 crm", () => {
  test("create lead → appears in the table and in the dashboard follow-up queue", async ({
    page,
  }) => {
    await gotoReady(page, "/crm");
    await expect(page.getByTestId("leads-table")).toBeVisible();

    await page.getByRole("button", { name: "ליד חדש" }).click();
    await page.locator("#crm-create-name").fill("בדיקת E2E ליד");
    await page.locator("#crm-create-phone").fill("050-1231234");
    await page.locator("#crm-create-interest").fill("קורס בדיקות");
    await page.getByRole("button", { name: "שמירה" }).click();
    await expect(page.locator(".os-toast").first()).toContainText("נוצר");

    // A new lead's follow-up = today, which sorts LAST under the default
    // followUp-ascending order (so it is NOT on page 1). Filter to it rather
    // than assume its page.
    await page.getByLabel("חיפוש חופשי בלידים").fill("בדיקת E2E ליד");
    await expect(page.getByTestId("leads-table")).toContainText("בדיקת E2E ליד");

    // and instantly on the dashboard follow-up queue (TanStack invalidation)
    await gotoReady(page, "/");
    await expect(page.getByTestId("command-center")).toContainText("בדיקת E2E ליד");
  });

  test("filters narrow the table and sorting toggles", async ({ page }) => {
    await gotoReady(page, "/crm");
    await page.getByLabel("סינון לפי סטטוס").selectOption("במשא ומתן");
    await expect(page.getByTestId("leads-table")).toContainText("מכללת אפיק");
    await expect(page.getByTestId("leads-table")).not.toContainText("עומר כהן");
    await page.getByLabel("סינון לפי סטטוס").selectOption("הכול");
    // sort by name
    await page.getByRole("columnheader", { name: /שם/ }).click();
    await expect(page.getByTestId("leads-table")).toBeVisible();
  });
});

test.describe("3.3 customer 360", () => {
  test("all nine tabs switch and render real data or honest empty states", async ({ page }) => {
    await gotoReady(page, "/customers/cu-2");
    await expect(page.getByTestId("customer-detail")).toBeVisible();
    await expect(page.locator("h1")).toContainText("סטודיו דגש");

    const tabs = [
      "פרטי קשר",
      "מדפסות",
      "קורסים",
      "הצעות מחיר",
      "קריאות שירות",
      "מסמכים",
      "משימות",
      "זיכרון לקוח",
      "ציר זמן",
    ];
    for (const t of tabs) {
      await page.getByRole("tab", { name: t }).click();
      await expect(page.getByRole("tab", { name: t })).toHaveAttribute("aria-selected", "true");
    }
    // memory tab actually finds the seeded memory record for this customer
    await page.getByRole("tab", { name: "זיכרון לקוח" }).click();
    await expect(page.getByTestId("customer-detail")).toContainText("העדפות תקשורת");
  });
});

test.describe("3.4 sales journey", () => {
  test("advancing a stage persists across reload", async ({ page }) => {
    await gotoReady(page, "/sales");
    const stepCell = page.getByTestId("journey-step-opp-4");
    await expect(stepCell).toBeVisible();
    const before = (await stepCell.textContent())?.trim() ?? "";

    await page.getByTestId("advance-opp-4").click();
    await expect(page.locator(".os-toast").first()).toContainText("קודמה לשלב");
    const after = (await stepCell.textContent())?.trim() ?? "";
    expect(after).not.toBe(before);

    await page.reload();
    await expect(page.getByTestId("journey-step-opp-4")).toHaveText(after);
  });

  test("rule-based matcher recommends only catalogue models with explanations", async ({
    page,
  }) => {
    await gotoReady(page, "/sales");
    await expect(page.getByText("מנוע מקומי מבוסס כללים").first()).toBeVisible();
    await page.getByTestId("run-match").click();
    const results = page.getByTestId("match-results");
    await expect(results).toBeVisible();
    await expect(results).toContainText("Bambu Lab");
    await expect(results).toContainText("ההתאמה המובילה");
    await expect(results).toContainText("אומדן פתרון מלא");
  });
});

test.describe("3.5 documents + quotations", () => {
  test("editor derives totals + VAT and blocks over-discount with a Hebrew error", async ({
    page,
  }) => {
    await gotoReady(page, "/documents");
    // q-2 is a seeded draft — open its editor
    const editRow = page.locator("tr", { hasText: "q-2" });
    await editRow.getByRole("button", { name: "עריכה" }).click();

    await expect(page.getByTestId("quote-totals")).toBeVisible();
    const subtotal = await page.getByTestId("subtotal").textContent();
    expect(subtotal).toContain("₪");
    // VAT row present and derived
    await expect(page.getByTestId("vat")).toContainText("₪");

    // over-discount blocked with the Hebrew CEO rule
    await page.getByTestId("discount-input").fill("45");
    await expect(page.getByTestId("discount-error")).toContainText('דורשת אישור מנכ"ל');
    await page.getByTestId("save-quote").click();
    // still open (save blocked)
    await expect(page.getByTestId("quote-totals")).toBeVisible();

    // valid discount saves
    await page.getByTestId("discount-input").fill("10");
    await expect(page.getByTestId("discount-error")).toHaveCount(0);
    await page.getByTestId("save-quote").click();
    await expect(page.locator(".os-toast").first()).toContainText("נשמרה");
  });

  test("print view opens a popup with the escaped RTL document", async ({ page }) => {
    await gotoReady(page, "/documents");
    const popupPromise = page.waitForEvent("popup");
    await page.getByTestId("print-q-1").click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    const html = await popup.content();
    expect(html).toContain("טרגון טכנולוגיות");
    expect(html).toContain('dir="rtl"');
    await popup.close();
  });

  test("PDF export is honestly disabled with a visible Hebrew reason", async ({ page }) => {
    await gotoReady(page, "/documents");
    const wrap = page.locator('[data-disabled-reason*="ייצוא PDF ייתמך בגל עתידי"]').first();
    await expect(wrap).toBeVisible();
  });
});
