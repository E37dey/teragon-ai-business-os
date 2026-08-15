// W8-F Phase 8.17 — axe accessibility gate (@axe-core/playwright) on the five
// Wave-8 routes + two drawer states (analytics drilldown drawer, governance
// incident detail). Gate: ZERO serious/critical violations — same contract as
// the W6/W7 axe gates (no baseline).
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  gotoAdministration,
  gotoAnalytics,
  gotoGovernance,
  gotoSettings,
  gotoSystemHealth,
  openGovernanceIncidents,
} from "./w8f-helpers";

interface ViolationSummary {
  id: string;
  impact: string;
  help: string;
  nodes: string[];
}

async function seriousViolations(page: Page): Promise<ViolationSummary[]> {
  const results = await new AxeBuilder({ page }).analyze();
  const out: ViolationSummary[] = [];
  for (const v of results.violations) {
    if (v.impact !== "serious" && v.impact !== "critical") continue;
    out.push({
      id: v.id,
      impact: v.impact ?? "",
      help: v.help,
      nodes: v.nodes.map((n) => n.target.join(" ")),
    });
  }
  return out;
}

test("axe: /analytics — ZERO serious/critical", async ({ page }) => {
  await gotoAnalytics(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("axe: /governance — ZERO serious/critical", async ({ page }) => {
  await gotoGovernance(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("axe: /administration — ZERO serious/critical", async ({ page }) => {
  await gotoAdministration(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("axe: /system-health — ZERO serious/critical", async ({ page }) => {
  await gotoSystemHealth(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("axe: /settings — ZERO serious/critical", async ({ page }) => {
  await gotoSettings(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("axe: analytics drilldown drawer open — ZERO serious/critical", async ({ page }) => {
  await gotoAnalytics(page);
  await page.getByRole("tab", { name: "ב · מכירות ולקוחות" }).click();
  await page.getByRole("button", { name: "לידים חדשים — פתיחת רשומות המקור" }).click();
  await expect(page.getByText("רשומות המקור — לידים חדשים")).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("axe: governance incident detail open — ZERO serious/critical", async ({ page }) => {
  await gotoGovernance(page);
  await openGovernanceIncidents(page);
  const zone = page.getByTestId("zone-incidents");
  await zone.scrollIntoViewIfNeeded();
  await page.getByTestId("incident-title").fill("W8F — תקרית נגישות");
  await page.getByTestId("incident-desc").fill("בדיקת axe על מצב פרטי תקרית פתוח");
  await page.getByTestId("incident-open").click();
  const row = zone.locator("table tbody tr", { hasText: "W8F — תקרית נגישות" });
  await row.first().click();
  await expect(page.getByTestId("incident-detail")).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});
