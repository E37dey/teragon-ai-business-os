// TERAGON AI BUSINESS OS — pure presentation timing engine (W7-F, 7.22).
// All functions take an explicit `now` (ms) — deterministic in tests. The
// page layer drives it with Date.now() + a 1s interval.
import type { PresentationSection } from "./types";

export const PRESENTATION_TOTAL_TARGET_MS = 600_000; // 10 minutes

/** A pausable stopwatch — accumulated time + optional running segment. */
export interface TimerSnapshot {
  running: boolean;
  /** ms timestamp when the current running segment started (null ⇒ paused) */
  startedAt: number | null;
  /** ms accumulated from completed segments */
  accumulatedMs: number;
}

export const TIMER_ZERO: TimerSnapshot = { running: false, startedAt: null, accumulatedMs: 0 };

export function startTimer(t: TimerSnapshot, now: number): TimerSnapshot {
  if (t.running) return t;
  return { running: true, startedAt: now, accumulatedMs: t.accumulatedMs };
}

export function pauseTimer(t: TimerSnapshot, now: number): TimerSnapshot {
  if (!t.running) return t;
  return { running: false, startedAt: null, accumulatedMs: elapsedMs(t, now) };
}

export function toggleTimer(t: TimerSnapshot, now: number): TimerSnapshot {
  return t.running ? pauseTimer(t, now) : startTimer(t, now);
}

export function resetTimer(): TimerSnapshot {
  return TIMER_ZERO;
}

/** Restore a paused snapshot from persisted accumulated ms. */
export function timerFromAccumulated(accumulatedMs: number): TimerSnapshot {
  return { running: false, startedAt: null, accumulatedMs: Math.max(0, accumulatedMs) };
}

export function elapsedMs(t: TimerSnapshot, now: number): number {
  const runningMs = t.running && t.startedAt !== null ? Math.max(0, now - t.startedAt) : 0;
  return t.accumulatedMs + runningMs;
}

export function elapsedSeconds(t: TimerSnapshot, now: number): number {
  return Math.floor(elapsedMs(t, now) / 1000);
}

/** Remaining ms of the 10-minute countdown (clamped at 0 — never negative). */
export function countdownRemainingMs(t: TimerSnapshot, now: number): number {
  return Math.max(0, PRESENTATION_TOTAL_TARGET_MS - elapsedMs(t, now));
}

/** True once the overall 10 minutes are used up. */
export function countdownExpired(t: TimerSnapshot, now: number): boolean {
  return elapsedMs(t, now) >= PRESENTATION_TOTAL_TARGET_MS;
}

// ---------------------------------------------------------------------------
// over-target warnings
// ---------------------------------------------------------------------------

export type TimingVerdict = "בתקציב" | "מתקרב לחריגה" | "חריגה";

/**
 * Warning logic (tested):
 *   elapsed <  80% of target  → "בתקציב"
 *   80% ≤ elapsed ≤ target    → "מתקרב לחריגה"
 *   elapsed >  target         → "חריגה"
 */
export function timingVerdict(elapsedSec: number, targetSec: number): TimingVerdict {
  if (elapsedSec > targetSec) return "חריגה";
  if (elapsedSec >= targetSec * 0.8) return "מתקרב לחריגה";
  return "בתקציב";
}

/** Rehearsal comparison: measured (or null) vs target → honest verdict text. */
export function rehearsalVerdict(
  actualSeconds: number | null,
  targetSec: number,
): { labelHe: string; over: boolean } {
  if (actualSeconds === null) return { labelHe: "טרם נמדד", over: false };
  const over = actualSeconds > targetSec;
  const delta = Math.abs(actualSeconds - targetSec);
  return over
    ? { labelHe: `חריגה של ${delta} שנ׳ מהיעד`, over: true }
    : { labelHe: `בתוך היעד (${actualSeconds} שנ׳)`, over: false };
}

/** "M:SS" clock text (never negative). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Sum of section targets — must equal 600 (tested via exactly5Sections too). */
export function sumTargetSeconds(sections: readonly PresentationSection[]): number {
  return sections.reduce((sum, s) => sum + s.timing.targetSeconds, 0);
}
