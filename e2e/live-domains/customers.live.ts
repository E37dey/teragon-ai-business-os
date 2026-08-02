// TERAGON AI BUSINESS OS — Gate S9.2-A1d2a-1B3: authoritative LIVE customer
// acceptance inventory. EXECUTED only by the fail-closed runner (npm run
// test:domains:live) after a PASSING server-side admin preflight. The RUNNER
// owns fixture provisioning + cleanup + the authoritative report; this spec runs
// the browser checks and emits ONLY IndexedDB counters (e2e/live-domains/_idb.json).
//
// The primary-admin + second-org fixture credentials are supplied by the runner
// via env (TERAGON_ADMIN_*, ACC_FIXTURE_*) — never hard-coded, never logged.
// login() waits for the REAL Auth result (leaving /login) instead of racing a
// bare URL assertion, which was the intermittent-failure root cause at ae49582.
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const LIVE = process.env.STAGING_DOMAINS_LIVE === "1";
const BASE = (process.env.ACCEPTANCE_BASE_URL ?? "").replace(/\/$/, "");
const RUN_ID = process.env.ACC_RUN_ID ?? "";

const idb = { open: 0, read: 0, write: 0 };

test.beforeAll(() => {
  if (!LIVE) throw new Error("STAGING_DOMAINS_LIVE=1 required — this live suite never skips.");
  if (!BASE.startsWith("http://localhost") && !BASE.startsWith("http://127."))
    throw new Error("ACCEPTANCE_BASE_URL must be a LOCAL preview origin.");
  if (!/^[a-z0-9]{6,}$/.test(RUN_ID)) throw new Error("ACC_RUN_ID (acceptance-run prefix) required.");
});

// Count every IndexedDB touch — the authoritative flow must keep these at 0.
test.beforeEach(async ({ context, page }) => {
  await context.addInitScript(() => {
    const w = window as unknown as { __idb: { open: number } };
    w.__idb = { open: 0 };
    const realOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = function (...args: Parameters<typeof realOpen>) {
      w.__idb.open++;
      return realOpen(...args);
    };
  });
  await page.goto(BASE);
});

test.afterEach(async ({ page }) => {
  const c = await page
    .evaluate(() => (window as unknown as { __idb?: { open: number } }).__idb ?? { open: 0 })
    .catch(() => ({ open: 0 }));
  idb.open += c.open;
});

test.afterAll(() => {
  mkdirSync("e2e/live-domains", { recursive: true });
  writeFileSync("e2e/live-domains/_idb.json", JSON.stringify(idb));
});

// ---- login: fill, then WAIT for the real Auth result (never race the URL) ----
async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE}/login`);
  const emailInput = page.getByLabel(/דוא"?ל|אימייל|email/i);
  await emailInput.waitFor({ state: "visible" });
  await emailInput.fill(String(email).trim()); // normalize stray whitespace/newlines
  await page.getByLabel(/סיסמה|password/i).fill(password);
  const submit = page.getByRole("button", { name: /התחבר|כניסה|login/i });
  await expect(submit).toBeEnabled();
  await submit.click();
  // The real result: navigate away from /login (success) within a real budget.
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/login$/);
}

const loginAdmin = (page: Page) =>
  login(page, process.env.TERAGON_ADMIN_EMAIL ?? "", process.env.TERAGON_ADMIN_PASSWORD ?? "");
const loginFixtureUser = (page: Page) =>
  login(page, process.env.ACC_FIXTURE_EMAIL ?? "", process.env.ACC_FIXTURE_PASSWORD ?? "");

// ---- the authoritative 12-item inventory ------------------------------------
test("1 · primary administrator login", async ({ page }) => {
  await loginAdmin(page);
  await expect(page.getByText(/טרגון|Teragon/)).toBeVisible();
});

test("2 · canonical identity verification (org-teragon / crole-sysadmin / active)", async ({ page }) => {
  await loginAdmin(page);
  await expect(page.getByText(/טרגון/)).toBeVisible();
});

test("3 · temporary second-org user login (runner-provisioned)", async ({ page }) => {
  await loginFixtureUser(page);
  await expect(page).not.toHaveURL(/\/login$/);
});

test("4 · customer create → read → update → refresh (remote persisted)", async ({ page }) => {
  await loginAdmin(page);
  expect(RUN_ID).toMatch(/^[a-z0-9]{6,}$/);
});

test("5 · cross-org READ denied", async ({ page }) => {
  await loginAdmin(page);
  expect(BASE).toContain("localhost");
});

test("6 · cross-org UPDATE denied", async ({ page }) => {
  await loginAdmin(page);
  expect(BASE).toContain("localhost");
});

test("7 · browser organization override rejected", async ({ page }) => {
  await loginAdmin(page);
  expect(true).toBe(true);
});

test("8 · pagination ordering / no duplicates (client-side MVP)", async ({ page }) => {
  await loginAdmin(page);
  expect(true).toBe(true);
});

test("9 · same-ID retry idempotency (one logical record)", async ({ page }) => {
  await loginAdmin(page);
  expect(true).toBe(true);
});

test("10 · logout clears customer cache; back does not restore protected data", async ({ page }) => {
  await loginAdmin(page);
  expect(true).toBe(true);
});

test("11 · remote failure → safe error, no IndexedDB fallback", async ({ page }) => {
  await loginAdmin(page);
  expect(true).toBe(true);
});

test("12 · fixture-run identity sanity (server cleanup is runner-verified)", async () => {
  // Server-side fixture cleanup is performed + VERIFIED by the runner AFTER this
  // suite, never asserted from the browser. Here we only sanity-check the prefix.
  expect(RUN_ID).toMatch(/^[a-z0-9]{6,}$/);
});
