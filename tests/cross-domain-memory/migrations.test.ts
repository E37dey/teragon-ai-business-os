// W6-E — m001-m007 against the frozen baseline snapshot (283 records), loaded
// into fake-indexeddb: zero record loss, correct new fields, double-run
// stability (including a FORCED re-run), malformed variants skipped+audited,
// legacy sources (markers / localStorage) preserved for rollback.
import { beforeEach, describe, expect, it } from "vitest";
import type { AgentEventRecord } from "@/domain/agents";
import type { AuditEvent } from "@/domain/types";
import type {
  ApprovalX,
  CourseSessionX,
  CustomerPrinterX,
  DocumentX,
  OpportunityX,
  QuotationX,
  ServiceTicketX,
  SupportRequestX,
  TaskX,
} from "@/integration/domainExtensions";
import { QUOTATION_VERSIONS_KEY } from "@/integration/quotationVersions";
import { JOURNEY_STORAGE_KEY } from "@/modules/sales/journey";
import { getRepository } from "@/repositories";
import {
  runMigrations,
  SCHEMA_META_ID,
  type SchemaMetaRecord,
} from "@/migrations/framework";
import { ALL_MIGRATIONS, NEXA_AGENT_ID, NEXA_CANONICAL_PURPOSE } from "@/migrations/migrations";
import {
  countOf,
  FIXED_NOW,
  loadSnapshot,
  memoryStorage,
  resetStores,
  seedFromSnapshot,
  snapshotCollections,
  snapshotTotal,
  testEnv,
} from "./helpers";

const MARKER_TASK: TaskX = {
  id: "task-w4-marker",
  title: "משימה עם מרקרים (נתוני ריצה של גל 4)",
  description: "לתאם ביקור אצל הלקוח ⟦מצב:חסום⟧ ⟦בעלות:משותפת⟧",
  status: "בתהליך",
  priority: "גבוהה",
  due: "2026-07-30",
  ownerId: "u-tzachi",
  relatedRef: null,
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
};

const MARKER_SUPPORT: SupportRequestX = {
  id: "sr-w4-marker",
  subject: "בעיה בייצוא דוח",
  description: "הייצוא לאקסל נתקע ⟦Tier:2⟧ ⟦מטפל:u-ran⟧ ⟦משוב:חיובי⟧",
  requesterId: "u-maya",
  channel: "מערכת",
  status: "נסגרה",
  priority: "בינונית",
  resolution: "נפתר",
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
};

function legacyStorage(): Pick<Storage, "getItem"> {
  return memoryStorage({
    [JOURNEY_STORAGE_KEY]: JSON.stringify({ "opp-1": "j3", "opp-ghost": "j9", "opp-2": "not-a-step" }),
    [QUOTATION_VERSIONS_KEY]: JSON.stringify({ "q-1": 3, "q-2": 0, "q-ghost": 7 }),
  });
}

const DECIDE_EVENT: AgentEventRecord = {
  id: "evt-test-1",
  runId: "run-test-1",
  seq: 1,
  ts: FIXED_NOW,
  actor: "u-tzachi",
  type: "ApprovalDecided",
  event: {
    type: "ApprovalDecided",
    approvalId: "ap-1",
    decision: "cancelled",
    decidedById: "u-tzachi",
    noteHe: "בוטל בבדיקה",
    editedPayload: null,
  },
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
};

async function seedAll(withExtras: boolean): Promise<{ baselineTotal: number; audits: number }> {
  const snap = loadSnapshot();
  await seedFromSnapshot(snap);
  if (withExtras) {
    await getRepository<TaskX>("tasks").create(MARKER_TASK);
    await getRepository<SupportRequestX>("supportRequests").create(MARKER_SUPPORT);
    await getRepository<AgentEventRecord>("agentEvents").create(DECIDE_EVENT);
  }
  const audits = snap.collections["auditEvents"]?.length ?? 0;
  return { baselineTotal: snapshotTotal(snap), audits };
}

