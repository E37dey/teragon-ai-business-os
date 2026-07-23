// W8-D — the 15 real check methods: every state comes from a check that ran,
// unchecked ⇒ "טרם נבדק", remote is NEVER green without server verification.
import { beforeEach, describe, expect, it } from "vitest";
import { RemoteAIProvider } from "@/ai/providers/RemoteAIProvider";
import type { AgentTask, AutomationRun, Customer } from "@/domain/types";
import { HEALTH_COMPONENT_IDS } from "@/domain/system-health";
import { SCHEMA_META_ID, type SchemaMetaRecord } from "@/migrations/framework";
import { ALL_MIGRATIONS } from "@/migrations/migrations";
import { __resetRepositoriesForTests } from "@/repositories";
import {
  checkAgentQueues,
  checkApprovalEngine,
  checkAuditRepository,
  checkAutomationRuns,
  checkExportEngine,
  checkIndexedDb,
  checkLocalProvider,
  checkMigrations,
  checkNetlifyFunctions,
  checkRemoteProvider,
  checkRepositories,
  checkSearchIndex,
  checkStorageEstimate,
  runAllChecks,
  uncheckedComponent,
} from "@/system-health/checks";
import { baseRecord, fakeEnvelope, fakeProvider, makeEnv, T0 } from "./helpers";

beforeEach(() => __resetRepositoriesForTests());

describe("honesty baseline — unchecked components", () => {
  it('every component starts "טרם נבדק" with no measurements and no fake green', () => {
    for (const id of HEALTH_COMPONENT_IDS) {
      const c = uncheckedComponent(id);
      expect(c.state).toBe("טרם נבדק");
      expect(c.lastCheck).toBeNull();
      expect(c.responseTimeMs).toBeNull();
      expect(c.lastSuccess).toBeNull();
      expect(c.checkMethodHe.length).toBeGreaterThan(10);
    }
  });

  it("runAllChecks returns exactly the 15 components in registry order", async () => {
    const env = await makeEnv();
    const results = await runAllChecks(env);
    expect(results.map((r) => r.componentId)).toEqual([...HEALTH_COMPONENT_IDS]);
    for (const r of results) {
      expect(r.lastCheck).toBe(T0);
    }
  });
});

describe("indexeddb", () => {
  it('probe unavailable ⇒ "לא זמין" and responseTime NOT measured', async () => {
    const env = await makeEnv({ probe: null });
    const c = await checkIndexedDb(env);
    expect(c.state).toBe("לא זמין");
    expect(c.responseTimeMs).toBeNull();
    expect(c.lastFailure).toBe(T0);
  });

  it('open + version + sample counts ⇒ "תקין" with the version in the finding', async () => {
    const env = await makeEnv({ probe: { version: 6, storeCount: 100 } });
    const c = await checkIndexedDb(env);
    expect(c.state).toBe("תקין");
    expect(c.detailHe).toContain("6");
    expect(c.responseTimeMs).not.toBeNull();
    expect(c.lastSuccess).toBe(T0);
  });
});

describe("repositories — real CRUD round-trip on meta", () => {
  it("passes and leaves no scratch record behind", async () => {
    const env = await makeEnv();
    const c = await checkRepositories(env);
    expect(c.state).toBe("תקין");
    const scratch = await env.collection("meta").get("w8d-health-scratch");
    expect(scratch).toBeUndefined();
  });

  it("a failing repository yields an honest finding without a stack trace", async () => {
    const env = await makeEnv();
    const broken = {
      ...env,
      collection: () => {
        throw new Error("קריסת אחסון מדומה\n    at fakeFrame (file.ts:1:2)");
      },
    };
    const c = await checkRepositories(broken as typeof env);
    expect(c.state).toBe("דורש תשומת לב");
    expect(c.detailHe).not.toContain("at fakeFrame");
    expect(c.detailHe).toContain("קריסת אחסון מדומה");
  });
});

