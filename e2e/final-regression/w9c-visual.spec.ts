// W9-C Phase 9.11 — FINAL visual QA. Full-page screenshots of ALL 31 canonical
// routes at 1920×1080, 2560×1440 and 3840×2160, plus key application states
// (empty / drawer / palette / search / present-mode / print-preview /
// pending-approval / degraded-health / provider-disabled / examiner-mode).
// Output → docs/screenshots/final/. Each capture waits for the route's real
// surface first, so no screenshot shows a Suspense loading stub.
import { test, expect, type Page } from "@playwright/test";
import { ROUTES, gotoRoute, settleOverlays } from "./w9c-helpers";

const OUT = "docs/screenshots/final";
const SIZES = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "2560x1440", width: 2560, height: 1440 },
  { name: "3840x2160", width: 3840, height: 2160 },
] as const;

function slug(path: string): string {
  if (path === "/") return "00-command-center";
  return path.replace(/^\//, "").replace(/\//g, "-").replace(/:/g, "");
}

// ---- every route at every resolution ----
for (const row of ROUTES) {
  for (const size of SIZES) {
    test(`route ${row.path} @ ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await gotoRoute(page, row);
      await page.waitForTimeout(400);
      await settleOverlays(page);
      await page.screenshot({ path: `${OUT}/route-${slug(row.path)}-${size.name}.png` });
    });
  }
}

// ---- key application states (1920×1080) ----
type Prepare = (page: Page) => Promise<void>;
const STATES: { slug: string; prepare: Prepare }[] = [
  {
    slug: "state-notifications-drawer",
    prepare: async (page) => {
      await page.goto("/");
      await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });
      await page.getByRole("button", { name: /^התראות/ }).click();
      await expect(page.getByRole("dialog", { name: /התראות/ })).toBeVisible();
    },
  },
  {
    slug: "state-command-palette",
    prepare: async (page) => {
      await page.goto("/");
      await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });
      await page.keyboard.press("Control+k");
      await expect(page.getByRole("combobox", { name: "חיפוש פקודה" })).toBeVisible();
    },
  },
  {
    slug: "state-global-search",
    prepare: async (page) => {
      await page.goto("/");
      await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });
      await page.getByRole("searchbox", { name: "חיפוש גלובלי" }).click();
      await page.getByRole("combobox", { name: "חיפוש בכל המערכת" }).fill("Bambu");
      await expect(page.locator(".os-palette__item--hit").first()).toBeVisible();
    },
  },
  {
    slug: "state-quick-create-lead",
    prepare: async (page) => {
      await page.goto("/");
      await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });
      await page.keyboard.press("Control+k");
      await page.getByRole("combobox", { name: "חיפוש פקודה" }).fill("צור ליד");
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog", { name: "ליד חדש" })).toBeVisible();
    },
  },
  {
    slug: "state-submission-pending-approval",
    prepare: async (page) => {
      await page.goto("/submission");
      await expect(page.getByText(/מוכנות להגשה:/).first()).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    slug: "state-system-health-degraded",
    prepare: async (page) => {
      await page.goto("/system-health");
      await expect(page.getByText("בריאות המערכת").first()).toBeVisible({ timeout: 30_000 });
      await page.getByRole("button", { name: "הרצת בדיקת בריאות מקומית" }).click();
      await expect(page.getByText("לא זמין").first()).toBeVisible({ timeout: 60_000 });
    },
  },
  {
    slug: "state-settings-ai-provider-disabled",
    prepare: async (page) => {
      await page.goto("/settings");
      await expect(page.getByText("הגדרות מנוהלות").first()).toBeVisible({ timeout: 30_000 });
      await page.getByRole("tab", { name: /AI/ }).click();
      await expect(page.getByText(/אין ולא יהיה שדה מפתח/)).toBeVisible();
    },
  },
  {
    slug: "state-presentation-present-mode",
    prepare: async (page) => {
      await page.goto("/submission/presentation");
      await expect(page.getByTestId("presentation-overview")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("start-presentation").click();
      await expect(page.getByTestId("present-mode")).toBeVisible();
      await expect(page.getByTestId("countdown")).toBeVisible();
    },
  },
  {
    slug: "state-presentation-examiner",
    prepare: async (page) => {
      await page.goto("/submission/presentation");
      await expect(page.getByText(/מצגת ההגשה/).first()).toBeVisible({ timeout: 30_000 });
      await page.getByRole("tab", { name: "מצב הדגמה לבוחן" }).click();
    },
  },
  {
    slug: "state-print-submission-a4",
    prepare: async (page) => {
      await page.goto("/submission?print=1");
      await expect(page.getByText("מרכז ההגשה והראיות —").first()).toBeVisible({ timeout: 30_000 });
      await page.emulateMedia({ media: "print" });
    },
  },
];

for (const s of STATES) {
  test(`${s.slug} @ 1920x1080`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await s.prepare(page);
    await page.waitForTimeout(400);
    await settleOverlays(page);
    await page.screenshot({ path: `${OUT}/${s.slug}-1920x1080.png` });
    await page.emulateMedia({ media: "screen" });
  });
}
