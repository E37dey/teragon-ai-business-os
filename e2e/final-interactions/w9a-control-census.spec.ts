// W9-A · FINAL RUNTIME INTERACTION AUDIT — control census + dead-control gate.
//
// Walks EVERY canonical route (src/app/routes.ts — single source of truth),
// waits for the route to render, then enumerates every VISIBLE interactive
// control (button, a[href], input, select, textarea, [role=button|tab|switch|
// checkbox|menuitem]) and asserts the wiring invariants that define "not a
// dead control":
//   • every enabled activation control has an accessible name;
//   • every icon-only control carries an aria-label/title;
//   • every disabled control exposes a visible Hebrew reason (title /
//     aria-label / data-disabled-reason — the OsButton honesty contract);
//   • every <a href> points somewhere real (no ""/"#"/"javascript:").
// It also asserts ZERO console errors per route, and records a per-route
// control tally written to w9a-control-tally.json (folded into the audit doc).
//
// A dead control anywhere fails the gate. Run:
//   npx playwright test -c e2e/w9a.config.ts
import { test, expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_ROUTES } from "../../src/app/routes";

const HERE = dirname(fileURLToPath(import.meta.url));

interface ControlRecord {
  tag: string;
  role: string | null;
  name: string;
  disabled: boolean;
  reason: string | null;
  href: string | null;
  iconOnly: boolean;
}
interface RouteCensus {
  path: string;
  title: string;
  total: number;
  buttons: number;
  links: number;
  inputs: number;
  tabs: number;
  other: number;
  disabled: number;
  disabledWithReason: number;
  violations: string[];
}

// Serialized into the page; enumerates + classifies every visible control.
function censusInBrowser(): {
  controls: ControlRecord[];
  counts: { total: number; buttons: number; links: number; inputs: number; tabs: number; other: number };
} {
  const SEL = [
    "button",
    "a[href]",
    "input",
    "select",
    "textarea",
    '[role="button"]',
    '[role="tab"]',
    '[role="switch"]',
    '[role="checkbox"]',
    '[role="menuitem"]',
    '[role="option"]',
  ].join(",");

  const isVisible = (el: Element): boolean => {
    const anyEl = el as HTMLElement & { checkVisibility?: (o?: unknown) => boolean };
    if (typeof anyEl.checkVisibility === "function") {
      return anyEl.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const accessibleName = (el: Element): string => {
    const aria = el.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim();
    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      const parts = labelledby
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .filter(Boolean);
      if (parts.length) return parts.join(" ");
    }
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text) return text;
    const title = el.getAttribute("title");
    if (title && title.trim()) return title.trim();
    // input value / placeholder
    const ph = el.getAttribute("placeholder");
    if (ph && ph.trim()) return ph.trim();
    return "";
  };

  // The OsButton honesty contract puts the disabled reason on the wrapping
  // span.os-btn-wrap (aria-label + data-disabled-reason + title). Native
  // disabled buttons carry title/aria-label directly.
  const reasonFor = (el: Element): string | null => {
    const own =
      el.getAttribute("data-disabled-reason") ||
      el.getAttribute("title") ||
      el.getAttribute("aria-label");
    if (own && own.trim()) return own.trim();
    const wrap = el.closest(".os-btn-wrap");
    if (wrap) {
      const r =
        wrap.getAttribute("data-disabled-reason") ||
        wrap.getAttribute("aria-label") ||
        wrap.getAttribute("title");
      if (r && r.trim()) return r.trim();
    }
    return null;
  };

  const nodes = Array.from(document.querySelectorAll(SEL)).filter(isVisible);
  const controls: ControlRecord[] = [];
  const counts = { total: 0, buttons: 0, links: 0, inputs: 0, tabs: 0, other: 0 };

  for (const el of nodes) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role");
    const name = accessibleName(el);
    const disabled =
      (el as HTMLButtonElement).disabled === true ||
      el.getAttribute("aria-disabled") === "true";
    const href = tag === "a" ? el.getAttribute("href") : null;
    const hasText = (el.textContent ?? "").replace(/\s+/g, "").length > 0;
    const hasIcon = !!el.querySelector("svg, img, .os-nav__icon, [class*='icon']");
    const iconOnly = !hasText && hasIcon;
    const reason = disabled ? reasonFor(el) : null;

    counts.total++;
    if (tag === "a") counts.links++;
    else if (tag === "input" || tag === "select" || tag === "textarea") counts.inputs++;
    else if (role === "tab") counts.tabs++;
    else if (tag === "button" || role === "button") counts.buttons++;
    else counts.other++;

    controls.push({ tag, role, name, disabled, reason, href, iconOnly });
  }
  return { controls, counts };
}

