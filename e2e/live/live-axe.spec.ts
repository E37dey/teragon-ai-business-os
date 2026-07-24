// W9-F Phase 10.2 §5 — axe smoke ON THE LIVE DEPLOY.
// Same no-baseline contract as the W9-C gate: ZERO serious/critical violations.
// This is a SMOKE subset (6 representative routes) — the full 31-route axe gate
// already runs against the production build in e2e/final-accessibility. Running
// it again over the network proves the DEPLOYED bundle + real CSS (Google Fonts
// included or not) did not regress accessibility.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ROUTES, gotoRoute, settleOverlays, observe } from "./live-helpers";

const SMOKE = ["/", "/crm", "/agents", "/governance", "/system-health", "/submission"] as const;

interface ViolationSummary {
  id: string;
  impact: string;
  help: string;
  nodes: string[];
}

async function seriousViolations(page: Page): Promise<ViolationSummary[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      id: v.id,
      impact: v.impact ?? "",
      help: v.help,
      nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 5),
    }));
}

for (const path of SMOKE) {
  const row = ROUTES.find((r) => r.path === path);
  test(`live axe: ${path} — ZERO serious/critical`, async ({ page }) => {
    expect(row, `route row for ${path}`).toBeTruthy();
    observe(page);
    await gotoRoute(page, row!);
    // fonts load over the network on the live deploy — let text settle so contrast
    // is measured against the FINAL rendered typography, not a fallback flash.
    await page.waitForTimeout(1_500);
    await settleOverlays(page);
    expect(await seriousViolations(page)).toEqual([]);
  });
}
