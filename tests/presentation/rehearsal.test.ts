// W7-F — rehearsal is a REAL measurement: seconds derive from actual clock
// deltas, land on the section record, and can never be fabricated (invalid
// values are refused; nothing is written for an unknown section).
import { describe, expect, it } from "vitest";
import {
  beginRehearsalSection,
  clearRehearsalMeasurements,
  recordRehearsalSeconds,
  rehearsalSeconds,
} from "@/presentation";
import { freshBootstrapped } from "./helpers";

describe("rehearsal measurement", () => {
  it("rehearsalSeconds measures the actual clock delta (rounded, min 1s)", () => {
    const run = beginRehearsalSection("ps-2", 10_000);
    expect(rehearsalSeconds(run, 10_000 + 117_400)).toBe(117);
    expect(rehearsalSeconds(run, 10_000 + 117_600)).toBe(118);
    // a sub-second pass still records honestly as 1 second, never 0
    expect(rehearsalSeconds(run, 10_200)).toBe(1);
  });

  it("recordRehearsalSeconds persists the measured value + timestamp on the section", async () => {
    const { stores, clock } = await freshBootstrapped();
    const before = await stores.sections.get("ps-3");
    expect(before?.timing.actualRehearsalSeconds).toBeNull();
    await recordRehearsalSeconds(stores, "ps-3", 131, clock);
    const after = await stores.sections.get("ps-3");
    expect(after?.timing.actualRehearsalSeconds).toBe(131);
    expect(after?.timing.lastRehearsedAt).not.toBeNull();
    // target untouched
    expect(after?.timing.targetSeconds).toBe(120);
  });

  it("refuses fabricated/invalid measurements and unknown sections", async () => {
    const { stores, clock } = await freshBootstrapped();
    await expect(recordRehearsalSeconds(stores, "ps-1", 0, clock)).rejects.toThrow();
    await expect(recordRehearsalSeconds(stores, "ps-1", -5, clock)).rejects.toThrow();
    await expect(recordRehearsalSeconds(stores, "ps-1", Number.NaN, clock)).rejects.toThrow();
    await expect(recordRehearsalSeconds(stores, "ps-9", 100, clock)).rejects.toThrow();
    const untouched = await stores.sections.get("ps-1");
    expect(untouched?.timing.actualRehearsalSeconds).toBeNull();
  });

  it("clearRehearsalMeasurements resets only measured sections back to טרם נמדד", async () => {
    const { stores, clock } = await freshBootstrapped();
    await recordRehearsalSeconds(stores, "ps-1", 100, clock);
    await recordRehearsalSeconds(stores, "ps-2", 140, clock);
    const cleared = await clearRehearsalMeasurements(stores, clock);
    expect(cleared).toBe(2);
    for (const s of await stores.sections.list()) {
      expect(s.timing.actualRehearsalSeconds).toBeNull();
    }
  });
});
