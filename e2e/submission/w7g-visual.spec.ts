// W7-G Phase 7.27 — visual-QA screenshots of every Wave-7 surface at
// 1920/2560/3840 → docs/screenshots/wave7/. Each capture waits for the
// surface's real content marker first, so no screenshot shows a loading stub.
import { test, expect, type Page } from "@playwright/test";
import {
  gotoFaq,
  gotoImplementation,
  gotoPersonas,
  gotoQuickStart,
  gotoStageGates,
  gotoSubmission,
  gotoTrainingMaterials,
} from "../adoption/w7g-helpers";

const OUT = "docs/screenshots/wave7";
const SIZES = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "2560x1440", width: 2560, height: 1440 },
  { name: "3840x2160", width: 3840, height: 2160 },
] as const;

type Prepare = (page: Page) => Promise<void>;

const SURFACES: { slug: string; prepare: Prepare; skip?: boolean }[] = [
  { slug: "01-implementation", prepare: gotoImplementation },
  {
    slug: "02-implementation-asis-tobe",
    prepare: async (page) => {
      await gotoImplementation(page);
      const map = page.getByTestId("asis-tobe-map");
      await map.scrollIntoViewIfNeeded();
      await expect(map).toBeVisible();
    },
  },
  { slug: "03-personas", prepare: gotoPersonas },
  {
    slug: "04-personas-training-matrix",
    prepare: async (page) => {
      await gotoPersonas(page);
      const matrix = page.getByText("Training Matrix — המטריצה הקנונית");
      await matrix.scrollIntoViewIfNeeded();
      await expect(matrix).toBeVisible();
    },
  },
  {
    slug: "05-stage-gates-evidence",
    prepare: async (page) => {
      await gotoStageGates(page);
      // select G1 and open its first attached evidence in the viewer
      await page.getByRole("button", { name: "שער G1 — מוכנות" }).click();
      const chip = page.getByRole("button", { name: /הצג ראיה/ }).first();
      await expect(chip).toBeVisible({ timeout: 15_000 });
      await chip.click();
      await page.waitForTimeout(300);
    },
  },
  { slug: "06-training-materials", prepare: gotoTrainingMaterials },
  {
    slug: "07-training-materials-preview",
    prepare: async (page) => {
      await gotoTrainingMaterials(page);
      await page.getByRole("button", { name: /פתיחת תצוגה מקדימה:/ }).first().click();
      await expect(page.getByRole("dialog").first()).toBeVisible();
      await page.waitForTimeout(300);
    },
  },
  { slug: "08-quick-start", prepare: gotoQuickStart },
  { slug: "09-faq", prepare: gotoFaq },
  // S13.1 "Product V2 context-rail reduction" removed the permanent rail from /faq, and the
  // LACE conversation simulator is a rail-ONLY surface — there is no longer a screen state to
  // capture here. The "09-faq" surface above still covers the page itself. Restore this entry
  // if the rail is brought back for /faq.
  {
    slug: "10-faq-lace-simulator",
    skip: true,
    prepare: async (page) => {
      await gotoFaq(page);
      await page
        .locator("#sim-response")
        .fill("אני מבין למה זה מדאיג — בוא נבדוק יחד את הראיות במסך השערים.");
      await page.getByRole("button", { name: "בדיקת הנוסח" }).click();
      await expect(page.getByText(/רמת ביטחון:/)).toBeVisible({ timeout: 10_000 });
    },
  },
  { slug: "11-submission", prepare: gotoSubmission },
  {
    slug: "12-submission-quality-blockers",
    prepare: async (page) => {
      await gotoSubmission(page);
      await page.getByRole("tab", { name: "מטריצת איכות 12×8" }).click();
      await expect(page.locator("table").first()).toBeVisible();
    },
  },
  {
    slug: "13-presentation-overview",
    prepare: async (page) => {
      await page.goto("/submission/presentation");
      await expect(page.getByTestId("presentation-overview")).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    slug: "14-presentation-present-timer",
    prepare: async (page) => {
      await page.goto("/submission/presentation");
      await expect(page.getByTestId("presentation-overview")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("start-presentation").click();
      await expect(page.getByTestId("present-mode")).toBeVisible();
      await expect(page.getByTestId("countdown")).toBeVisible();
    },
  },
  {
    slug: "15-presentation-presenter-notes",
    prepare: async (page) => {
      await page.goto("/submission/presentation");
      await expect(page.getByTestId("presentation-overview")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("start-presentation").click();
      await expect(page.getByTestId("present-mode")).toBeVisible();
      await page.keyboard.press("KeyN");
      await expect(page.getByTestId("notes-drawer")).toBeVisible();
    },
  },
  {
    slug: "16-presentation-backup-mode",
    prepare: async (page) => {
      await page.goto("/submission/presentation");
      await expect(page.getByTestId("presentation-overview")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("start-presentation").click();
      await expect(page.getByTestId("present-mode")).toBeVisible();
      await page.keyboard.press("KeyB");
      await expect(page.getByTestId("backup-view")).toBeVisible();
    },
  },
];

for (const surface of SURFACES) {
  for (const size of SIZES) {
    const run = surface.skip === true ? test.skip : test;
    run(`${surface.slug} @ ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await surface.prepare(page);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${surface.slug}-${size.name}.png` });
    });
  }
}
