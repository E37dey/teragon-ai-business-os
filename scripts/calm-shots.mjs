// Multi-route calm screenshot harness. Screenshot + basic DOM health from one
// render per (route,size). Usage: node scripts/calm-shots.mjs <baseUrl> <sizeCsv?>
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:4790";
const sizeArg = process.argv[3] ?? "1440x900";
const OUT = "docs/screenshots/visual-calm";
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ["courses", "/courses"],
  ["crm", "/crm"],
  ["service", "/service"],
  ["agents", "/agents"],
  ["governance", "/governance"],
  ["analytics", "/analytics"],
];
const SIZES = sizeArg.split(",").map((s) => {
  const [w, h] = s.split("x").map(Number);
  return { w, h };
});

const browser = await chromium.launch();
const results = [];
for (const [name, path] of ROUTES) {
  for (const { w, h } of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    try {
      await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForSelector("main, .os-workspace, [class*='workspace']", { timeout: 12000 });
      await page.waitForTimeout(350);
      const dom = await page.evaluate(() => {
        const de = document.documentElement;
        return {
          overflow: de.scrollWidth > window.innerWidth + 1,
          scrollW: de.scrollWidth,
          inner: window.innerWidth,
          // count elements still carrying a colored neon halo (multi-arg box-shadow with rgba blur)
          bodyBg: getComputedStyle(document.body).backgroundColor,
        };
      });
      const file = `${OUT}/${name}-${w}x${h}.png`;
      await page.screenshot({ path: file, fullPage: false });
      results.push({ name, size: `${w}x${h}`, file, ...dom, errors });
    } catch (e) {
      results.push({ name, size: `${w}x${h}`, error: String(e), errors });
    }
    await ctx.close();
  }
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
