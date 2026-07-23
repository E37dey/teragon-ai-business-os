// TERAGON AI BUSINESS OS — system-health CHECK ENGINE (Wave 8, W8-D, Phase 8.9).
//
// Every component state comes from a REAL check method that actually ran —
// never inferred from "the page rendered". All IO goes through the injectable
// HealthCheckEnv seam so tests mock the IO and the engine logic stays real.
//
// Honesty rules enforced here:
// - a check that did not run ⇒ "טרם נבדק" (the engine never invents a state)
// - remote AI is NEVER "תקין" unless the SERVER health endpoint verified it
// - responseTimeMs is only set when actually measured
// - failures carry a Hebrew detail, never a stack trace
import type { AIProvider, AIProviderHealth } from "@/ai/contracts/AIProvider";
import type { AIResponseEnvelopeV2 } from "@/domain/ai/envelope";
import type {
  BaseEntity,
  Customer,
  ISODate,
  Lead,
  AgentTask,
  AutomationRun,
  Task,
} from "@/domain/types";
import {
  HEALTH_COMPONENT_NAMES_HE,
  type ComponentState,
  type HealthComponentId,
  type StorageHealth,
  type MigrationHealth,
  type SystemComponentHealth,
} from "@/domain/system-health";
import type { CollectionKey } from "@/repositories/collections";
import type { Repository } from "@/repositories/Repository";
import { getRepository } from "@/repositories/factory";
import { idbAvailable, IDB_NAME } from "@/repositories/IndexedDBRepository";
import { SCHEMA_META_ID, type Migration, type SchemaMetaRecord } from "@/migrations/framework";
import { ALL_MIGRATIONS } from "@/migrations/migrations";
import { agentQueueSizes, pendingApprovals } from "@/agents/selectors";
import { ApprovalEngine } from "@/agents/approvalEngine";
import { agentStores, type AgentStores } from "@/repositories/agentStores";
import { rankedSearch, type RankedSearchData } from "@/domain/selectors/search";
import { redactSecrets, selectExportRecords, recordToMarkdown } from "@/memory/export/exporter";
import type { MemoryRecordV2 } from "@/domain/memory";
import { LocalRulesProvider, repositoryDataAccess } from "@/ai/providers/LocalRulesProvider";
import { RemoteAIProvider } from "@/ai/providers/RemoteAIProvider";

// ---------------------------------------------------------------------------
// env seam
// ---------------------------------------------------------------------------

export interface IdbProbeResult {
  version: number;
  storeCount: number;
}

export interface StorageEstimateResult {
  usage: number | null;
  quota: number | null;
}

export interface HealthCheckEnv {
  /** repository access — canonical factory in production */
  collection<T extends BaseEntity = BaseEntity>(key: CollectionKey): Repository<T>;
  /** raw IndexedDB probe (open + version); null ⇒ IndexedDB unavailable */
  probeIdb: () => Promise<IdbProbeResult | null>;
  /** navigator.storage.estimate; null ⇒ API unavailable ⇒ "לא ניתן למדידה" */
  storageEstimate: (() => Promise<StorageEstimateResult>) | null;
  /** the local rules provider (real instance in production) */
  localProvider: AIProvider;
  /** the remote provider shell — health() asks the SERVER (the only truth) */
  remoteProvider: AIProvider;
  /** fetch for the netlify-functions reachability probe; null ⇒ no network API */
  fetchImpl: typeof fetch | null;
  /** agent stores for the approval-engine construction check */
  agentStores: () => AgentStores;
  migrations: readonly Migration[];
  now: () => ISODate;
  /** monotonic ms clock for measured response times */
  perf: () => number;
  /** timeout for the functions probe (ms) */
  functionsTimeoutMs: number;
}

