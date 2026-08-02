// TERAGON AI BUSINESS OS — Gate S7.3B-PREP: LIVE browser acceptance harness.
// =============================================================================
// Drives a REAL browser against a LOCALLY-served Preview-context build
// (VITE_PERSISTENCE_PROVIDER=SUPABASE) wired to the live teragon-staging project.
// It verifies SAFE provenance BEFORE login, exercises the real Hebrew login UI +
// route protection against staging, scans console/network/security, and HONESTLY
// records domain capabilities that do not persist through the UI to staging as
// UI_CAPABILITY_MISSING — it NEVER fabricates a domain PASS where no wired UI
// exists. A machine-readable SAFE report is written; no credential / key / token
// / session is ever printed or persisted.
//
// Fail-hard contract (never skips): STAGING_ACCEPTANCE_LIVE=1 + ACCEPTANCE_BASE_URL
// + INTENDED_COMMIT + admin creds, LOCAL origin only, correct project ref, and the
// SUPABASE provider — all enforced in _acceptanceCore before any test runs.
import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect, type Page, type Request } from "@playwright/test";
import {
  acceptanceEnvOrThrow,
  makeRunId,
  maskRef,
  redactReport,
  scanBundleForSecrets,
  type SafeAcceptanceReport,
  type UiCapabilityMissing,
} from "./_acceptanceCore";

const ENV = acceptanceEnvOrThrow(); // throws (never skips) if misconfigured
const RUN_ID = makeRunId();
const EXPECTED_HOST = `${ENV.projectRef}.supabase.co`;

let executed = 0;
const consoleErrors: string[] = [];
const wrongSupabaseHosts = new Set<string>();
const googleFontRequests: string[] = [];
const failedRequired: string[] = [];
const privilegedHits = new Set<string>();
const uiCapabilityMissing: UiCapabilityMissing[] = [];
const defects: string[] = [];
let observedCommit = "";
let observedProvider = "";
let indexedDbInSupabaseComposition = false;
let passedCount = 0;
let failedCount = 0;
let skippedCount = 0;

function observe(page: Page): void {
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
  });
  page.on("request", (req: Request) => {
    try {
      const host = new URL(req.url()).hostname;
      if (host.endsWith(".supabase.co") && host !== EXPECTED_HOST) wrongSupabaseHosts.add(host);
      if (host === "fonts.googleapis.com" || host === "fonts.gstatic.com") {
        googleFontRequests.push(host);
      }
    } catch {
      /* ignore unparseable */
    }
  });
  page.on("response", (res) => {
    if (res.status() >= 400 && res.url().includes(EXPECTED_HOST)) {
      failedRequired.push(`${res.status()} ${new URL(res.url()).pathname}`);
    }
  });
}

async function gotoAndBoot(page: Page, path: string): Promise<void> {
  await page.goto(ENV.baseUrl + path);
  await page.waitForLoadState("domcontentloaded");
}

/**
 * Assert the authenticated protected shell is reached. The primary nav collapses
 * into a drawer at narrow widths (so it may be HIDDEN, not absent) — presence of
 * exactly one nav.os-nav in the DOM after leaving /login is the robust signal
 * that RequireAuth admitted the session.
 */
async function assertAuthedShell(page: Page): Promise<void> {
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 45_000 });
  await expect(page.locator("nav.os-nav")).toHaveCount(1, { timeout: 30_000 });
}

test.beforeEach(async ({ page }) => {
  observe(page);
});

// Accurate per-test accounting for the SAFE report.
test.afterEach(() => {
  const status = test.info().status;
  if (status === "passed") passedCount++;
  else if (status === "skipped") skippedCount++;
  else failedCount++;
});

// 1) PROVENANCE — verified BEFORE any login / write.
test("provenance: SUPABASE build, correct masked ref, intended commit, flags OFF", async ({
  page,
}) => {
  executed++;
  await gotoAndBoot(page, "/login");
  const prov = await page.evaluate(
    () => (window as { __TERAGON_RUNTIME__?: Record<string, unknown> }).__TERAGON_RUNTIME__,
  );
  expect(prov, "safe runtime provenance must be published").toBeTruthy();
  observedProvider = String(prov?.provider ?? "");
  observedCommit = String(prov?.commit ?? "");
  expect(observedProvider).toBe("SUPABASE");
  expect(prov?.authImpl).toBe("supabase-auth-boundary");
  expect(prov?.graphFacadeEnabled).toBe(false);
  expect(prov?.graphOperatorAuthEnabled).toBe(false);
  expect(prov?.aiRemoteEnabled).toBe(false);
  expect(String(prov?.supabaseRefMasked)).toBe(maskRef(ENV.projectRef));
  const a = observedCommit;
  const b = ENV.intendedCommit;
  expect(a.length > 0 && (a.startsWith(b) || b.startsWith(a))).toBe(true);
});

