// W9-C Phase 9.10 — FINAL accessibility survey. Structural a11y behaviours that
// axe cannot fully assert (keyboard-only nav, visible focus, heading hierarchy,
// modal/drawer focus + ESC, reduced motion, RTL reading order) PLUS a numeric
// minor/moderate survey across all 31 routes written to
// docs/screenshots/final/axe-survey.json for honest reporting in
// docs/FINAL_ACCESSIBILITY_REPORT.md.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { ROUTES, gotoRoute, settleOverlays } from "../final-regression/w9c-helpers";

// ---- RTL reading order: the document root is rtl on every route ----
test("a11y: document direction is RTL on representative routes", async ({ page }) => {
  for (const p of ["/", "/crm", "/analytics", "/settings", "/submission"]) {
    await page.goto(p);
    await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });
    const dir = await page.evaluate(() => document.documentElement.getAttribute("dir") ?? getComputedStyle(document.body).direction);
    expect(dir).toBe("rtl");
  }
});

// ---- heading hierarchy ----
// GATE: no route may declare MORE than one h1 (a genuine hierarchy break).
// REPORTED (moderate, not gating): routes whose top heading is an h2/h3 with no
// h1 at all. axe classifies "page-has-heading-one" as best-practice/moderate;
// the offender list is written to the survey artifact and documented honestly
// in docs/FINAL_ACCESSIBILITY_REPORT.md rather than silently passed.
// Both whole-product surveys below walk ALL 31 canonical routes in a SINGLE test
// (navigate + settle + inspect per route). The 60s project default is a per-test
// budget, so on a loaded machine they time out mid-walk — a harness limit, not a
// product finding. Give them a budget proportional to the route count; the gates
// they assert (no multiple-h1, zero serious/critical) are unchanged.
test("a11y: heading hierarchy — no route declares multiple h1 (missing-h1 reported)", {
  timeout: 180_000,
}, async ({
  page,
}) => {
  const multiple: { path: string; h1: number }[] = [];
  const missing: string[] = [];
  for (const row of ROUTES.filter((r) => r.inShell)) {
    await gotoRoute(page, row);
    const h1 = await page.locator("h1").count();
    if (h1 > 1) multiple.push({ path: row.path, h1 });
    if (h1 === 0) missing.push(row.path);
  }
  mkdirSync("docs/screenshots/final", { recursive: true });
  writeFileSync(
    "docs/screenshots/final/heading-survey.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), multipleH1: multiple, missingH1: missing }, null, 2),
    "utf8",
  );
  expect(multiple).toEqual([]);
});

// ---- keyboard-only nav: arrow keys move between grouped nav controls ----
test("a11y: keyboard arrows move focus through the grouped nav", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "מרכז השליטה" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("link", { name: /מרכז השליטה/ })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("button", { name: "מרכז השליטה" })).toBeFocused();
});

// ---- visible focus indicator: a focused nav link has a non-zero outline/ring ----
test("a11y: focused nav link shows a visible focus indicator", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });
  const link = page.getByRole("link", { name: /מרכז השליטה/ });
  await link.focus();
  const hasIndicator = await link.evaluate((el) => {
    const s = getComputedStyle(el);
    const outline = parseFloat(s.outlineWidth) > 0 && s.outlineStyle !== "none";
    const ring = s.boxShadow !== "none" && s.boxShadow !== "";
    return outline || ring;
  });
  expect(hasIndicator).toBe(true);
});

// ---- modal/drawer focus management + ESC ----
test("a11y: notifications drawer traps a dialog role and ESC closes it", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^התראות/ }).click();
  const drawer = page.getByRole("dialog", { name: /התראות/ });
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
});

test("a11y: quick-create dialog is labelled and ESC closes it", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "חיפוש פקודה" }).fill("צור ליד");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "ליד חדש" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

// ---- reduced motion: the app renders cleanly under prefers-reduced-motion ----
test("a11y: renders under prefers-reduced-motion with no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const p of ["/", "/analytics", "/submission/presentation"]) {
    await page.goto(p);
    await page.waitForTimeout(300);
  }
  expect(errors).toEqual([]);
});

// ---- numeric minor/moderate survey across all 31 routes → JSON artifact ----
interface Tally {
  counts: Record<string, number>;
  rules: Record<string, { impact: string; nodes: number }>;
}

async function tally(page: Page): Promise<Tally> {
  const r = await new AxeBuilder({ page }).analyze();
  const counts: Record<string, number> = { minor: 0, moderate: 0, serious: 0, critical: 0 };
  const rules: Record<string, { impact: string; nodes: number }> = {};
  for (const v of r.violations) {
    const k = v.impact ?? "minor";
    counts[k] = (counts[k] ?? 0) + v.nodes.length;
    rules[v.id] = { impact: k, nodes: (rules[v.id]?.nodes ?? 0) + v.nodes.length };
  }
  return { counts, rules };
}

test("a11y: minor/moderate survey across all 31 routes (reported, zero serious/critical)", {
  timeout: 420_000,
}, async ({
  page,
}) => {
  const perRoute: Record<string, Record<string, number>> = {};
  const totals: Record<string, number> = { minor: 0, moderate: 0, serious: 0, critical: 0 };
  const byRule: Record<string, { impact: string; nodes: number; routes: number }> = {};
  for (const row of ROUTES) {
    await gotoRoute(page, row);
    await page.waitForTimeout(200);
    await settleOverlays(page);
    const { counts, rules } = await tally(page);
    perRoute[row.path] = counts;
    for (const k of Object.keys(totals)) totals[k] += counts[k] ?? 0;
    for (const [id, info] of Object.entries(rules)) {
      byRule[id] = {
        impact: info.impact,
        nodes: (byRule[id]?.nodes ?? 0) + info.nodes,
        routes: (byRule[id]?.routes ?? 0) + 1,
      };
    }
  }
  mkdirSync("docs/screenshots/final", { recursive: true });
  writeFileSync(
    "docs/screenshots/final/axe-survey.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), totals, byRule, perRoute }, null, 2),
    "utf8",
  );
  // the gate: zero serious AND zero critical across every route
  expect({ serious: totals.serious, critical: totals.critical }).toEqual({
    serious: 0,
    critical: 0,
  });
});
