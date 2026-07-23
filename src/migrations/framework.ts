// W6-E — MIGRATION FRAMEWORK (Phase 6.16).
// Registry of numbered migrations executed at boot AFTER seedIfEmpty().
// Binding principles (WAVE_6_DATA_MIGRATION_PLAN.md): deterministic ·
// idempotent · versioned · recoverable · malformed records are SKIPPED and
// audited, never app-fatal · zero silent record loss.
//
// schemaVersion bookkeeping lives in the `meta` collection (record id
// "schema"); one AuditEvent is written PER APPLIED MIGRATION (not per record).
// Re-running the runner is a no-op (applied ids are recorded), and every
// up() is itself idempotent so even a forced re-run is stable.
import type { AuditEvent, BaseEntity, ISODate } from "@/domain/types";
import type { CollectionKey } from "@/repositories/collections";
import type { Repository } from "@/repositories/Repository";
import { getRepository } from "@/repositories/factory";

// ---------------------------------------------------------------------------
// seams
// ---------------------------------------------------------------------------

/** Minimal store seam — production wiring uses the canonical factory. */
export interface MigrationStores {
  collection<T extends BaseEntity = BaseEntity>(key: CollectionKey): Repository<T>;
}

export function productionMigrationStores(): MigrationStores {
  return {
    collection: <T extends BaseEntity = BaseEntity>(key: CollectionKey) => getRepository<T>(key),
  };
}

/** Everything a migration may consult besides the records themselves. */
export interface MigrationEnv {
  stores: MigrationStores;
  /** browser localStorage (legacy workaround source); tests inject a stub */
  localStorage: Pick<Storage, "getItem"> | null;
  now: () => ISODate;
}

