// W8-C — shared fixtures: deterministic clock, fresh factory-backed stores
// (InMemory in jsdom), in-memory emergency-flag port (no localStorage).
import { __resetRepositoriesForTests } from "@/repositories";
import { agentStores } from "@/repositories/agentStores";
import { roleStores } from "@/repositories/roleStores";
import { userStores } from "@/repositories/userStores";
import { AdministrationService, type EmergencyFlagPort } from "@/administration";
import type { EmergencyFlagKind } from "@/administration";

/** Deterministic clock: each call advances by stepMs (default 10ms). */
export function makeClock(startISO = "2026-07-23T09:00:00.000Z", stepMs = 10): () => string {
  let t = Date.parse(startISO);
  return () => {
    const iso = new Date(t).toISOString();
    t += stepMs;
    return iso;
  };
}

export interface MemFlags extends EmergencyFlagPort {
  map: Map<EmergencyFlagKind, boolean>;
}

/** In-memory flag port — tests never touch localStorage. */
export function memFlags(): MemFlags {
  const map = new Map<EmergencyFlagKind, boolean>();
  return {
    map,
    isActive: (kind) => map.get(kind) === true,
    set: (kind, active) => {
      map.set(kind, active);
    },
  };
}

export interface Fixture {
  service: AdministrationService;
  flags: MemFlags;
  stores: ReturnType<typeof userStores>;
  roles: ReturnType<typeof roleStores>;
  agents: ReturnType<typeof agentStores>;
}

/** Fresh factory state + service per test. */
export function freshFixture(): Fixture {
  __resetRepositoriesForTests();
  const flags = memFlags();
  const stores = userStores();
  const roles = roleStores();
  const agents = agentStores();
  const service = new AdministrationService({
    stores,
    roles,
    agentStores: agents,
    clock: makeClock(),
    flags,
  });
  return { service, flags, stores, roles, agents };
}
