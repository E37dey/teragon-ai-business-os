// TERAGON AI BUSINESS OS — Gate S4: domain-entity ↔ Supabase-row mapping DSL.
//
// A DomainMapping declaratively describes how one domain entity maps to its
// Postgres table:
//   * `table`          — snake_case table name (from supabase/migrations/**).
//   * `idPrefix`       — the app's deterministic id prefix (never random).
//   * `schema`         — the canonical zod schema; rows are PARSED into a typed
//                        entity on read and validated on write (boundary safety).
//   * `fields`         — camelCase prop ↔ snake_case column pairs (JSONB columns
//                        pass through as-is; supabase-js (de)serializes jsonb).
//   * `tenant`         — whether the table carries `organization_id` (default
//                        true; `organizations` and `roles` are global — false).
//
// id / createdAt / updatedAt are handled generically (id/created_at/updated_at).
import type { z } from "zod";
import type { BaseEntity } from "@/domain/types";
import type { CollectionKey } from "@/repositories/collections";
import type { DbRow } from "./db";

export interface FieldMap {
  /** camelCase entity property. */
  readonly prop: string;
  /** snake_case column. */
  readonly col: string;
}

export interface DomainMapping<T extends BaseEntity> {
  readonly collection: CollectionKey;
  readonly table: string;
  readonly idPrefix: string;
  readonly schema: z.ZodType<T>;
  readonly fields: readonly FieldMap[];
  /** false ⇒ global table with no organization_id (organizations, roles). */
  readonly tenant?: boolean;
}

/** A mapping stored in the registry (entity type erased to BaseEntity). */
export type AnyMapping = DomainMapping<BaseEntity>;

/**
 * Register a typed mapping into the erased registry shape. The cast is sound:
 * every entity extends BaseEntity and the schema/fields describe exactly `T`.
 */
export function defineMapping<T extends BaseEntity>(mapping: DomainMapping<T>): AnyMapping {
  return mapping as unknown as AnyMapping;
}

/** Convenience: a `prop`/`col` pair where the names are identical. */
export function same(name: string): FieldMap {
  return { prop: name, col: name };
}

/** Build a `[prop, col]` field map from an object literal (prop → column). */
export function fields(map: Record<string, string>): FieldMap[] {
  return Object.entries(map).map(([prop, col]) => ({ prop, col }));
}

/**
 * Entity → row. Adds id/created_at/updated_at generically and, for tenant
 * tables, `organization_id`. Only mapped fields are written (nothing implicit).
 */
export function entityToRow<T extends BaseEntity>(
  mapping: DomainMapping<T>,
  entity: T,
  organizationId: string,
): DbRow {
  const row: DbRow = {
    id: entity.id,
    created_at: entity.createdAt,
    updated_at: entity.updatedAt,
  };
  if (mapping.tenant !== false) row.organization_id = organizationId;
  for (const { prop, col } of mapping.fields) {
    row[col] = (entity as Record<string, unknown>)[prop];
  }
  return row;
}

/**
 * Row → entity candidate (pre-validation plain object). The caller then parses
 * it through `mapping.schema` so a malformed row is REJECTED, never trusted.
 */
export function rowToEntityCandidate<T extends BaseEntity>(mapping: DomainMapping<T>, row: DbRow): unknown {
  const entity: Record<string, unknown> = {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  for (const { prop, col } of mapping.fields) {
    entity[prop] = row[col];
  }
  return entity;
}