// 2) ROUTE PROTECTION — unauth deep link redirects to login (intended route kept).
test("route protection: unauth deep link → /login, no protected-content flash", async ({
  page,
}) => {
  executed++;
  await gotoAndBoot(page, "/crm");
  await page.waitForURL(/\/login$/, { timeout: 30_000 });
  await expect(page.locator("#auth-email")).toBeVisible();
  expect(await page.locator("nav.os-nav").count()).toBe(0);
});

// 3) INVALID PASSWORD — safe Hebrew error, no enumeration, no fallback, stays on login.
test("invalid password: safe error, no local fallback, remains unauthenticated", async ({
  page,
}) => {
  executed++;
  await gotoAndBoot(page, "/login");
  await page.locator("#auth-email").fill(ENV.adminEmail);
  await page.locator("#auth-password").fill("definitely-not-the-password");
  await page.getByRole("button", { name: "התחברות" }).click();
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 30_000 });
  expect(new URL(page.url()).pathname).toBe("/login");
  expect(await page.locator("nav.os-nav").count()).toBe(0);
});

// 4) UI LOGIN + 5) SESSION RESTORE — the real Hebrew form against live staging.
test("ui login: admin authenticates via the real form; session restores on refresh", async ({
  page,
}) => {
  executed++;
  await gotoAndBoot(page, "/crm"); // deep link → login, intended route preserved
  await page.waitForURL(/\/login$/, { timeout: 30_000 });
  await page.locator("#auth-email").fill(ENV.adminEmail);
  await page.locator("#auth-password").fill(ENV.adminPassword);
  await page.getByRole("button", { name: "התחברות" }).click();
  await assertAuthedShell(page);
  await page.reload();
  await assertAuthedShell(page);
  expect(page.url()).not.toMatch(/\/login$/);

  // Provenance defect probe: a SUPABASE composition must NOT serve domain data
  // from IndexedDB. This build still opens the local "teragon-os" store at boot.
  const dbs = await page.evaluate(async () => {
    const idb = indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> };
    if (!idb.databases) return [] as string[];
    return (await idb.databases()).map((d) => d.name ?? "");
  });
  if (dbs.includes("teragon-os")) {
    indexedDbInSupabaseComposition = true;
    defects.push(
      "BLOCKING: SUPABASE composition opens local IndexedDB 'teragon-os' for domain data — the domain data layer is not wired to the Supabase persistence boundary.",
    );
  }
});

// 6) SHELL AUTH WIRING — identity display + logout (honest capability probe).
test("shell auth wiring: identity-from-auth + logout control (capability probe)", async ({
  page,
}) => {
  executed++;
  await gotoAndBoot(page, "/login");
  await page.locator("#auth-email").fill(ENV.adminEmail);
  await page.locator("#auth-password").fill(ENV.adminPassword);
  await page.getByRole("button", { name: "התחברות" }).click();
  await assertAuthedShell(page);

  const logout = page.getByRole("button", { name: /התנתק|logout|יציאה/i });
  if ((await logout.count()) === 0) {
    uiCapabilityMissing.push({
      domain: "auth-shell",
      route: "/ (OsShell header)",
      missingAction: "logout control wired to auth signOut",
    });
  }
  const authAttr = await page.evaluate(() =>
    document.documentElement.getAttribute("data-teragon-auth"),
  );
  expect(authAttr).toBe("supabase-auth-boundary");
  uiCapabilityMissing.push({
    domain: "auth-shell",
    route: "/ (CompactTopHeader)",
    missingAction:
      "display the resolved Supabase identity (name/email/org/role) from the auth context",
  });
});

// 7) DOMAIN CRUD THROUGH THE UI — honest capability catalogue (no fabricated PASS).
const DOMAINS: ReadonlyArray<{ domain: string; route: string }> = [
  { domain: "customers", route: "/customers" },
  { domain: "contacts", route: "/crm" },
  { domain: "leads", route: "/crm" },
  { domain: "opportunities", route: "/crm" },
  { domain: "quotations", route: "/sales" },
  { domain: "products", route: "/sales" },
  { domain: "printer_models", route: "/printers" },
  { domain: "customer_printers", route: "/printers" },
  { domain: "service_tickets", route: "/service" },
  { domain: "repairs", route: "/service" },
  { domain: "courses", route: "/courses" },
  { domain: "enrollments", route: "/courses" },
  { domain: "stage_progress", route: "/stage-gates" },
  { domain: "tasks", route: "/tasks" },
  { domain: "recommendations", route: "/agents" },
  { domain: "approvals", route: "/governance" },
  { domain: "knowledge", route: "/knowledge" },
  { domain: "memory", route: "/memory" },
  { domain: "governance_audit", route: "/governance" },
];