describe("migrations — meta schemaVersion vs registry", () => {
  it('no meta record ⇒ "דורש תשומת לב"', async () => {
    const env = await makeEnv({ collections: { meta: [] } });
    const c = await checkMigrations(env);
    expect(c.state).toBe("דורש תשומת לב");
  });

  it('all registered applied ⇒ "תקין"', async () => {
    const meta: SchemaMetaRecord = {
      ...baseRecord(SCHEMA_META_ID),
      schemaVersion: ALL_MIGRATIONS.length,
      appliedMigrations: ALL_MIGRATIONS.map((m) => m.id),
    };
    const env = await makeEnv({ collections: { meta: [meta] } });
    const c = await checkMigrations(env);
    expect(c.state).toBe("תקין");
    expect(c.detailHe).toContain(String(ALL_MIGRATIONS.length));
  });

  it("pending migrations are listed by id", async () => {
    const meta: SchemaMetaRecord = {
      ...baseRecord(SCHEMA_META_ID),
      schemaVersion: 1,
      appliedMigrations: [ALL_MIGRATIONS[0]?.id ?? "m001"],
    };
    const env = await makeEnv({ collections: { meta: [meta] } });
    const c = await checkMigrations(env);
    expect(c.state).toBe("דורש תשומת לב");
    const lastId = ALL_MIGRATIONS[ALL_MIGRATIONS.length - 1]?.id ?? "";
    expect(c.detailHe).toContain(lastId);
  });
});

describe("local AI provider — a real summarize operation, not a render inference", () => {
  it("valid envelope ⇒ תקין", async () => {
    const env = await makeEnv();
    const c = await checkLocalProvider(env);
    expect(c.state).toBe("תקין");
  });

  it("envelope violating the contract (wrong provider / fake model) ⇒ דורש תשומת לב", async () => {
    const env = await makeEnv({
      localProvider: fakeProvider(
        { state: "מחובר", checkedAt: T0, detail: "" },
        fakeEnvelope({ provider: "llm-pretender", model: "gpt-fake" }),
      ),
    });
    const c = await checkLocalProvider(env);
    expect(c.state).toBe("דורש תשומת לב");
  });

  it("summarize throwing ⇒ honest failure state", async () => {
    const env = await makeEnv({
      localProvider: fakeProvider(
        { state: "מחובר", checkedAt: T0, detail: "" },
        fakeEnvelope(),
        new Error("המנוע קרס"),
      ),
    });
    const c = await checkLocalProvider(env);
    expect(c.state).toBe("דורש תשומת לב");
    expect(c.lastFailure).toBe(T0);
  });
});

describe('remote AI provider — NEVER "תקין" without a verified server check', () => {
  it('server says מושבת ⇒ component "לא הוגדר", not green', async () => {
    const env = await makeEnv();
    const c = await checkRemoteProvider(env);
    expect(c.state).toBe("לא הוגדר");
    expect(c.detailHe).toContain("מושבת");
  });

  it('real RemoteAIProvider with unreachable server ⇒ "לא זמין" with the netlify-dev limitation', async () => {
    const remote = new RemoteAIProvider({
      fetchImpl: () => Promise.reject(new Error("ECONNREFUSED")),
    });
    const env = await makeEnv({ remoteProvider: remote });
    const c = await checkRemoteProvider(env);
    expect(c.state).toBe("לא זמין");
    expect(c.limitationHe).toContain("netlify dev");
  });

  it('real RemoteAIProvider with malformed health body ⇒ "לא זמין" (unverified is never green)', async () => {
    const remote = new RemoteAIProvider({
      fetchImpl: () =>
        Promise.resolve(new Response(JSON.stringify({ totally: "wrong" }), { status: 200 })),
    });
    const env = await makeEnv({ remoteProvider: remote });
    const c = await checkRemoteProvider(env);
    expect(c.state).toBe("לא זמין");
  });

  it("only a server-verified «מחובר» yields תקין", async () => {
    const env = await makeEnv({
      remoteProvider: fakeProvider({ state: "מחובר", checkedAt: T0, detail: "אומת בשרת" }),
    });
    const c = await checkRemoteProvider(env);
    expect(c.state).toBe("תקין");
  });
});

