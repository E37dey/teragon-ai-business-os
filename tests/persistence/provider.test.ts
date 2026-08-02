// Gate S4 — provider flag default + lazy-load isolation of the Supabase module.
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  DEFAULT_PERSISTENCE_PROVIDER,
  PERSISTENCE_PROVIDER,
  resolvePersistenceProvider,
} from "@/persistence/provider";

// Replace the Supabase lazy entry with a spy. If the LOCAL path ever reaches it,
// this spy would be called — proving the opposite (never called for LOCAL).
const createSupabaseRepository = vi.fn(() => ({ collection: "customers", fake: true }));
vi.mock("@/persistence/supabase/index", () => ({ createSupabaseRepository }));

describe("persistence provider flag", () => {
  beforeEach(() => createSupabaseRepository.mockClear());

  it("defaults to LOCAL_INDEXEDDB (env unset)", () => {
    expect(DEFAULT_PERSISTENCE_PROVIDER).toBe("LOCAL_INDEXEDDB");
    // No VITE_PERSISTENCE_PROVIDER in the test env ⇒ resolves to LOCAL.
    expect(PERSISTENCE_PROVIDER).toBe("LOCAL_INDEXEDDB");
    expect(resolvePersistenceProvider()).toBe("LOCAL_INDEXEDDB");
  });

  it("only an exact 'SUPABASE' flag opts in; anything else is LOCAL", () => {
    expect(resolvePersistenceProvider("SUPABASE")).toBe("SUPABASE");
    expect(resolvePersistenceProvider("LOCAL_INDEXEDDB")).toBe("LOCAL_INDEXEDDB");
    expect(resolvePersistenceProvider("supabase")).toBe("LOCAL_INDEXEDDB");
    expect(resolvePersistenceProvider("")).toBe("LOCAL_INDEXEDDB");
    expect(resolvePersistenceProvider(null)).toBe("LOCAL_INDEXEDDB");
    expect(resolvePersistenceProvider("garbage")).toBe("LOCAL_INDEXEDDB");
  });

  it("selecting LOCAL never touches the Supabase module; SUPABASE does", async () => {
    const { getPersistenceRepository } = await import("@/persistence/boundary");

    const local = await getPersistenceRepository("customers", "LOCAL_INDEXEDDB");
    expect(local.collection).toBe("customers");
    expect(createSupabaseRepository).not.toHaveBeenCalled(); // proof of isolation

    const remote = await getPersistenceRepository("customers", "SUPABASE");
    expect(createSupabaseRepository).toHaveBeenCalledTimes(1);
    expect(remote).toMatchObject({ fake: true });
  });
});
