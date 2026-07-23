// W7-A — AS-IS/TO-BE map (Phase 7.3): exact mandated counts (5/7/6/5),
// no-overlap layout math for the 16:9 presentation frame, all three views
// render, and the print stylesheet carries the A4 light-mode rules.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AsIsToBe } from "@/modules/implementation/AsIsToBe";
import {
  AS_IS_STEPS,
  FORBIDDEN_AI_ITEMS,
  HUMAN_RESPONSIBILITY_ITEMS,
  PRESENTATION_HEIGHT,
  PRESENTATION_WIDTH,
  TO_BE_STEPS,
  computeMapLayout,
  rectanglesOverlap,
} from "@/modules/implementation/asIsToBeContent";

afterEach(cleanup);

describe("mandated content — exact counts", () => {
  it("has exactly 5 AS-IS steps and 7 TO-BE steps", () => {
    expect(AS_IS_STEPS).toHaveLength(5);
    expect(TO_BE_STEPS).toHaveLength(7);
  });

  it("has exactly 6 human-responsibility items and 5 forbidden-to-AI items", () => {
    expect(HUMAN_RESPONSIBILITY_ITEMS).toHaveLength(6);
    expect(FORBIDDEN_AI_ITEMS).toHaveLength(5);
  });

  it("TO-BE marks AI points with ◆ and keeps the human approval step unmarked", () => {
    expect(TO_BE_STEPS.filter((s) => s.startsWith("◆")).length).toBeGreaterThanOrEqual(4);
    expect(TO_BE_STEPS.some((s) => s.includes("HITL"))).toBe(true);
  });
});

describe("computeMapLayout — fixed layout math (no overlapping boxes)", () => {
  it("lays out 5 + 7 step boxes and 2 panels inside the 16:9 frame", () => {
    const rects = computeMapLayout();
    expect(rects.filter((r) => r.band === "as-is")).toHaveLength(5);
    expect(rects.filter((r) => r.band === "to-be")).toHaveLength(7);
    expect(rects.filter((r) => r.band === "human")).toHaveLength(1);
    expect(rects.filter((r) => r.band === "forbidden")).toHaveLength(1);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(PRESENTATION_WIDTH);
      expect(r.y + r.height).toBeLessThanOrEqual(PRESENTATION_HEIGHT);
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
    }
  });

  it("NO pair of boxes overlaps", () => {
    const rects = computeMapLayout();
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i];
        const b = rects[j];
        if (!a || !b) continue;
        expect(rectanglesOverlap(a, b), `${a.band}#${a.index} overlaps ${b.band}#${b.index}`).toBe(
          false,
        );
      }
    }
  });

  it("RTL ordering: step 1 of each row sits at the right edge", () => {
    const rects = computeMapLayout();
    const asIs = rects.filter((r) => r.band === "as-is").sort((a, b) => a.index - b.index);
    expect(asIs[0] && asIs[1] && asIs[0].x > asIs[1].x).toBe(true);
  });
});

describe("rendering — app / print / presentation", () => {
  it("app view renders every step and both boundary panels", () => {
    render(<AsIsToBe view="app" />);
    for (const step of AS_IS_STEPS) expect(screen.getByText(step)).toBeTruthy();
    for (const step of TO_BE_STEPS) expect(screen.getByText(step)).toBeTruthy();
    expect(screen.getByTestId("atb-panel-human")).toBeTruthy();
    expect(screen.getByTestId("atb-panel-forbidden")).toBeTruthy();
    for (const item of HUMAN_RESPONSIBILITY_ITEMS) expect(screen.getByText(item)).toBeTruthy();
    for (const item of FORBIDDEN_AI_ITEMS) expect(screen.getByText(item)).toBeTruthy();
  });

  it("print view renders the same flow markup + an @media print A4 stylesheet", () => {
    const { container } = render(<AsIsToBe view="print" />);
    const style = container.querySelector("style")?.textContent ?? "";
    expect(style).toContain("@media print");
    expect(style).toContain("size: A4 portrait");
    expect(style).toContain("#fff"); // light print background (spec-mandated)
    expect(screen.getByTestId("atb-step-asis-1")).toBeTruthy();
  });

  it("presentation view renders the fixed 16:9 frame with all content", () => {
    render(<AsIsToBe view="presentation" />);
    const frame = screen.getByTestId("atb-presentation");
    expect(frame).toBeTruthy();
    for (const step of TO_BE_STEPS) expect(screen.getByText(step)).toBeTruthy();
  });
});