async function ready(page: Page): Promise<void> {
  // 30 routes render inside OsShell (nav.os-nav); /submission/presentation is
  // top-level full-screen (its root is [data-testid=presentation-page], no
  // shell nav) — accept any of them.
  await page
    .locator("nav.os-nav, main, [data-testid='presentation-page']")
    .first()
    .waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle").catch(() => {});
}

const allCensus: RouteCensus[] = [];

for (const route of APP_ROUTES) {
  test(`census · ${route.navPath} (${route.title})`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));

    await page.goto(route.navPath);
    await ready(page);
    await page.waitForTimeout(400); // let derived queries settle

    const { controls, counts } = await page.evaluate(censusInBrowser);

    const violations: string[] = [];
    for (const c of controls) {
      const where = `${c.tag}${c.role ? `[role=${c.role}]` : ""}"${c.name.slice(0, 30)}"`;
      // dead href
      if (c.href !== null) {
        const h = c.href.trim();
        if (h === "" || h === "#" || h.startsWith("javascript:")) {
          violations.push(`DEAD-HREF ${where} href="${h}"`);
        }
        continue; // links need no name/handler check beyond a real href
      }
      // disabled control must expose a reason
      if (c.disabled) {
        if (!c.reason) violations.push(`DISABLED-NO-REASON ${where}`);
        continue;
      }
      // enabled activation control (button-like) must have an accessible name
      const buttonLike =
        c.tag === "button" || c.role === "button" || c.role === "tab" || c.role === "menuitem";
      if (buttonLike && !c.name) {
        violations.push(c.iconOnly ? `ICON-ONLY-NO-LABEL ${where}` : `NO-ACCESSIBLE-NAME ${where}`);
      }
    }

    const disabled = controls.filter((c) => c.disabled);
    const census: RouteCensus = {
      path: route.navPath,
      title: route.title,
      total: counts.total,
      buttons: counts.buttons,
      links: counts.links,
      inputs: counts.inputs,
      tabs: counts.tabs,
      other: counts.other,
      disabled: disabled.length,
      disabledWithReason: disabled.filter((c) => c.reason).length,
      violations,
    };
    allCensus.push(census);

    // dead-control gate — must be zero
    expect(violations, `dead controls on ${route.navPath}:\n${violations.join("\n")}`).toEqual([]);
    // every disabled control carries a reason (honesty contract)
    expect(census.disabledWithReason).toBe(census.disabled);
    // route must render at least the primary nav (or a presentation surface)
    expect(counts.total).toBeGreaterThan(0);
    // zero console errors on this route
    expect(consoleErrors, `console errors on ${route.navPath}`).toEqual([]);
  });
}

test.afterAll(() => {
  allCensus.sort((a, b) => a.path.localeCompare(b.path));
  const totals = allCensus.reduce(
    (acc, c) => {
      acc.total += c.total;
      acc.buttons += c.buttons;
      acc.links += c.links;
      acc.inputs += c.inputs;
      acc.tabs += c.tabs;
      acc.disabled += c.disabled;
      acc.violations += c.violations.length;
      return acc;
    },
    { total: 0, buttons: 0, links: 0, inputs: 0, tabs: 0, disabled: 0, violations: 0 },
  );
  // NOTE: intentionally NO volatile `generatedAt` — the tally is a committed
  // generated artifact, so it must be deterministic (change only when the real
  // control inventory changes, never merely because time passed).
  writeFileSync(
    join(HERE, "w9a-control-tally.json"),
    JSON.stringify({ totals, routes: allCensus }, null, 2),
    "utf8",
  );
});
