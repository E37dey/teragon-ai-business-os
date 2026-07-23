// W6-F Phase 6.23 — visual QA screenshots: 13 mandated Wave-6 surfaces ×
// 3 resolutions (1920×1080 / 2560×1440 / 3840×2160) → docs/screenshots/wave6/
// (39 files). Each state is DRIVEN to reality first (no empty-shell shots) and
// then captured at all three viewports.
import { test, expect, type Page } from "@playwright/test";
import { forgeZip, gotoKnowledgeSeeded } from "./w6-helpers";

const SIZES = [
  { w: 1920, h: 1080 },
  { w: 2560, h: 1440 },
  { w: 3840, h: 2160 },
] as const;

const OUT = "docs/screenshots/wave6";

async function shoot(page: Page, name: string): Promise<void> {
  for (const { w, h } of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250); // reflow settle
    await page.screenshot({ path: `${OUT}/${name}-${w}x${h}.png`, fullPage: true });
  }
}

async function gotoMemory(page: Page): Promise<void> {
  await page.goto("/memory");
  await expect(page.getByTestId("memory-page")).toBeVisible({ timeout: 20_000 });
}

async function submitProposal(page: Page, title: string, body: string): Promise<void> {
  await page.getByLabel("כותרת", { exact: true }).fill(title);
  await page.getByLabel("תוכן (Markdown)", { exact: true }).fill(body);
  await page.getByLabel("מקור: לקוח").selectOption({ index: 1 });
  await page.getByTestId("submit-proposal").click();
  await expect(page.getByTestId("memory-proposal-card").first()).toBeVisible({ timeout: 15_000 });
}

test("memory surfaces — 01 page, 02 import preview, 03 proposal queue, 04 version comparison", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await gotoMemory(page);
  await shoot(page, "01-memory-page");

  // 02 — import preview open (staged files + a security rejection visible)
  const zip = forgeZip([
    { name: "תיקיה/פתק-לתצוגה.md", content: "# פתק לתצוגה מקדימה\n\nתוכן מדגים [[קישור ויקי]]." },
  ]);
  await page.getByTestId("import-file-input").setInputFiles([
    { name: "vault-visual.zip", mimeType: "application/zip", buffer: zip },
  ]);
  await expect(page.getByTestId("import-review")).toBeVisible();
  await shoot(page, "02-memory-import-preview");
  await page.reload();
  await expect(page.getByTestId("memory-page")).toBeVisible({ timeout: 20_000 });

  // 03 — proposal approval open (pending card with the 7 controls + checks)
  await submitProposal(page, "הצעה לצילום מסך W6F", "תוכן ההצעה לצילום — ממתין לאישור");
  await page.getByTestId("memory-proposal-card").first().scrollIntoViewIfNeeded();
  await shoot(page, "03-memory-proposal-approval");

  // 04 — version comparison (approve + merge ⇒ two versions with a diff)
  await page.getByTestId("proposal-approve").click();
  await expect(page.getByText("ההצעה אושרה ונכתבה לזיכרון (גרסה חתומה)").first()).toBeVisible({
    timeout: 15_000,
  });
  await submitProposal(page, "מיזוג לצילום W6F", "תוכן שונה — גרסה שנייה");
  await page
    .getByTestId("memory-proposal-card")
    .getByLabel("פריט יעד למיזוג", { exact: true })
    .selectOption({ label: "הצעה לצילום מסך W6F" });
  await page.getByTestId("proposal-merge").click();
  await expect(
    page.getByText("ההצעה מוזגה — נוצרה גרסה חדשה על הפריט הקיים").first(),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("memory-note-list").getByText("הצעה לצילום מסך W6F").click();
  await expect(page.getByTestId("note-versions")).toContainText("גרסאות (2)");
  await page.getByTestId("note-versions").scrollIntoViewIfNeeded();
  await shoot(page, "04-memory-version-comparison");
});

