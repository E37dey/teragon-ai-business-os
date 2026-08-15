// W6-F Phase 6.22 — /memory end-to-end: derived metrics + honest status
// lines, Markdown import (staged preview → proposals → named approval →
// record + links), hostile-ZIP partial rejection, version comparison via
// merge, real export download, IndexedDB refresh persistence, keyboard
// operability of the proposal queue, and honest offline scope.
// Every test asserts ZERO console errors (offline test allows network noise).
import { test, expect, type Page } from "@playwright/test";
import { collectConsoleErrors, forgeZip, nonNetworkErrors } from "./w6-helpers";

const TITLE_A = "מזכר בדיקה W6F אלף";
const TITLE_B = "מזכר בדיקה W6F בית";

const MD_A = `# ${TITLE_A}\n\nגוף המזכר הראשון עם קישור אל [[${TITLE_B}]].\n`;
const MD_B = `# ${TITLE_B}\n\nגוף המזכר השני — יעד הקישור.\n`;

async function gotoMemory(page: Page): Promise<void> {
  await page.goto("/memory");
  await expect(page.getByTestId("memory-page")).toBeVisible({ timeout: 20_000 });
}

function file(name: string, content: string): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: "text/markdown", buffer: Buffer.from(content, "utf-8") };
}

test("/memory loads: derived metrics + the two mandated Obsidian status lines", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await gotoMemory(page);

  // 4 PRIMARY derived KPI cards (VC density: the four passive metrics moved to
  // the "מדדים נוספים" disclosure below).
  const metrics = page.getByTestId("memory-metrics");
  for (const title of [
    "הצעות ממתינות",
    "סקירות שהגיע זמנן",
    "קישורים לא פתורים",
    "סתירות פתוחות",
  ]) {
    await expect(metrics.getByText(title, { exact: true })).toBeVisible();
  }
  // the remaining 4 metrics live in the disclosure
  const moreMetrics = page.getByTestId("memory-more-metrics");
  await moreMetrics.locator("summary").click();
  for (const title of ["פריטים מאושרים", "קישורים", "ייבואים היום", "שימושי AI היום"]) {
    await expect(moreMetrics.getByText(title, { exact: true })).toBeVisible();
  }

  // the EXACT two mandated status lines (rail — honest, no fake sync)
  await expect(page.getByText("ייבוא וייצוא Obsidian פעיל").first()).toBeVisible();
  await expect(page.getByText("גישה מקומית ישירה אינה פעילה").first()).toBeVisible();

  // seed records render in the browser + list (5 legacy-bridged records)
  await expect(page.getByTestId("memory-note-list").locator("button")).not.toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Markdown import: staged preview → proposals created NOT approved → named approval → records + resolved link", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoMemory(page);

  const approvedBefore = await page
    .getByTestId("memory-note-list")
    .locator("button")
    .count();

  // stage: choose files (hidden input — Playwright setInputFiles)
  await page
    .getByTestId("import-file-input")
    .setInputFiles([file("w6f-a.md", MD_A), file("w6f-b.md", MD_B)]);

  // staged preview appears; link analysis marks the in-batch wikilink
  const review = page.getByTestId("import-review");
  await expect(review).toBeVisible();
  await expect(review).toContainText(TITLE_A);
  await expect(review).toContainText(TITLE_B);
  await expect(review).toContainText("יקושר בתוך הייבוא");

  // commit — proposals ONLY (the exact honest message: 0 auto-approved)
  await page.getByTestId("import-commit").click();
  await expect(
    page.getByText("נוצרו 2 הצעות זיכרון — ממתינות לאישור אנושי (0 אושרו אוטומטית)").first(),
  ).toBeVisible({ timeout: 15_000 });

  // queue holds 2 pending cards; the note list is UNCHANGED (nothing written)
  await expect(page.getByTestId("memory-proposal-card")).toHaveCount(2);
  await expect(page.getByTestId("memory-note-list").locator("button")).toHaveCount(approvedBefore);

  // approve BOTH through the queue (named human via the canonical engine)
  for (let i = 0; i < 2; i += 1) {
    await page.getByTestId("proposal-approve").first().click();
    await expect(page.getByText("ההצעה אושרה ונכתבה לזיכרון (גרסה חתומה)").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("memory-proposal-card")).toHaveCount(1 - i);
  }

  // the records now exist in the note list
  const list = page.getByTestId("memory-note-list");
  await expect(list.getByText(TITLE_A)).toBeVisible();
  await expect(list.getByText(TITLE_B)).toBeVisible();
  await expect(list.locator("button")).toHaveCount(approvedBefore + 2);

  // note navigation: open A — its body renders safely with the wikilink text
  await list.getByText(TITLE_A).click();
  const note = page.getByTestId("memory-note-view");
  await expect(note).toContainText(TITLE_A);
  await expect(note.getByTestId("note-markdown")).toContainText(TITLE_B); // inert wikilink text

  // link click-through: the link graph lives in the "גרף קישורים" center tab
  // (VC-E density made the note-list and graph two center tabs) — open it first.
  await page.getByRole("tab", { name: "גרף קישורים" }).click();
  await page.getByTestId("memory-link-graph").getByRole("button", { name: TITLE_B }).click();
  await expect(note).toContainText(TITLE_B);
  await expect(note.getByTestId("note-governance")).toContainText("אישור: מאושר");
  expect(errors).toEqual([]);
});

