// W9-F shared helpers for the LIVE deployment verification suite (Phase 10.2).
// Mirrors e2e/final-regression/w9c-helpers.ts but adds live-network concerns:
// non-required (third-party font) request classification and CSP-violation
// capture, since on a real deploy those are the two honest sources of noise.
import { expect, type Page, type Request, type Response } from "@playwright/test";

export interface RouteRow {
  /** concrete sample path (navPath in src/app/routes.ts) */
  path: string;
  /** Hebrew screen title */
  title: string;
  /** renders inside OsShell (false = top-level presentation route) */
  inShell: boolean;
}

// Mirror of APP_ROUTES navPaths (src/app/routes.ts) — 31 operational routes.
export const ROUTES: readonly RouteRow[] = [
  { path: "/", title: "מרכז הפיקוד", inShell: true },
  { path: "/crm", title: "ניהול לקוחות ולידים (CRM)", inShell: true },
  { path: "/customers", title: "לקוחות", inShell: true },
  { path: "/customers/cu-1", title: "כרטיס לקוח", inShell: true },
  { path: "/sales", title: "מכירות והצעות מחיר", inShell: true },
  { path: "/courses", title: "קורסים ולמידה", inShell: true },
  { path: "/service", title: "שירות ותיקונים", inShell: true },
  { path: "/printers", title: "מדפסות ודגמים", inShell: true },
  { path: "/organizations", title: "ארגונים", inShell: true },
  { path: "/tasks", title: "משימות ופגישות", inShell: true },
  { path: "/documents", title: "מסמכים והצעות מחיר", inShell: true },
  { path: "/automations", title: "אוטומציות", inShell: true },
  { path: "/agents", title: "סוכני AI", inShell: true },
  { path: "/agents/collaboration", title: "חדר התיאום של הסוכנים", inShell: true },
  { path: "/memory", title: "זיכרון ארגוני · Obsidian", inShell: true },
  { path: "/knowledge", title: "מאגר ידע", inShell: true },
  { path: "/learning", title: "מרכז למידה ושיפור", inShell: true },
  { path: "/analytics", title: "דוחות וניתוחים", inShell: true },
  { path: "/governance", title: "ממשל ובקרת AI", inShell: true },
  { path: "/implementation", title: "תכנית ההטמעה", inShell: true },
  { path: "/personas", title: "פרסונות ומסלולי הדרכה", inShell: true },
  { path: "/stage-gates", title: "Stage Gates · שערי מעבר וראיות", inShell: true },
  { path: "/training-materials", title: "מרכז חומרי ההדרכה", inShell: true },
  { path: "/quick-start", title: "התחלה מהירה ושימוש נכון", inShell: true },
  { path: "/faq", title: "FAQ והתנגדויות", inShell: true },
  { path: "/support", title: "תמיכה לאחר ההשקה", inShell: true },
  { path: "/administration", title: "ניהול המערכת", inShell: true },
  { path: "/system-health", title: "בריאות המערכת", inShell: true },
  { path: "/settings", title: "הגדרות", inShell: true },
  { path: "/submission", title: "מרכז ההגשה והראיות", inShell: true },
  { path: "/submission/presentation", title: "מצגת ההגשה", inShell: false },
] as const;

/**
 * NON-REQUIRED hosts on the live deploy.
 *
 * index.html loads the Heebo/Assistant stylesheet from fonts.googleapis.com and
 * the webfonts from fonts.gstatic.com. Those are third-party, cross-origin and
 * genuinely optional: the app declares a full local font fallback stack, so a
 * slow, rate-limited, geo-blocked or offline Google Fonts host degrades
 * typography only — it never breaks a screen. We therefore classify font
 * traffic as NON-REQUIRED and say so explicitly in the report, rather than
 * quietly filtering it. Everything else (same-origin HTML, /assets/* chunks,
 * /.netlify/functions/*) is REQUIRED and any failure is a defect.
 */
export const NON_REQUIRED_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"] as const;

export function isNonRequired(url: string): boolean {
  return NON_REQUIRED_HOSTS.some((h) => url.includes(h));
}