test("knowledge surfaces — 05 page, 06 article open, 07 conflict panel", async ({ page }) => {
  test.setTimeout(300_000);
  await gotoKnowledgeSeeded(page, async (p) => {
    await expect(p.getByText("מאגר ידע מנוהל").first()).toBeVisible({ timeout: 20_000 });
  });
  await shoot(page, "05-knowledge-page");

  // 06 — article drawer open (seeded article; retry across seed rerender)
  await expect(async () => {
    await page.getByRole("cell", { name: /וורפינג/ }).first().click();
    await expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await shoot(page, "06-knowledge-article-open");
  await page.keyboard.press("Escape");

  // 07 — conflict panel with a REAL detected contradiction
  const createDraft = async (title: string, content: string): Promise<void> => {
    await page.getByRole("button", { name: "טיוטת מאמר חדשה" }).click();
    const modal = page.getByRole("dialog");
    await modal.locator("#kd-title").fill(title);
    await modal.locator("#kd-summary").fill(`תקציר — ${title}`);
    await modal.locator("#kd-content").fill(content);
    await modal.getByRole("button", { name: "יצירת טיוטה" }).click();
    await expect(page.getByText("טיוטה חדשה נוצרה").first()).toBeVisible({ timeout: 15_000 });
  };
  const approveArticle = async (title: string): Promise<void> => {
    await page.getByRole("cell", { name: title }).first().click();
    const drawer = page.getByRole("dialog").last();
    await drawer.getByRole("button", { name: "הגשה לבדיקה", exact: true }).click();
    await expect(
      page.getByText("המאמר הוגש לבדיקה — נוצרה בקשת אישור קנונית").first(),
    ).toBeVisible({ timeout: 15_000 });
    await drawer.getByRole("button", { name: "אישור", exact: true }).click();
    await expect(page.getByText("המאמר אושר — נוצרה גרסה חתומה").first()).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press("Escape");
  };
  await createDraft("סתירה ויזואלית א", "עבור ASA מיוחד: טמפ' מיטה 60 בלבד.");
  await approveArticle("סתירה ויזואלית א");
  await createDraft("סתירה ויזואלית ב", "עבור ASA מיוחד: טמפ' מיטה 85 חובה.");
  await approveArticle("סתירה ויזואלית ב");
  await page.getByRole("button", { name: "סריקת סתירות" }).click();
  await expect(page.getByText(/נמצאו \d+ סתירות חדשות/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByText("סתירות בידע", { exact: false }).first().scrollIntoViewIfNeeded();
  await shoot(page, "07-knowledge-conflict-panel");
});

test("learning surfaces — 08 page, 09 proposal selected, 10 rule history", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/learning");
  await expect(page.getByTestId("learning-page")).toBeVisible({ timeout: 30_000 });
  await shoot(page, "08-learning-page");

  // 09 — pending proposal selected in the rail (single-case marker visible)
  await expect(page.getByTestId("proposal-rail")).toBeVisible();
  await expect(page.getByTestId("single-case-marker")).toBeVisible();
  await shoot(page, "09-learning-proposal-selected");

  // 10 — rule history: the active rule with its recorded applications
  await page
    .getByTestId("learning-table")
    .getByRole("row")
    .filter({ hasText: "כלל פעיל" })
    .first()
    .click();
  await expect(page.getByTestId("proposal-rail").getByText(/פעיל · גרסה \d+/)).toBeVisible({
    timeout: 15_000,
  });
  await shoot(page, "10-learning-rule-history");
});

test("cross-domain surfaces — 11 customer-360 memory tab, 12 command-center memory rail, 13 copilot evidence", async ({
  page,
}) => {
  test.setTimeout(300_000);

  // 11 — Customer-360 memory tab (seeded סטודיו דגש legacy note)
  await page.goto("/customers/cu-2");
  await page.getByRole("tab", { name: "זיכרון לקוח" }).click();
  await expect(page.getByTestId("c360-memory-tab")).toBeVisible({ timeout: 20_000 });
  await shoot(page, "11-customer360-memory-tab");

  // 12 — Command-Center memory rail (derived band)
  await page.goto("/");
  await expect(page.getByTestId("cc-memory-band")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("cc-memory-band").scrollIntoViewIfNeeded();
  await shoot(page, "12-command-center-memory-rail");

  // 13 — Copilot evidence view: real pending proposal → envelope with
  // evidence + navigable route links
  await gotoMemory(page);
  await submitProposal(page, "ראיה לקופיילוט W6F", "תוכן שיוצג כראיה בפקודת הקופיילוט");
  await page.getByTestId("shell-open-copilot").click();
  const workspace = page.getByTestId("copilot-workspace");
  await expect(workspace).toBeVisible();
  await workspace
    .getByRole("button", { name: "הצג הצעות זיכרון שממתינות לאישור" })
    .first()
    .click();
  await expect(page.getByTestId("copilot-msg-assistant").last()).toBeVisible({
    timeout: 20_000,
  });
  await shoot(page, "13-copilot-evidence-view");
});