test("hostile ZIP: traversal entry ⇒ Hebrew security rejection; clean sibling file still stages (partial rejection of the selection)", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoMemory(page);

  // one hostile archive (contains a traversal entry — the WHOLE archive is
  // fail-closed, which is the documented honest behavior) + one clean .md in
  // the same selection ⇒ the selection is PARTIALLY rejected, in Hebrew.
  const zip = forgeZip([
    { name: "תיקיה/תקין.md", content: "# פתק בתוך הארכיון\n\nתוכן חוקי." },
    { name: "../../evil.md", content: "# פריצה\n\nניסיון יציאה מהכספת." },
  ]);
  await page.getByTestId("import-file-input").setInputFiles([
    { name: "w6f-vault.zip", mimeType: "application/zip", buffer: zip },
    file("w6f-clean.md", "# פתק נקי בצד\n\nקובץ תקין שנבחר יחד עם הארכיון העוין."),
  ]);

  // security rejection surfaced in Hebrew (traversal reason)…
  const rejections = page.getByTestId("import-rejections");
  await expect(rejections).toBeVisible();
  await expect(rejections).toContainText("דחיות אבטחה");
  await expect(rejections).toContainText("נתיב חשוד בארכיון");

  // …while the clean sibling file still stages (partial, not silent-total)
  const review = page.getByTestId("import-review");
  await expect(review).toBeVisible();
  await expect(review).toContainText("פתק נקי בצד");
  // FAIL-CLOSED: nothing from inside the hostile archive stages — including
  // its "clean" entry (an archive with a traversal entry is never trusted)
  await expect(review).not.toContainText("פתק בתוך הארכיון");
  await expect(review).not.toContainText("פריצה");
  expect(errors).toEqual([]);
});

test("version comparison: approve → merge creates v2 on the target; NoteView shows both versions + field diff", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoMemory(page);

  const submitProposal = async (title: string, body: string): Promise<void> => {
    await page.getByLabel("כותרת", { exact: true }).fill(title);
    await page.getByLabel("תוכן (Markdown)", { exact: true }).fill(body);
    await page.getByLabel("מקור: לקוח").selectOption({ index: 1 });
    await page.getByTestId("submit-proposal").click();
    await expect(
      page.getByText("נוצרה הצעת זיכרון — ממתינה לאישור אנושי בתור").first(),
    ).toBeVisible({ timeout: 15_000 });
  };

  // 1 — base record (approved ⇒ version 1)
  await submitProposal("פריט השוואה W6F", "גוף גרסה ראשונה");
  await page.getByTestId("proposal-approve").click();
  await expect(page.getByText("ההצעה אושרה ונכתבה לזיכרון (גרסה חתומה)").first()).toBeVisible({
    timeout: 15_000,
  });

  // 2 — second proposal merged INTO the base record ⇒ version 2 on the target
  await submitProposal("תוספת למיזוג W6F", "גוף גרסה שנייה — תוכן שונה");
  const card = page.getByTestId("memory-proposal-card");
  await card
    .getByLabel("פריט יעד למיזוג", { exact: true })
    .selectOption({ label: "פריט השוואה W6F" });
  await page.getByTestId("proposal-merge").click();
  await expect(
    page.getByText("ההצעה מוזגה — נוצרה גרסה חדשה על הפריט הקיים").first(),
  ).toBeVisible({ timeout: 15_000 });

  // 3 — the version comparison view on the merged record
  await page.getByTestId("memory-note-list").getByText("פריט השוואה W6F").click();
  const versions = page.getByTestId("note-versions");
  await expect(versions).toContainText("גרסאות (2)");
  await expect(versions).toContainText("שדות ששונו:");
  expect(errors).toEqual([]);
});

