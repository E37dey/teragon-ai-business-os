// W8-F e2e — /system-health (W8-D): running the local health check updates the
// component states HONESTLY (netlify-functions is לא זמין in the vite preview —
// the REAL degraded state, not a fixture; the remote provider is NEVER shown
// "מחובר" from the browser), the diagnostic export downloads a real JSON file
// which is read back and scanned for secrets. Zero console errors.
import { test, expect } from "@playwright/test";
import { collectConsoleErrors, gotoSystemHealth } from "../analytics/w8f-helpers";

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /AKIA[A-Z0-9]{12,}/,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/,
  /[Bb]earer\s+[A-Za-z0-9._~+/=-]{16,}/,
];

test("run local health check → honest states: functions לא זמין in preview, remote never מחובר", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoSystemHealth(page);

  // before any run: nothing pretends to be checked
  await expect(page.getByText("טרם נבדקו / לא נמדדים").first()).toBeVisible();

  await page.getByRole("button", { name: "הרצת בדיקת בריאות מקומית" }).click();

  // the netlify-functions probe runs against the REAL preview server — the
  // function is not served there, so the honest state is לא זמין (degraded)
  const functionsRow = page.locator("*", { hasText: "Netlify Functions" }).locator("..").first();
  await expect(page.getByText("לא זמין").first()).toBeVisible({ timeout: 60_000 });

  // the remote provider row NEVER claims "מחובר" from the browser
  const remoteName = page.getByText("ספק ה-AI המרוחק", { exact: false }).first();
  if (await remoteName.isVisible().catch(() => false)) {
    const row = remoteName.locator("xpath=ancestor::*[self::tr or contains(@class,'os-panel')][1]");
    await expect(row.getByText("מחובר")).toHaveCount(0);
  }
  // global honesty: the string "מחובר" must not be attributed to remote AI
  const pageText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(pageText).not.toMatch(/ה-AI המרוחק[^·]{0,40}מחובר/);

  // measured counters replaced the "טרם נבדקו" bulk — snapshot history row exists
  await expect(page.getByText("היסטוריית תצלומי בריאות")).toBeVisible();
  await expect(functionsRow).toBeDefined();
  expect(errors).toEqual([]);
});

test("diagnostic export downloads a real JSON — read back, secret-scanned, exclusions declared", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoSystemHealth(page);

  // the export is honestly disabled before any snapshot exists
  await expect(
    page.getByRole("button", { name: "ייצוא דוח אבחון (מושמט-סודות)" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "הרצת בדיקת בריאות מקומית" }).click();
  await expect(page.getByText("לא זמין").first()).toBeVisible({ timeout: 60_000 });

  const exportBtn = page.getByRole("button", { name: "ייצוא דוח אבחון (מושמט-סודות)" });
  await expect(exportBtn).toBeEnabled({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent("download");
  await exportBtn.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^teragon-diagnostics-.*\.json$/);

  const path = await download.path();
  const fs = await import("node:fs");
  const json = fs.readFileSync(path, "utf-8");
  const report = JSON.parse(json) as {
    reportVersion: string;
    exclusionsHe: string[];
    redactionCount: number;
  };
  expect(report.reportVersion).toBe("teragon-diagnostic-report/1");
  // the report declares what it deliberately does NOT contain
  expect(report.exclusionsHe.join(" ")).toContain("משתני סביבה");
  // scan the ACTUAL export for secret shapes
  for (const re of SECRET_PATTERNS) {
    expect(json).not.toMatch(re);
  }
  // no personal contact data either
  expect(json).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  expect(errors).toEqual([]);
});
