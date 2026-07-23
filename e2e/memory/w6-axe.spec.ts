// W6-F Phase 6.23 — axe accessibility gate (@axe-core/playwright) on the
// Wave-6 surfaces: /memory, /knowledge, /learning + the open knowledge
// article drawer. Gate: ZERO serious/critical violations — no baseline
// (one trivial fix applied: ConfidenceBar aria — see WAVE_6_VISUAL_QA.md §axe).
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { gotoKnowledgeSeeded } from "./w6-helpers";

async function knowledgeVisible(page: Page): Promise<void> {
  await expect(page.getByText("מאגר ידע מנוהל").first()).toBeVisible({ timeout: 20_000 });
}

interface ViolationSummary {
  id: string;
  impact: string;
  help: string;
  nodes: string[];
}

/**
 * TRUE ZERO GATE: the 2026-07-23 audit run found NO serious/critical
 * violations on any Wave-6 surface after W6-F's one trivial fix
 * (ConfidenceBar unmeasured state no longer claims role="meter" without
 * aria-valuenow — axe aria-required-attr, critical). No baseline exists.
 */
async function newSeriousViolations(page: Page): Promise<ViolationSummary[]> {
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

test("axe: /memory — ZERO serious/critical (no baseline)", async ({ page }) => {
  await page.goto("/memory");
  await expect(page.getByTestId("memory-page")).toBeVisible({ timeout: 20_000 });
  expect(await newSeriousViolations(page)).toEqual([]);
});

test("axe: /knowledge — ZERO serious/critical (no baseline)", async ({ page }) => {
  await gotoKnowledgeSeeded(page, knowledgeVisible);
  expect(await newSeriousViolations(page)).toEqual([]);
});

test("axe: /knowledge with the article drawer OPEN", async ({ page }) => {
  await gotoKnowledgeSeeded(page, knowledgeVisible);
  await expect(async () => {
    await page.getByRole("cell", { name: /וורפינג/ }).first().click();
    await expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  expect(await newSeriousViolations(page)).toEqual([]);
});

test("axe: /learning — ZERO serious/critical (no baseline)", async ({ page }) => {
  await page.goto("/learning");
  await expect(page.getByTestId("learning-page")).toBeVisible({ timeout: 30_000 });
  expect(await newSeriousViolations(page)).toEqual([]);
});
