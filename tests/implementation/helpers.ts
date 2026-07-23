// Shared fixtures for the W7-A implementation-programme tests: deterministic
// clock, fresh factory-backed stores (InMemory in jsdom — pre-seeded with the
// canonical seed, incl. users and implementationStages).
import { __resetRepositoriesForTests } from "@/repositories";
import {
  implementationStores,
  type ImplementationStores,
} from "@/repositories/implementationStores";
import {
  ensureImplementationProgramme,
  PROGRAMME_ID,
} from "@/domain/adoption/bootstrap";
import type { ImplementationProgramme } from "@/domain/adoption/types";

export const NOW = "2026-07-23T12:00:00.000Z";
export const TODAY = NOW.slice(0, 10);

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
  stores: ImplementationStores;
  clock: () => string;
}

/** Fresh everything per test — factory reset ⇒ seeded base + empty W7 collections. */
export function fresh(): Fixture {
  __resetRepositoriesForTests();
  return { stores: implementationStores(), clock: makeClock() };
}

/** fresh() + bootstrap run once — returns the created programme. */
export async function freshBootstrapped(): Promise<Fixture & { programme: ImplementationProgramme }> {
  const fx = fresh();
  await ensureImplementationProgramme(fx.stores, fx.clock);
  const programme = await fx.stores.programmes.get(PROGRAMME_ID);
  if (!programme) throw new Error("bootstrap did not create the programme");
  return { ...fx, programme };
}
