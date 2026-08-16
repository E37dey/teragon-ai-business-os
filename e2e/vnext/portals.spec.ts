// vNext Phase B — role portal E2E: demo login + TRUE deny-by-default on direct URL.
// Targets the running portal preview (absolute URL) so it is independent of the
// default RC2 webServer/baseURL.
import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:4180";

async function loginAs(page: Page, portal: "manager" | "student" | "technician") {
  await page.goto(`${BASE}/welcome`);
  await page.getByTestId(`demo-prefill-${portal}`).click();
  await page.getByTestId("demo-login-submit").click();
  await expect(page).toHaveURL(`${BASE}/home`); // vNext: role home is the landing
}

test.describe("vNext role portals — direct-URL RBAC", () => {
  test("welcome shows the three demo cards + credentials (demo mode)", async ({ page }) => {
    await page.goto(`${BASE}/welcome`);
    await expect(page.getByTestId("demo-prefill-manager")).toBeVisible();
    await expect(page.getByTestId("demo-prefill-student")).toBeVisible();
    await expect(page.getByTestId("demo-prefill-technician")).toBeVisible();
    await expect(page.getByTestId("demo-credentials")).toBeVisible();
  });

  test("STUDENT — denied executive routes by typed URL, allowed learning", async ({ page }) => {
    await loginAs(page, "student");
    for (const p of ["/analytics", "/governance", "/administration", "/automations", "/system-health"]) {
      await page.goto(`${BASE}${p}`);
      await expect(page.getByTestId("authz-access-denied")).toBeVisible();
    }
    await page.goto(`${BASE}/learning`);
    await expect(page.getByTestId("authz-access-denied")).toHaveCount(0);
  });

  test("TECHNICIAN — denied admin/analytics, allowed field work", async ({ page }) => {
    await loginAs(page, "technician");
    for (const p of ["/analytics", "/governance", "/administration", "/settings"]) {
      await page.goto(`${BASE}${p}`);
      await expect(page.getByTestId("authz-access-denied")).toBeVisible();
    }
    for (const p of ["/tasks", "/service", "/knowledge"]) {
      await page.goto(`${BASE}${p}`);
      await expect(page.getByTestId("authz-access-denied")).toHaveCount(0);
    }
  });

  test("MANAGER — allowed executive routes", async ({ page }) => {
    await loginAs(page, "manager");
    for (const p of ["/analytics", "/automations", "/agents", "/tasks"]) {
      await page.goto(`${BASE}${p}`);
      await expect(page.getByTestId("authz-access-denied")).toHaveCount(0);
    }
  });

  test("switching demo accounts never elevates (student→manager→student)", async ({ page }) => {
    await loginAs(page, "manager");
    await page.goto(`${BASE}/analytics`);
    await expect(page.getByTestId("authz-access-denied")).toHaveCount(0); // manager allowed
    await loginAs(page, "student");
    await page.goto(`${BASE}/analytics`);
    await expect(page.getByTestId("authz-access-denied")).toBeVisible(); // student denied again
  });
});

test.describe("vNext role portals — homes + session", () => {
  const B = "http://localhost:4180";
  async function login(page, portal) {
    await page.goto(`${B}/welcome`);
    await page.getByTestId(`demo-prefill-${portal}`).click();
    await page.getByTestId("demo-login-submit").click();
    await expect(page).toHaveURL(`${B}/home`);
  }
  test("each portal lands on its DISTINCT /home", async ({ page }) => {
    await login(page, "manager");
    await expect(page.getByTestId("manager-kpis")).toBeVisible();
    await login(page, "student");
    await expect(page.getByTestId("student-continue")).toBeVisible();
    await expect(page.getByTestId("manager-kpis")).toHaveCount(0); // no leak
    await login(page, "technician");
    await expect(page.getByTestId("tech-current-job")).toBeVisible();
    await expect(page.getByTestId("student-continue")).toHaveCount(0);
  });
  test("portal indicator + exit returns to welcome; state does not leak", async ({ page }) => {
    await login(page, "student");
    await expect(page.getByTestId("portal-indicator")).toBeVisible();
    await page.getByTestId("portal-exit").click();
    await expect(page).toHaveURL(`${B}/welcome`);
    // after exit, a fresh manager login shows the manager home (rebuilt)
    await login(page, "manager");
    await expect(page.getByTestId("manager-kpis")).toBeVisible();
  });
  test("onboarding shows then dismisses (persisted)", async ({ page }) => {
    await login(page, "student");
    await expect(page.getByTestId("portal-onboarding")).toBeVisible();
    await page.getByTestId("onboarding-dismiss").click();
    await expect(page.getByTestId("portal-onboarding")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("portal-onboarding")).toHaveCount(0); // stays dismissed
  });
});

test.describe("vNext role portals — header identity + workspace + switching", () => {
  const B = "http://localhost:4180";
  const IDENTITY = {
    manager: { name: "צחי זוסטייהם", role: "מנהל", workspace: "סביבת מנהל" },
    student: { name: "תלמיד דמו", role: "תלמיד", workspace: "סביבת תלמיד" },
    technician: { name: "טכנאי דמו", role: "טכנאי", workspace: "סביבת טכנאי" },
  } as const;

  async function login(page: Page, portal: "manager" | "student" | "technician") {
    await page.goto(`${B}/welcome`);
    await page.getByTestId(`demo-prefill-${portal}`).click();
    await page.getByTestId("demo-login-submit").click();
    await expect(page).toHaveURL(`${B}/home`);
  }
  async function assertIdentity(page: Page, portal: keyof typeof IDENTITY) {
    const id = IDENTITY[portal];
    await expect(page.locator(".os-header__name")).toHaveText(id.name);
    await expect(page.locator(".os-header__role")).toHaveText(id.role);
    await expect(page.getByTestId("portal-indicator")).toContainText(id.workspace);
  }

  test("header identity derives from the authenticated account, per portal", async ({ page }) => {
    for (const portal of ["manager", "student", "technician"] as const) {
      await login(page, portal);
      await assertIdentity(page, portal);
    }
  });

  test("switching Manager→Student→Technician leaves NO stale identity/role/home", async ({ page }) => {
    await login(page, "manager");
    await assertIdentity(page, "manager");
    await expect(page.getByTestId("manager-kpis")).toBeVisible();

    await page.getByTestId("portal-exit").click(); // logout
    await expect(page).toHaveURL(`${B}/welcome`);

    await login(page, "student");
    await assertIdentity(page, "student"); // no stale "צחי"/"מנהל"
    await expect(page.getByTestId("student-continue")).toBeVisible();
    await expect(page.getByTestId("manager-kpis")).toHaveCount(0); // no stale home

    await page.getByTestId("portal-exit").click();
    await expect(page).toHaveURL(`${B}/welcome`);

    await login(page, "technician");
    await assertIdentity(page, "technician"); // no stale "תלמיד דמו"
    await expect(page.getByTestId("tech-current-job")).toBeVisible();
    await expect(page.getByTestId("student-continue")).toHaveCount(0);

    // exit → default operator identity restored (no stale demo name)
    await page.getByTestId("portal-exit").click();
    await expect(page).toHaveURL(`${B}/welcome`);
  });
});
