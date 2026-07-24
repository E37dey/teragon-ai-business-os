// W9-F Phase 10.2 §6 — evidence screenshots of the LIVE deploy at three
// evaluator-realistic resolutions (1920×1080, 2560×1440, 3840×2160).
// These are EVIDENCE, not visual-regression baselines: no pixel comparison is
// performed, so a font-render difference can never fail the release gate.
// Output: docs/screenshots/final-live/<slug>-<W>x<H>.png
import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { ROUTES, gotoRoute, settleOverlays, observe, drainCsp } from "./live-helpers";

// ESM-safe: the repo is type:module, so __dirname does not exist here.
const OUT_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  "../../docs/screenshots/final-live",
);

const VIEWPORTS = [
  { w: 1920, h: 1080 },
  { w: 2560, h: 1440 },
  { w: 3840, h: 2160 },
] as const;

const TARGETS = [
  "/",
  "/crm",
  "/agents/collaboration",
  "/analytics",
  "/governance",
  "/system-health",
  "/submission",
  "/submission/presentation",
] as const;

function slug(p: string): string {
  return p === "/" ? "home" : p.replace(/^\//, "").replace(/\//g, "-");
}

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

for (const vp of VIEWPORTS) {
  test(`live screenshots @ ${vp.w}x${vp.h}`, async ({ browser }) => {
    // 8 live navigations + a 4K compositing pass per run — this is legitimately
    // slow on a loaded machine, so it gets its own generous budget rather than
    // failing the gate on local CPU contention.
    test.setTimeout(600_000);
    const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await context.newPage();
    const o = observe(page);
    try {
      for (const target of TARGETS) {
        const row = ROUTES.find((r) => r.path === target);
        expect(row, `route row for ${target}`).toBeTruthy();
        await gotoRoute(page, row!);
        // let webfonts + entrance animations settle so the evidence is honest
        await page.waitForTimeout(1_500);
        await settleOverlays(page);
        await page.screenshot({
          path: path.join(OUT_DIR, `${slug(target)}-${vp.w}x${vp.h}.png`),
          fullPage: false,
        });
      }
      await drainCsp(page, o);
      expect(o.consoleErrors, `console errors during ${vp.w}x${vp.h} capture`).toEqual([]);
      expect(o.cspViolations, `CSP violations during ${vp.w}x${vp.h} capture`).toEqual([]);
    } finally {
      await page.close();
      await context.close();
    }
  });
}

test("screenshot evidence set is complete on disk (8 screens × 3 resolutions)", async () => {
  const expected: string[] = [];
  for (const vp of VIEWPORTS) for (const t of TARGETS) expected.push(`${slug(t)}-${vp.w}x${vp.h}.png`);
  const missing = expected.filter((f) => !fs.existsSync(path.join(OUT_DIR, f)));
  expect(missing, "missing live screenshots").toEqual([]);
  for (const f of expected) {
    expect(fs.statSync(path.join(OUT_DIR, f)).size, `${f} is empty`).toBeGreaterThan(5_000);
  }
});