test("Markdown/ZIP export: REAL browser download + manifest with checksum", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await gotoMemory(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-run").click();
  const download = await downloadPromise;

  // content sanity: a dated vault ZIP with real bytes on disk
  expect(download.suggestedFilename()).toMatch(/^teragon-memory-\d{4}-\d{2}-\d{2}\.zip$/);
  const path = await download.path();
  expect(path).toBeTruthy();

  // manifest: included count, sha-256, honest download state
  const manifest = page.getByTestId("export-manifest");
  await expect(manifest).toBeVisible();
  await expect(manifest).toContainText("פריטים יוצאו");
  await expect(manifest).toContainText("sha-256:");
  await expect(manifest).toContainText("מצב הורדה: הורד");
  expect(errors).toEqual([]);
});

test("refresh persistence: an approved record survives a full reload (IndexedDB)", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoMemory(page);

  await page.getByLabel("כותרת", { exact: true }).fill("פריט התמדה W6F");
  await page.getByLabel("תוכן (Markdown)", { exact: true }).fill("נשמר ב-IndexedDB — חייב לשרוד רענון");
  await page.getByLabel("מקור: לקוח").selectOption({ index: 1 });
  await page.getByTestId("submit-proposal").click();
  await expect(page.getByTestId("memory-proposal-card")).toHaveCount(1);
  await page.getByTestId("proposal-approve").click();
  await expect(page.getByText("ההצעה אושרה ונכתבה לזיכרון (גרסה חתומה)").first()).toBeVisible({
    timeout: 15_000,
  });

  await page.reload();
  await expect(page.getByTestId("memory-page")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("memory-note-list").getByText("פריט התמדה W6F")).toBeVisible();
  expect(errors).toEqual([]);
});

test("keyboard navigation: the proposal-queue approve button is Tab-reachable and Enter-operable", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoMemory(page);

  await page.getByLabel("כותרת", { exact: true }).fill("אישור במקלדת W6F");
  await page.getByLabel("תוכן (Markdown)", { exact: true }).fill("הפעלה מלאה במקלדת בלבד");
  await page.getByLabel("מקור: לקוח").selectOption({ index: 1 });
  await page.getByTestId("submit-proposal").click();
  await expect(page.getByTestId("memory-proposal-card")).toHaveCount(1);

  // reach the approve button by KEYBOARD only (bounded Tab walk)
  await page.getByTestId("memory-proposal-card").locator("textarea").first().focus();
  let reached = false;
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press("Tab");
    const isApprove = await page.evaluate(
      () => document.activeElement?.getAttribute("data-testid") === "proposal-approve",
    );
    if (isApprove) {
      reached = true;
      break;
    }
  }
  expect(reached).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByText("ההצעה אושרה ונכתבה לזיכרון (גרסה חתומה)").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("memory-proposal-card")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("offline (honest scope): with the SPA loaded, /memory keeps reading from IndexedDB offline", async ({
  page,
  context,
}) => {
  // HONEST SCOPE: there is no service worker, so a COLD offline boot cannot
  // load the app shell (documented limitation in WAVE_6_TEST_RESULTS.md).
  // What IS supported: once the SPA is loaded, all reads come from IndexedDB —
  // navigation and data work with the network fully offline.
  const errors = collectConsoleErrors(page);
  await page.goto("/"); // load the shell + command-center chunk online
  // gate on the command center itself (the memory band now lives inside the
  // "פירוט נוסף" disclosure; this test only needs the CC chunk warmed).
  await expect(page.getByTestId("command-center")).toBeVisible({ timeout: 20_000 });
  // VC collapses non-active nav groups — expand them so the /memory link is
  // reachable for a client-side (chunk-warming) navigation.
  for (let i = 0; i < 8; i++) {
    const collapsed = page.locator('.os-nav__group-head[aria-expanded="false"]').first();
    if ((await collapsed.count()) === 0) break;
    await collapsed.click();
  }
  await page.getByRole("link", { name: "זיכרון מקומי" }).first().click(); // warm the /memory chunk
  await expect(page.getByTestId("memory-page")).toBeVisible({ timeout: 20_000 });

  await context.setOffline(true);

  // client-side round trip with zero network — data still renders from IDB
  await page.goBack();
  await expect(page.getByTestId("command-center")).toBeVisible();
  await page.goForward();
  await expect(page.getByTestId("memory-page")).toBeVisible();
  await expect(page.getByTestId("memory-note-list").locator("button")).not.toHaveCount(0);

  // filtering/search work offline (pure IDB + in-memory derivation)
  await page.getByPlaceholder("חיפוש בכותרת, בתוכן ובתגיות…").fill("עסקת");
  await expect(page.getByTestId("memory-note-list").getByText(/עסקת/).first()).toBeVisible();

  await context.setOffline(false);
  expect(nonNetworkErrors(errors)).toEqual([]);
});
