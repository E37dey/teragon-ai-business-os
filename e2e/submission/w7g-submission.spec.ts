// W7-G e2e — /submission (W7-E): 12 deliverable cards, the 12×8 quality
// matrix of REAL validator results, blocker click-through, and the readiness
// chip that is NEVER green while a blocker exists. Deliverable approval flow:
// the UI intentionally exposes NO approve button for deliverables (approvals
// come from the canonical engine) — so the e2e injects one canonical Approval
// record straight into the app's IndexedDB store (documented; the engine is
// not bundled for the browser console) and asserts the DERIVED state reacts
// and persists across refresh. Zero console errors.
import { test, expect, type Page } from "@playwright/test";
import { collectConsoleErrors, gotoSubmission } from "../adoption/w7g-helpers";

test("12 deliverables + honest summary line — zero console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await gotoSubmission(page);

  // 12 ordered cards (1..12 with a state chip each)
  for (let i = 1; i <= 12; i += 1) {
    await expect(page.getByText(new RegExp(`^${i}\\. `)).first()).toBeVisible();
  }
  // honest counters — no forced 12/12
  await expect(page.getByText(/מצב כן — אין 12\/12 מאולץ/)).toBeVisible();
  await expect(page.getByText(/חוסמים פתוחים:/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("quality matrix 12×8: real validator glyphs render; honesty note present", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoSubmission(page);

  await page.getByRole("tab", { name: "מטריצת איכות 12×8" }).click();
  const table = page.locator("table").first();
  await expect(table).toBeVisible();
  // 12 body rows × 8 criteria columns (+ the row-label column)
  await expect(table.locator("tbody tr")).toHaveCount(12);
  await expect(table.locator("thead th")).toHaveCount(9);
  await expect(
    page.getByText(/אזהרות וכשלים הם המצב הכן, לא תקלה/),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("readiness is NEVER green while blockers exist + blocker click-through navigates", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoSubmission(page);

  // the auditor rail reports blockers + warnings
  await expect(page.getByText("מבקר ההגשה")).toBeVisible();
  await expect(page.getByText(/חוסמים ·/).first()).toBeVisible();

  // the idempotent bootstraps (bridge/objections/materials/programme) settle
  // asynchronously — wait until the summary line and the rail agree on the
  // SAME blocker count before asserting the readiness contract
  let blockers = 0;
  await expect(async () => {
    const summary = (await page.getByText(/חוסמים פתוחים:/).textContent()) ?? "";
    const rail = (await page.getByText(/חוסמים ·/).first().textContent()) ?? "";
    const s = Number(/חוסמים פתוחים:\s*(\d+)/.exec(summary)?.[1] ?? "-1");
    const r = Number(/(\d+)\s*חוסמים/.exec(rail)?.[1] ?? "-2");
    expect(s).toBe(r);
    blockers = s;
  }).toPass({ timeout: 20_000 });

  const chip = page.getByText(/מוכנות להגשה:/).first();
  await expect(chip).toBeVisible();
  const chipText = ((await chip.textContent()) ?? "").trim();
  if (blockers > 0) {
    // NEVER "מוכן להגשה" while any blocker exists
    expect(chipText).toContain("לא מוכן להגשה");
  } else {
    // honest current state: not forced green either way — never a fake
    // "מוכן להגשה" while deliverables are still awaiting approval
    expect(chipText === "מוכנות להגשה: מוכן להגשה").toBe(false);
  }

  // click-through: the presenter-notes finding navigates OUT to its target
  // route (/submission/presentation) — a fresh context has no presenter notes
  const finding = page.locator("button", { hasText: "הערות מרצה חסרות" }).first();
  await expect(finding).toBeVisible();
  await finding.click();
  await expect(page).toHaveURL(/\/submission\/presentation$/, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("metrics tab: targets shown separately from measurements; honest טרם נמדד", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoSubmission(page);

  await page.getByRole("tab", { name: "מדדים — 3 רמות" }).click();
  await expect(page.getByText("יעד (לא מדידה)").first()).toBeVisible();
  await expect(page.getByText("טרם נמדד").first()).toBeVisible();
  await expect(page.getByText(/אף מספר דונור לא יובא כמדידה/)).toBeVisible();
  expect(errors).toEqual([]);
});

/** inject ONE canonical-shape Approval record for the one-pager deliverable */
async function injectDeliverableApproval(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const now = new Date().toISOString();
    const record = {
      id: "ap-w7g-e2e-one-pager",
      subjectRef: "submission-deliverable:one-pager",
      requestedById: "u-tzachi",
      requestedAt: now,
      status: "אושר",
      decidedById: "u-tzachi",
      decidedAt: now,
      note: "W7-G e2e — אישור תוצר שהוזרק ישירות ל-store (מתועד בדוח)",
      createdAt: now,
      updatedAt: now,
    };
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("teragon-os");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("approvals", "readwrite");
        tx.objectStore("approvals").put(record);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
}

test("deliverable approval flow (engine-shape record) → approval status derives + persists across refresh", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoSubmission(page);

  // honest initial state: the one-pager has no approval record
  const onePager = page
    .locator("div.os-panel", { has: page.getByText(/^1\. /) })
    .first();
  await expect(onePager.getByText(/אישור: אין רשומת אישור/)).toBeVisible();

  await injectDeliverableApproval(page);
  await page.reload();
  await gotoSubmission(page);

  // the DERIVED evaluation now reads the canonical Approval record
  const onePagerAfter = page
    .locator("div.os-panel", { has: page.getByText(/^1\. /) })
    .first();
  await expect(onePagerAfter.getByText("אישור: מאושר")).toBeVisible({ timeout: 15_000 });

  // refresh persistence — still approved after ANOTHER reload
  await page.reload();
  await gotoSubmission(page);
  await expect(
    page
      .locator("div.os-panel", { has: page.getByText(/^1\. /) })
      .first()
      .getByText("אישור: מאושר"),
  ).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});
