// vNext Phase B — role portal E2E: demo login + TRUE deny-by-default on direct URL.
// Targets the running portal preview (absolute URL) so it is independent of the
// default RC2 webServer/baseURL.
import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:4180";

async function loginAs(page: Page, portal: "manager" | "student" | "technician") {
  await page.goto(`${BASE}/welcome`);
  await page.getByTestId(`demo-prefill-${portal}`).click();
  await page.getByTestId("demo-login-submit").click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/(\\?.*)?$`));
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
