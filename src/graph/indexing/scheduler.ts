// TERAGON Business Graph — indexing scheduler abstraction (Phase 5).
// ---------------------------------------------------------------------------
// The coordinator NEVER calls `Date.now` or `setTimeout` directly. It defers
// processing and retry-backoff through an INJECTED scheduler so tests can drive
// time and task execution deterministically (no real sleeps). Production wires the
// microtask-based default; tests wire a manual driver.
export interface GraphIndexingScheduler {
  /** Enqueue a task to run "soon" (a coalescing point the driver can drain). */
  enqueue(task: () => Promise<void>): void;
  /** Enqueue a task to run after a logical delay (deterministic retry backoff). */
  enqueueAfter(delayMs: number, task: () => Promise<void>): void;
}

/**
 * The default production scheduler: `enqueue` runs on a microtask, `enqueueAfter`
 * uses a real timer. Errors are swallowed so a background rebuild can never break
 * the caller — the coordinator already records failures durably.
 */
export class MicrotaskIndexingScheduler implements GraphIndexingScheduler {
  enqueue(task: () => Promise<void>): void {
    void Promise.resolve().then(task).catch(() => undefined);
  }

  enqueueAfter(delayMs: number, task: () => Promise<void>): void {
    setTimeout(() => {
      void task().catch(() => undefined);
    }, delayMs);
  }
}
