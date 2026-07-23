// TERAGON AI BUSINESS OS — system-health domain types (Wave 8, W8-D, Phase 8.9).
//
// Truthfulness contract: a component state is NEVER inferred from "the page
// rendered" — it comes only from a real check method that ran and measured.
// Anything unchecked is "טרם נבדק"; anything unconfigured is "לא הוגדר";
// anything the browser cannot measure is "לא ניתן למדידה". There is no code
// path that produces a green state without a passed check.
import type { BaseEntity, ISODate } from "@/domain/types";

// ---------------------------------------------------------------------------
// component states — exact Hebrew product values
// ---------------------------------------------------------------------------

export const COMPONENT_STATES = [
  "תקין",
  "מוגבל",
  "דורש תשומת לב",
  "לא זמין",
  "לא הוגדר",
  "לא ניתן למדידה",
  "טרם נבדק",
] as const;

export type ComponentState = (typeof COMPONENT_STATES)[number];

/** The canonical 15 checked components (see SYSTEM_HEALTH_ARCHITECTURE.md). */
export const HEALTH_COMPONENT_IDS = [
  "indexeddb",
  "repositories",
  "migrations",
  "local-ai-provider",
  "remote-ai-provider",
  "netlify-functions",
  "approval-engine",
  "audit-repository",
  "memory-repository",
  "knowledge-repository",
  "agent-queues",
  "automation-runs",
  "search-index",
  "export-engine",
  "storage-estimate",
] as const;

export type HealthComponentId = (typeof HEALTH_COMPONENT_IDS)[number];

export const HEALTH_COMPONENT_NAMES_HE: Record<HealthComponentId, string> = {
  indexeddb: "מסד הנתונים המקומי (IndexedDB)",
  repositories: "שכבת ה-Repositories",
  migrations: "מיגרציות סכימה",
  "local-ai-provider": "מנוע ה-AI המקומי (כללים)",
  "remote-ai-provider": "ספק ה-AI המרוחק",
  "netlify-functions": "פונקציות השרת (Netlify)",
  "approval-engine": "מנגנון האישורים",
  "audit-repository": "יומן הביקורת (Audit)",
  "memory-repository": "הזיכרון הארגוני",
  "knowledge-repository": "מאגר הידע",
  "agent-queues": "תורי הסוכנים",
  "automation-runs": "ריצות אוטומציה",
  "search-index": "אינדקס החיפוש",
  "export-engine": "מנוע הייצוא",
  "storage-estimate": "אומדן שטח אחסון",
};

// ---------------------------------------------------------------------------
// per-component health record
// ---------------------------------------------------------------------------

export interface SystemComponentHealth {
  componentId: HealthComponentId;
  nameHe: string;
  state: ComponentState;
  /** when the check last ran; null ⇒ never ran ("טרם נבדק") */
  lastCheck: ISODate | null;
  /** honest Hebrew description of HOW the state was determined */
  checkMethodHe: string;
  /** measured milliseconds; null ⇒ not measured (never invented) */
  responseTimeMs: number | null;
  lastSuccess: ISODate | null;
  lastFailure: ISODate | null;
  /** known limitation of the check or the component in this environment */
  limitationHe: string | null;
  recommendedActionHe: string | null;
  /** short Hebrew finding (counts, versions…) — never a stack trace */
  detailHe: string;
}

// ---------------------------------------------------------------------------
// section records
// ---------------------------------------------------------------------------

export interface StorageHealth {
  /** null ⇒ navigator.storage.estimate unavailable ⇒ "לא ניתן למדידה" */
  usageBytes: number | null;
  quotaBytes: number | null;
  measured: boolean;
  detailHe: string;
}

export interface MigrationHealth {
  /** schemaVersion from the meta record; null ⇒ meta unreadable */
  schemaVersion: number | null;
  registeredMigrations: number;
  appliedMigrations: number;
  pendingMigrations: string[];
  detailHe: string;
}

export interface RepositoryHealth {
  collection: string;
  count: number | null;
  /** most recent updatedAt observed; null ⇒ empty or unreadable */
  lastWrite: ISODate | null;
}

export interface FunctionHealth {
  name: string;
  reachable: boolean | null;
  httpStatus: number | null;
  detailHe: string;
}

export interface ProviderHealthRecord {
  providerId: string;
  displayNameHe: string;
  /** the provider-level Hebrew state (AIProviderHealthState vocabulary) */
  stateHe: string;
  checkedAt: ISODate | null;
  detailHe: string;
}

export interface QueueHealth {
  agentId: string;
  queued: number;
}

export interface BuildInformation {
  /** vite mode (real, always available at build) */
  mode: string;
  /** VITE_APP_VERSION define when supplied; otherwise honest "לא סופק בזמן build" */
  appVersion: string;
  /** VITE_BUILD_COMMIT define when supplied; otherwise honest "לא סופק בזמן build" */
  commit: string;
  detailHe: string;
}

export interface RuntimeDiagnostic {
  key: string;
  labelHe: string;
  /** measured/observed value; null ⇒ not measurable in this environment */
  value: string | null;
}

/** Incident opened from the health page into the governance incidents collection. */
export interface HealthIncident extends BaseEntity {
  componentId: HealthComponentId;
  titleHe: string;
  descriptionHe: string;
  stateAtOpen: ComponentState;
  openedBy: string;
  status: "פתוח" | "סגור";
  source: "system-health";
}

// ---------------------------------------------------------------------------
// snapshot — persisted to the healthSnapshots collection
// ---------------------------------------------------------------------------

export interface SystemHealthSnapshot extends BaseEntity {
  takenAt: ISODate;
  components: SystemComponentHealth[];
  storage: StorageHealth;
  migration: MigrationHealth;
  build: BuildInformation;
  /** honest tallies derived from components (no invented aggregate score) */
  okCount: number;
  attentionCount: number;
  unavailableCount: number;
  uncheckedCount: number;
}
