// S9.2-A1a — targeted tests for the authenticated async Supabase domain loader.
// Deterministic: the dynamic loader + repository factory are injected fakes; no
// live Supabase, no IndexedDB.
import { describe, it, expect, vi } from "vitest";
import {
  loadSupabaseDomainRepository,
  type SupabaseModuleLike,
  type DomainLoadContext,
} from "@/persistence/composition/loadSupabaseDomainRepository";
import { DomainCompositionError } from "@/persistence/composition/domainComposition";
import type { PersistenceRepository } from "@/persistence/boundary";
import type { BaseEntity } from "@/domain/types";
import type { ResolvedIdentity } from "@/auth/types";

const IDENTITY: ResolvedIdentity = {
  userId: "u1", profileId: "u1", name: "A", email: "a@b.co",
  organizationId: "org-teragon", organizationName: "טרגון",
  roleId: "crole-sysadmin", roleLabel: "מנהל", capabilities: [], membershipId: "m1",
};

const fakeRepo = () => ({ collection: "customers" }) as unknown as PersistenceRepository<BaseEntity>;
function fakeModule(create = vi.fn(fakeRepo)): { mod: SupabaseModuleLike; create: typeof create } {
  return { mod: { createSupabaseRepository: create as unknown as SupabaseModuleLike["createSupabaseRepository"] }, create };
}
function ctx(over: Partial<DomainLoadContext> = {}): DomainLoadContext {
  return { provider: "SUPABASE", sessionActive: true, identity: IDENTITY, ...over };
}
async function codeOf(p: Promise<unknown>): Promise<string> {
  try { await p; return "NO_THROW"; } catch (e) { return (e as DomainCompositionError).code; }
}

describe("S9.2-A1a · loadSupabaseDomainRepository", () => {
  it("authenticated SUPABASE load succeeds for an implementation-ready domain (customers)", async () => {
    const { mod, create } = fakeModule();
    const repo = await loadSupabaseDomainRepository("customers", ctx(), { loadSupabase: async () => mod });
    expect(repo).toBeDefined();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("uses the CANONICAL identity organization — never VITE_SUPABASE_ORG / a browser org", async () => {
    const { mod, create } = fakeModule();
    await loadSupabaseDomainRepository("customers", ctx(), { loadSupabase: async () => mod });
    const [coll, client, org] = create.mock.calls[0] as [string, unknown, string];
    expect(coll).toBe("customers");
    expect(org).toBe("org-teragon"); // from identity.organizationId
    expect(client).toBeUndefined();  // authenticated client bound internally; not browser-supplied
  });

  it("missing session → AUTH_REQUIRED", async () => {
    expect(await codeOf(loadSupabaseDomainRepository("customers", ctx({ sessionActive: false })))).toBe("AUTH_REQUIRED");
  });

  it("missing/malformed identity → IDENTITY_INVALID", async () => {
    expect(await codeOf(loadSupabaseDomainRepository("customers", ctx({ identity: null })))).toBe("IDENTITY_INVALID");
    expect(await codeOf(loadSupabaseDomainRepository("customers", ctx({ identity: { ...IDENTITY, organizationId: "" } })))).toBe("IDENTITY_INVALID");
  });

  it("unsupported domain → DOMAIN_NOT_CONNECTED", async () => {
    expect(await codeOf(loadSupabaseDomainRepository("leads", ctx()))).toBe("DOMAIN_NOT_CONNECTED");
  });

  it("LOCAL provider is rejected (SUPABASE-only seam) → PROVIDER_BYPASS_FORBIDDEN", async () => {
    expect(await codeOf(loadSupabaseDomainRepository("customers", ctx({ provider: "LOCAL_INDEXEDDB" })))).toBe("PROVIDER_BYPASS_FORBIDDEN");
  });

  it("dynamic-import failure → REMOTE_REPOSITORY_LOAD_FAILED (no local fallback, no repo returned)", async () => {
    const code = await codeOf(
      loadSupabaseDomainRepository("customers", ctx(), { loadSupabase: async () => { throw new Error("boom"); } }),
    );
    expect(code).toBe("REMOTE_REPOSITORY_LOAD_FAILED");
  });

  it("errors never leak credential material", async () => {
    try {
      await loadSupabaseDomainRepository("customers", ctx(), {
        loadSupabase: async () => { throw new Error("service_role eyJabcdefghij.token sb_secret_XXXXXXXXXXXX"); },
      });
      throw new Error("expected throw");
    } catch (e) {
      expect((e as Error).message).not.toMatch(/service_role|eyJ|token|secret|password|sb_secret_/i);
    }
  });

  it("only the Supabase createSupabaseRepository path is used (no IndexedDB factory)", async () => {
    const { mod, create } = fakeModule();
    await loadSupabaseDomainRepository("customers", ctx(), { loadSupabase: async () => mod });
    expect(create).toHaveBeenCalled(); // the loader has no reference to getRepository/IndexedDB
  });
});
