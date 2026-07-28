// Reusable calm verifier: for each route, one headless render → axe + overflow +
// screenshot. Usage: node scripts/calm-verify.mjs <baseUrl> <name:path,name:path,...> [sizeCsv]
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:4800";
const routeArg = process.argv[3] ?? "";
const sizeCsv = process.argv[4] ?? "1440x900";
const OUT = process.env.CALM_OUT ?? "docs/screenshots/visual-calm";
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
const out = [];
for (const { name, path } of routes) {
  const primary = sizes[0];
  const ctx = await browser.newContext({ viewport: { width: primary.w, height: primary.h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  if (process.env.THEME) {
    const t = process.env.THEME;
    await page.addInitScript((theme) => {
      try { localStorage.setItem("teragon.theme.preference", theme); } catch {}
    }, t);
  }
  page.on("pageerror", (e) => errors.push(String(e)));
  let axeRes = { serious: -1, critical: -1, contrast: -1 };
  let overflow = null;
  try {
    await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForSelector("main, .os-workspace, [class*='workspace']", { timeout: 12000 });
    await page.waitForTimeout(350);
    overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const r = await new AxeBuilder({ page }).analyze();
    const contrastV = r.violations.filter((v) => v.id === "color-contrast");
    axeRes = {
      serious: r.violations.filter((v) => v.impact === "serious").length,
      critical: r.violations.filter((v) => v.impact === "critical").length,
      contrast: contrastV.reduce((n, v) => n + v.nodes.length, 0),
      contrastSample: contrastV.flatMap((v) => v.nodes.map((n) => n.target.join(" "))).slice(0, 5),
    };
    // screenshots at all requested sizes
    for (const { w, h } of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${OUT}/${name}-${w}x${h}.png`, fullPage: false });
    }
  } catch (e) {
    errors.push(String(e));
  }
  out.push({ name, path, ...axeRes, overflow, errors: errors.slice(0, 2) });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 2));
