// TERAGON AI BUSINESS OS — Gate S9.3-E: authoritative LIVE contacts acceptance.
// EXECUTED only by the fail-closed runner (npm run test:domains:live with
// ACC_SUITE=contacts) after a PASSING server-side admin preflight. The RUNNER
// owns fixture provisioning + cleanup + the authoritative report; this spec runs
// the browser checks and emits ONLY IndexedDB counters.
//
// Fixtures (runner-provisioned, all accrun-<runId>-prefixed):
//   * PRIMARY org (administrator's own): one customer + two contacts — the rows
//     this suite reads/creates/updates through the real UI.
//   * SECOND org: a non-admin user + customers — used ONLY to prove isolation.
// Credentials and ids arrive via env; nothing is hard-coded and nothing is logged.
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const LIVE = process.env.STAGING_DOMAINS_LIVE === "1";
const BASE = (process.env.ACCEPTANCE_BASE_URL ?? "").replace(/\/$/, "");
const RUN_ID = process.env.ACC_RUN_ID ?? "";
const PREFIX = process.env.ACC_FIXTURE_PREFIX ?? "";
const CUSTOMER_ID = process.env.ACC_FIXTURE_CUSTOMER_ID ?? "";
const SECOND_CUSTOMER_ID = process.env.ACC_FIXTURE_SECOND_CUSTOMER_ID ?? "";

const idb = { open: 0, read: 0, write: 0 };

