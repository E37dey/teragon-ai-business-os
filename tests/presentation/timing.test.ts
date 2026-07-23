// W7-F — pure timing engine: pausable stopwatch, 10-minute countdown,
// over-target warning logic, rehearsal verdicts and clock formatting.
import { describe, expect, it } from "vitest";
import {
  countdownExpired,
  countdownRemainingMs,
  elapsedMs,
  elapsedSeconds,
  formatClock,
  pauseTimer,
  rehearsalVerdict,
  startTimer,
  timerFromAccumulated,
  timingVerdict,
  toggleTimer,
  TIMER_ZERO,
  PRESENTATION_TOTAL_TARGET_MS,
} from "@/presentation";

const T0 = 1_000_000;

describe("timer snapshot engine (pure, injected now)", () => {
  it("start → elapsed grows; pause freezes; resume continues", () => {
    let t = startTimer(TIMER_ZERO, T0);
    expect(elapsedMs(t, T0 + 5_000)).toBe(5_000);
    t = pauseTimer(t, T0 + 5_000);
    expect(t.running).toBe(false);
    expect(elapsedMs(t, T0 + 60_000)).toBe(5_000); // frozen while paused
    t = startTimer(t, T0 + 60_000);
    expect(elapsedMs(t, T0 + 62_500)).toBe(7_500);
  });

  it("toggle flips run state; double start/pause are no-ops", () => {
    let t = toggleTimer(TIMER_ZERO, T0);
    expect(t.running).toBe(true);
    expect(startTimer(t, T0 + 999)).toBe(t); // no-op
    t = toggleTimer(t, T0 + 1_000);
    expect(t.running).toBe(false);
    expect(pauseTimer(t, T0 + 2_000)).toBe(t); // no-op
  });

  it("restores from persisted accumulated ms (paused)", () => {
    const t = timerFromAccumulated(42_000);
    expect(t.running).toBe(false);
    expect(elapsedSeconds(t, T0)).toBe(42);
  });

  it("10-minute countdown: remaining clamps at 0 and expiry flips", () => {
    const t = startTimer(TIMER_ZERO, T0);
    expect(countdownRemainingMs(t, T0)).toBe(PRESENTATION_TOTAL_TARGET_MS);
    expect(countdownRemainingMs(t, T0 + 599_000)).toBe(1_000);
    expect(countdownExpired(t, T0 + 599_000)).toBe(false);
    expect(countdownRemainingMs(t, T0 + 601_000)).toBe(0);
    expect(countdownExpired(t, T0 + 600_000)).toBe(true);
  });
});

describe("over-target warning logic", () => {
  it("בתקציב below 80%, מתקרב לחריגה at 80%..100%, חריגה above target", () => {
    expect(timingVerdict(0, 120)).toBe("בתקציב");
    expect(timingVerdict(95, 120)).toBe("בתקציב");
    expect(timingVerdict(96, 120)).toBe("מתקרב לחריגה"); // exactly 80%
    expect(timingVerdict(120, 120)).toBe("מתקרב לחריגה"); // exactly on target
    expect(timingVerdict(121, 120)).toBe("חריגה");
  });

  it("rehearsalVerdict: null ⇒ טרם נמדד; over target ⇒ explicit חריגה with delta", () => {
    expect(rehearsalVerdict(null, 120)).toEqual({ labelHe: "טרם נמדד", over: false });
    const over = rehearsalVerdict(135, 120);
    expect(over.over).toBe(true);
    expect(over.labelHe).toContain("15");
    const under = rehearsalVerdict(110, 120);
    expect(under.over).toBe(false);
    expect(under.labelHe).toContain("110");
  });
});

describe("formatClock", () => {
  it("formats M:SS and never goes negative", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(600)).toBe("10:00");
    expect(formatClock(-5)).toBe("0:00");
  });
});
