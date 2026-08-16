// vNext Phase F — the extra human-review evidence screenshots requested for the
// final gate: student learning, technician current job, manager decision surface,
// and the onboarding card. Captured at 1440 against the running portal preview.
import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:4180";
const OUT = "docs/vnext/screenshots/final";

async function login(page: Page, portal: "manager" | "student" | "technician") {
  await page.goto(`${BASE}/welcome`);
  await page.getByTestId(`demo-prefill-${portal}`).click();
  await page.getByTestId("demo-login-submit").click();
  await expect(page).toHaveURL(`${BASE}/home`);
}

test.describe("vNext portals — extra review screenshots", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("ONBOARDING card (student first visit)", async ({ page }) => {
    await login(page, "student");
    const card = page.getByTestId("portal-onboarding");
    await expect(card).toBeVisible();
    await card.screenshot({ path: `${OUT}/onboarding.png` });
  });

  test("STUDENT LEARNING (continue-learning destination)", async ({ page }) => {
    await login(page, "student");
    await page.getByTestId("student-continue-cta").click();
    await expect(page).toHaveURL(`${BASE}/learning`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/student-learning.png`, fullPage: true });
  });

  test("TECHNICIAN CURRENT JOB (hero + open-job destination)", async ({ page }) => {
    await login(page, "technician");
    const hero = page.getByTestId("tech-current-job");
    await expect(hero).toBeVisible();
    await hero.screenshot({ path: `${OUT}/technician-current-job.png` });
  });

  test("MANAGER DECISION (operations brief — decisions first)", async ({ page }) => {
    await login(page, "manager");
    const brief = page.getByTestId("operations-brief");
    await expect(brief).toBeVisible();
    await brief.screenshot({ path: `${OUT}/manager-decision.png` });
  });
});