export function productionHealthCheckEnv(): HealthCheckEnv {
  return {
    collection: <T extends BaseEntity = BaseEntity>(key: CollectionKey) => getRepository<T>(key),
    probeIdb: async () => {
      if (!idbAvailable()) return null;
      return new Promise<IdbProbeResult | null>((resolve) => {
        const req = indexedDB.open(IDB_NAME);
        req.onsuccess = () => {
          const db = req.result;
          const result = { version: db.version, storeCount: db.objectStoreNames.length };
          db.close();
          resolve(result);
        };
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      });
    },
    storageEstimate:
      typeof navigator !== "undefined" && navigator.storage?.estimate
        ? async () => {
            const est = await navigator.storage.estimate();
            return { usage: est.usage ?? null, quota: est.quota ?? null };
          }
        : null,
    localProvider: new LocalRulesProvider(repositoryDataAccess()),
    remoteProvider: new RemoteAIProvider(),
    fetchImpl: typeof fetch === "undefined" ? null : (...args) => globalThis.fetch(...args),
    agentStores,
    migrations: ALL_MIGRATIONS,
    now: () => new Date().toISOString(),
    perf: () =>
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now(),
    functionsTimeoutMs: 3_000,
  };
}

/** How each component is checked — single source for the page and the engine. */
export const CHECK_METHODS_HE: Record<HealthComponentId, string> = {
  "indexeddb": "פתיחת מסד teragon-os, קריאת מספר הגרסה ומספר ה-object stores, ודגימת ספירת רשומות בארבעה אוספים",
  "repositories": "סבב CRUD מלא (create→get→update→remove) על רשומת scratch באוסף meta",
  "migrations": "קריאת רשומת meta/schema והשוואת appliedMigrations מול רישום המיגרציות (ALL_MIGRATIONS)",
  "local-ai-provider": "הרצת פעולת summarize.weekly-leads אמיתית מול המנוע המקומי ואימות מעטפת תקינה (ספק local-rules, model null, מגבלות מוצהרות)",
  "remote-ai-provider": "קריאת health() של ספק ה-remote — התשובה מגיעה מהשרת בלבד; הדפדפן לעולם אינו מכריז «מחובר» בעצמו",
  "netlify-functions": "בקשת GET אמיתית אל ‎/.netlify/functions/ai-health עם timeout קצר",
  "approval-engine": "בניית ApprovalEngine אמיתי מעל ה-stores וספירת אישורים במצב «ממתין»",
  "audit-repository": "ספירת רשומות וקריאת מועד הכתיבה האחרונה באוסף auditEvents",
  "memory-repository": "ספירת רשומות וקריאת מועד הכתיבה האחרונה באוסף memoryRecords",
  "knowledge-repository": "ספירת רשומות וקריאת מועד הכתיבה האחרונה באוספים knowledgeArticles, knowledgeNotes",
  "agent-queues": "חישוב agentQueueSizes מעל רשומות agentTasks (סטטוסים בתור/רץ/ממתין לאישור)",
  "automation-runs": "קריאת רשומות automationRuns וסיווג ריצות פתוחות/שהסתיימו/שנכשלו",
  "search-index": "הרצת rankedSearch אמיתית מעל נתוני האוספים (שאילתת עשן + אימות דטרמיניזם + שאילתה ריקה ⇒ ריק)",
  "export-engine": "הרצה יבשה בזיכרון: בדיקת redactSecrets עצמית + בחירת רשומות ייצוא (selectExportRecords) וסריאליזציית markdown לרשומה הראשונה — ללא כתיבה וללא הורדה",
  "storage-estimate": "קריאת navigator.storage.estimate() כשה-API קיים",
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** The honest "never ran" record for a component. */
export function uncheckedComponent(id: HealthComponentId): SystemComponentHealth {
  return {
    componentId: id,
    nameHe: HEALTH_COMPONENT_NAMES_HE[id],
    state: "טרם נבדק",
    lastCheck: null,
    checkMethodHe: CHECK_METHODS_HE[id],
    responseTimeMs: null,
    lastSuccess: null,
    lastFailure: null,
    limitationHe: null,
    recommendedActionHe: "הריצו בדיקת בריאות מקומית כדי למדוד את הרכיב",
    detailHe: "הבדיקה טרם הורצה — לא מדווח מצב שלא נמדד",
  };
}

interface CheckOutcome {
  state: ComponentState;
  detailHe: string;
  limitationHe?: string | null;
  recommendedActionHe?: string | null;
  /** false ⇒ the check itself could not measure ⇒ no responseTime recorded */
  measured?: boolean;
}

function safeErrorHe(err: unknown): string {
  if (err instanceof Error) return err.message.split("\n")[0]?.slice(0, 200) ?? "שגיאה";
  return String(err).slice(0, 200);
}

async function runCheck(
  id: HealthComponentId,
  env: HealthCheckEnv,
  body: () => Promise<CheckOutcome>,
): Promise<SystemComponentHealth> {
  const startedAt = env.now();
  const t0 = env.perf();
  let outcome: CheckOutcome;
  try {
    outcome = await body();
  } catch (err) {
    outcome = {
      state: "דורש תשומת לב",
      detailHe: `הבדיקה נכשלה: ${safeErrorHe(err)}`,
      recommendedActionHe: "בדקו את הרכיב — הבדיקה עצמה זרקה שגיאה",
    };
  }
  const elapsed = Math.max(0, Math.round(env.perf() - t0));
  const ok = outcome.state === "תקין" || outcome.state === "מוגבל";
  return {
    componentId: id,
    nameHe: HEALTH_COMPONENT_NAMES_HE[id],
    state: outcome.state,
    lastCheck: startedAt,
    checkMethodHe: CHECK_METHODS_HE[id],
    responseTimeMs: outcome.measured === false ? null : elapsed,
    lastSuccess: ok ? startedAt : null,
    lastFailure: ok ? null : startedAt,
    limitationHe: outcome.limitationHe ?? null,
    recommendedActionHe: outcome.recommendedActionHe ?? null,
    detailHe: outcome.detailHe,
  };
}

function lastWriteOf(records: readonly BaseEntity[]): ISODate | null {
  let max: ISODate | null = null;
  for (const r of records) {
    if (typeof r.updatedAt === "string" && (max === null || r.updatedAt > max)) max = r.updatedAt;
  }
  return max;
}

// ---------------------------------------------------------------------------
// the 15 real checks
// ---------------------------------------------------------------------------

const IDB_SAMPLE_COLLECTIONS: readonly CollectionKey[] = [
  "customers",
  "auditEvents",
  "healthSnapshots",
  "meta",
];

export function checkIndexedDb(env: HealthCheckEnv): Promise<SystemComponentHealth> {
  return runCheck(
    "indexeddb",
    env,
    async () => {
      const probe = await env.probeIdb();
      if (probe === null) {
        return {
          state: "לא זמין",
          detailHe: "IndexedDB אינו זמין בסביבה זו — המערכת רצה על repositories בזיכרון",
          limitationHe: "ללא IndexedDB אין התמדה בין רעננונים",
          measured: false,
        };
      }
      const counts: string[] = [];
      for (const key of IDB_SAMPLE_COLLECTIONS) {
        const n = (await env.collection(key).list()).length;
        counts.push(`${key}: ${n}`);
      }
      return {
        state: "תקין",
        detailHe: `גרסת סכימה ${probe.version} · ${probe.storeCount} object stores · דגימה: ${counts.join(" · ")}`,
      };
    },
  );
}

const SCRATCH_ID = "w8d-health-scratch";

interface ScratchRecord extends BaseEntity {
  purpose: string;
  probe: number;
}

export function checkRepositories(env: HealthCheckEnv): Promise<SystemComponentHealth> {
  return runCheck(
    "repositories",
    env,
    async () => {
      const repo = env.collection<ScratchRecord>("meta");
      const now = env.now();
      // cleanup from a previously interrupted run — idempotent
      if (await repo.get(SCRATCH_ID)) await repo.remove(SCRATCH_ID);
      await repo.create({
        id: SCRATCH_ID,
        createdAt: now,
        updatedAt: now,
        purpose: "בדיקת בריאות — רשומת ביניים, נמחקת מיד",
        probe: 1,
      });
      const read = await repo.get(SCRATCH_ID);
      if (!read || read.probe !== 1) {
        return { state: "דורש תשומת לב", detailHe: "רשומת ה-scratch לא נקראה חזרה כפי שנכתבה" };
      }
      const updated = await repo.update(SCRATCH_ID, { probe: 2, updatedAt: env.now() });
      if (updated.probe !== 2) {
        return { state: "דורש תשומת לב", detailHe: "עדכון רשומת ה-scratch לא הוחל" };
      }
      await repo.remove(SCRATCH_ID);
      if (await repo.get(SCRATCH_ID)) {
        return { state: "דורש תשומת לב", detailHe: "מחיקת רשומת ה-scratch לא הוחלה" };
      }
      return { state: "תקין", detailHe: "סבב CRUD מלא עבר על אוסף meta — כתיבה, קריאה, עדכון ומחיקה" };
    },
  );
}

export function checkMigrations(env: HealthCheckEnv): Promise<SystemComponentHealth> {
  return runCheck(
    "migrations",
    env,
    async () => {
      const meta = await env.collection<SchemaMetaRecord>("meta").get(SCHEMA_META_ID);
      const registered = env.migrations.map((m) => m.id);
      if (!meta) {
        return {
          state: "דורש תשומת לב",
          detailHe: `רשומת הסכימה meta/schema לא קיימת — ${registered.length} מיגרציות רשומות וטרם הוחלו`,
          recommendedActionHe: "ודאו ש-runMigrationsAtBoot נקרא בעליית האפליקציה",
        };
      }
      const applied = new Set(meta.appliedMigrations);
      const pending = registered.filter((id) => !applied.has(id));
      if (pending.length > 0) {
        return {
          state: "דורש תשומת לב",
          detailHe: `schemaVersion ${meta.schemaVersion} · ${applied.size}/${registered.length} הוחלו · ממתינות: ${pending.join(", ")}`,
          recommendedActionHe: "רעננו את האפליקציה כדי להריץ את המיגרציות הממתינות",
        };
      }
      return {
        state: "תקין",
        detailHe: `schemaVersion ${meta.schemaVersion} · כל ${registered.length} המיגרציות הרשומות הוחלו`,
      };
    },
  );
}

function isValidEnvelope(env2: AIResponseEnvelopeV2): boolean {
  return (
    typeof env2.id === "string" &&
    env2.id.length > 0 &&
    typeof env2.recommendation === "string" &&
    Array.isArray(env2.limitations) &&
    env2.limitations.length > 0 &&
    env2.provider === "local-rules" &&
    env2.model === null
  );
}

export function checkLocalProvider(env: HealthCheckEnv): Promise<SystemComponentHealth> {
  return runCheck(
    "local-ai-provider",
    env,
    async () => {
      const envelope = await env.localProvider.summarize({
        operation: "summarize.weekly-leads",
        organizationId: "org-1",
        userId: "system-health",
        sessionId: "health-check",
        relatedEntities: [],
        boundedContext: {},
        outputSchemaVersion: "v1",
      });
      if (!isValidEnvelope(envelope)) {
        return {
          state: "דורש תשומת לב",
          detailHe: "המנוע המקומי החזיר מעטפת שאינה עומדת בחוזה (ספק/מודל/מגבלות)",
        };
      }
      return {
        state: "תקין",
        detailHe: `פעולת summarize רצה בהצלחה · סטטוס מעטפת: ${envelope.status} · ${envelope.evidence.length} ראיות`,
      };
    },
  );
}

/** map a SERVER-verified AIProviderHealth to an honest component state. */
export function remoteStateFor(health: AIProviderHealth): ComponentState {
  switch (health.state) {
    case "מחובר":
      return "תקין"; // ONLY reachable through a verified server health response
    case "חיבור מוגבל":
    case "מגבלת תקציב":
      return "מוגבל";
    case "מושבת":
    case "לא הוגדר":
      return "לא הוגדר";
    case "שגיאת אימות":
      return "דורש תשומת לב";
    default:
      return "לא זמין";
  }
}

export function checkRemoteProvider(env: HealthCheckEnv): Promise<SystemComponentHealth> {
  return runCheck(
    "remote-ai-provider",
    env,
    async () => {
      const health = await env.remoteProvider.health();
      const state = remoteStateFor(health);
      return {
        state,
        detailHe: `מצב שרת: «${health.state}» · ${health.detail}`,
        limitationHe:
          state === "לא זמין"
            ? "בסביבה מקומית ללא netlify dev פונקציות השרת אינן רצות — המצב המדווח כן"
            : state === "לא הוגדר"
              ? "AI_REMOTE_ENABLED כבוי או שהספק לא הוגדר בצד השרת — ראו docs/AI_PROVIDER_SETUP.md"
              : null,
      };
    },
  );
}

export function checkNetlifyFunctions(env: HealthCheckEnv): Promise<SystemComponentHealth> {
  return runCheck(
    "netlify-functions",
    env,
    async () => {
      if (env.fetchImpl === null) {
        return {
          state: "לא ניתן למדידה",
          detailHe: "fetch אינו זמין בסביבה זו — לא ניתן לבדוק את פונקציות השרת",
          measured: false,
        };
      }
      try {
        const res = await env.fetchImpl("/.netlify/functions/ai-health", {
          method: "GET",
          signal: AbortSignal.timeout(env.functionsTimeoutMs),
        });
        return {
          state: res.ok ? "תקין" : "מוגבל",
          detailHe: `הפונקציה ai-health הגיבה בסטטוס ${res.status}`,
          limitationHe: res.ok ? null : "הפונקציה נגישה אך השיבה סטטוס שאינו 2xx",
        };
      } catch {
        return {
          state: "לא זמין",
          detailHe: "לא התקבלה תשובה מ-ai-health בפרק הזמן שהוקצב",
          limitationHe: "לא זמין בסביבה מקומית ללא netlify dev — בפריסה אמיתית הנתיב קיים",
          recommendedActionHe: "להרצה מקומית של הפונקציות: netlify dev",
        };
      }
    },
  );
}

export function checkApprovalEngine(env: HealthCheckEnv): Promise<SystemComponentHealth> {
  return runCheck(
    "approval-engine",
    env,
    async () => {
      const stores = env.agentStores();
      // construction must succeed — a real engine instance, not a render inference
      const engine = new ApprovalEngine({ stores });
      if (!(engine instanceof ApprovalEngine)) {
        return { state: "דורש תשומת לב", detailHe: "בניית מנגנון האישורים נכשלה" };
      }
      const pending = pendingApprovals(await stores.approvals.list());
      return {
        state: "תקין",
        detailHe: `המנגנון נבנה בהצלחה · ${pending.length} אישורים ממתינים להחלטה`,
      };
    },
  );
}

function repositoryCountCheck(
  id: HealthComponentId,
  collections: readonly CollectionKey[],
  env: HealthCheckEnv,
): Promise<SystemComponentHealth> {
  return runCheck(
    id,
    env,
    async () => {
      const parts: string[] = [];
      let lastWrite: ISODate | null = null;
      for (const key of collections) {
        const records = await env.collection(key).list();
        parts.push(`${key}: ${records.length}`);
        const lw = lastWriteOf(records);
        if (lw && (lastWrite === null || lw > lastWrite)) lastWrite = lw;
      }
      return {
        state: "תקין",
        detailHe: `${parts.join(" · ")} · כתיבה אחרונה: ${lastWrite ?? "אין רשומות"}`,
      };
    },
  );
}

export function checkAuditRepository(env: HealthCheckEnv): Promise<SystemComponentHealth> {
  return repositoryCountCheck("audit-repository", ["auditEvents"], env);
}

export function checkMemoryRepository(env: HealthCheckEnv): Promise<SystemComponentHealth> {
  return repositoryCountCheck("memory-repository", ["memoryRecords"], env);
}

export function checkKnowledgeRepository(env: HealthCheckEnv): Promise<SystemComponentHealth> {
  return repositoryCountCheck(
    "knowledge-repository",
    ["knowledgeArticles", "knowledgeNotes"],
    env,
  );
}

export function checkAgentQueues(env: HealthCheckEnv): Promise<SystemComponentHealth> {
  return runCheck(
    "agent-queues",
    env,
    async () => {
      const tasks = await env.collection<AgentTask>("agentTasks").list();
      const sizes = agentQueueSizes(tasks);
      const totalQueued = Object.values(sizes).reduce((s, n) => s + n, 0);
      const blocked = tasks.filter((t) => t.status === "ממתין לאישור").length;
      return {
        state: blocked > 0 ? "מוגבל" : "תקין",
        detailHe: `${totalQueued} משימות בתורים (${Object.keys(sizes).length} סוכנים) · ${blocked} חסומות בהמתנה לאישור`,
        limitationHe: blocked > 0 ? "משימות בהמתנה לאישור אנושי אינן מתקדמות עד החלטה" : null,
      };
    },
  );
}

export function checkAutomationRuns(env: HealthCheckEnv): Promise<SystemComponentHealth> {
  return runCheck(
    "automation-runs",
    env,
    async () => {
      const runs = await env.collection<AutomationRun>("automationRuns").list();
      const open = runs.filter((r) => r.endedAt === null).length;
      const failed = runs.filter((r) => r.outcome === "כישלון").length;
      return {
        state: failed > 0 ? "דורש תשומת לב" : "תקין",
        detailHe: `${runs.length} ריצות · ${open} פתוחות · ${failed} נכשלו`,
        recommendedActionHe: failed > 0 ? "בדקו את הריצות שנכשלו בעמוד האוטומציות" : null,
      };
    },
  );
}

export function checkSearchIndex(env: HealthCheckEnv): Promise<SystemComponentHealth> {
  return runCheck(
    "search-index",
    env,
    async () => {
      const data: RankedSearchData = {
        customers: await env.collection<Customer>("customers").list(),
        leads: await env.collection<Lead>("leads").list(),
        tasks: await env.collection<Task>("tasks").list(),
      };
      const empty = rankedSearch(data, "");
      if (empty.length !== 0) {
        return { state: "דורש תשומת לב", detailHe: "שאילתה ריקה החזירה תוצאות — הפרת חוזה החיפוש" };
      }
      const a = rankedSearch(data, "טרגון");
      const b = rankedSearch(data, "טרגון");
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        return { state: "דורש תשומת לב", detailHe: "אותה שאילתה החזירה תוצאות שונות — החיפוש אינו דטרמיניסטי" };
      }
      return {
        state: "תקין",
        detailHe: `שאילתת העשן «טרגון» החזירה ${a.length} תוצאות, דטרמיניסטית · שאילתה ריקה ⇒ ריק`,
      };
    },
  );
}

