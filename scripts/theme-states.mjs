// Capture representative interactive states in the active theme.
// Usage: THEME=light|dark node scripts/theme-states.mjs <baseUrl>
// (THEME=dark toggles via the header control first, then persists.)
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:4825";
const theme = process.env.THEME ?? "light";
const OUT = process.env.CALM_OUT ?? `docs/screenshots/theme-rollout/states/${theme}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const log = [];

// set dark via the real toggle (persists repo+mirror) if requested
await page.goto(`${base}/courses`, { waitUntil: "networkidle" });
await page.waitForSelector("main", { timeout: 15000 });
if (theme === "dark") {
  await page.click('[data-testid="theme-toggle"]');
  await page.waitForTimeout(1000);
}
const applied = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));

async function state(name, path, prep) {
  try {
    await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForSelector("main, [class*='workspace']", { timeout: 15000 });
    await page.waitForTimeout(450);
    const note = prep ? await prep(page) : "base";
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
    log.push({ name, ok: true, note });
  } catch (e) {
    log.push({ name, ok: false, note: String(e).slice(0, 90) });
  }
}
const clickText = async (p, t) => {
  const el = p.getByText(t, { exact: false }).first();
  if (await el.count()) { await el.click({ timeout: 4000 }).catch(() => {}); return `clicked ${t}`; }
  return `${t} not found`;
};

await state("drawer-courses-insights", "/courses", (p) => clickText(p, "תובנות והמשך"));
await state("approval-agents", "/agents", () => "pending approvals visible");
await state("warning-governance", "/governance", () => "risks/incidents visible");
await state("insufficient-analytics", "/analytics", async (p) => {
  await p.getByText("טרם נמדד", { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
  return "insufficient-data";
});
await state("empty-collaboration", "/agents/collaboration", () => "empty run state");
await state("nav-collapsed", "/governance", () => "collapsed nav default");
await state("copilot-open", "/courses", async (p) => {
  const b = p.locator('[data-testid="shell-open-copilot"]').first();
  if (await b.count()) { await b.click().catch(() => {}); return "copilot open"; }
  return "no copilot";
});
await state("modal-crm-newlead", "/crm", (p) => clickText(p, "ליד חדש"));

await browser.close();
console.log(JSON.stringify({ appliedTheme: applied, states: log }, null, 2));
