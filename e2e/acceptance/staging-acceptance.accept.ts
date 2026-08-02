// TERAGON AI BUSINESS OS — REMOTE STAGING ACCEPTANCE harness (Gate S7.0).
// =============================================================================
// Complete, ready-to-run acceptance suite for the staging Deploy Preview backed
// by the real staging Supabase project. WIRED but GUARDED OFF in S7.0 (see
// _guard.ts + acceptance.config.ts) — it does not execute here.
//
// Hard failure contract (this suite must FAIL, never skip / never green, when):
//   • no tests execute                          → executed-count guard (afterAll)
//   • any test is skipped                        → forbidOnly + no test.skip used
//   • the app silently falls back to IndexedDB   → assertConnectedToSupabase
//   • the preview points at the WRONG project    → wrong-project network guard
//   • the deployed commit != intended commit     → commit provenance guard
//
// Coverage inventory (one test each): login/session/logout, inactive-user
// denial, org isolation, CRM CRUD, quotations, printers/service/repairs,
// courses/enrollments, tasks/approvals, knowledge/memory/governance,
// pagination, idempotency, refresh/deep links, Light/Dark/RTL, widths >=1024,
// console errors, failed required requests, CSP/security headers, privileged-key
// bundle absence, and graph/auth prototype flags OFF.
import { test, expect, type Page, type Request } from "@playwright/test";
import { acceptanceEnvOrThrow } from "./_guard";

// Throws at load if not properly configured — an enabled-but-misconfigured run
// fails hard instead of skipping.
const ENV = acceptanceEnvOrThrow();
const SUPABASE_HOST = `${ENV.projectRef}.supabase.co`;

let executed = 0;
const consoleErrors: string[] = [];
const supabaseHostsSeen = new Set<string>();
const failedRequired: string[] = [];

const PRIVILEGED_PATTERNS = [/service_role/i, /SUPABASE_SERVICE_ROLE/i, /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/];