describe("netlify functions — real fetch with short timeout", () => {
  it("responding 200 ⇒ תקין", async () => {
    const env = await makeEnv({
      fetchImpl: () => Promise.resolve(new Response("{}", { status: 200 })),
    });
    const c = await checkNetlifyFunctions(env);
    expect(c.state).toBe("תקין");
    expect(c.detailHe).toContain("200");
  });

  it('unreachable ⇒ honest "לא זמין" naming the local-env limitation', async () => {
    const env = await makeEnv({ fetchImpl: () => Promise.reject(new Error("no server")) });
    const c = await checkNetlifyFunctions(env);
    expect(c.state).toBe("לא זמין");
    expect(c.limitationHe).toContain("netlify dev");
  });

  it('no fetch API at all ⇒ "לא ניתן למדידה"', async () => {
    const env = await makeEnv({ fetchImpl: null });
    const c = await checkNetlifyFunctions(env);
    expect(c.state).toBe("לא ניתן למדידה");
    expect(c.responseTimeMs).toBeNull();
  });
});

describe("approval engine + queues + automation runs", () => {
  it("engine constructs and pending approvals are counted", async () => {
    const env = await makeEnv();
    const c = await checkApprovalEngine(env);
    expect(c.state).toBe("תקין");
    expect(c.detailHe).toMatch(/\d+ אישורים ממתינים/);
  });

  it("blocked agent queues (ממתין לאישור) ⇒ מוגבל", async () => {
    const task: AgentTask = {
      ...baseRecord("at-x1"),
      agentId: "ag-1",
      title: "משימה",
      description: "",
      status: "ממתין לאישור",
      evidenceIds: [],
      approvalId: null,
    };
    const env = await makeEnv({ collections: { agentTasks: [task] } });
    const c = await checkAgentQueues(env);
    expect(c.state).toBe("מוגבל");
    expect(c.detailHe).toContain("1 חסומות");
  });

  it("a failed automation run ⇒ דורש תשומת לב", async () => {
    const run: AutomationRun = {
      ...baseRecord("ar-x1"),
      automationId: "au-1",
      startedAt: T0,
      endedAt: T0,
      outcome: "כישלון",
      stepsLog: [],
      triggeredBy: "system",
    };
    const env = await makeEnv({ collections: { automationRuns: [run] } });
    const c = await checkAutomationRuns(env);
    expect(c.state).toBe("דורש תשומת לב");
  });
});

describe("repository counts + search + export + storage", () => {
  it("audit repository check reports count and last write", async () => {
    const env = await makeEnv({
      collections: { auditEvents: [baseRecord("aud-1"), { ...baseRecord("aud-2"), updatedAt: "2026-07-23T10:00:00.000Z" }] },
    });
    const c = await checkAuditRepository(env);
    expect(c.state).toBe("תקין");
    expect(c.detailHe).toContain("auditEvents: 2");
    expect(c.detailHe).toContain("2026-07-23T10:00:00.000Z");
  });

  it("search smoke: deterministic ranked results over seeded customers, empty query ⇒ empty", async () => {
    const customer = {
      ...baseRecord("cu-x1"),
      name: "טרגון בדיקות",
      type: "עסק",
      phone: "",
      email: "x@y.z",
      city: "תל אביב",
      organizationId: null,
      printerSummary: "",
      courseNames: [],
      revenue: 0,
      contactState: "פעיל",
      review: null,
      status: "פעיל",
    } as unknown as Customer;
    const env = await makeEnv({
      collections: { customers: [customer], leads: [], tasks: [] },
    });
    const c = await checkSearchIndex(env);
    expect(c.state).toBe("תקין");
    expect(c.detailHe).toContain("1 תוצאות");
  });

  it("export dry-run: redaction self-test + selection over V2 records only", async () => {
    const env = await makeEnv({ collections: { memoryRecords: [baseRecord("legacy-1")] } });
    const c = await checkExportEngine(env);
    expect(c.state).toBe("תקין");
    expect(c.detailHe).toContain("נבחרו 0 רשומות");
  });

  it('storage estimate: API missing ⇒ "לא ניתן למדידה"; measured ⇒ תקין', async () => {
    const missing = await makeEnv({ storage: null });
    expect((await checkStorageEstimate(missing)).state).toBe("לא ניתן למדידה");

    const present = await makeEnv({ storage: { usage: 5 * 1024 * 1024, quota: 100 * 1024 * 1024 } });
    const c = await checkStorageEstimate(present);
    expect(c.state).toBe("תקין");
    expect(c.detailHe).toContain("5.0MB");
  });
});
