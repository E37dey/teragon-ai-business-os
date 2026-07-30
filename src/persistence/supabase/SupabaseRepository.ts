// TERAGON AI BUSINESS OS — Gate S4: generic Supabase repository adapter.
//
// One instance serves one collection/table via its DomainMapping. It implements
// the neutral `PersistenceRepository<T>` so callers are backend-agnostic.
//
// Guarantees enforced here (per the gate contract):
//   * zod validation at the boundary — every row read is PARSED into a typed
//     entity; a malformed row is rejected (validation SafeError), never trusted.
//     Every write is validated before it leaves the client.
//   * safe typed errors — raw PostgREST payloads are mapped to SafeError; the
//     throwing Repository methods throw a typed RepositoryRemoteError only.
//   * pagination — range-based (.range(from,to)).
//   * duplicate-submit prevention — upsert keyed by the deterministic id + an
//     in-flight guard collapsing concurrent identical submits.
//   * deterministic ids — allocateId() reuses the app's `<prefix>-<n>` strategy.
//   * NO silent fallback — a failed remote write returns/throws an error; it is
//     NEVER retried against local storage.
import type { BaseEntity } from "@/domain/types";
import type { ChangeEvent, Unsubscribe } from "@/repositories/Repository";
import { nextId } from "@/repositories/Repository";
import type { PersistenceRepository } from "../boundary";
import { ok, err, safeError, type Page, type PageRequest, type RepoResult } from "../result";
import { toSafeError } from "./errors";
import type { DbRow, SupabaseLike } from "./db";
import { entityToRow, rowToEntityCandidate, type DomainMapping } from "./mapping";

/** Typed error the throwing Repository surface raises (never a raw driver error). */
export class RepositoryRemoteError extends Error {
  readonly code: string;
  readonly collection: string;
  constructor(code: string, collection: string) {
    super(`[supabase:${collection}] ${code}`);
    this.name = "RepositoryRemoteError";
    this.code = code;
    this.collection = collection;
  }
}

export class SupabaseRepository<T extends BaseEntity> implements PersistenceRepository<T> {
  readonly collection: string;
  private readonly listeners = new Set<(event: ChangeEvent<T>) => void>();
  private readonly inFlight = new Map<string, Promise<RepoResult<T>>>();
  private readonly client: SupabaseLike;
  private readonly mapping: DomainMapping<T>;
  private readonly organizationId: string;

  constructor(client: SupabaseLike, mapping: DomainMapping<T>, organizationId: string) {
    this.client = client;
    this.mapping = mapping;
    this.organizationId = organizationId;
    this.collection = mapping.collection;
  }

  // -- validation seam -------------------------------------------------------

  /** Parse a raw row into a validated entity, or a `validation` SafeError. */
  private parseRow(row: DbRow): RepoResult<T> {
    const candidate = rowToEntityCandidate(this.mapping, row);
    const parsed = this.mapping.schema.safeParse(candidate);
    if (!parsed.success) return err(safeError("validation", `${this.collection}:${String(row.id)}`));
    return ok(parsed.data);
  }

  private validateWrite(entity: T): RepoResult<T> {
    const parsed = this.mapping.schema.safeParse(entity);
    if (!parsed.success) return err(safeError("validation", `${this.collection}:${entity.id}`));
    return ok(parsed.data);
  }

