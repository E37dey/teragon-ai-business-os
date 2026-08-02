// Gate S4 tests — deterministic, in-memory fake of the PostgREST query builder.
// Implements exactly the `SupabaseLike` surface the adapters call:
//   from(t).select()/insert()/upsert()/update()/delete()/eq()/order()/range()/single()/maybeSingle()
//   rpc(fn, args)
// No network, no live Supabase. Supports forced errors (to prove safe mapping)
// and pluggable RPC handlers (to prove atomic-write boundaries).
import type { DbResult, DbRow, FromBuilder, SupabaseLike } from "@/persistence/supabase/db";
import type { PostgrestErrorLike } from "@/persistence/supabase/errors";

type Op = "select" | "insert" | "upsert" | "update" | "delete";

const NO_ROWS: PostgrestErrorLike = { code: "PGRST116", message: "no rows" };
const DUPLICATE: PostgrestErrorLike = { code: "23505", message: "duplicate key" };

export class MockSupabase implements SupabaseLike {
  /** table → id → row */
  readonly tables = new Map<string, Map<string, DbRow>>();
  private forcedError: PostgrestErrorLike | null = null;
  private readonly rpcHandlers = new Map<string, (args: Record<string, unknown>) => DbResult<unknown>>();

  seed(table: string, rows: DbRow[]): this {
    const map = this.store(table);
    for (const r of rows) map.set(String(r.id), { ...r });
    return this;
  }

  /** Force the next terminal query to fail with a PostgREST-shaped error. */
  failNext(error: PostgrestErrorLike): this {
    this.forcedError = error;
    return this;
  }

  onRpc(fn: string, handler: (args: Record<string, unknown>) => DbResult<unknown>): this {
    this.rpcHandlers.set(fn, handler);
    return this;
  }

  private store(table: string): Map<string, DbRow> {
    let map = this.tables.get(table);
    if (!map) {
      map = new Map<string, DbRow>();
      this.tables.set(table, map);
    }
    return map;
  }

  private takeForced(): PostgrestErrorLike | null {
    const e = this.forcedError;
    this.forcedError = null;
    return e;
  }

  from(table: string): FromBuilder {
    return new MockBuilder(this.store(table), () => this.takeForced()) as unknown as FromBuilder;
  }

  rpc(fn: string, args: Record<string, unknown> = {}): PromiseLike<DbResult<unknown>> {
    const forced = this.takeForced();
    if (forced) return Promise.resolve({ data: null, error: forced });
    const handler = this.rpcHandlers.get(fn);
    if (!handler) return Promise.resolve({ data: null, error: { code: "PGRST202", message: "no function" } });
    return Promise.resolve(handler(args));
  }
}

class MockBuilder {
  private op: Op = "select";
  private values: DbRow[] = [];
  private readonly filters: { col: string; value: unknown }[] = [];
  private rangeVal: { from: number; to: number } | null = null;
  private orderCol: string | null = null;
  private orderAsc = true;
  private ran: DbResult<DbRow[]> | null = null;
  private readonly rows: Map<string, DbRow>;
  private readonly takeForced: () => PostgrestErrorLike | null;

  constructor(rows: Map<string, DbRow>, takeForced: () => PostgrestErrorLike | null) {
    this.rows = rows;
    this.takeForced = takeForced;
  }

  select(_columns?: string): this {
    return this;
  }
  insert(v: DbRow | DbRow[]): this {
    this.op = "insert";
    this.values = Array.isArray(v) ? v : [v];
    return this;
  }
  upsert(v: DbRow | DbRow[]): this {
    this.op = "upsert";
    this.values = Array.isArray(v) ? v : [v];
    return this;
  }
  update(v: DbRow): this {
    this.op = "update";
    this.values = [v];
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  eq(col: string, value: unknown): this {
    this.filters.push({ col, value });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderCol = col;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }
  range(from: number, to: number): this {
    this.rangeVal = { from, to };
    return this;
  }

  private matches(row: DbRow): boolean {
    return this.filters.every((f) => row[f.col] === f.value);
  }

  private compute(): DbResult<DbRow[]> {
    if (this.ran) return this.ran;
    const forced = this.takeForced();
    if (forced) {
      this.ran = { data: null, error: forced };
      return this.ran;
    }
    let data: DbRow[] = [];
    switch (this.op) {
      case "insert": {
        for (const v of this.values) {
          const id = String(v.id);
          if (this.rows.has(id)) {
            this.ran = { data: null, error: DUPLICATE };
            return this.ran;
          }
          this.rows.set(id, { ...v });
          data.push({ ...v });
        }
        break;
      }
      case "upsert": {
        for (const v of this.values) {
          this.rows.set(String(v.id), { ...v });
          data.push({ ...v });
        }
        break;
      }
      case "update": {
        const patch = this.values[0] ?? {};
        for (const row of this.rows.values()) {
          if (!this.matches(row)) continue;
          Object.assign(row, patch);
          data.push({ ...row });
        }
        break;
      }
      case "delete": {
        for (const [id, row] of [...this.rows.entries()]) {
          if (!this.matches(row)) continue;
          this.rows.delete(id);
          data.push({ ...row });
        }
        break;
      }
      default: {
        data = [...this.rows.values()].filter((r) => this.matches(r)).map((r) => ({ ...r }));
        if (this.orderCol) {
          const col = this.orderCol;
          const dir = this.orderAsc ? 1 : -1;
          data.sort((a, b) => {
            const av = String(a[col]);
            const bv = String(b[col]);
            return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
          });
        }
        if (this.rangeVal) data = data.slice(this.rangeVal.from, this.rangeVal.to + 1);
      }
    }
    this.ran = { data, error: null };
    return this.ran;
  }

  single(): PromiseLike<DbResult<DbRow>> {
    const r = this.compute();
    if (r.error) return Promise.resolve({ data: null, error: r.error });
    const rows = r.data ?? [];
    if (rows.length === 0) return Promise.resolve({ data: null, error: NO_ROWS });
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }

  maybeSingle(): PromiseLike<DbResult<DbRow>> {
    const r = this.compute();
    if (r.error) return Promise.resolve({ data: null, error: r.error });
    const rows = r.data ?? [];
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }

  then<TResult1 = DbResult<DbRow[]>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<DbRow[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.compute()).then(onfulfilled, onrejected);
  }
}
