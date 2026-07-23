// W5-B budget.ts — measured-only accounting + day rollover.
import { describe, expect, it } from "vitest";
import { DailyBudgetLedger } from "@/server/budget";

const DAY1 = Date.UTC(2026, 6, 23, 10);
const DAY2 = Date.UTC(2026, 6, 24, 10);

describe("DailyBudgetLedger", () => {
  it("unmeasured usage counts REQUESTS (1 unit), never invented tokens", () => {
    const ledger = new DailyBudgetLedger(2);
    ledger.record(DAY1, { measured: false });
    const status = ledger.status(DAY1);
    expect(status.unmeasuredRequestUnits).toBe(1);
    expect(status.measuredTokenUnits).toBe(0);
    expect(status.exceeded).toBe(false);
  });

  it("measured usage counts the reported tokens", () => {
    const ledger = new DailyBudgetLedger(1_000);
    ledger.record(DAY1, { measured: true, totalTokens: 600 });
    ledger.record(DAY1, { measured: true, totalTokens: 500 });
    const status = ledger.status(DAY1);
    expect(status.measuredTokenUnits).toBe(1100);
    expect(status.exceeded).toBe(true);
  });

  it("limit 0 ⇒ no budget configured ⇒ never exceeded", () => {
    const ledger = new DailyBudgetLedger(0);
    for (let i = 0; i < 50; i += 1) ledger.record(DAY1, { measured: false });
    expect(ledger.status(DAY1).exceeded).toBe(false);
  });

  it("resets on day rollover", () => {
    const ledger = new DailyBudgetLedger(1);
    ledger.record(DAY1, { measured: false });
    expect(ledger.status(DAY1).exceeded).toBe(true);
    expect(ledger.status(DAY2).exceeded).toBe(false);
    expect(ledger.status(DAY2).spentUnits).toBe(0);
  });
});
