// W7-D — Microlearning concept guards (7.13): 6 segments, 90 seconds, honest label.
import { describe, expect, it } from "vitest";
import {
  MICROLEARNING_CHECK_AI,
  MICROLEARNING_CONCEPT_LABEL,
} from "@/domain/training-materials";

describe("Microlearning concept — איך בודקים המלצת AI לפני אישור (7.13)", () => {
  it("has exactly 6 segments with the mandated boundaries", () => {
    expect(MICROLEARNING_CHECK_AI.segments).toHaveLength(6);
    expect(MICROLEARNING_CHECK_AI.segments.map((s) => [s.fromSec, s.toSec])).toEqual([
      [0, 10],
      [10, 25],
      [25, 45],
      [45, 60],
      [60, 75],
      [75, 90],
    ]);
  });

  it("segment timing is contiguous and sums to exactly 90 seconds", () => {
    let cursor = 0;
    let total = 0;
    for (const seg of MICROLEARNING_CHECK_AI.segments) {
      expect(seg.fromSec).toBe(cursor);
      total += seg.toSec - seg.fromSec;
      cursor = seg.toSec;
    }
    expect(total).toBe(90);
    expect(MICROLEARNING_CHECK_AI.totalSec).toBe(90);
  });

  it("every segment carries storyboard, narration, on-screen text, action and a success question", () => {
    for (const seg of MICROLEARNING_CHECK_AI.segments) {
      expect(seg.storyboard.length, `storyboard @${seg.fromSec}`).toBeGreaterThan(10);
      expect(seg.narration.length, `narration @${seg.fromSec}`).toBeGreaterThan(10);
      expect(seg.onScreenText.length, `onScreenText @${seg.fromSec}`).toBeGreaterThan(3);
      expect(seg.screenAction.length, `screenAction @${seg.fromSec}`).toBeGreaterThan(10);
      expect(seg.successQuestion.length, `successQuestion @${seg.fromSec}`).toBeGreaterThan(5);
      expect(seg.successQuestion).toContain("?");
    }
  });

  it("is labeled EXACTLY as a concept — no fake video claim", () => {
    expect(MICROLEARNING_CHECK_AI.label).toBe("קונספט ותסריט Microlearning");
    expect(MICROLEARNING_CHECK_AI.label).toBe(MICROLEARNING_CONCEPT_LABEL);
    expect(MICROLEARNING_CHECK_AI.productionStatus).toBe("קונספט בלבד — לא הופק וידאו");
  });

  it("accessibility transcript covers every segment's narration and on-screen text", () => {
    for (const seg of MICROLEARNING_CHECK_AI.segments) {
      expect(MICROLEARNING_CHECK_AI.accessibilityTranscript).toContain(seg.onScreenText);
    }
    expect(MICROLEARNING_CHECK_AI.accessibilityTranscript.length).toBeGreaterThan(500);
  });

  it("thumbnail is declared HTML data — not an image claim", () => {
    expect(MICROLEARNING_CHECK_AI.thumbnail.titleHe.length).toBeGreaterThan(0);
    expect(MICROLEARNING_CHECK_AI.thumbnail.subtitleHe.length).toBeGreaterThan(0);
  });
});
