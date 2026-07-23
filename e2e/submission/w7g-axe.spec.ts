// W7-G Phase 7.27 — axe accessibility gate (@axe-core/playwright) on the
// Wave-7 surfaces: /implementation, /personas, /stage-gates, /submission and
// the presentation overview. Gate: ZERO serious/critical violations — same
// contract as the W6 axe gate (no baseline).
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  gotoImplementation,
  gotoPersonas,
  gotoStageGates,
  gotoSubmission,
} from "../adoption/w7g-helpers";

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

test("axe: /implementation — ZERO serious/critical", async ({ page }) => {
  await gotoImplementation(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("axe: /personas — ZERO serious/critical", async ({ page }) => {
  await gotoPersonas(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("axe: /stage-gates — ZERO serious/critical", async ({ page }) => {
  await gotoStageGates(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("axe: /submission — ZERO serious/critical", async ({ page }) => {
  await gotoSubmission(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("axe: presentation overview — ZERO serious/critical", async ({ page }) => {
  await page.goto("/submission/presentation");
  await expect(page.getByTestId("presentation-overview")).toBeVisible({ timeout: 30_000 });
  expect(await seriousViolations(page)).toEqual([]);
});
