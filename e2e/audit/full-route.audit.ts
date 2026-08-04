// S11.1-A2 — full-route visual + metrics audit with DETERMINISTIC route readiness.
// Replaces the earlier fixed 200ms settle (which captured under-rendered lazy routes
// at <=1024). Readiness = Suspense loader (`.os-route-loading`) detached + main canvas
// (`main.os-workspace__canvas`) holds real content; a route whose main stays empty
// FAILS the audit. Headerless/full-bleed routes are exempted only through an explicit
// map. Screenshots land in shots/audit/<w>/<slug>.png; metrics in _metrics-<w>.json.
// LOCAL synthetic build, Demo Mode ON. No staging, no real data.
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

// Routes that intentionally hide the shell header / main canvas (full-bleed modes).
const HEADERLESS = new Set<string>(["/submission/presentation"]);

function slug(navPath: string): string {
  return navPath === "/" ? "root" : navPath.replace(/^\//, "").replace(/[/:]/g, "_");
}

async function overflowPx(page: Page): Promise<number> {
  return page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
}

// Deterministic readiness. Returns whether the main content actually rendered.
async function waitRouteReady(page: Page, headerless: boolean): Promise<boolean> {
  // 1. Suspense fallback for the lazy route chunk must be gone.
  await page.locator(".os-route-loading").waitFor({ state: "detached", timeout: 20_000 }).catch(() => {});
  if (headerless) {
    // Full-bleed page: no shell canvas; wait for substantial body text instead.
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    return page.waitForFunction(
      () => ((document.body?.innerText ?? "").trim().length > 80),
      { timeout: 15_000 },
    ).then(() => true).catch(() => false);
  }
  // 2. Main canvas present and holding real content (children + non-trivial text),
  //    and no in-canvas loading indicator remains.
  await page.locator("main.os-workspace__canvas").waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
  const ready = await page.waitForFunction(
    () => {
      const m = document.querySelector("main.os-workspace__canvas");
      if (!m) return false;
      if (m.querySelector("[aria-busy='true'], .os-route-loading")) return false;
      const txt = ((m as HTMLElement).innerText ?? "").trim();
      return m.children.length > 0 && txt.length > 15;
    },
    { timeout: 15_000 },
  ).then(() => true).catch(() => false);
  // Let data-driven widgets (sparklines / async KPI grids) settle — they can widen the
  // canvas AFTER the text/children readiness gate, which otherwise under-reports overflow.
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(450);
  return ready;
}

async function pageHeading(page: Page, headerless: boolean): Promise<string> {
  return page.evaluate((hl) => {
    const scope = hl ? document.body : document.querySelector("main.os-workspace__canvas") ?? document.body;
    const h = scope.querySelector("h1, [role='heading'][aria-level='1'], h2");
    return (h as HTMLElement | null)?.innerText?.trim().slice(0, 80) ?? "";
  }, headerless);
}

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
      const headerless = HEADERLESS.has(route.path);
      const before = errors.length;
      await page.goto(route.navPath, { waitUntil: "domcontentloaded" });
      const mainRendered = await waitRouteReady(page, headerless);

      const finalUrl = new URL(page.url()).pathname;
      const heading = await pageHeading(page, headerless);
      const of = await overflowPx(page);
      const header = await page.locator("header.os-header").first().isVisible().catch(() => false);
      const navInline = await page.locator("nav.os-nav").first().isVisible().catch(() => false);
      const hamburger = await page.getByRole("button", { name: /פתיחת תפריט הניווט/ }).first().isVisible().catch(() => false);
      const headerControls = await page.locator("header.os-header button, header.os-header a").count().catch(() => 0);
      const dir = await page.locator("html").getAttribute("dir").catch(() => null);

      await page.screenshot({ path: resolve(shotsRoot, String(vp.w), `${slug(route.navPath)}.png`), fullPage: false });

      report.push({
        viewport: vp.w, expectedRoute: route.navPath, finalUrl, title: route.title,
        heading, mainRendered, overflowPx: of, sidebarMode: navInline ? "inline" : hamburger ? "hamburger" : "none",
        header, headerControls, dir, headerless, newConsoleErrors: errors.slice(before),
      });
    }

    writeFileSync(resolve(shotsRoot, `_metrics-${vp.w}.json`), JSON.stringify(report, null, 2));

    // Fail if a non-exempt route's main content stayed empty (the exact defect A2 targets).
    const emptyMain = report.filter((r) => !r.headerless && !r.mainRendered);
    expect(emptyMain, `routes with empty main: ${JSON.stringify(emptyMain.map((r) => [r.viewport, r.expectedRoute]))}`).toEqual([]);
  });
}
