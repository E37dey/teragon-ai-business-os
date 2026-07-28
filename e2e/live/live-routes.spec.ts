// W9-F Phase 10.2 §1 — ALL 31 canonical routes on the LIVE Deploy Preview.
// Per route, four access modes are exercised against the real CDN:
//   1. direct URL   (tests the Netlify SPA 200-rewrite for deep links)
//   2. browser refresh (F5 on the deep link — same rewrite, warm cache)
//   3. browser back  (history restore back onto the route)
//   4. in-app navigation (react-router client transition — covered in the
//      dedicated nav sweep below, which walks the shell nav for real)
// Each mode must render REAL content (never a blank shell), with zero console
// errors and zero failed REQUIRED network requests. Google Fonts traffic is
// classified NON-REQUIRED (see live-helpers.ts) and reported, never asserted.
import { test, expect } from "@playwright/test";
import {
  ROUTES,
  observe,
  drainCsp,
  gotoRoute,
  awaitRouteRendered,
  bodyTextLength,
  gotoShellReady,
} from "./live-helpers";

// A rendered TERAGON screen is dense; anything under this is a blank shell.
const MIN_BODY_TEXT = 400;

for (const row of ROUTES) {
  test(`live route ${row.path} — direct URL + refresh + back, real content, clean console`, async ({
    page,
  }, testInfo) => {
    const o = observe(page);

    // --- mode 1: DIRECT URL -------------------------------------------------
    await gotoRoute(page, row);
    const directLen = await bodyTextLength(page);
    expect(directLen, `${row.path} direct URL rendered a blank shell`).toBeGreaterThan(
      MIN_BODY_TEXT,
    );

    // --- mode 2: BROWSER REFRESH -------------------------------------------
    await page.reload({ waitUntil: "domcontentloaded" });
    await awaitRouteRendered(page, row);
    expect(await bodyTextLength(page), `${row.path} refresh rendered a blank shell`).toBeGreaterThan(
      MIN_BODY_TEXT,
    );

    // --- mode 3: BROWSER BACK ----------------------------------------------
    // navigate away to a different real route, then go back onto this one.
    const away = row.path === "/" ? "/settings" : "/";
    await page.goto(away, { waitUntil: "domcontentloaded" });
    await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 60_000 });
    await page.goBack({ waitUntil: "domcontentloaded" });
    await awaitRouteRendered(page, row);
    expect(await bodyTextLength(page), `${row.path} back-nav rendered a blank shell`).toBeGreaterThan(
      MIN_BODY_TEXT,
    );

    await drainCsp(page, o);
    // honest evidence: nothing is filtered away silently
    await testInfo.attach("live-observations", {
      body: JSON.stringify(
        {
          route: row.path,
          bodyTextChars: directLen,
          consoleErrors: o.consoleErrors,
          failedRequired: o.failedRequired,
          badStatusRequired: o.badStatusRequired,
          abortedByNavigation_NOT_ASSERTED: o.abortedByNavigation,
          nonRequiredFontIssues_NOT_ASSERTED: o.fontIssues,
          cspBenign_NOT_ASSERTED: o.cspBenign,
          cspUnexpected: o.cspViolations,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    expect(o.consoleErrors, `${row.path} console errors`).toEqual([]);
    expect(o.failedRequired, `${row.path} failed REQUIRED requests`).toEqual([]);
    expect(o.badStatusRequired, `${row.path} REQUIRED >=400 responses`).toEqual([]);
    expect(o.cspViolations, `${row.path} UNEXPECTED CSP violations`).toEqual([]);
  });
}

// --- mode 4: IN-APP NAVIGATION ----------------------------------------------
// One long client-side session that clicks through EVERY in-shell nav target
// without a full page load, proving the router works on the deployed bundle
// (chunk fetching from the CDN included). Split into two halves so a single
// live session stays inside the timeout budget.
// /customers and /customers/:id are DELIBERATELY absent from the shell nav
// (src/app/nav/navGroups.ts documents this). They are covered by their own
// in-app-entry-point test below, so the nav-link sweep excludes them.
const NOT_IN_NAV = new Set(["/customers", "/customers/cu-1"]);
const IN_SHELL = ROUTES.filter((r) => r.inShell && !NOT_IN_NAV.has(r.path));
const HALVES: ReadonlyArray<readonly [string, typeof IN_SHELL]> = [
  ["1/2", IN_SHELL.slice(0, Math.ceil(IN_SHELL.length / 2))],
  ["2/2", IN_SHELL.slice(Math.ceil(IN_SHELL.length / 2))],
];

for (const [label, chunk] of HALVES) {
  test(`live in-app navigation ${label} — client-side route transitions render real content`, async ({
    page,
  }) => {
    const o = observe(page);
    await gotoShellReady(page, "/");

    for (const row of chunk) {
      // Visual-Calm collapses non-active nav groups by default, so a target
      // link can live inside a collapsed <details>/group and not be visible.
      // Expand every collapsed group first so every in-shell link is reachable
      // (the SPA route transition is what's under test, not the disclosure).
      for (let i = 0; i < 8; i++) {
        const collapsed = page.locator('.os-nav__group-head[aria-expanded="false"]').first();
        if ((await collapsed.count()) === 0) break;
        await collapsed.click();
      }
      const link = page.locator(`nav.os-nav a[href='${row.path}']`).first();
      await expect(link, `nav link missing for ${row.path}`).toBeVisible({ timeout: 30_000 });
      await link.scrollIntoViewIfNeeded();
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${row.path.replace(/\//g, "\\/")}$`), {
        timeout: 60_000,
      });
      await awaitRouteRendered(page, row);
      expect(
        await bodyTextLength(page),
        `${row.path} in-app nav rendered a blank shell`,
      ).toBeGreaterThan(MIN_BODY_TEXT);
    }

    await drainCsp(page, o);
    expect(o.consoleErrors, "in-app nav console errors").toEqual([]);
    expect(o.failedRequired, "in-app nav failed REQUIRED requests").toEqual([]);
    expect(o.badStatusRequired, "in-app nav REQUIRED >=400 responses").toEqual([]);
    expect(o.cspViolations, "in-app nav UNEXPECTED CSP violations").toEqual([]);
  });
}

// The two customer routes are off-nav by design. Their REAL in-app entry
// points on the deployed build are:
//   /customers/:id — the global search hit (cross-module search → customer card)
//                    and the CRM/customers table row click (onRowClick navigate)
//   /customers     — the Ctrl+K quick-create "לקוח חדש" flow, whose success
//                    destination is /customers (QuickCreateHost.tsx)
// FINDING (reported, non-blocking): there is NO plain link/button anywhere in
// the deployed UI that navigates to the /customers LIST. navGroups.ts claims it
// is "reachable from the /crm screen", but /crm only links to individual
// customer cards. The list is reachable in-app only as the quick-create
// destination, or by direct URL.
test("live in-app navigation — /customers/cu-1 via global search + via table row click", async ({
  page,
}) => {
  const o = observe(page);
  await gotoShellReady(page, "/");

  // (a) cross-module global search → customer card, client-side
  await page.getByRole("searchbox", { name: "חיפוש גלובלי" }).click();
  await page.getByRole("combobox", { name: "חיפוש בכל המערכת" }).fill("אבי לוטם");
  const hit = page.locator(".os-palette__item--hit").first();
  await expect(hit).toBeVisible({ timeout: 30_000 });
  await hit.click();
  await expect(page).toHaveURL(/\/customers\/cu-1$/, { timeout: 60_000 });
  const cu1 = ROUTES.find((r) => r.path === "/customers/cu-1")!;
  await awaitRouteRendered(page, cu1);
  expect(await bodyTextLength(page)).toBeGreaterThan(MIN_BODY_TEXT);

  // (b) the /customers table row click also lands on the card, client-side
  await page.goto("/customers", { waitUntil: "domcontentloaded" });
  const customers = ROUTES.find((r) => r.path === "/customers")!;
  await awaitRouteRendered(page, customers);
  await page.locator("table tbody tr").first().click();
  await expect(page).toHaveURL(/\/customers\/cu-1$/, { timeout: 60_000 });
  await awaitRouteRendered(page, cu1);

  await drainCsp(page, o);
  expect(o.consoleErrors).toEqual([]);
  expect(o.failedRequired).toEqual([]);
  expect(o.badStatusRequired).toEqual([]);
  expect(o.cspViolations).toEqual([]);
});

test("live in-app navigation — quick-create «לקוח חדש» lands on the /customers list", async ({
  page,
}) => {
  const o = observe(page);
  await gotoShellReady(page, "/");
  await page.keyboard.press("Control+k");
  const combo = page.getByRole("combobox", { name: "חיפוש פקודה" });
  await expect(combo).toBeVisible({ timeout: 30_000 });
  await combo.fill("לקוח חדש");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "לקוח חדש" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  // customerInputSchema requires name + phone (type defaults from the select)
  await dialog.locator("#qc-customer-name").fill(`W9F לקוח ${Date.now()}`);
  await dialog.locator("#qc-customer-phone").fill("050-9990010");
  await dialog.locator("#qc-customer-city").fill("רמת גן");
  await dialog.getByRole("button", { name: "שמירה" }).click();
  await expect(page).toHaveURL(/\/customers$/, { timeout: 60_000 });
  const customers = ROUTES.find((r) => r.path === "/customers")!;
  await awaitRouteRendered(page, customers);
  expect(await bodyTextLength(page)).toBeGreaterThan(MIN_BODY_TEXT);
  await drainCsp(page, o);
  expect(o.consoleErrors).toEqual([]);
  expect(o.failedRequired).toEqual([]);
  expect(o.cspViolations).toEqual([]);
});

// The top-level presentation route is deliberately NOT in the shell nav
// (src/app/nav/navGroups.ts) — it is opened from inside the app. The real
// in-app link lives on /settings (SettingsPage.tsx), so that is the client-side
// transition an evaluator actually performs.
test("live in-app navigation — /settings → /submission/presentation", async ({ page }) => {
  const o = observe(page);
  await gotoShellReady(page, "/settings");
  // the link lives inside the "הדגמה" settings group (SettingsPage.tsx)
  await page.getByRole("tab", { name: /הדגמה/ }).click();
  await page.locator("a[href='/submission/presentation']").first().click();
  await expect(page).toHaveURL(/\/submission\/presentation$/, { timeout: 60_000 });
  await expect(page.getByText(/מצגת ההגשה/).first()).toBeVisible({ timeout: 60_000 });
  expect(await bodyTextLength(page)).toBeGreaterThan(MIN_BODY_TEXT);
  await drainCsp(page, o);
  expect(o.consoleErrors).toEqual([]);
  expect(o.failedRequired).toEqual([]);
  expect(o.badStatusRequired).toEqual([]);
  expect(o.cspViolations).toEqual([]);
});