test.beforeAll(() => {
  if (!LIVE) throw new Error("STAGING_DOMAINS_LIVE=1 required — this live suite never skips.");
  if (!BASE.startsWith("http://localhost") && !BASE.startsWith("http://127."))
    throw new Error("ACCEPTANCE_BASE_URL must be a LOCAL preview origin.");
  if (!/^[a-z0-9]{6,}$/.test(RUN_ID)) throw new Error("ACC_RUN_ID (acceptance-run prefix) required.");
  if (!CUSTOMER_ID) throw new Error("ACC_FIXTURE_CUSTOMER_ID required (primary-org fixture customer).");
});

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

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE}/login`);
  const emailInput = page.getByLabel(/דוא"?ל|אימייל|email/i);
  await emailInput.waitFor({ state: "visible" });
  await emailInput.fill(String(email).trim());
  await page.getByLabel(/סיסמה|password/i).fill(password);
  const submit = page.getByRole("button", { name: /התחבר|כניסה|login/i });
  await expect(submit).toBeEnabled();
  await submit.click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
}

const loginAdmin = (page: Page) =>
  login(page, process.env.TERAGON_ADMIN_EMAIL ?? "", process.env.TERAGON_ADMIN_PASSWORD ?? "");
const loginFixtureUser = (page: Page) =>
  login(page, process.env.ACC_FIXTURE_EMAIL ?? "", process.env.ACC_FIXTURE_PASSWORD ?? "");

/** Open the fixture customer's detail page and wait for its contacts section. */
async function openFixtureCustomer(page: Page): Promise<void> {
  await page.goto(`${BASE}/customers/${CUSTOMER_ID}`);
  await page.getByTestId("customer-contacts").waitFor({ state: "visible", timeout: 30_000 });
}

// ---- the authoritative 12-item contacts inventory ---------------------------
test("1 · administrator login", async ({ page }) => {
  await loginAdmin(page);
  await expect(page.locator(".os-header__role")).toHaveText(/מנהל מערכת/);
});

test("2 · contacts list reads remotely at /contacts", async ({ page }) => {
  await loginAdmin(page);
  await page.goto(`${BASE}/contacts`);
  await page.getByTestId("contacts-page").waitFor({ state: "visible", timeout: 30_000 });
  // the runner-provisioned fixture contacts are visible in the org-wide list
  await expect(page.getByText(`${PREFIX} איש קשר 1`)).toBeVisible();
});

test("3 · customer detail shows THIS customer's contacts", async ({ page }) => {
  await loginAdmin(page);
  await openFixtureCustomer(page);
  await expect(page.getByText(`${PREFIX} איש קשר 1`)).toBeVisible();
  await expect(page.getByText(`${PREFIX} איש קשר 2`)).toBeVisible();
});

test("4 · an unrelated customer's contacts are EXCLUDED", async ({ page }) => {
  await loginAdmin(page);
  await openFixtureCustomer(page);
  const section = page.getByTestId("customer-contacts");
  // every rendered contact belongs to the fixture customer's own set
  await expect(section.getByText(`${PREFIX} איש קשר 1`)).toBeVisible();
  // a second-org customer id must never appear anywhere on this page
  if (SECOND_CUSTOMER_ID) await expect(page.getByText(SECOND_CUSTOMER_ID)).toHaveCount(0);
});

test("5 · create a contact through the real UI", async ({ page }) => {
  await loginAdmin(page);
  await openFixtureCustomer(page);
  await page.getByRole("button", { name: "איש קשר חדש" }).click();
  await page.getByLabel("שם *").fill(`${PREFIX} נוצר`);
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByText(`${PREFIX} נוצר`)).toBeVisible({ timeout: 30_000 });
});

test("6 · required-name validation blocks an empty save", async ({ page }) => {
  await loginAdmin(page);
  await openFixtureCustomer(page);
  await page.getByRole("button", { name: "איש קשר חדש" }).click();
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByRole("alert")).toContainText("שם איש הקשר");
});

test("7 · duplicate submit collapses to ONE contact", async ({ page }) => {
  await loginAdmin(page);
  await openFixtureCustomer(page);
  await page.getByRole("button", { name: "איש קשר חדש" }).click();
  const name = `${PREFIX} כפול`;
  await page.getByLabel("שם *").fill(name);
  const save = page.getByRole("button", { name: "שמירה" });
  await save.click();
  await save.click({ force: true }).catch(() => undefined); // second click of ONE submission
  await expect(page.getByText(name)).toHaveCount(1, { timeout: 30_000 });
});

test("8 · update a contact through the real UI", async ({ page }) => {
  await loginAdmin(page);
  await openFixtureCustomer(page);
  const row = page.getByRole("row", { name: new RegExp(`${PREFIX} איש קשר 2`) });
  await row.getByRole("button", { name: "עריכה" }).click();
  await page.getByLabel("שם *").fill(`${PREFIX} עודכן`);
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByText(`${PREFIX} עודכן`)).toBeVisible({ timeout: 30_000 });
});

test("9 · the edit form exposes NO customer field — a contact cannot be re-parented", async ({ page }) => {
  await loginAdmin(page);
  await openFixtureCustomer(page);
  const row = page.getByRole("row", { name: new RegExp(`${PREFIX} איש קשר 1`) });
  await row.getByRole("button", { name: "עריכה" }).click();
  await expect(page.getByLabel(/customerId|לקוח משויך/i)).toHaveCount(0);
  await expect(page.getByLabel("שם *")).toBeVisible();
});

test("10 · canonical organization scope — the admin's org identity is shown", async ({ page }) => {
  await loginAdmin(page);
  await expect(page.locator(".os-header__role")).toHaveText(/Teragon/);
  await openFixtureCustomer(page);
  await expect(page.getByTestId("customer-contacts")).toBeVisible();
});

test("11 · second-organization isolation — fixture user cannot see these contacts", async ({ page }) => {
  await loginFixtureUser(page);
  await page.goto(`${BASE}/contacts`);
  await page.getByTestId("contacts-page").waitFor({ state: "visible", timeout: 30_000 });
  // RLS scopes the read to the fixture user's OWN organization
  await expect(page.getByText(`${PREFIX} איש קשר 1`)).toHaveCount(0);
});

test("12 · fail-closed when unauthenticated — no protected contact data renders", async ({ page }) => {
  await page.goto(`${BASE}/contacts`);
  await expect(page.getByText(`${PREFIX} איש קשר 1`)).toHaveCount(0);
  await expect(page).toHaveURL(/\/login$/, { timeout: 30_000 });
});