export function defaultMigrationEnv(stores: MigrationStores): MigrationEnv {
  return {
    stores,
    localStorage: typeof localStorage === "undefined" ? null : localStorage,
    now: () => new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// migration contract
// ---------------------------------------------------------------------------

export interface Migration {
  /** "m001" … — lexicographic order IS the execution order */
  id: string;
  description: string;
  collections: readonly CollectionKey[];
  /** stable key written to the per-migration AuditEvent correlationId */
  idempotencyKey: string;
  /**
   * Gather cross-collection / localStorage inputs once, before the pure
   * per-record pass. Absent ⇒ up() receives undefined.
   */
  prepare?(env: MigrationEnv): Promise<unknown>;
  /**
   * Pure per-record transform. Return the transformed record, the record
   * unchanged (no write), or null ⇒ malformed: skip + collect + audit.
   * MUST be idempotent: up(up(r)) deep-equals up(r).
   */
  up(record: BaseEntity, prepared: unknown, collection: CollectionKey): BaseEntity | null;
  /** optional extra audit detail (e.g. the legacy value m006 replaces) */
  auditDetail?(prepared: unknown): string;
}

// ---------------------------------------------------------------------------
// meta bookkeeping
// ---------------------------------------------------------------------------

export const SCHEMA_META_ID = "schema";

export interface SchemaMetaRecord extends BaseEntity {
  schemaVersion: number;
  appliedMigrations: string[];
}

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

export interface SkippedRecordRef {
  collection: CollectionKey;
  id: string;
}

export interface MigrationResult {
  id: string;
  status: "applied" | "already-applied" | "failed";
  changed: number;
  unchanged: number;
  skipped: SkippedRecordRef[];
  error: string | null;
}

export interface RunMigrationsReport {
  results: MigrationResult[];
  schemaVersion: number;
}

function stableEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function readMeta(env: MigrationEnv): Promise<SchemaMetaRecord> {
  const metaRepo = env.stores.collection<SchemaMetaRecord>("meta");
  const existing = await metaRepo.get(SCHEMA_META_ID);
  if (existing) return existing;
  const now = env.now();
  return metaRepo.create({
    id: SCHEMA_META_ID,
    schemaVersion: 0,
    appliedMigrations: [],
    createdAt: now,
    updatedAt: now,
  });
}

async function writeMigrationAudit(
  env: MigrationEnv,
  migration: Migration,
  result: MigrationResult,
  extraDetail: string,
): Promise<void> {
  const audit = env.stores.collection<AuditEvent>("auditEvents");
  const now = env.now();
  const skippedNote =
    result.skipped.length === 0
      ? "ללא רשומות שדולגו"
      : `דולגו ${result.skipped.length} רשומות פגומות: ${result.skipped
          .map((s) => `${s.collection}/${s.id}`)
          .join(", ")}`;
  const details = [
    migration.description,
    `שונו ${result.changed} רשומות, ${result.unchanged} ללא שינוי`,
    skippedNote,
    result.error ? `שגיאה: ${result.error}` : null,
    extraDetail || null,
  ]
    .filter((x): x is string => Boolean(x))
    .join(" · ");
  const record: AuditEvent = {
    id: `aud-migration-${migration.id}`,
    createdAt: now,
    updatedAt: now,
    at: now,
    actor: "system",
    action: result.status === "failed" ? `migration-failed:${migration.id}` : `migration:${migration.id}`,
    entityRef: null,
    details,
    correlationId: migration.idempotencyKey,
  };
  try {
    await audit.create(record);
  } catch {
    // audit id already exists (recovered partial run) — keep the earlier
    // trail; audit must never break the app, the report still carries it
  }
}

/**
 * Apply all pending migrations in registry order. NEVER throws app-fatal:
 * per-record failures are skipped+audited; per-migration failures are audited
 * and the runner continues (each migration is independent by design).
 */
export async function runMigrations(
  migrations: readonly Migration[],
  env: MigrationEnv,
): Promise<RunMigrationsReport> {
  const results: MigrationResult[] = [];
  let meta: SchemaMetaRecord;
  try {
    meta = await readMeta(env);
  } catch {
    // storage completely unavailable — honest no-op, the app still boots
    return { results, schemaVersion: -1 };
  }
  const ordered = [...migrations].sort((a, b) => a.id.localeCompare(b.id));
  const applied = new Set(meta.appliedMigrations);

  for (const migration of ordered) {
    if (applied.has(migration.id)) {
      results.push({
        id: migration.id,
        status: "already-applied",
        changed: 0,
        unchanged: 0,
        skipped: [],
        error: null,
      });
      continue;
    }
    const result: MigrationResult = {
      id: migration.id,
      status: "applied",
      changed: 0,
      unchanged: 0,
      skipped: [],
      error: null,
    };
    let extraDetail = "";
    try {
      const prepared = migration.prepare ? await migration.prepare(env) : undefined;
      extraDetail = migration.auditDetail ? migration.auditDetail(prepared) : "";
      for (const collection of migration.collections) {
        const repo = env.stores.collection(collection);
        const records = await repo.list();
        for (const record of records) {
          if (typeof record !== "object" || typeof record.id !== "string") {
            result.skipped.push({ collection, id: "(ללא מזהה)" });
            continue;
          }
          let next: BaseEntity | null;
          try {
            next = migration.up(record, prepared, collection);
          } catch {
            next = null;
          }
          if (next === null) {
            result.skipped.push({ collection, id: record.id });
            continue;
          }
          if (stableEquals(next, record)) {
            result.unchanged += 1;
            continue;
          }
          const { id: _id, ...patch } = next;
          await repo.update(record.id, patch);
          result.changed += 1;
        }
      }
      applied.add(migration.id);
      meta = await env.stores.collection<SchemaMetaRecord>("meta").update(SCHEMA_META_ID, {
        schemaVersion: meta.schemaVersion + 1,
        appliedMigrations: [...applied].sort((a, b) => a.localeCompare(b)),
        updatedAt: env.now(),
      });
    } catch (err) {
      result.status = "failed";
      result.error = err instanceof Error ? err.message : String(err);
    }
    await writeMigrationAudit(env, migration, result, extraDetail);
    results.push(result);
  }
  return { results, schemaVersion: meta.schemaVersion };
}