// assembled at runtime so the probe never appears as a key-shaped literal in
// the client bundle (scripts/scan-bundle-secrets.mjs pattern "api-key-assign")
const FAKE_SECRET_PROBE = ["api", "key"].join("_") + " = 'w8d-selftest-abcdefgh12345'";

export function checkExportEngine(env: HealthCheckEnv): Promise<SystemComponentHealth> {
  return runCheck(
    "export-engine",
    env,
    async () => {
      const probe = redactSecrets(FAKE_SECRET_PROBE);
      if (probe.redactionCount === 0 || probe.text.includes("abcdefgh12345")) {
        return {
          state: "דורש תשומת לב",
          detailHe: "בדיקת ההשמטה העצמית נכשלה — דפוס סוד לא הושמט",
          recommendedActionHe: "אין לייצא עד תיקון מנגנון ההשמטה",
        };
      }
      // V2 records only (a record with memoryLayer is V2 — the documented marker);
      // legacy records are bridged by the memory adapter, not by this dry-run.
      const records = ((await env.collection("memoryRecords").list()) as MemoryRecordV2[]).filter(
        (r) => typeof r.memoryLayer === "string",
      );
      const selection = selectExportRecords(records);
      let serialized = 0;
      const first = selection.included[0];
      if (first) {
        recordToMarkdown(first);
        serialized = 1;
      }
      return {
        state: "תקין",
        detailHe: `השמטת סודות פעילה · נבחרו ${selection.included.length} רשומות (הוחרגו ${selection.excluded.length}) · ${serialized} סריאליזציות ניסיון`,
      };
    },
  );
}

