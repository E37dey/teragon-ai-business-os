// Gate S7.0 — stage tracker + retry/recovery: only masked metadata is recorded,
// completed idempotent steps are detected, retry never duplicates.
import { describe, expect, it } from "vitest";
import { mask, FORWARD_ORDER } from "../../scripts/platform/shared/stage.mjs";
import { memoryStage } from "./fakes";

describe("stage mask — only safe metadata is persisted", () => {
  it("masks refs/ids to a short prefix", () => {
    expect(mask("abcdefghijkl")).toBe("abcdef…(12)");
    expect(mask("ab")).toBe("ab…");
    expect(mask("")).toBeNull();
  });

  it("state file never contains a full ref (masked only)", () => {
    const { tracker, store } = memoryStage();
    tracker.markComplete("PROJECT_READY", { project: { refMask: mask("supersecretref123") } });
    expect(store.text).toBeTruthy();
    expect(store.text).not.toContain("supersecretref123");
    expect(store.text).toContain("supers…");
  });
});

describe("retry / recovery", () => {
  it("detects a completed step so a rerun skips it (no duplicate)", () => {
    const { tracker } = memoryStage();
    tracker.markComplete("PROJECT_READY");
    expect(tracker.completed("PROJECT_READY")).toBe(true);
    expect(tracker.completed("MIGRATIONS_APPLIED")).toBe(false);
  });

  it("records forward states in order and marks completed set idempotently", () => {
    const { tracker } = memoryStage();
    tracker.markComplete("PROJECT_READY");
    tracker.markComplete("PROJECT_READY"); // idempotent — no duplicate entry
    const st = tracker.read();
    expect(st.completed.filter((s: string) => s === "PROJECT_READY")).toHaveLength(1);
    expect(FORWARD_ORDER).toContain("ACCEPTANCE_PASSED");
  });

  it("fail() records a FAILED state without losing completed steps", () => {
    const { tracker } = memoryStage();
    tracker.markComplete("PROJECT_READY");
    tracker.fail("boom");
    const st = tracker.read();
    expect(st.state).toBe("FAILED");
    expect(st.completed).toContain("PROJECT_READY");
  });
});