/**
 * KNOWN-BENIGN CSP report on the live deploy — documented, not silently hidden.
 *
 * Zod v4 (`^4.4.3`, bundled into /assets/schemas-*.js) feature-detects whether
 * it may use its JIT-compiled validator path with a guarded probe:
 *     try { return Function(""), true } catch { return false }
 * Our CSP is `script-src 'self'` (deliberately NO 'unsafe-eval'), so the browser
 * refuses the Function() constructor. The refusal is caught by Zod's own
 * try/catch and Zod transparently falls back to its interpreted validator — so
 * validation keeps working (proved live by LB-9 in live-behavior.spec.ts).
 *
 * Consequences of the refusal, measured on the live deploy:
 *   • Chromium emits NO console error for it (verified: zero console messages
 *     of any type on a full page load) — the "zero console errors" contract is
 *     unaffected.
 *   • The DOM `securitypolicyviolation` event DOES fire once per bundle load.
 *
 * This is the CSP doing exactly its job against a library probe, not a defect
 * in the app. It is allow-listed HERE ONLY, narrowly (script-src + blockedURI
 * "eval"), so any OTHER violation — a real blocked script, style, image, font
 * or connection — still fails the gate. Reported in
 * docs/LIVE_SITE_VERIFICATION.md as a known, non-blocking observation.
 */
export function isKnownBenignCsp(entry: string): boolean {
  return /^script-src\b/.test(entry) && /\bblocked eval\b/.test(entry);
}

export interface LiveObserver {
  /** console.error + uncaught pageerror text */
  consoleErrors: string[];
  /** REQUIRED (same-origin) requests that failed outright */
  failedRequired: string[];
  /**
   * Requests cancelled by a SUBSEQUENT navigation (net::ERR_ABORTED).
   *
   * These are an artefact of the test itself, not a site defect: this suite
   * deliberately navigates away mid-flight (route → away → back) to exercise
   * browser Back, and react-router's lazy route chunks that were still being
   * prefetched at that instant get aborted by the browser. Chromium reports the
   * abort as a "failed" request even though nothing was broken — the chunk is
   * simply re-fetched (from the immutable /assets cache) when it is next needed,
   * which the render assertions then prove. Recorded, reported, never asserted.
   */
  abortedByNavigation: string[];
  /** REQUIRED responses with a >=400 status */
  badStatusRequired: string[];
  /** requests to the allowed-to-fail font hosts (reported, never asserted) */
  fontIssues: string[];
  /** UNEXPECTED CSP violations reported by the browser (the gate assertion) */
  cspViolations: string[];
  /** known-benign CSP reports (Zod JIT probe) — recorded as evidence only */
  cspBenign: string[];
}

/**
 * Attach every live listener at once. Call BEFORE the first navigation.
 * CSP violations are captured two ways: the console text Chromium prints
 * ("Refused to …") and the DOM securitypolicyviolation event, which is the
 * authoritative signal and survives console-format changes.
 */
export function observe(page: Page): LiveObserver {
  const o: LiveObserver = {
    consoleErrors: [],
    failedRequired: [],
    abortedByNavigation: [],
    badStatusRequired: [],
    fontIssues: [],
    cspViolations: [],
    cspBenign: [],
  };

  page.addInitScript(() => {
    const w = window as unknown as { __cspViolations?: string[] };
    w.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      const ev = e as SecurityPolicyViolationEvent;
      w.__cspViolations?.push(
        `${ev.violatedDirective} blocked ${ev.blockedURI} (on ${ev.documentURI})`,
      );
    });
  });

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/Refused to (load|execute|apply|connect|frame|evaluate)/i.test(text)) {
      if (/unsafe-eval|evaluate a string as JavaScript/i.test(text)) o.cspBenign.push(text);
      else o.cspViolations.push(text);
      return;
    }
    if (isNonRequired(text)) {
      o.fontIssues.push(text);
      return;
    }
    o.consoleErrors.push(text);
  });
  page.on("pageerror", (err) => o.consoleErrors.push(String(err)));

  page.on("requestfailed", (req: Request) => {
    const url = req.url();
    const errorText = req.failure()?.errorText ?? "failed";
    const entry = `${url} — ${errorText}`;
    if (isNonRequired(url)) o.fontIssues.push(entry);
    else if (errorText.includes("ERR_ABORTED")) o.abortedByNavigation.push(entry);
    else o.failedRequired.push(entry);
  });

  page.on("response", (res: Response) => {
    const url = res.url();
    if (res.status() < 400) return;
    const entry = `${res.status()} ${url}`;
    if (isNonRequired(url)) o.fontIssues.push(entry);
    else o.badStatusRequired.push(entry);
  });

  return o;
}

