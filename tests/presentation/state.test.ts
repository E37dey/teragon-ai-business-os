// W7-F — session-state persistence: the demo-link round trip resumes the
// exact section and timers; corrupted storage degrades to null (never throws);
// the return flag drives the floating "חזרה למצגת" control.
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPresentationReturn,
  clearPresentationState,
  hasPresentationReturn,
  loadPresentationState,
  markPresentationReturn,
  PRESENTATION_STATE_KEY,
  savePresentationState,
  type PresentationSessionState,
} from "@/presentation";

const SAMPLE: PresentationSessionState = {
  mode: "present",
  sectionIndex: 3,
  overallAccumulatedMs: 250_000,
  sectionAccumulatedMs: 40_000,
  timerWasRunning: true,
  notesOpen: true,
  backupOpen: false,
  rehearsalActive: false,
  savedAt: "2026-07-23T12:00:00.000Z",
};

beforeEach(() => {
  sessionStorage.clear();
});

describe("presentation session state", () => {
  it("save → load round-trips the full state", () => {
    savePresentationState(SAMPLE);
    expect(loadPresentationState()).toEqual(SAMPLE);
  });

  it("clear removes it; empty storage loads null", () => {
    savePresentationState(SAMPLE);
    clearPresentationState();
    expect(loadPresentationState()).toBeNull();
  });

  it("corrupted / wrong-shaped JSON degrades to null (never throws)", () => {
    sessionStorage.setItem(PRESENTATION_STATE_KEY, "{not json");
    expect(loadPresentationState()).toBeNull();
    sessionStorage.setItem(PRESENTATION_STATE_KEY, JSON.stringify({ mode: "nope" }));
    expect(loadPresentationState()).toBeNull();
    sessionStorage.setItem(PRESENTATION_STATE_KEY, JSON.stringify({ mode: "present" }));
    expect(loadPresentationState()).toBeNull();
  });

  it("section index is clamped into 0..4 on load", () => {
    savePresentationState({ ...SAMPLE, sectionIndex: 99 });
    expect(loadPresentationState()?.sectionIndex).toBe(4);
    savePresentationState({ ...SAMPLE, sectionIndex: -2 });
    expect(loadPresentationState()?.sectionIndex).toBe(0);
  });
});

describe("the return flag (floating חזרה למצגת)", () => {
  it("mark → has → clear lifecycle", () => {
    expect(hasPresentationReturn()).toBe(false);
    markPresentationReturn();
    expect(hasPresentationReturn()).toBe(true);
    clearPresentationReturn();
    expect(hasPresentationReturn()).toBe(false);
  });
});
