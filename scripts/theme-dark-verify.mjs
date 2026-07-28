// Validate DARK theme via the REAL toggle (persists repo + mirror in one context).
// Usage: node scripts/theme-dark-verify.mjs <baseUrl> <name:path,...> [sizeCsv]
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2];
const routeArg = process.argv[3] ?? "";
const sizeCsv = process.argv[4] ?? "1440x900";
const OUT = process.env.CALM_OUT ?? "docs/screenshots/theme-dark";
mkdirSync(OUT, { recursive: true });
const routes = routeArg.split(",").filter(Boolean).map((s) => {
  const [name, ...rest] = s.split(":");
  return { name, path: rest.join(":") };
});
const sizes = sizeCsv.split(",").map((s) => {
  const [w, h] = s.split("x").map(Number);
  return { w, h };
});

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: sizes[0].w, height: sizes[0].h },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

// 1) go to a route in default (light), then TOGGLE to dark via the header control.
await page.goto(`${base}/courses`, { waitUntil: "networkidle" });
await page.waitForSelector("main", { timeout: 15000 });
// click twice? order is light→dark on first click.
await page.click('[data-testid="theme-toggle"]');
await page.waitForTimeout(1000); // let setSetting (IndexedDB) + mirror persist
const themeAfter = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));

const out = [];
for (const { name, path } of routes) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector("main, [class*='workspace']", { timeout: 15000 });
  await page.waitForTimeout(400);
  const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const r = await new AxeBuilder({ page }).analyze();
  const contrastV = r.violations.filter((v) => v.id === "color-contrast");
  for (const { w, h } of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${OUT}/${name}-${w}x${h}.png`, fullPage: false });
  }
  await page.setViewportSize({ width: sizes[0].w, height: sizes[0].h });
  out.push({
    name,
    theme,
    overflow,
    serious: r.violations.filter((v) => v.impact === "serious").length,
    critical: r.violations.filter((v) => v.impact === "critical").length,
    contrast: contrastV.reduce((n, v) => n + v.nodes.length, 0),
    contrastSample: contrastV.flatMap((v) => v.nodes.map((n) => n.target.join(" "))).slice(0, 4),
  });
}
await browser.close();
console.log(JSON.stringify({ themeAfterToggle: themeAfter, routes: out }, null, 2));
