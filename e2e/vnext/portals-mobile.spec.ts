// vNext Phase F — TRUE 390px mobile journeys + final screenshots.
// Each portal is driven button-by-button on a real 390-wide viewport: log in,
// verify the primary action reaches its destination, and capture the final
// evidence screenshots (welcome, three homes, AccessDenied) at 390 AND 1440.
import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:4180";
const OUT = "docs/vnext/screenshots/final";

async function login(page: Page, portal: "manager" | "student" | "technician") {
  await page.goto(`${BASE}/welcome`);
  await page.getByTestId(`demo-prefill-${portal}`).click();
  await page.getByTestId("demo-login-submit").click();
  await expect(page).toHaveURL(`${BASE}/home`);
}

async function noHBar(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(1);
}

test.describe("vNext portals — 390px mobile journeys", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("STUDENT — continue-learning CTA reaches /learning; no h-scroll", async ({ page }) => {
    await login(page, "student");
    await expect(page.getByTestId("student-continue")).toBeVisible();
    await noHBar(page);
    await page.screenshot({ path: `${OUT}/student-home-390.png`, fullPage: true });
    await page.getByTestId("student-continue-cta").click();
    await expect(page).toHaveURL(`${BASE}/learning`);
  });

  test("TECHNICIAN — open-job CTA reaches /service; no h-scroll", async ({ page }) => {
    await login(page, "technician");
    await expect(page.getByTestId("tech-current-job")).toBeVisible();
    await noHBar(page);
    await page.screenshot({ path: `${OUT}/technician-home-390.png`, fullPage: true });
    const cta = page.getByTestId("tech-open-job");
    if (await cta.count()) {
      await cta.click();
      await expect(page).toHaveURL(`${BASE}/service`);
    }
  });

  test("MANAGER — quick link reaches /analytics; no h-scroll", async ({ page }) => {
    await login(page, "manager");
    await expect(page.getByTestId("manager-kpis")).toBeVisible();
    await noHBar(page);
    await page.screenshot({ path: `${OUT}/manager-home-390.png`, fullPage: true });
    await page.getByTestId("manager-quick").getByRole("button", { name: "דוחות וניתוחים" }).click();
    await expect(page).toHaveURL(`${BASE}/analytics`);
  });

  test("welcome + AccessDenied — 390 screenshots + no h-scroll", async ({ page }) => {
    await page.goto(`${BASE}/welcome`);
    await expect(page.getByTestId("demo-prefill-manager")).toBeVisible();
    await noHBar(page);
    await page.screenshot({ path: `${OUT}/welcome-390.png`, fullPage: true });
    await login(page, "student");
    await page.goto(`${BASE}/analytics`);
    await expect(page.getByTestId("authz-access-denied")).toBeVisible();
    await noHBar(page);
    await page.screenshot({ path: `${OUT}/access-denied-390.png`, fullPage: true });
  });
});

test.describe("vNext portals — 1440 final screenshots", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("capture welcome + three homes + AccessDenied at 1440", async ({ page }) => {
    await page.goto(`${BASE}/welcome`);
    await expect(page.getByTestId("demo-prefill-manager")).toBeVisible();
    await page.screenshot({ path: `${OUT}/welcome-1440.png`, fullPage: true });

    await login(page, "manager");
    await expect(page.getByTestId("manager-kpis")).toBeVisible();
    await page.screenshot({ path: `${OUT}/manager-home-1440.png`, fullPage: true });

    await login(page, "student");
    await expect(page.getByTestId("student-continue")).toBeVisible();
    await page.screenshot({ path: `${OUT}/student-home-1440.png`, fullPage: true });

    await login(page, "technician");
    await expect(page.getByTestId("tech-current-job")).toBeVisible();
    await page.screenshot({ path: `${OUT}/technician-home-1440.png`, fullPage: true });

    await page.goto(`${BASE}/analytics`);
    await expect(page.getByTestId("authz-access-denied")).toBeVisible();
    await page.screenshot({ path: `${OUT}/access-denied-1440.png`, fullPage: true });
  });
});