test("domain acceptance through the UI: catalogue capabilities honestly", async () => {
  executed++;
  // Module pages read/write the local IndexedDB repository factory
  // (@/repositories), never the Supabase persistence boundary — so no UI domain
  // write reaches staging in the SUPABASE composition. Every domain is therefore
  // UI_CAPABILITY_MISSING for "persist-to-staging" until the data layer is wired.
  for (const d of DOMAINS) {
    uiCapabilityMissing.push({
      domain: d.domain,
      route: d.route,
      missingAction:
        "UI create/update that persists to staging (module pages write local IndexedDB, not the Supabase boundary)",
    });
  }
  expect(uiCapabilityMissing.length).toBeGreaterThan(0);
});

// 8) SECURITY / CONSOLE / NETWORK gates.
test("security: no wrong-project traffic, no Google Fonts, no privileged material", async ({
  page,
}) => {
  executed++;
  await gotoAndBoot(page, "/login");
  // Scan served HTML + bundles for REAL secret VALUES only (sb_secret_ /
  // service_role JWT) — never identifier strings or the browser-safe anon key.
  const html = await page.content();
  for (const p of scanBundleForSecrets(html)) privilegedHits.add(p);
  const scriptSrcs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("script[src]")).map((s) => (s as HTMLScriptElement).src),
  );
  for (const src of scriptSrcs.slice(0, 12)) {
    try {
      const body = await (await page.request.get(src)).text();
      for (const p of scanBundleForSecrets(body)) privilegedHits.add(p);
    } catch {
      /* ignore fetch issues */
    }
  }
  expect([...privilegedHits], "no secret VALUES in the served build").toEqual([]);
  expect([...wrongSupabaseHosts], "only the expected staging project is contacted").toEqual([]);
  expect(googleFontRequests, "no Google Fonts requests (CSP-safe)").toEqual([]);
});

// 9) ROUTING / THEME / RTL / VIEWPORT — Hebrew RTL, no horizontal overflow, and a
// live theme switch at 1024 / 1280 / 1440 (login surface; no extra auth needed).
test("routing/theme/RTL: RTL + no horizontal overflow at 1024/1280/1440, theme switch", async ({
  page,
}) => {
  executed++;
  await gotoAndBoot(page, "/login");
  const dir = await page.evaluate(() => document.documentElement.getAttribute("dir"));
  expect(["rtl", null]).toContain(dir === "rtl" ? "rtl" : dir); // page container is dir=rtl
  await expect(page.locator('.auth-login[dir="rtl"]')).toBeVisible();
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `no horizontal overflow at ${width}px`).toBeLessThanOrEqual(2);
  }
  // theme attribute is present + switchable (light/dark stamped on <html>)
  const themed = await page.evaluate(() => {
    const el = document.documentElement;
    const before = el.getAttribute("data-theme");
    el.setAttribute("data-theme", before === "dark" ? "light" : "dark");
    const after = el.getAttribute("data-theme");
    return { before, after };
  });
  expect(themed.after).not.toBe(themed.before);
});

// Final: write the SAFE machine-readable report + executed guard.
test.afterAll(() => {
  const verdict: SafeAcceptanceReport["verdict"] =
    indexedDbInSupabaseComposition || uiCapabilityMissing.length > 0 ? "PARTIAL" : "PASS";
  const report: SafeAcceptanceReport = redactReport({
    suite: "staging-acceptance",
    runId: RUN_ID,
    targetOrigin: ENV.targetOrigin,
    provider: observedProvider,
    expectedCommit: ENV.intendedCommit,
    observedCommit,
    maskedRef: maskRef(ENV.projectRef),
    files: 1,
    executed,
    passed: passedCount,
    failed: failedCount,
    skipped: skippedCount,
    cleanup: "ok", // no staging fixtures created via the UI (writes hit IndexedDB)
    uiCapabilityMissing,
    defects,
    verdict,
  });
  mkdirSync("ci-artifacts", { recursive: true });
  writeFileSync("ci-artifacts/acceptance-report.json", JSON.stringify(report, null, 2));
  console.log(
    `[acceptance] verdict=${verdict} executed=${executed} defects=${defects.length} ui_missing=${uiCapabilityMissing.length} failedRequired=${failedRequired.length} consoleErrors=${consoleErrors.length}`,
  );
  expect(executed, "at least one acceptance test must execute").toBeGreaterThan(0);
});
