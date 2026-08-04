// S-Product Phase 1 — capture every canonical route at four viewports and record
// objective layout metrics. Screenshots land in shots/audit/<w>/<slug>.png.
// Evidence-only: this suite asserts nothing beyond "the shell rendered"; the numbers
// feed the human audit matrix. LOCAL synthetic build, Demo Mode ON.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { APP_ROUTES } from "../../src/app/routes";

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1024, h: 768 },
  { w: 768, h: 1024 },
  { w: 390, h: 844 },
] as const;

const BENIGN = [
  /favicon/i, /ResizeObserver loop/i, /React DevTools/i, /React Router Future Flag/i,
  /\[vite\]/i, /Failed to load resource/i,
];

function slug(navPath: string): string {
  return navPath === "/" ? "root" : navPath.replace(/^\//, "").replace(/[/:]/g, "_");
}

async function overflowPx(page: Page): Promise<number> {
  return page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
}

// One test per viewport so each ~32-route sweep gets its own timeout budget and the
// metrics JSON is written incrementally to shots/audit/_metrics-<w>.json.
for (const vp of VIEWPORTS) {
  test(`full-route audit @ ${vp.w}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !BENIGN.some((re) => re.test(m.text()))) errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    const report: Record<string, unknown>[] = [];
    const shotsRoot = resolve(process.cwd(), "shots/audit");
    mkdirSync(resolve(shotsRoot, String(vp.w)), { recursive: true });
    await page.setViewportSize({ width: vp.w, height: vp.h });

    for (const route of APP_ROUTES) {
      const before = errors.length;
      await page.goto(route.navPath, { waitUntil: "domcontentloaded" });
      await page.locator("header.os-header").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(200);

      const of = await overflowPx(page);
      const header = await page.locator("header.os-header").first().isVisible().catch(() => false);
      const main = await page.locator("main").first().isVisible().catch(() => false);
      const dir = await page.locator("html").getAttribute("dir").catch(() => null);
      const navInline = await page.locator("nav.os-nav").first().isVisible().catch(() => false);
      const hamburger = await page.getByRole("button", { name: /פתיחת תפריט הניווט/ }).first().isVisible().catch(() => false);

      await page.screenshot({
        path: resolve(shotsRoot, String(vp.w), `${slug(route.navPath)}.png`),
        fullPage: false,
      });

      report.push({
        viewport: vp.w, route: route.navPath, title: route.title,
        overflowPx: of, header, main, dir, navInline, hamburger,
        newConsoleErrors: errors.slice(before),
      });
    }

    writeFileSync(resolve(shotsRoot, `_metrics-${vp.w}.json`), JSON.stringify(report, null, 2));
    // `/submission/presentation` is a full-bleed slide mode that hides the shell header
    // by design, so it is exempt. The `main` element check is intentionally NOT asserted
    // here: it is unreliable on cold reload at <=1024 (content paints > the settle
    // window); main presence is proven by the a11y/network/cross-browser gates instead.
    const headerless = report.filter((r) => !r.header && r.route !== "/submission/presentation");
    expect(headerless, `routes missing shell header: ${JSON.stringify(headerless.map((r) => r.route))}`).toEqual([]);
  });
}
