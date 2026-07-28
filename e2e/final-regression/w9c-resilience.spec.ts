// W9-C Phase 9.9 — FINAL per-route resilience. For EVERY canonical route:
//   • direct URL load (deep-link)         • browser refresh
//   • back/forward navigation             • no infinite loading (Suspense resolves)
//   • zero console errors
// Plus cross-cutting: IndexedDB persistence across reload, offline warm-walk,
// migration-runs-once (schemaVersion stable across reloads).
import { test, expect } from "@playwright/test";
import {
  ROUTES,
  collectConsoleErrors,
  nonNetworkErrors,
  gotoRoute,
  assertNotStuckLoading,
} from "./w9c-helpers";

// ---- direct load + refresh + no-stuck-loading + clean console, every route ----
for (const row of ROUTES) {
  test(`resilience: ${row.path} — direct load, refresh, clean console`, async ({ page }) => {
    const errors = collectConsoleErrors(page);

    // 1) direct URL load (deep-link straight into the route)
    await gotoRoute(page, row);

    // 2) browser refresh lands on the SAME route (client router rehydrates)
    await page.reload();
    await gotoRoute(page, row);

    // 3) Suspense fallback resolved — nothing stuck loading
    await assertNotStuckLoading(page);

    await page.waitForTimeout(300);
    expect(nonNetworkErrors(errors)).toEqual([]);
  });
}

// ---- back / forward across a walk of representative routes ----
test("resilience: back/forward preserves route identity across a walk", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  const walk = ["/", "/crm", "/customers", "/service", "/analytics", "/governance"];
  for (const p of walk) {
    await page.goto(p);
    await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });
    await assertNotStuckLoading(page);
  }
  // walk back to the start
  for (let i = 0; i < walk.length - 1; i++) {
    await page.goBack();
    await expect(page.locator("nav.os-nav").first()).toBeVisible();
    await assertNotStuckLoading(page);
  }
  await expect(page).toHaveURL(/\/$/);
  // and forward once
  await page.goForward();
  await expect(page).toHaveURL(/\/crm$/);
  await assertNotStuckLoading(page);
  expect(nonNetworkErrors(errors)).toEqual([]);
});

// ---- IndexedDB persistence across reload (mutation survives) ----
test("resilience: notification mark-read persists across reload (IndexedDB)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });
  const bell = page.getByRole("button", { name: /^התראות/ });
  const countBadge = bell.locator(".os-header__count");
  await expect(countBadge).toBeVisible();
  const before = Number.parseInt((await countBadge.textContent()) ?? "0", 10);
  expect(before).toBeGreaterThan(0);

  await bell.click();
  const drawer = page.getByRole("dialog", { name: /התראות/ });
  await expect(drawer).toBeVisible();
  await drawer.locator(".os-ntf:not(.os-ntf--read) .os-ntf__read-toggle").first().click();
  await expect(bell.locator(".os-header__count")).toHaveText(String(before - 1));
  await page.keyboard.press("Escape");

  // refresh-after-mutation — the decremented count is read back from IndexedDB
  await page.reload();
  await expect(page.locator("nav.os-nav").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^התראות/ }).locator(".os-header__count"),
  ).toHaveText(String(before - 1));
});

// ---- migration runs once: schemaVersion is stable & seed is not re-applied ----
test("resilience: migration runs once — schemaVersion stable across reloads", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });

  const readVersion = async (): Promise<number> =>
    page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const req = indexedDB.open("teragon-os");
          req.onsuccess = () => {
            const v = req.result.version;
            req.result.close();
            resolve(v);
          };
          req.onerror = () => reject(req.error);
        }),
    );

  const v1 = await readVersion();
  expect(v1).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator("nav.os-nav").first()).toBeVisible();
  const v2 = await readVersion();
  // idempotent: the DB version does not climb on every load
  expect(v2).toBe(v1);
});

// ---- offline warm-walk: a warm (already-loaded) app keeps navigating offline ----
// Uses in-app (client-side) navigation via real nav links — a full-page goto
// would fail offline (vite preview has no service worker). Nav labels are the
// canonical NAV_GROUPS labels (src/app/nav/navGroups.ts).
const WARM_LINKS = [
  { label: "לקוחות ולידים", url: /\/crm$/ }, // /crm
  { label: "מכירות והתאמת מדפסות", url: /\/sales$/ }, // /sales
  { label: "דוחות וניתוחים", url: /\/analytics$/ }, // /analytics
];

async function clickNav(page: import("@playwright/test").Page, label: string, url: RegExp) {
  // VC-B collapses non-active nav groups by default — expand them so every
  // link is reachable (the SPA-navigation resilience is what's under test).
  for (let i = 0; i < 8; i++) {
    const collapsed = page.locator('.os-nav__group-head[aria-expanded="false"]').first();
    if ((await collapsed.count()) === 0) break;
    await collapsed.click();
  }
  const navLink = page.getByRole("link", { name: label }).first();
  await navLink.scrollIntoViewIfNeeded();
  await navLink.click();
  await expect(page).toHaveURL(url);
  await expect(page.locator("nav.os-nav").first()).toBeVisible();
  await assertNotStuckLoading(page);
}

test("resilience: offline warm-walk — cached SPA still navigates, no crash", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/");
  await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 30_000 });

  // Warm the lazy chunks IN THE SAME JS CONTEXT via client-side nav — a full
  // goto reload would drop the in-memory module cache. (This SPA has no service
  // worker, so only already-loaded chunks are reachable offline — by design.)
  for (const link of WARM_LINKS) await clickNav(page, link.label, link.url);
  await clickNav(page, "מרכז השליטה", /\/$/);

  await page.context().setOffline(true);
  try {
    // routes whose chunks are already in memory keep navigating offline
    for (const link of WARM_LINKS) await clickNav(page, link.label, link.url);
  } finally {
    await page.context().setOffline(false);
  }
  // offline network noise is filtered; no unexpected app errors
  expect(nonNetworkErrors(errors)).toEqual([]);
});
