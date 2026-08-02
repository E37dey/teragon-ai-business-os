// TERAGON AI BUSINESS OS — Gate S4: the NARROW client surface the adapters use.
//
// The generic SupabaseRepository depends only on this structural interface — the
// exact subset of the PostgREST query builder we call. The real
// `@supabase/supabase-js` client satisfies it (cast at the seam); the test mock
// implements it directly. This keeps the adapter engine driver-agnostic and
// deterministically testable with no live Supabase.
import type { PostgrestErrorLike } from "./errors";

export type DbRow = Record<string, unknown>;

export interface DbResult<T> {
  data: T | null;
  error: PostgrestErrorLike | null;
}

export interface SelectBuilder extends PromiseLike<DbResult<DbRow[]>> {
  eq(column: string, value: unknown): SelectBuilder;
  order(column: string, opts?: { ascending?: boolean }): SelectBuilder;
  range(from: number, to: number): SelectBuilder;
  single(): PromiseLike<DbResult<DbRow>>;
  maybeSingle(): PromiseLike<DbResult<DbRow>>;
}

export interface MutationBuilder extends PromiseLike<DbResult<DbRow[]>> {
  eq(column: string, value: unknown): MutationBuilder;
  select(columns?: string): MutationBuilder;
  single(): PromiseLike<DbResult<DbRow>>;
}

export interface FromBuilder {
  select(columns?: string): SelectBuilder;
  insert(values: DbRow | DbRow[]): MutationBuilder;
  upsert(values: DbRow | DbRow[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }): MutationBuilder;
  update(values: DbRow): MutationBuilder;
  delete(): MutationBuilder;
}

export interface SupabaseLike {
  from(table: string): FromBuilder;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<DbResult<unknown>>;
}
