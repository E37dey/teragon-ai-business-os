// W8-F Phase 8.17 — visual-QA screenshots of every Wave-8 surface at
// 1920/2560/3840 → docs/screenshots/wave8/. Each capture waits for the
// surface's real content marker first, so no screenshot shows a loading stub.
import { test, expect, type Page } from "@playwright/test";
import {
  gotoAdministration,
  gotoAnalytics,
  gotoGovernance,
  gotoSettings,
  gotoSystemHealth,
} from "./w8f-helpers";

const OUT = "docs/screenshots/wave8";
const SIZES = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "2560x1440", width: 2560, height: 1440 },
  { name: "3840x2160", width: 3840, height: 2160 },
] as const;

type Prepare = (page: Page) => Promise<void>;

const SURFACES: { slug: string; prepare: Prepare }[] = [
  { slug: "01-analytics", prepare: gotoAnalytics },
  {
    slug: "02-analytics-insufficient-data",
    prepare: async (page) => {
      await gotoAnalytics(page);
      const chip = page.getByText("טרם נמדד").first();
      await chip.scrollIntoViewIfNeeded();
      await expect(chip).toBeVisible();
    },
  },
  {
    slug: "03-analytics-drilldown",
    prepare: async (page) => {
      await gotoAnalytics(page);
      await page.getByRole("button", { name: "לידים חדשים — פתיחת רשומות המקור" }).click();
      await expect(page.getByText("רשומות המקור — לידים חדשים")).toBeVisible();
    },
  },
  {
    slug: "04-analytics-report-print",
    prepare: async (page) => {
      await page.addInitScript(() => {
        window.print = () => {};
      });
      await gotoAnalytics(page);
      await page.getByRole("tab", { name: "דוחות" }).click();
      await page.getByRole("button", { name: "הפקת דוח מנתוני אמת" }).first().click();
      const runsTable = page.locator("table").last();
      await expect(runsTable.locator("tbody tr").first()).toBeVisible({ timeout: 20_000 });
      await runsTable.locator("tbody tr").first().click();
      await expect(page.getByText(/^דוח — /)).toBeVisible();
      await page.getByRole("button", { name: "הדפסה / שמירה כ-PDF" }).click();
      await expect(page.locator(".an-print-root")).toBeAttached({ timeout: 10_000 });
      await page.emulateMedia({ media: "print" });
    },
  },
  { slug: "05-governance", prepare: gotoGovernance },
  {
    slug: "06-governance-policy-detail",
    prepare: async (page) => {
      await gotoGovernance(page);
      const table = page.getByTestId("zone-policies").locator("table").first();
      await table.locator("tbody tr").first().click();
      await expect(page.getByTestId("policy-detail")).toBeVisible();
    },
  },
  {
    slug: "07-governance-permission-matrix",
    prepare: async (page) => {
      await gotoGovernance(page);
      const zone = page.getByTestId("zone-permissions");
      await zone.scrollIntoViewIfNeeded();
      await expect(zone.locator("table tbody tr").first()).toBeVisible({ timeout: 20_000 });
    },
  },
  {
    slug: "08-governance-audit-explorer",
    prepare: async (page) => {
      await gotoGovernance(page);
      const zone = page.getByTestId("zone-audit");
      await zone.scrollIntoViewIfNeeded();
      await expect(zone.locator("table tbody tr").first()).toBeVisible({ timeout: 20_000 });
    },
  },
  {
    slug: "09-governance-risk-register",
    prepare: async (page) => {
      await gotoGovernance(page);
      const zone = page.getByTestId("zone-risks");
      await zone.scrollIntoViewIfNeeded();
      await expect(zone.locator("table tbody tr").first()).toBeVisible({ timeout: 20_000 });
    },
  },
  {
    slug: "10-governance-incident-drawer",
    prepare: async (page) => {
      await gotoGovernance(page);
      const zone = page.getByTestId("zone-incidents");
      await zone.scrollIntoViewIfNeeded();
      await page.getByTestId("incident-title").fill("W8F — תקרית ויזואלית");
      await page.getByTestId("incident-desc").fill("צילום מצב פרטי תקרית");
      await page.getByTestId("incident-open").click();
      const row = zone.locator("table tbody tr", { hasText: "W8F — תקרית ויזואלית" });
      await row.first().click();
      await expect(page.getByTestId("incident-detail")).toBeVisible();
    },
  },
  { slug: "11-administration", prepare: gotoAdministration },
  {
    slug: "12-administration-user-drawer",
    prepare: async (page) => {
      await gotoAdministration(page);
      await page.getByTestId("assign-role-u-maya").click();
      await expect(page.getByTestId("assign-role-modal")).toBeVisible();
    },
  },
  {
    slug: "13-administration-permission-request",
    prepare: async (page) => {
      await gotoAdministration(page);
      await page.getByTestId("request-change-u-maya").click();
      await expect(page.getByTestId("request-change-modal")).toBeVisible();
    },
  },
  {
    slug: "14-administration-emergency",
    prepare: async (page) => {
      await gotoAdministration(page);
      await page.getByRole("tab", { name: /מצב חירום/ }).click();
      await expect(page.getByText("בקרות חירום")).toBeVisible();
    },
  },
  { slug: "15-system-health", prepare: gotoSystemHealth },
  {
    slug: "16-system-health-degraded-unavailable",
    prepare: async (page) => {
      await gotoSystemHealth(page);
      await page.getByRole("button", { name: "הרצת בדיקת בריאות מקומית" }).click();
      // the REAL degraded state: netlify-functions לא זמין in preview
      await expect(page.getByText("לא זמין").first()).toBeVisible({ timeout: 60_000 });
    },
  },
  {
    slug: "17-system-health-diagnostic",
    prepare: async (page) => {
      await gotoSystemHealth(page);
      await page.getByRole("button", { name: "הרצת בדיקת בריאות מקומית" }).click();
      await expect(page.getByText("לא זמין").first()).toBeVisible({ timeout: 60_000 });
      await expect(
        page.getByRole("button", { name: "ייצוא דוח אבחון (מושמט-סודות)" }),
      ).toBeEnabled({ timeout: 30_000 });
    },
  },
  { slug: "18-settings", prepare: gotoSettings },
  {
    slug: "19-settings-ai-tab",
    prepare: async (page) => {
      await gotoSettings(page);
      await page.getByRole("tab", { name: /AI/ }).click();
      await expect(page.getByText(/אין ולא יהיה שדה מפתח/)).toBeVisible();
    },
  },
  {
    slug: "20-settings-security-tab",
    prepare: async (page) => {
      await gotoSettings(page);
      await page.getByRole("tab", { name: /אבטחה/ }).click();
      await expect(page.getByLabel("יעד SLA לתגובה (שעות)")).toBeVisible();
    },
  },
  {
    slug: "21-command-center-management-band",
    prepare: async (page) => {
      await page.goto("/");
      const band = page.getByTestId("management-band");
      await band.scrollIntoViewIfNeeded();
      await expect(band.getByText("רצועת הניהול")).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    slug: "22-submission-pending-state",
    prepare: async (page) => {
      await page.goto("/submission");
      await expect(page.getByText("מרכז ההגשה והראיות").first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText(/מוכנות להגשה:/)).toBeVisible({ timeout: 30_000 });
    },
  },
];

for (const surface of SURFACES) {
  for (const size of SIZES) {
    test(`${surface.slug} @ ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await surface.prepare(page);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${surface.slug}-${size.name}.png` });
    });
  }
}