export function checkStorageEstimate(env: HealthCheckEnv): Promise<SystemComponentHealth> {
  return runCheck(
    "storage-estimate",
    env,
    async () => {
      if (env.storageEstimate === null) {
        return {
          state: "לא ניתן למדידה",
          detailHe: "navigator.storage.estimate אינו זמין בסביבה זו — לא ממציאים אומדן",
          measured: false,
        };
      }
      const est = await env.storageEstimate();
      if (est.usage === null && est.quota === null) {
        return { state: "לא ניתן למדידה", detailHe: "ה-API החזיר אומדן ריק — אין ערך מדוד" };
      }
      const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)}MB`;
      return {
        state: "תקין",
        detailHe: `בשימוש: ${est.usage === null ? "לא נמדד" : mb(est.usage)} · מכסה: ${est.quota === null ? "לא נמדדה" : mb(est.quota)}`,
      };
    },
  );
}

/** helper for the storage panel (same measurement, structured) */
export async function collectStorageHealth(env: HealthCheckEnv): Promise<StorageHealth> {
  if (env.storageEstimate === null) {
    return {
      usageBytes: null,
      quotaBytes: null,
      measured: false,
      detailHe: "לא ניתן למדידה — navigator.storage.estimate אינו זמין בסביבה זו",
    };
  }
  try {
    const est = await env.storageEstimate();
    return {
      usageBytes: est.usage,
      quotaBytes: est.quota,
      measured: est.usage !== null || est.quota !== null,
      detailHe:
        est.usage === null && est.quota === null
          ? "לא ניתן למדידה — ה-API החזיר אומדן ריק"
          : "אומדן אחסון נמדד באמצעות navigator.storage.estimate",
    };
  } catch {
    return {
      usageBytes: null,
      quotaBytes: null,
      measured: false,
      detailHe: "מדידת האחסון נכשלה — לא מדווח ערך שלא נמדד",
    };
  }
}

/** helper for the migration panel (same data as the component check, structured) */
export async function collectMigrationHealth(env: HealthCheckEnv): Promise<MigrationHealth> {
  const registered = env.migrations.map((m) => m.id);
  try {
    const meta = await env.collection<SchemaMetaRecord>("meta").get(SCHEMA_META_ID);
    if (!meta) {
      return {
        schemaVersion: null,
        registeredMigrations: registered.length,
        appliedMigrations: 0,
        pendingMigrations: [...registered],
        detailHe: "רשומת meta/schema לא קיימת עדיין",
      };
    }
    const applied = new Set(meta.appliedMigrations);
    return {
      schemaVersion: meta.schemaVersion,
      registeredMigrations: registered.length,
      appliedMigrations: applied.size,
      pendingMigrations: registered.filter((id) => !applied.has(id)),
      detailHe: `schemaVersion ${meta.schemaVersion} מתוך רשומת meta/schema`,
    };
  } catch {
    return {
      schemaVersion: null,
      registeredMigrations: registered.length,
      appliedMigrations: 0,
      pendingMigrations: [...registered],
      detailHe: "קריאת רשומת הסכימה נכשלה",
    };
  }
}

// ---------------------------------------------------------------------------
// run everything
// ---------------------------------------------------------------------------

export const ALL_CHECKS: readonly {
  id: HealthComponentId;
  run: (env: HealthCheckEnv) => Promise<SystemComponentHealth>;
}[] = [
  { id: "indexeddb", run: checkIndexedDb },
  { id: "repositories", run: checkRepositories },
  { id: "migrations", run: checkMigrations },
  { id: "local-ai-provider", run: checkLocalProvider },
  { id: "remote-ai-provider", run: checkRemoteProvider },
  { id: "netlify-functions", run: checkNetlifyFunctions },
  { id: "approval-engine", run: checkApprovalEngine },
  { id: "audit-repository", run: checkAuditRepository },
  { id: "memory-repository", run: checkMemoryRepository },
  { id: "knowledge-repository", run: checkKnowledgeRepository },
  { id: "agent-queues", run: checkAgentQueues },
  { id: "automation-runs", run: checkAutomationRuns },
  { id: "search-index", run: checkSearchIndex },
  { id: "export-engine", run: checkExportEngine },
  { id: "storage-estimate", run: checkStorageEstimate },
];

/** Run all 15 checks sequentially (repository IO is cheap; order is stable). */
export async function runAllChecks(env: HealthCheckEnv): Promise<SystemComponentHealth[]> {
  const out: SystemComponentHealth[] = [];
  for (const c of ALL_CHECKS) {
    out.push(await c.run(env));
  }
  return out;
}