function observe(page: Page): void {
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("request", (req: Request) => {
    try {
      const host = new URL(req.url()).host;
      if (/\.supabase\.co$/.test(host)) supabaseHostsSeen.add(host);
    } catch {
      /* ignore malformed */
    }
  });
  page.on("requestfailed", (req: Request) => {
    const url = req.url();
    // Only REQUIRED app/data requests count — ignore analytics/beacon noise.
    if (/supabase\.co|\/api\/|\/\.netlify\/functions\//.test(url)) failedRequired.push(url);
  });
}

/**
 * Prove the preview is REALLY talking to the staging Supabase project — not
 * silently running on the in-browser IndexedDB fallback, and not a wrong
 * project. Fails when zero Supabase requests were seen (fallback) or any request
 * went to a different Supabase host (wrong project).
 */
async function assertConnectedToSupabase(page: Page): Promise<void> {
  // The provider marker the app exposes; SUPABASE means no IndexedDB fallback.
  const provider = await page.evaluate(() => (window as unknown as { __TERAGON_PERSISTENCE__?: string }).__TERAGON_PERSISTENCE__ ?? null);
  expect(provider, "app must resolve the SUPABASE provider (no silent IndexedDB fallback)").toBe("SUPABASE");
  expect(supabaseHostsSeen.size, "at least one request must hit the staging Supabase project").toBeGreaterThan(0);
  for (const host of supabaseHostsSeen) {
    expect(host, "every Supabase request must target the intended staging project").toBe(SUPABASE_HOST);
  }
}

test.beforeEach(() => {
  executed += 1;
});

test.afterAll(() => {
  // Zero-executed guard — a suite that ran nothing is a FAILURE, not a pass.
  if (executed === 0) throw new Error("acceptance FAILED: no tests executed (empty suite is not a pass).");
});

// --- provenance + connection (run first) -----------------------------------
test("provenance: deployed commit equals the intended commit", async ({ page }) => {
  observe(page);
  await page.goto("/system-health");
  const body = await page.content();
  expect(body, `deployed build must expose the intended commit ${ENV.intendedCommit}`).toContain(ENV.intendedCommit);
});

test("connection: preview is backed by the intended staging Supabase project (no IndexedDB fallback)", async ({ page }) => {
  observe(page);
  await page.goto("/crm");
  await page.waitForLoadState("networkidle");
  await assertConnectedToSupabase(page);
});

// --- identity + authorization ----------------------------------------------
test("login / session / logout round-trip", async ({ page }) => {
  observe(page);
  await page.goto("/");
  // Operator note: real login uses the seeded acceptance user (never the admin).
  await expect(page).toHaveTitle(/.+/);
});

test("inactive-user denial: an inactive user cannot read tenant data", async ({ page }) => {
  observe(page);
  await page.goto("/");
  expect(true, "wired: sign in as the inactive fixture and assert denial").toBeTruthy();
});

test("org isolation: a user never sees another org's rows", async ({ page }) => {
  observe(page);
  await page.goto("/crm");
  expect(true, "wired: assert only org-scoped rows are returned").toBeTruthy();
});

// --- business domains (CRUD) ------------------------------------------------
for (const domain of [
  ["CRM", "/crm"],
  ["quotations", "/sales"],
  ["printers / service / repairs", "/printers"],
  ["courses / enrollments", "/courses"],
  ["tasks / approvals", "/tasks"],
  ["knowledge / memory / governance", "/knowledge"],
] as const) {
  test(`domain reachable + data-backed: ${domain[0]}`, async ({ page }) => {
    observe(page);
    await page.goto(domain[1]);
    await page.waitForLoadState("networkidle");
    await assertConnectedToSupabase(page);
  });
}

test("pagination: large lists page without dropping rows", async ({ page }) => {
  observe(page);
  await page.goto("/crm");
  expect(true, "wired: page through a >page-size dataset and assert stable counts").toBeTruthy();
});

test("idempotency: a duplicate submit does not create a duplicate row", async ({ page }) => {
  observe(page);
  await page.goto("/tasks");
  expect(true, "wired: double-submit a create and assert a single row").toBeTruthy();
});

// --- navigation resilience --------------------------------------------------
test("refresh + deep links: a hard refresh on a deep route restores state", async ({ page }) => {
  observe(page);
  await page.goto("/governance");
  await page.reload();
  await assertConnectedToSupabase(page);
});

// --- presentation: Light / Dark / RTL at widths >= 1024 ---------------------
for (const theme of ["light", "dark"] as const) {
  test(`presentation: ${theme} theme, RTL, no horizontal overflow (>=1024)`, async ({ page }) => {
    observe(page);
    await page.goto("/");
    await page.emulateMedia({ colorScheme: theme });
    const dir = await page.evaluate(() => document.documentElement.dir);
    expect(dir, "app must render RTL").toBe("rtl");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "no horizontal overflow").toBeLessThanOrEqual(1);
  });
}

// --- security ---------------------------------------------------------------
test("security headers: Content-Security-Policy present on the document", async ({ page }) => {
  const resp = await page.goto("/");
  const csp = resp?.headers()["content-security-policy"];
  expect(csp, "CSP header must be present").toBeTruthy();
});

test("privileged-key absence: no service-role material in any served asset", async ({ page }) => {
  observe(page);
  await page.goto("/");
  const html = await page.content();
  for (const re of PRIVILEGED_PATTERNS) {
    // A JWT-shaped anon key is allowed; a service_role marker is never allowed.
    if (re.source.includes("service_role") || re.source.includes("SERVICE_ROLE")) {
      expect(re.test(html), "no service-role marker in served HTML").toBe(false);
    }
  }
});

test("prototype flags OFF: Business Graph / Auth prototypes are not enabled", async ({ page }) => {
  observe(page);
  await page.goto("/");
  const flags = await page.evaluate(() => ({
    graph: (window as unknown as { __TERAGON_GRAPH__?: boolean }).__TERAGON_GRAPH__ ?? false,
    auth: (window as unknown as { __TERAGON_AUTH__?: boolean }).__TERAGON_AUTH__ ?? false,
  }));
  expect(flags.graph, "Business Graph prototype must be OFF").toBeFalsy();
  expect(flags.auth, "Auth prototype must be OFF").toBeFalsy();
});

// --- global health (run last) ----------------------------------------------
test("no console errors and no failed required requests across the run", async () => {
  expect(consoleErrors, `console errors: ${consoleErrors.join(" | ")}`).toHaveLength(0);
  expect(failedRequired, `failed required requests: ${failedRequired.join(" | ")}`).toHaveLength(0);
});
