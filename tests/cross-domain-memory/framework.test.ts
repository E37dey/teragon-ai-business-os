// W6-E — migration framework: order, idempotence, malformed-skip+audit,
// meta versioning, failure isolation. Runs against fake-indexeddb.
import { beforeEach, describe, expect, it } from "vitest";
import type { AuditEvent, BaseEntity } from "@/domain/types";
import { getRepository } from "@/repositories";
import {
  runMigrations,
  SCHEMA_META_ID,
  type Migration,
  type SchemaMetaRecord,
} from "@/migrations/framework";
import { resetStores, testEnv, FIXED_NOW } from "./helpers";

interface Widget extends BaseEntity {
  label: string;
  upgraded?: boolean;
}

const widget = (id: string, label: string): Widget => ({
  id,
  label,
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
});

function upgradeMigration(id: string): Migration {
  return {
    id,
    description: `בדיקה ${id}`,
    collections: ["tasks"],
    idempotencyKey: `test-${id}`,
    up(record) {
      const w = record as Widget;
      if (typeof w.label !== "string") return null; // malformed
      if (w.upgraded === true) return w;
      return { ...w, upgraded: true };
    },
  };
}

describe("migration framework", () => {
  beforeEach(resetStores);

  it("applies pending migrations in id order and records meta versioning", async () => {
    const order: string[] = [];
    const tracking = (id: string): Migration => ({
      ...upgradeMigration(id),
      up(record) {
        if (!order.includes(id)) order.push(id);
        return record;
      },
    });
    await getRepository<Widget>("tasks").create(widget("w-1", "א"));
    // registry deliberately out of order — the runner must sort by id
    const report = await runMigrations([tracking("m902"), tracking("m901")], testEnv());
    expect(order).toEqual(["m901", "m902"]);
    expect(report.results.map((r) => r.status)).toEqual(["applied", "applied"]);
    expect(report.schemaVersion).toBe(2);
    const meta = await getRepository<SchemaMetaRecord>("meta").get(SCHEMA_META_ID);
    expect(meta?.schemaVersion).toBe(2);
    expect(meta?.appliedMigrations).toEqual(["m901", "m902"]);
  });

  it("is idempotent: a second run is a no-op and changes nothing", async () => {
    const repo = getRepository<Widget>("tasks");
    await repo.create(widget("w-1", "א"));
    const env = testEnv();
    const first = await runMigrations([upgradeMigration("m901")], env);
    expect(first.results[0]?.status).toBe("applied");
    expect(first.results[0]?.changed).toBe(1);
    const afterFirst = await repo.list();

    const second = await runMigrations([upgradeMigration("m901")], env);
    expect(second.results[0]?.status).toBe("already-applied");
    expect(await repo.list()).toEqual(afterFirst);
    const meta = await getRepository<SchemaMetaRecord>("meta").get(SCHEMA_META_ID);
    expect(meta?.schemaVersion).toBe(1);
  });

  it("skips malformed records, audits them, and never throws", async () => {
    const repo = getRepository<Widget>("tasks");
    await repo.create(widget("w-1", "תקין"));
    await repo.create({ id: "w-bad", createdAt: FIXED_NOW, updatedAt: FIXED_NOW } as Widget);
    const report = await runMigrations([upgradeMigration("m901")], testEnv());
    const result = report.results[0];
    expect(result?.status).toBe("applied");
    expect(result?.changed).toBe(1);
    expect(result?.skipped).toEqual([{ collection: "tasks", id: "w-bad" }]);
    // the malformed record is preserved untouched — zero silent loss
    expect(await repo.get("w-bad")).toBeDefined();
    const audit = await getRepository<AuditEvent>("auditEvents").get("aud-migration-m901");
    expect(audit?.action).toBe("migration:m901");
    expect(audit?.details).toContain("w-bad");
    expect(audit?.correlationId).toBe("test-m901");
  });

  it("a throwing up() counts as malformed-skip, not a crash", async () => {
    const repo = getRepository<Widget>("tasks");
    await repo.create(widget("w-1", "א"));
    const migration: Migration = {
      ...upgradeMigration("m903"),
      up() {
        throw new Error("boom");
      },
    };
    const report = await runMigrations([migration], testEnv());
    expect(report.results[0]?.status).toBe("applied");
    expect(report.results[0]?.skipped).toEqual([{ collection: "tasks", id: "w-1" }]);
  });

  it("a failing prepare() marks the migration failed, audits it and continues", async () => {
    await getRepository<Widget>("tasks").create(widget("w-1", "א"));
    const failing: Migration = {
      ...upgradeMigration("m901"),
      prepare() {
        return Promise.reject(new Error("הכנה נכשלה"));
      },
    };
    const report = await runMigrations([failing, upgradeMigration("m902")], testEnv());
    expect(report.results[0]?.status).toBe("failed");
    expect(report.results[0]?.error).toContain("הכנה נכשלה");
    expect(report.results[1]?.status).toBe("applied");
    const meta = await getRepository<SchemaMetaRecord>("meta").get(SCHEMA_META_ID);
    // only the successful migration advanced the schema
    expect(meta?.appliedMigrations).toEqual(["m902"]);
    const audit = await getRepository<AuditEvent>("auditEvents").get("aud-migration-m901");
    expect(audit?.action).toBe("migration-failed:m901");
    // failed migration is retried on the next run
    const retry = await runMigrations([upgradeMigration("m901")], testEnv());
    expect(retry.results[0]?.status).toBe("applied");
  });

  it("writes exactly one audit event per applied migration (not per record)", async () => {
    const repo = getRepository<Widget>("tasks");
    for (let i = 1; i <= 5; i++) await repo.create(widget(`w-${i}`, `רשומה ${i}`));
    await runMigrations([upgradeMigration("m901")], testEnv());
    const audits = (await getRepository<AuditEvent>("auditEvents").list()).filter((a) =>
      a.action.includes("m901"),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.details).toContain("שונו 5 רשומות");
  });
});
