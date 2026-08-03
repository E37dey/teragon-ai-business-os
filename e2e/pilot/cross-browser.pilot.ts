// S10.3-C1 — cross-browser × responsive Demo-Pilot coverage.
// Runs under e2e/cross-browser.config.ts (3 engines × 3 viewports). LOCAL
// synthetic-data build, Demo Mode ON. No staging, no Production, no real data.
import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

const DEMO_BANNER = "סביבת הדגמה — הנתונים במערכת סינתטיים ואינם נתוני העסק";

// Console errors that are environmental noise, not product defects.
const BENIGN = [
  /favicon/i,
  /ResizeObserver loop/i,
  /Download the React DevTools/i,
  /React Router Future Flag/i,
  /\[vite\]/i,
];

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (!BENIGN.some((re) => re.test(text))) errors.push(text);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/** Real horizontal overflow: the document is wider than its own viewport. */
async function horizontalOverflowPx(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.documentElement;
    return Math.max(0, el.scrollWidth - el.clientWidth);
  });
}

/** Every pilot surface, with a stable anchor that proves it rendered. */
const ROUTES: ReadonlyArray<{ id: string; path: string; anchor: () => string; shell: boolean }> = [
  // Shell readiness anchors on the header, which is present at EVERY viewport.
  // `nav.os-nav` is NOT a valid readiness anchor: on mobile the nav correctly
  // collapses into a hamburger-opened drawer and is hidden. Nav reachability is
  // asserted separately (step 5), per-viewport.
  { id: "shell-home", path: "/", anchor: () => "header.os-header", shell: true },
  { id: "customers-list", path: "/customers", anchor: () => "header.os-header", shell: true },
  { id: "customer-detail", path: "/customers/cu-1", anchor: () => "header.os-header", shell: true },
  { id: "contacts-list", path: "/contacts", anchor: () => "header.os-header", shell: true },
  { id: "system-health", path: "/system-health", anchor: () => "header.os-header", shell: true },
  // Non-shell routes render minimal content, so `body` alone resolves before the
  // React tree (incl. the above-router banner) has mounted — a race that surfaced
  // only under webkit's slower JS. Anchor on the banner's own testid: it is the
  // global element under test, so waiting for it is the correct readiness signal,
  // not a loosened assertion.
  { id: "login", path: "/login", anchor: () => "[data-testid='demo-mode-banner']", shell: false },
  { id: "not-found", path: "/no-such-route-xyz", anchor: () => "[data-testid='demo-mode-banner']", shell: false },
];

for (const route of ROUTES) {
  test(`${route.id} — renders, RTL, nav reachable, clean console`, async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    const resp = await page.goto(route.path, { waitUntil: "domcontentloaded" });

    // 1. no crash — the anchor is present, and the HTTP response (if any) is ok.
    await expect(page.locator(route.anchor()).first()).toBeVisible({ timeout: 30_000 });
    if (resp) expect(resp.status(), `${route.path} status`).toBeLessThan(400);

    // 2. RTL direction is preserved.
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    // 3. the persistent Demo-Mode banner is present on every surface.
    await expect(page.getByText(DEMO_BANNER)).toBeVisible();

    // 4. primary navigation is reachable on shell routes.
    if (route.shell) {
      const w = testInfo.project.use.viewport?.width ?? 1440;
      const inlineNav = page.locator("nav.os-nav").first();
      const hamburger = page.getByRole("button", { name: /פתיחת תפריט הניווט/ }).first();
      if (w >= 1024) {
        // desktop/tablet-wide: the nav is visible inline.
        await expect(inlineNav).toBeVisible();
      } else {
        // narrow: the inline nav collapses; the hamburger must be present AND
        // actually open the drawer nav — proving navigation stays reachable.
        await expect(hamburger).toBeVisible();
        await hamburger.click();
        await expect(page.locator(".os-nav-drawer, .os-nav--in-drawer").first()).toBeVisible();
      }
    }

    // 6. console/page errors — none unexpected.
    await page.waitForTimeout(300);
    expect(errors, `console errors on ${route.id} @ ${testInfo.project.name}`).toEqual([]);
  });
}

for (const route of ROUTES) {
  test(`${route.id} — no horizontal overflow`, async ({ page }, testInfo) => {
    // S10.3-C2: the 390px header overflow is FIXED — the inline search collapses
    // to an explicit search icon button below 640px. This assertion is strict at
    // every viewport, including mobile; there is no expected-failure marker.
    await page.goto(route.path, { waitUntil: "domcontentloaded" });
    await expect(page.locator(route.anchor()).first()).toBeVisible({ timeout: 30_000 });
    const overflow = await horizontalOverflowPx(page);
    expect(overflow, `${route.id} @ ${testInfo.project.name} horizontal overflow`).toBeLessThanOrEqual(2);
  });
}

test("search stays accessible at the current viewport (inline ≥768px, icon button <640px)", async ({ page }, testInfo) => {
  const width = testInfo.project.use.viewport?.width ?? 1440;
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("header.os-header").first()).toBeVisible({ timeout: 30_000 });

  const inlineSearch = page.getByRole("searchbox", { name: /חיפוש גלובלי/ }).first();
  const searchBtn = page.getByRole("button", { name: /חיפוש גלובלי/ }).first();

  if (width >= 768) {
    // desktop/tablet: the inline search input is the accessible control.
    await expect(inlineSearch).toBeVisible();
  } else {
    // mobile: an explicit search icon button replaces it and is keyboard-reachable.
    await expect(searchBtn).toBeVisible();
    await expect(inlineSearch).toBeHidden();
    await searchBtn.focus();
    await expect(searchBtn).toBeFocused(); // visible focus + keyboard reachable
  }
});

test("quick-create dialog fits inside the viewport", async ({ page }, testInfo) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("header.os-header").first()).toBeVisible({ timeout: 30_000 });

  // The quick-add trigger is always present in the header — assert it strictly
  // rather than skipping (the dialog-fit check must never be silently bypassed).
  const trigger = page.getByRole("button", { name: /הוספה מהירה|יצירה|חדש/i }).first();
  await expect(trigger).toBeVisible();
  await trigger.click();

  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  const box = await dialog.boundingBox();
  const vp = testInfo.project.use.viewport ?? { width: 1440, height: 900 };
  expect(box, "dialog has a box").not.toBeNull();
  // The dialog must not spill outside the viewport bounds.
  expect(box!.x).toBeGreaterThanOrEqual(-2);
  expect(box!.y).toBeGreaterThanOrEqual(-2);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 2);
});