  private emit(event: ChangeEvent<T>): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        /* a broken listener must not break persistence */
      }
    }
  }

  // -- safe API (RepoResult, never throws a raw driver error) ----------------

  async listSafe(): Promise<RepoResult<T[]>> {
    const { data, error } = await this.client.from(this.mapping.table).select("*").order("id");
    if (error) return err(toSafeError(error, this.collection));
    const out: T[] = [];
    for (const row of data ?? []) {
      const parsed = this.parseRow(row);
      if (!parsed.ok) return parsed; // a bad row rejects the read — never trusted
      out.push(parsed.data);
    }
    return ok(out);
  }

  async getSafe(id: string): Promise<RepoResult<T | undefined>> {
    const { data, error } = await this.client
      .from(this.mapping.table)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      const safe = toSafeError(error, this.collection);
      return safe.code === "not_found" ? ok(undefined) : err(safe);
    }
    if (!data) return ok(undefined);
    return this.parseRow(data);
  }

  async createSafe(item: T): Promise<RepoResult<T>> {
    const valid = this.validateWrite(item);
    if (!valid.ok) return valid;
    const { data, error } = await this.client
      .from(this.mapping.table)
      .insert(entityToRow(this.mapping, item, this.organizationId))
      .select("*")
      .single();
    if (error) return err(toSafeError(error, this.collection));
    if (!data) return err(safeError("unknown", this.collection));
    const parsed = this.parseRow(data);
    if (parsed.ok) this.emit({ type: "create", collection: this.collection, id: item.id, item: parsed.data });
    return parsed;
  }

  async updateSafe(id: string, patch: Partial<Omit<T, "id">>): Promise<RepoResult<T>> {
    const values: DbRow = {};
    for (const { prop, col } of this.mapping.fields) {
      if (prop in patch) values[col] = (patch as Record<string, unknown>)[prop];
    }
    if ("updatedAt" in patch) values.updated_at = (patch as Record<string, unknown>).updatedAt;
    const { data, error } = await this.client
      .from(this.mapping.table)
      .update(values)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return err(toSafeError(error, this.collection));
    if (!data) return err(safeError("not_found", `${this.collection}:${id}`));
    const parsed = this.parseRow(data);
    if (parsed.ok) this.emit({ type: "update", collection: this.collection, id, item: parsed.data });
    return parsed;
  }

  async removeSafe(id: string): Promise<RepoResult<void>> {
    const { data, error } = await this.client
      .from(this.mapping.table)
      .delete()
      .eq("id", id)
      .select("*");
    if (error) return err(toSafeError(error, this.collection));
    if (!data || data.length === 0) return err(safeError("not_found", `${this.collection}:${id}`));
    this.emit({ type: "remove", collection: this.collection, id });
    return ok(undefined);
  }

  /** Idempotent, duplicate-submit-safe upsert keyed by the deterministic id. */
  async upsertSafe(item: T): Promise<RepoResult<T>> {
    const existing = this.inFlight.get(item.id);
    if (existing) return existing; // collapse concurrent identical submits
    const promise = this.doUpsert(item).finally(() => this.inFlight.delete(item.id));
    this.inFlight.set(item.id, promise);
    return promise;
  }

  private async doUpsert(item: T): Promise<RepoResult<T>> {
    const valid = this.validateWrite(item);
    if (!valid.ok) return valid;
    const { data, error } = await this.client
      .from(this.mapping.table)
      .upsert(entityToRow(this.mapping, item, this.organizationId), { onConflict: "id" })
      .select("*")
      .single();
    if (error) return err(toSafeError(error, this.collection));
    if (!data) return err(safeError("unknown", this.collection));
    const parsed = this.parseRow(data);
    if (parsed.ok) this.emit({ type: "update", collection: this.collection, id: item.id, item: parsed.data });
    return parsed;
  }

  async listPage(range: PageRequest): Promise<RepoResult<Page<T>>> {
    const { data, error } = await this.client
      .from(this.mapping.table)
      .select("*")
      .order("id")
      .range(range.from, range.to);
    if (error) return err(toSafeError(error, this.collection));
    const rows: T[] = [];
    for (const row of data ?? []) {
      const parsed = this.parseRow(row);
      if (!parsed.ok) return parsed;
      rows.push(parsed.data);
    }
    return ok({ rows, range, hasMore: rows.length === range.to - range.from + 1 });
  }

  /** Deterministic next id (`<prefix>-<n>`) — never random. */
  async allocateId(): Promise<RepoResult<string>> {
    const listed = await this.listSafe();
    if (!listed.ok) return listed;
    return ok(nextId(this.mapping.idPrefix, listed.data.map((e) => e.id)));
  }

  // -- throwing Repository surface (typed errors only) -----------------------

  private unwrap<R>(r: RepoResult<R>): R {
    if (!r.ok) throw new RepositoryRemoteError(r.error.code, this.collection);
    return r.data;
  }

  async list(): Promise<T[]> {
    return this.unwrap(await this.listSafe());
  }
  async get(id: string): Promise<T | undefined> {
    return this.unwrap(await this.getSafe(id));
  }
  async create(item: T): Promise<T> {
    return this.unwrap(await this.createSafe(item));
  }
  async update(id: string, patch: Partial<Omit<T, "id">>): Promise<T> {
    return this.unwrap(await this.updateSafe(id, patch));
  }
  async remove(id: string): Promise<void> {
    this.unwrap(await this.removeSafe(id));
  }

  async clear(): Promise<void> {
    // Scoped wipe (tenant tables: this org's rows). No TRUNCATE — RLS-safe.
    const q = this.client.from(this.mapping.table).delete();
    const filtered = this.mapping.tenant === false ? q : q.eq("organization_id", this.organizationId);
    const { error } = await filtered.select("*");
    if (error) throw new RepositoryRemoteError(toSafeError(error).code, this.collection);
    this.emit({ type: "clear", collection: this.collection });
  }

  subscribe(listener: (event: ChangeEvent<T>) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
