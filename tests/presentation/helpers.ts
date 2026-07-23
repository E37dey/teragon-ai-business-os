// Shared fixtures for the W7-F presentation tests: deterministic clock and
// fresh factory-backed stores (InMemory in jsdom — pre-seeded with the
// canonical seed; the presentation collections start empty by design).
import { __resetRepositoriesForTests } from "@/repositories";
import { presentationStores, type PresentationStores } from "@/presentation/stores";
import { ensurePresentationContent } from "@/presentation/bootstrap";
import { ensureDemoSteps } from "@/presentation/demoMode";

export const NOW = "2026-07-23T12:00:00.000Z";

/** Deterministic clock: each call advances by stepMs (default 10ms). */
export function makeClock(startISO = NOW, stepMs = 10): () => string {
  let t = Date.parse(startISO);
  return () => {
    const iso = new Date(t).toISOString();
    t += stepMs;
    return iso;
  };
}

export interface Fixture {
  stores: PresentationStores;
  clock: () => string;
}

/** Fresh everything per test — factory reset ⇒ seeded base + empty W7-F collections. */
export function fresh(): Fixture {
  __resetRepositoriesForTests();
  try {
    sessionStorage.clear();
  } catch {
    // non-browser environments
  }
  return { stores: presentationStores(), clock: makeClock() };
}

/** fresh() + both idempotent bootstraps (sections+notes and demo steps). */
export async function freshBootstrapped(): Promise<Fixture> {
  const fx = fresh();
  await ensurePresentationContent(fx.stores, fx.clock);
  await ensureDemoSteps(fx.stores, fx.clock);
  return fx;
}
