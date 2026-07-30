// Gate S4 — Supabase provider LAZY entry point.
//
// This module (and everything it imports, including `@supabase/supabase-js` via
// ./client) is reached ONLY through a dynamic `import()` from the boundary when
// PERSISTENCE_PROVIDER === "SUPABASE". Nothing in the default (LOCAL) graph
// imports it statically, so the driver never enters the default bundle.
import type { BaseEntity } from "@/domain/types";
import type { CollectionKey } from "@/repositories/collections";
import type { PersistenceRepository } from "../boundary";
import { getSupabaseClient } from "./client";
import type { SupabaseLike } from "./db";
import { getMapping } from "./registry";
import { SupabaseRepository } from "./SupabaseRepository";

export class UnmappedCollectionError extends Error {
  constructor(collection: string) {
    super(`[supabase] no mapping registered for collection "${collection}"`);
    this.name = "UnmappedCollectionError";
  }
}

/**
 * Resolve the active tenant/organization id. In production this is derived from
 * the authenticated session (a later auth gate). For build/staging it may be
 * provided via env; absent ⇒ empty (writes then fail closed, never silently).
 */
export function resolveActiveOrganizationId(): string {
  return import.meta.env.VITE_SUPABASE_ORG ?? "";
}

/**
 * Build a neutral repository backed by Supabase for `collection`. Constructs the
 * browser client from the PUBLIC anon key (throws if unconfigured — the boundary
 * maps that to a safe "unavailable", never a silent local fallback).
 */
export function createSupabaseRepository<T extends BaseEntity = BaseEntity>(
  collection: CollectionKey,
  client: SupabaseLike = getSupabaseClient() as unknown as SupabaseLike,
  organizationId: string = resolveActiveOrganizationId(),
): PersistenceRepository<T> {
  const mapping = getMapping(collection);
  if (!mapping) throw new UnmappedCollectionError(collection);
  return new SupabaseRepository<T>(client, mapping as never, organizationId);
}

export { SupabaseRepository, RepositoryRemoteError } from "./SupabaseRepository";
export { getSupabaseClient, readSupabaseConfig, SupabaseNotConfiguredError } from "./client";
export { closeTicketWithRepair } from "./domains/service";
export { getMapping, SUPPORTED_COLLECTIONS } from "./registry";
export type { SupabaseLike } from "./db";
