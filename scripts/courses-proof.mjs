// Single-render provenance proof for /courses.
// Screenshot AND DOM assertions come from ONE identical headless render at an
// EXACT CSS viewport (no window chrome, unlike the interactive MCP browser).
// Usage: node scripts/courses-proof.mjs <baseUrl>
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:4790";
const OUT = "docs/screenshots/courses-v3-proof";
mkdirSync(OUT, { recursive: true });

const SIZES = [
  { w: 1440, h: 900, file: `${OUT}/courses-v3-1440x900.png` },
  { w: 1920, h: 1080, file: `${OUT}/courses-v3-1920x1080.png` },
];

const browser = await chromium.launch();
const results = [];
for (const { w, h, file } of SIZES) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/courses`, { waitUntil: "networkidle" });
  await page.waitForSelector(".courses-page", { timeout: 15000 });
  await page.waitForTimeout(400);

  const dom = await page.evaluate(() => {
    const q = (s) => Array.from(document.querySelectorAll(s));
    const de = document.documentElement;
    return {
      renderedViewport: window.innerWidth + "x" + window.innerHeight,
      coursesPagePresent: !!document.querySelector(".courses-page"),
      phaseSegmentCount: q(".courses-phase-seg").length,
      phaseSegmentTitles: q(".courses-phase-seg__title").map((e) => e.textContent.trim()),
      activeStepCount: q(".courses-phase-step").length,
      activeStepLabels: q(".courses-phase-step__label").map((e) => e.textContent.trim()),
      legacyStepperCircleCount: q(".os-stepper__circle").length,
      legacyStepperComponentCount: q(".os-stepper").length,
      docScrollWidth: de.scrollWidth,
      innerWidth: window.innerWidth,
      horizontalOverflow: de.scrollWidth > window.innerWidth + 1,
      permanentInsightsColVisible: (() => {
        const ws = document.querySelector(".courses-workspace");
        if (!ws) return null;
        return getComputedStyle(ws).gridTemplateColumns.split(" ").length;
      })(),
    };
  });
  await page.screenshot({ path: file, fullPage: false });
  results.push({ size: `${w}x${h}`, file, dom });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
