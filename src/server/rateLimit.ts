// TERAGON AI BUSINESS OS — rate limiting + concurrency gate (Wave 5, W5-B).
//
// HONEST SERVERLESS CAVEAT (documented, not hidden): this limiter is in-memory
// per function INSTANCE. Netlify may run several instances concurrently and
// recycle them between invocations, so the effective global limit can be
// higher than configured and counters reset on cold start. It still stops
// per-instance runaway loops and abusive bursts. A shared store (e.g. Redis /
// Netlify Blobs) is required for a strict global limit — see
// docs/AI_SERVER_SECURITY.md and docs/integration-requests-w5b.md.

export interface RateDecision {
  allowed: boolean;
  /** which key tripped, when blocked */
  limitedBy: string | null;
  /** ms until the oldest counted hit leaves the window (when blocked) */
  retryAfterMs: number;
}

const WINDOW_MS = 60_000;
const PRUNE_EVERY = 64;

/** Sliding one-minute window over per-key hit timestamps, with periodic prune. */
export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly limitPerMinute: number;
  private opsSincePrune = 0;

  constructor(limitPerMinute: number) {
    this.limitPerMinute = Math.max(1, Math.floor(limitPerMinute));
  }

  /** Check ALL keys first; record the hit only when every key allows it. */
  check(keys: readonly string[], nowMs: number): RateDecision {
    this.maybePrune(nowMs);
    const cutoff = nowMs - WINDOW_MS;
    for (const key of keys) {
      const stamps = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
      this.hits.set(key, stamps);
      if (stamps.length >= this.limitPerMinute) {
        const oldest = stamps[0] ?? nowMs;
        return { allowed: false, limitedBy: key, retryAfterMs: Math.max(0, oldest - cutoff) };
      }
    }
    for (const key of keys) {
      const stamps = this.hits.get(key) ?? [];
      stamps.push(nowMs);
      this.hits.set(key, stamps);
    }
    return { allowed: true, limitedBy: null, retryAfterMs: 0 };
  }

  /** periodic prune so the Map cannot grow unbounded across invocations */
  private maybePrune(nowMs: number): void {
    this.opsSincePrune += 1;
    if (this.opsSincePrune < PRUNE_EVERY) return;
    this.opsSincePrune = 0;
    const cutoff = nowMs - WINDOW_MS;
    for (const [key, stamps] of this.hits) {
      const kept = stamps.filter((t) => t > cutoff);
      if (kept.length === 0) this.hits.delete(key);
      else this.hits.set(key, kept);
    }
  }

  /** test/inspection helper */
  size(): number {
    return this.hits.size;
  }
}

/** rate-limit keys: per-session AND per-user (both must be under the limit) */
export function rateKeys(organizationId: string, userId: string, sessionId: string): string[] {
  return [`user:${organizationId}:${userId}`, `session:${sessionId}`];
}

/** Simple concurrency gate — same per-instance caveat as the rate limiter. */
export class ConcurrencyGate {
  private inFlight = 0;
  private readonly max: number;

  constructor(maxConcurrent: number) {
    this.max = Math.max(1, Math.floor(maxConcurrent));
  }

  /** true = slot acquired (caller MUST release in finally) */
  tryAcquire(): boolean {
    if (this.inFlight >= this.max) return false;
    this.inFlight += 1;
    return true;
  }

  release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  current(): number {
    return this.inFlight;
  }
}
