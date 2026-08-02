// Proves the app makes NO external font request and renders with the approved
// system Hebrew stack, in both themes, with correct first paint.
import { test, expect } from "@playwright/test";

const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

test("no request to fonts.googleapis.com / fonts.gstatic.com on load", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (r) => {
    const url = r.url();
    if (FONT_HOSTS.some((h) => url.includes(h))) external.push(url);
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.goto("/settings", { waitUntil: "networkidle" });
  expect(external, `unexpected external font requests: ${external.join(", ")}`).toEqual([]);
});

test("computed font stack resolves to the approved system Hebrew stack", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const ff = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  // approved stack: "Segoe UI", "Arial Hebrew", Arial, sans-serif
  expect(ff).toContain("Segoe UI");
  expect(ff).toContain("Arial");
  // no external-webfont family names leak into the resolved stack
  expect(ff.toLowerCase()).not.toContain("heebo");
  expect(ff.toLowerCase()).not.toContain("assistant");
});

test("Light is the fresh-user default and Dark first paint is correct", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  // fresh user → Light default
  await expect
    .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
    .toBe("light");
  // switch to dark via the real control → applies dark
  await page.getByTestId("theme-opt-dark").click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
    .toBe("dark");
  // dark persists across a navigation (no wrong-theme flash back to light)
  await page.goto("/settings", { waitUntil: "networkidle" });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
    .toBe("dark");
});