/** Drain the in-page securitypolicyviolation buffer into the observer. */
export async function drainCsp(page: Page, o: LiveObserver): Promise<void> {
  const fromPage = await page
    .evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [])
    .catch(() => [] as string[]);
  for (const v of fromPage) {
    if (isKnownBenignCsp(v)) o.cspBenign.push(v);
    else o.cspViolations.push(v);
  }
}

/** The Suspense fallback must resolve — no screen may sit loading forever. */
export async function assertNotStuckLoading(page: Page): Promise<void> {
  await expect(page.locator(".os-route-loading")).toHaveCount(0, { timeout: 60_000 });
}

/**
 * Wait for a route's REAL surface — i.e. prove three things, not one:
 *   (a) the shell rendered (nav visible) and no Suspense fallback is stuck;
 *   (b) the ROUTER RESOLVED THIS ROUTE — a nav link carries aria-current="page"
 *       (OsShell.tsx sets it only on the active item), which a blank/fallback
 *       shell would not have;
 *   (c) the route's own <main> region holds real rendered text.
 *
 * NOTE (deliberate): we do NOT assert routes.ts `title` text on screen. Those
 * titles are the canonical ROUTER/nav labels; several screens legitimately show
 * a different in-page H1 (e.g. /crm renders "ניהול לקוחות ולידים" without the
 * "(CRM)" suffix, /sales renders "מסע הלקוח במכירה", /customers/:id renders the
 * customer's name). Asserting the router label as page copy would be a false
 * contract, so the blank-shell detector is content-based instead.
 */
const MIN_MAIN_TEXT = 150;

export async function awaitRouteRendered(page: Page, row: RouteRow): Promise<void> {
  if (row.inShell) {
    await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 60_000 });
    await assertNotStuckLoading(page);
    // (b) router really resolved a route — the active nav item is marked with
    // aria-current="page". This proof only applies to routes that HAVE a nav
    // link. /customers and /customers/:id are OFF-NAV by design (see
    // live-routes.spec.ts and src/app/nav/navGroups.ts): no nav link exists for
    // them, so no item can ever carry aria-current. For those, the router-
    // resolved proof is instead the strong content assertion (c) below plus the
    // caller's own toHaveURL check — asserting aria-current here would be a
    // false contract. So we gate (b) on a nav link for this route existing.
    const hasNavLink = (await page.locator(`nav.os-nav a[href='${row.path}']`).count()) > 0;
    if (hasNavLink) {
      await expect(page.locator('nav.os-nav a[aria-current="page"]').first()).toBeVisible({
        timeout: 60_000,
      });
    }
    // (c) the route's own content region rendered
    const main = page.locator("main").first();
    await expect(main).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(
        async () => (await main.innerText().catch(() => "")).trim().length,
        { timeout: 60_000, message: `${row.path} <main> stayed empty (blank shell)` },
      )
      .toBeGreaterThan(MIN_MAIN_TEXT);
  } else {
    // top-level presentation route: its own heading is the surface
    await expect(page.getByText(/מצגת ההגשה/).first()).toBeVisible({ timeout: 60_000 });
    await assertNotStuckLoading(page);
  }
}

export async function gotoRoute(page: Page, row: RouteRow): Promise<void> {
  await page.goto(row.path, { waitUntil: "domcontentloaded" });
  await awaitRouteRendered(page, row);
}

/** Measured body text length — the blank-shell detector. */
export async function bodyTextLength(page: Page): Promise<number> {
  return page.evaluate(() => (document.body.innerText ?? "").trim().length);
}

/** Wait for overlay ENTRANCE animations (`*-in`) to settle before axe/screens. */
export async function settleOverlays(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () =>
        !document.getAnimations().some((a) => {
          const name = (a as unknown as { animationName?: string }).animationName ?? "";
          return a.playState === "running" && name.endsWith("-in");
        }),
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => {
      /* decorative infinite animations must never hang the gate */
    });
}

export async function gotoShellReady(page: Page, path = "/"): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("nav.os-nav").first()).toBeVisible({ timeout: 60_000 });
  await assertNotStuckLoading(page);
}
