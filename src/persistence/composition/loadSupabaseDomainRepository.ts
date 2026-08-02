// TERAGON AI BUSINESS OS — Gate S9.2-A1a: authenticated async Supabase domain
// repository seam.
//
// The ONE identity-aware asynchronous loader for a Supabase-backed domain
// repository. It fails closed in order — provider → session → canonical identity
// → implementation-ready allow-list → lazy load — and returns the provider-
// neutral `PersistenceRepository<T>`. The organization is taken ONLY from the
// canonical, server-resolved identity; NEVER from VITE_SUPABASE_ORG, a form, a
// URL parameter, localStorage, IndexedDB, or any browser-supplied org/role/active
// value. The authenticated publishable-key client is bound inside the lazily-
// imported Supabase tree (no service_role / privileged key). There is NO
// IndexedDB construction and NO local fallback here — a failure is a typed,
// user-safe error carrying no token, session, credential, or raw driver text.
import type { BaseEntity } from "@/domain/types";
import type { CollectionKey } from "@/repositories/collections";
import type { PersistenceRepository } from "@/persistence/boundary";
import type { SupabaseLike } from "@/persistence/supabase/db";
import type { ResolvedIdentity } from "@/auth/types";
import type { PersistenceProvider } from "@/persistence/provider";
import { DomainCompositionError, isSupabaseConnectedDomain } from "./domainComposition";

/** Provider/session/identity context — validated from TRUSTED sources only. */
export interface DomainLoadContext {
  readonly provider: PersistenceProvider;
  readonly sessionActive: boolean;
  readonly identity: ResolvedIdentity | null;
}

/** The slice of the lazily-imported Supabase module the loader depends on. */
export interface SupabaseModuleLike {
  createSupabaseRepository: <T extends BaseEntity = BaseEntity>(
    collection: CollectionKey,
    client?: SupabaseLike,
    organizationId?: string,
  ) => PersistenceRepository<T>;
}

export interface SupabaseRepoLoaderDeps {
  /**
   * Dynamic import — the ONLY reference to the Supabase tree, so
   * `@supabase/supabase-js` never enters the default bundle; it is pulled in
   * only when a connected domain is actually loaded.
   */
  loadSupabase: () => Promise<SupabaseModuleLike>;
}

const defaultDeps: SupabaseRepoLoaderDeps = {
  loadSupabase: () => import("@/persistence/supabase/index"),
};

/**
 * Load an authenticated Supabase repository for `collection`. Async by design
 * (lazy import + authenticated client). Callers (a query hook in S9.2-A1b) pass
 * only trusted context; no React component instantiates a repository directly.
 */
export async function loadSupabaseDomainRepository<T extends BaseEntity = BaseEntity>(
  collection: CollectionKey,
  ctx: DomainLoadContext,
  deps: SupabaseRepoLoaderDeps = defaultDeps,
): Promise<PersistenceRepository<T>> {
  // 1. provider — SUPABASE-only seam; the LOCAL sync path (factory.getRepository)
  //    is untouched and must never route through here.
  if (ctx.provider !== "SUPABASE") {
    throw new DomainCompositionError("PROVIDER_BYPASS_FORBIDDEN", `${collection}: not a SUPABASE composition`);
  }
  // 2. session
  if (!ctx.sessionActive) {
    throw new DomainCompositionError("AUTH_REQUIRED", `${collection}: authenticated session required`);
  }
  // 3. canonical identity
  const id = ctx.identity;
  if (!id || !id.organizationId || !id.roleId) {
    throw new DomainCompositionError("IDENTITY_INVALID", `${collection}: canonical identity is not resolved`);
  }
  // 4. implementation-ready allow-list
  if (!isSupabaseConnectedDomain(collection)) {
    throw new DomainCompositionError("DOMAIN_NOT_CONNECTED", collection);
  }
  // 5. lazy load the Supabase adapter (dynamic import) — sanitize any failure.
  let mod: SupabaseModuleLike;
  try {
    mod = await deps.loadSupabase();
  } catch {
    throw new DomainCompositionError("REMOTE_REPOSITORY_LOAD_FAILED", collection);
  }
  // 6. authenticated client bound internally + 7. canonical organization context
  //    (client omitted ⇒ the module's authenticated getSupabaseClient() singleton;
  //     org from the CANONICAL identity, overriding any env/default). 8. return.
  try {
    return mod.createSupabaseRepository<T>(collection, undefined, id.organizationId);
  } catch {
    throw new DomainCompositionError("REMOTE_REPOSITORY_LOAD_FAILED", collection);
  }
}
