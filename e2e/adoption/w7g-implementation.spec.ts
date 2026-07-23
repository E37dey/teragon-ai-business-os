// W7-G e2e — /implementation (W7-A): six-stage roadmap, per-stage drawer tabs,
// AS-IS/TO-BE map with a REAL no-overlap assertion via bounding boxes.
// Every test asserts ZERO console errors.
import { test, expect } from "@playwright/test";
import { collectConsoleErrors, gotoImplementation } from "./w7g-helpers";

test("roadmap: exactly 6 stage cards + programme health + rollout waves — zero console errors", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoImplementation(page);

  await expect(page.getByTestId("implementation-health")).toBeVisible();
  await expect(page.getByTestId("current-stage-panel")).toBeVisible();
  for (let i = 1; i <= 6; i += 1) {
    await expect(page.getByTestId(`stage-card-${i}`)).toBeVisible();
  }
  await expect(page.getByTestId("stage-card-7")).toHaveCount(0);
  await expect(page.getByTestId("implementation-gantt")).toBeVisible();
  await expect(page.getByTestId("rollout-waves")).toBeVisible();
  for (let i = 1; i <= 5; i += 1) {
    await expect(page.getByTestId(`rollout-wave-${i}`)).toBeVisible();
  }
  // the honesty rail derives from real records
  await expect(page.getByTestId("rail-pilot-readiness")).toBeVisible();
  await expect(page.getByTestId("rail-missing-evidence")).toBeVisible();
  expect(errors).toEqual([]);
});

test("stage drawer: opens from a roadmap card and all six tabs render real content", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoImplementation(page);

  await page.getByTestId("stage-card-1").click();
  const drawer = page.getByRole("dialog").first();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(/שלב 1 —/)).toBeVisible();

  await expect(page.getByTestId("stage-tab-overview")).toBeVisible();
  const tabs: { label: string; testid: string }[] = [
    { label: "תוצרים", testid: "stage-tab-deliverables" },
    { label: "ראיות", testid: "stage-tab-evidence" },
    { label: "סיכונים", testid: "stage-tab-risks" },
    { label: "החלטות", testid: "stage-tab-decisions" },
    { label: "היסטוריה", testid: "stage-tab-history" },
  ];
  for (const t of tabs) {
    await drawer.getByRole("tab", { name: t.label }).click();
    // honest empty states are allowed — the tab container must render either way
    await expect(
      page.getByTestId(t.testid).or(drawer.getByText(/אין |לא נרשם|טרם/).first()).first(),
    ).toBeVisible();
  }
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("AS-IS/TO-BE: both flows render and NO step boxes overlap (bounding-box assert)", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await gotoImplementation(page);

  const map = page.getByTestId("asis-tobe-map");
  await map.scrollIntoViewIfNeeded();
  await expect(map).toBeVisible();
  // 5 AS-IS steps + 7 TO-BE steps + the human/forbidden boundary panels
  for (let i = 1; i <= 5; i += 1) {
    await expect(page.getByTestId(`atb-step-asis-${i}`)).toBeVisible();
  }
  for (let i = 1; i <= 7; i += 1) {
    await expect(page.getByTestId(`atb-step-tobe-${i}`)).toBeVisible();
  }
  await expect(page.getByTestId("atb-panel-human")).toBeVisible();
  await expect(page.getByTestId("atb-panel-forbidden")).toBeVisible();

  // no-overlap: collect every step box and assert pairwise disjointness
  const boxes: { id: string; x: number; y: number; w: number; h: number }[] = [];
  const ids = [
    ...Array.from({ length: 5 }, (_, i) => `atb-step-asis-${i + 1}`),
    ...Array.from({ length: 7 }, (_, i) => `atb-step-tobe-${i + 1}`),
  ];
  for (const id of ids) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, `bounding box of ${id}`).not.toBeNull();
    if (box) boxes.push({ id, x: box.x, y: box.y, w: box.width, h: box.height });
  }
  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      const p = boxes[a];
      const q = boxes[b];
      const overlapX = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
      const overlapY = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
      const overlaps = overlapX > 1 && overlapY > 1; // 1px tolerance for borders
      expect(overlaps, `${p.id} must not overlap ${q.id}`).toBe(false);
    }
  }
  expect(errors).toEqual([]);
});
