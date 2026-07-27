// Axe accessibility scan across pilot routes. Usage: node scripts/calm-axe.mjs <baseUrl>
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const base = process.argv[2] ?? "http://localhost:4792";
const ROUTES = ["/courses", "/crm", "/service", "/agents", "/governance", "/analytics"];

const browser = await chromium.launch();
const summary = [];
for (const path of ROUTES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious");
  const critical = results.violations.filter((v) => v.impact === "critical");
  const contrast = results.violations.filter((v) => v.id === "color-contrast");
  summary.push({
    route: path,
    serious: serious.length,
    critical: critical.length,
    contrastNodes: contrast.reduce((n, v) => n + v.nodes.length, 0),
    contrastSample: contrast[0]?.nodes.slice(0, 3).map((n) => n.target.join(" ")) ?? [],
  });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(summary, null, 2));
