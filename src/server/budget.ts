// TERAGON AI BUSINESS OS — daily org budget (Wave 5, W5-B).
//
// MEASURED-ONLY ACCOUNTING (honesty rule): we never invent token counts.
// - When the provider reports usage (usage.measured=true with totalTokens),
//   we account the measured tokens.
// - When usage is UNMEASURED (rules/test adapters, missing provider usage),
//   we account 1 unit per REQUEST — requests are countable facts; tokens that
//   were never reported are not.
// The two unit kinds are tracked separately and both count against the daily
// limit; the ledger discloses which kind dominated. dailyBudget=0 ⇒ no budget
// configured ⇒ never blocks (and health never claims "מגבלת תקציב").
//
// SERVERLESS CAVEAT: per-instance in-memory ledger — same honesty note as
// rateLimit.ts; a strict global budget needs a shared store.

export interface BudgetStatus {
  /** true when a budget is configured AND spent ≥ limit */
  exceeded: boolean;
  limit: number;
  spentUnits: number;
  measuredTokenUnits: number;
  unmeasuredRequestUnits: number;
  day: string;
}

function dayKeyOf(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export class DailyBudgetLedger {
  private readonly limit: number;
  private day = "";
  private measuredTokens = 0;
  private unmeasuredRequests = 0;

  /** limit ≤ 0 ⇒ no budget configured (never blocks) */
  constructor(limit: number) {
    this.limit = Number.isFinite(limit) && limit > 0 ? limit : 0;
  }

  private roll(nowMs: number): void {
    const day = dayKeyOf(nowMs);
    if (day !== this.day) {
      this.day = day;
      this.measuredTokens = 0;
      this.unmeasuredRequests = 0;
    }
  }

  status(nowMs: number): BudgetStatus {
    this.roll(nowMs);
    const spent = this.measuredTokens + this.unmeasuredRequests;
    return {
      exceeded: this.limit > 0 && spent >= this.limit,
      limit: this.limit,
      spentUnits: spent,
      measuredTokenUnits: this.measuredTokens,
      unmeasuredRequestUnits: this.unmeasuredRequests,
      day: this.day,
    };
  }

  /** Record completed work. Call AFTER the provider returned. */
  record(nowMs: number, usage: { measured: boolean; totalTokens?: number }): void {
    this.roll(nowMs);
    if (usage.measured && typeof usage.totalTokens === "number" && usage.totalTokens >= 0) {
      this.measuredTokens += usage.totalTokens;
    } else {
      this.unmeasuredRequests += 1;
    }
  }
}