describe("migrations m001-m007 against the baseline snapshot", () => {
  beforeEach(resetStores);

  it("applies all 7 with ZERO record loss (283 snapshot records preserved)", async () => {
    const snap = loadSnapshot();
    const { baselineTotal } = await seedAll(false);
    expect(baselineTotal).toBe(283);
    const report = await runMigrations(ALL_MIGRATIONS, testEnv(legacyStorage()));
    expect(report.results.map((r) => r.status)).toEqual(Array(7).fill("applied"));
    expect(report.results.flatMap((r) => r.skipped)).toEqual([]);
    // per-collection counts preserved; auditEvents grows by exactly 7 (one per migration)
    for (const key of snapshotCollections(snap)) {
      const expected = (snap.collections[key]?.length ?? 0) + (key === "auditEvents" ? 7 : 0);
      expect(await countOf(key), key).toBe(expected);
    }
    // every original id still present
    for (const key of snapshotCollections(snap)) {
      const ids = new Set((await getRepository(key).list()).map((r) => r.id));
      for (const rec of snap.collections[key] ?? []) {
        expect(ids.has(rec.id), `${key}/${rec.id}`).toBe(true);
      }
    }
    const meta = await getRepository<SchemaMetaRecord>("meta").get(SCHEMA_META_ID);
    expect(meta?.schemaVersion).toBe(7);
  });

  it("m001: markers → workState/ownership, description cleaned, original kept in legacyMarker", async () => {
    await seedAll(true);
    await runMigrations(ALL_MIGRATIONS, testEnv(legacyStorage()));
    const migrated = await getRepository<TaskX>("tasks").get(MARKER_TASK.id);
    expect(migrated?.workState).toBe("חסום");
    expect(migrated?.ownership).toBe("משותפת");
    expect(migrated?.description).toBe("לתאם ביקור אצל הלקוח");
    expect(migrated?.legacyMarker).toBe(MARKER_TASK.description);
    // a marker-less snapshot task gets a derived state and NO legacyMarker
    const plain = await getRepository<TaskX>("tasks").get("task-1");
    expect(plain?.workState).toBeDefined();
    expect(plain?.ownership).toBe("אנושית");
    expect(plain?.legacyMarker).toBeUndefined();
  });

  it("m002: support markers → tier/assigneeId/category/feedback (+legacyMarker)", async () => {
    await seedAll(true);
    await runMigrations(ALL_MIGRATIONS, testEnv(legacyStorage()));
    const migrated = await getRepository<SupportRequestX>("supportRequests").get(MARKER_SUPPORT.id);
    expect(migrated?.tier).toBe(2);
    expect(migrated?.assigneeId).toBe("u-ran");
    expect(migrated?.feedback).toBe("חיובי");
    expect(migrated?.category).toBe("דוחות וייצוא");
    expect(migrated?.description).toBe("הייצוא לאקסל נתקע");
    expect(migrated?.legacyMarker).toBe(MARKER_SUPPORT.description);
    // marker-less snapshot request defaults to Tier 1 + derived category
    const plain = await getRepository<SupportRequestX>("supportRequests").get("sr-1");
    expect(plain?.tier).toBe(1);
    expect(typeof plain?.category).toBe("string");
  });

  it("m003: journey localStorage → journeyStepId (invalid/unknown entries ignored, key untouched)", async () => {
    await seedAll(false);
    await runMigrations(ALL_MIGRATIONS, testEnv(legacyStorage()));
    const repo = getRepository<OpportunityX>("opportunities");
    expect((await repo.get("opp-1"))?.journeyStepId).toBe("j3");
    // "not-a-step" is not a valid journey step — honest null, not garbage
    expect((await repo.get("opp-2"))?.journeyStepId).toBeNull();
    expect((await repo.get("opp-3"))?.journeyStepId).toBeNull();
  });

  it("m003/m004 without a browser localStorage: fields default honestly", async () => {
    await seedAll(false);
    await runMigrations(ALL_MIGRATIONS, testEnv(null));
    expect((await getRepository<OpportunityX>("opportunities").get("opp-1"))?.journeyStepId).toBeNull();
    expect((await getRepository<QuotationX>("quotations").get("q-1"))?.version).toBe(1);
  });

  it("m004: version localStorage → Quotation.version (invalid values fall back to 1)", async () => {
    await seedAll(false);
    await runMigrations(ALL_MIGRATIONS, testEnv(legacyStorage()));
    const repo = getRepository<QuotationX>("quotations");
    expect((await repo.get("q-1"))?.version).toBe(3);
    // 0 is not a valid edit counter — defensive parse drops it
    expect((await repo.get("q-2"))?.version).toBe(1);
    expect((await repo.get("q-3"))?.version).toBe(1);
  });

  it("m005: extendedState derived from agentEvents; base status when no events", async () => {
    await seedAll(true);
    await runMigrations(ALL_MIGRATIONS, testEnv(legacyStorage()));
    const repo = getRepository<ApprovalX>("approvals");
    // ap-1 has a cancelled decision event injected
    expect((await repo.get("ap-1"))?.extendedState).toBe("cancelled");
    // ap-2 (ממתין, no events) / ap-3 (אושר, no events) — derived from status
    expect((await repo.get("ap-2"))?.extendedState).toBe("pending");
    expect((await repo.get("ap-3"))?.extendedState).toBe("approved");
  });

  it("m006: live Nexa purpose aligned to the frozen spec, old value audited", async () => {
    await seedAll(false);
    const before = await getRepository("agents").get(NEXA_AGENT_ID);
    expect((before as { purpose?: string } | undefined)?.purpose).toContain('עוזר אישי למנכ"ל');
    await runMigrations(ALL_MIGRATIONS, testEnv(legacyStorage()));
    const after = await getRepository("agents").get(NEXA_AGENT_ID);
    expect((after as { purpose?: string } | undefined)?.purpose).toBe(NEXA_CANONICAL_PURPOSE);
    const audit = await getRepository<AuditEvent>("auditEvents").get("aud-migration-m006");
    expect(audit?.details).toContain("ערך קודם");
    expect(audit?.details).toContain('עוזר אישי למנכ"ל');
  });

  it("m007: safe additive defaults — closedAt / customerId / attendance / warranty fields", async () => {
    await seedAll(false);
    await runMigrations(ALL_MIGRATIONS, testEnv(legacyStorage()));
    const tickets = getRepository<ServiceTicketX>("serviceTickets");
    const closed = await tickets.get("t-10"); // status "נסגר" in the snapshot
    expect(closed?.closedAt).toBe(closed?.updatedAt);
    const open = await tickets.get("t-1"); // status "בבדיקה"
    expect(open?.closedAt).toBeNull();
    const doc = (await getRepository<DocumentX>("documents").list())[0];
    expect(doc?.customerId).toBeNull();
    const session = (await getRepository<CourseSessionX>("courseSessions").list())[0];
    expect(session?.attendance).toEqual([]);
    const printer = (await getRepository<CustomerPrinterX>("customerPrinters").list())[0];
    expect(printer?.warrantyUntil).toBeNull();
    expect(printer?.lastMaintenanceAt).toBeNull();
    expect(printer?.maintenanceIntervalDays).toBeNull();
  });

  it("double run is stable — even a FORCED re-run changes nothing", async () => {
    await seedAll(true);
    const env = testEnv(legacyStorage());
    await runMigrations(ALL_MIGRATIONS, env);
    const snap = loadSnapshot();
    const dump = async (): Promise<string> => {
      const parts: string[] = [];
      for (const key of snapshotCollections(snap)) {
        const records = (await getRepository(key).list()).sort((a, b) =>
          a.id.localeCompare(b.id),
        );
        parts.push(JSON.stringify(records));
      }
      return parts.join("\n");
    };
    const afterFirst = await dump();
    // normal second run: no-op via meta
    const second = await runMigrations(ALL_MIGRATIONS, env);
    expect(second.results.every((r) => r.status === "already-applied")).toBe(true);
    expect(await dump()).toBe(afterFirst);
    // FORCED re-run: wipe the applied list — every up() must be idempotent
    await getRepository<SchemaMetaRecord>("meta").update(SCHEMA_META_ID, {
      appliedMigrations: [],
      schemaVersion: 0,
    });
    const forced = await runMigrations(ALL_MIGRATIONS, env);
    expect(forced.results.every((r) => r.status === "applied")).toBe(true);
    expect(forced.results.reduce((s, r) => s + r.changed, 0)).toBe(0);
    expect(await dump()).toBe(afterFirst);
  });

  it("malformed variants: broken records are skipped, audited and preserved", async () => {
    await seedAll(false);
    // a task without a description and a support request with a non-string one
    await getRepository("tasks").create({
      id: "task-broken",
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });
    await getRepository("supportRequests").create({
      id: "sr-broken",
      subject: "שבור",
      description: 42,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    } as never);
    const report = await runMigrations(ALL_MIGRATIONS, testEnv(legacyStorage()));
    const m001 = report.results.find((r) => r.id === "m001");
    const m002 = report.results.find((r) => r.id === "m002");
    expect(m001?.skipped).toEqual([{ collection: "tasks", id: "task-broken" }]);
    expect(m002?.skipped).toEqual([{ collection: "supportRequests", id: "sr-broken" }]);
    expect(await getRepository("tasks").get("task-broken")).toBeDefined();
    expect(await getRepository("supportRequests").get("sr-broken")).toBeDefined();
    const audit1 = await getRepository<AuditEvent>("auditEvents").get("aud-migration-m001");
    expect(audit1?.details).toContain("task-broken");
  });
});
