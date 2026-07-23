// TERAGON AI BUSINESS OS — controlled settings store (Wave 8, W8-D, Phase 8.11).
//
// Every setting is a TYPED record: zod validation + allowed range + default +
// explanation + owner + lastChanged. Sensitive settings write an AuditEvent on
// change; approval-required settings go through the canonical ApprovalEngine
// and apply ONLY after a human decision. Values live in the `meta` collection
// (record id "settings") — documented in docs/SETTINGS_REFERENCE.md.
//
// Hard rules enforced here (and tested):
// - RTL is immutable — no code path can change it
// - NO API key / secret is ever stored or accepted (no such setting exists)
// - a non-editable setting REFUSES writes with its Hebrew reason
import { z } from "zod";
import type { AuditEvent, BaseEntity, ISODate } from "@/domain/types";
import type { CollectionKey } from "@/repositories/collections";
import type { Repository } from "@/repositories/Repository";
import { getRepository } from "@/repositories/factory";
import { nextId } from "@/repositories/Repository";
import { ApprovalEngine } from "@/agents/approvalEngine";
import { agentStores, type AgentStores } from "@/repositories/agentStores";

// ---------------------------------------------------------------------------
// groups
// ---------------------------------------------------------------------------

export const SETTING_GROUPS = [
  "business",
  "interface",
  "notifications",
  "ai",
  "memory-knowledge",
  "security",
  "demo",
] as const;

export type SettingGroupId = (typeof SETTING_GROUPS)[number];

export const SETTING_GROUP_LABELS_HE: Record<SettingGroupId, string> = {
  business: "עסק",
  interface: "ממשק",
  notifications: "התראות",
  ai: "AI",
  "memory-knowledge": "זיכרון וידע",
  security: "אבטחה",
  demo: "הדגמה",
};

// ---------------------------------------------------------------------------
// definition registry
// ---------------------------------------------------------------------------

export type SettingValue = string | number | boolean;

export interface SettingDefinition {
  key: string;
  group: SettingGroupId;
  labelHe: string;
  /** what the setting does + honest consumption status */
  explanationHe: string;
  /** human description of the allowed range shown next to the control */
  allowedHe: string;
  owner: string;
  schema: z.ZodType<SettingValue>;
  defaultValue: SettingValue;
  /** true ⇒ change writes an AuditEvent */
  sensitive: boolean;
  /** true ⇒ change goes through the canonical ApprovalEngine before applying */
  requiresApproval: boolean;
  /** false ⇒ read-only display; readOnlyReasonHe is mandatory then */
  editable: boolean;
  readOnlyReasonHe: string | null;
  /** UI control hint */
  control: "text" | "number" | "toggle" | "select";
  options?: readonly string[];
}

export const SETTINGS_OWNER = "צחי זוסטייהם";

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  // ── עסק ────────────────────────────────────────────────────────────────
  {
    key: "business.name",
    group: "business",
    labelHe: "שם העסק",
    explanationHe: "השם המוצג בכותרות ובמסמכים. ברירת המחדל מארגון ה-seed (org-1).",
    allowedHe: "טקסט, 2–60 תווים",
    owner: SETTINGS_OWNER,
    schema: z.string().min(2).max(60),
    defaultValue: "טרגון טכנולוגיות",
    sensitive: false,
    requiresApproval: false,
    editable: true,
    readOnlyReasonHe: null,
    control: "text",
  },
  {
    key: "business.defaultCurrency",
    group: "business",
    labelHe: "מטבע ברירת מחדל",
    explanationHe: "כל הסכומים במערכת מוצגים בשקלים.",
    allowedHe: "₪ (ILS) בלבד",
    owner: SETTINGS_OWNER,
    schema: z.literal("ILS"),
    defaultValue: "ILS",
    sensitive: false,
    requiresApproval: false,
    editable: false,
    readOnlyReasonHe: "המערכת מיישמת ₪ בלבד בכל המסכים — מטבעות נוספים אינם ממומשים",
    control: "select",
    options: ["ILS"],
  },
  {
    key: "business.quotationValidityDays",
    group: "business",
    labelHe: "תוקף הצעת מחיר (ימים)",
    explanationHe:
      "ברירת מחדל ארגונית לתוקף הצעה. נשמר כאן; חיווט מודול המכירות לצריכת הערך — בבקשות האינטגרציה (W8-D).",
    allowedHe: "מספר שלם בין 7 ל-90",
    owner: SETTINGS_OWNER,
    schema: z.number().int().min(7).max(90),
    defaultValue: 30,
    sensitive: false,
    requiresApproval: false,
    editable: true,
    readOnlyReasonHe: null,
    control: "number",
  },
  // ── ממשק ───────────────────────────────────────────────────────────────
  {
    key: "interface.rtl",
    group: "interface",
    labelHe: "כיווניות עברית (RTL)",
    explanationHe: "עברית מימין-לשמאל היא חוזה המוצר.",
    allowedHe: "פעיל תמיד",
    owner: SETTINGS_OWNER,
    schema: z.literal(true),
    defaultValue: true,
    sensitive: false,
    requiresApproval: false,
    editable: false,
    readOnlyReasonHe: "RTL אינו ניתן לכיבוי — זהו חוזה המוצר, לא העדפה",
    control: "toggle",
  },
  {
    key: "interface.density",
    group: "interface",
    labelHe: "צפיפות תצוגה",
    explanationHe: "״צפוף״ מקטין את בסיס הטיפוגרפיה (font-size שורש) — חל מיידית.",
    allowedHe: "רגיל / צפוף",
    owner: SETTINGS_OWNER,
    schema: z.enum(["רגיל", "צפוף"]),
    defaultValue: "רגיל",
    sensitive: false,
    requiresApproval: false,
    editable: true,
    readOnlyReasonHe: null,
    control: "select",
    options: ["רגיל", "צפוף"],
  },
  {
    key: "interface.tablePageSize",
    group: "interface",
    labelHe: "שורות בעמוד טבלה",
    explanationHe: "גודל עמוד להיסטוריית תצלומי הבריאות בעמוד ״בריאות המערכת״ — צרכן אמיתי של הערך.",
    allowedHe: "מספר שלם בין 5 ל-50",
    owner: SETTINGS_OWNER,
    schema: z.number().int().min(5).max(50),
    defaultValue: 10,
    sensitive: false,
    requiresApproval: false,
    editable: true,
    readOnlyReasonHe: null,
    control: "number",
  },
  {
    key: "interface.reducedMotion",
    group: "interface",
    labelHe: "הפחתת אנימציות (override)",
    explanationHe: "המערכת מכבדת את prefers-reduced-motion של מערכת ההפעלה.",
    allowedHe: "לפי הגדרת מערכת ההפעלה",
    owner: SETTINGS_OWNER,
    schema: z.boolean(),
    defaultValue: false,
    sensitive: false,
    requiresApproval: false,
    editable: false,
    readOnlyReasonHe:
      "מנגנון האנימציות הגלובלי טרם קורא דגל override מקומי — בקשת אינטגרציה פתוחה; אין כאן מתג מת",
    control: "toggle",
  },
  // ── התראות ─────────────────────────────────────────────────────────────
  {
    key: "notifications.navBadges",
    group: "notifications",
    labelHe: "תגי התראה בניווט",
    explanationHe: "תגי הניווט נגזרים אוטומטית מהרשומות (deriveNotifications).",
    allowedHe: "פעיל — נגזר מהנתונים",
    owner: SETTINGS_OWNER,
    schema: z.boolean(),
    defaultValue: true,
    sensitive: false,
    requiresApproval: false,
    editable: false,
    readOnlyReasonHe: "התגים נגזרים מהרשומות עצמן; כיבוי סלקטיבי אינו ממומש — לא מוצג מתג מת",
    control: "toggle",
  },
  {
    key: "notifications.emailDigest",
    group: "notifications",
    labelHe: "תקציר במייל",
    explanationHe: "אין למערכת שרת דיוור.",
    allowedHe: "לא זמין",
    owner: SETTINGS_OWNER,
    schema: z.boolean(),
    defaultValue: false,
    sensitive: false,
    requiresApproval: false,
    editable: false,
    readOnlyReasonHe: "שליחת מייל אינה ממומשת (אין שרת דיוור) — המתג יופעל רק כשתהיה יכולת אמיתית",
    control: "toggle",
  },
  // ── AI ─────────────────────────────────────────────────────────────────
  {
    key: "ai.mode",
    group: "ai",
    labelHe: "מצב מנוע ה-AI",
    explanationHe: "המנוע המקומי מבוסס-הכללים הוא המנוע הראשי (Mode A).",
    allowedHe: "נקבע בצד השרת בלבד",
    owner: SETTINGS_OWNER,
    schema: z.string(),
    defaultValue: "מקומי — מנוע כללים (Mode A)",
    sensitive: false,
    requiresApproval: false,
    editable: false,
    readOnlyReasonHe: "מצב הספק נקבע בתצורת השרת (AI_REMOTE_ENABLED) — הדפדפן מציג בלבד",
    control: "text",
  },
  {
    key: "ai.remoteState",
    group: "ai",
    labelHe: "ספק מרוחק — מצב שרת",
    explanationHe:
      "תצוגה בלבד של אמת השרת (ai-health). אין שדה מפתח בשום מקום בדפדפן — הגדרת ספק: docs/AI_PROVIDER_SETUP.md.",
    allowedHe: "מדווח מהשרת בלבד",
    owner: SETTINGS_OWNER,
    schema: z.string(),
    defaultValue: "טרם נבדק",
    sensitive: false,
    requiresApproval: false,
    editable: false,
    readOnlyReasonHe: "מצב הספק המרוחק הוא אמת שרת — נקרא מ-ai-health, לא נערך בדפדפן",
    control: "text",
  },
  {
    key: "ai.approvalRequired",
    group: "ai",
    labelHe: "אישור אנושי לפעולות AI",
    explanationHe: "כל פעולת AI שמשנה נתונים דורשת אישור אנושי.",
    allowedHe: "פעיל תמיד",
    owner: SETTINGS_OWNER,
    schema: z.literal(true),
    defaultValue: true,
    sensitive: false,
    requiresApproval: false,
    editable: false,
    readOnlyReasonHe: "חוזה הממשל — אישור אנושי לפעולות משנות-נתונים אינו ניתן לכיבוי",
    control: "toggle",
  },
  {
    key: "ai.dailyBudget",
    group: "ai",
    labelHe: "תקציב AI יומי",
    explanationHe: "התקציב נאכף ונמדד בצד השרת (AI_DAILY_BUDGET).",
    allowedHe: "מוצג מהשרת; ללא מדידה — ״טרם נמדד״",
    owner: SETTINGS_OWNER,
    schema: z.string(),
    defaultValue: "טרם נמדד",
    sensitive: false,
    requiresApproval: false,
    editable: false,
    readOnlyReasonHe: "תקציב נמדד ונאכף בשרת בלבד — הדפדפן אינו ממציא ערך",
    control: "text",
  },
  {
    key: "ai.fallbackBehavior",
    group: "ai",
    labelHe: "התנהגות נפילה (fallback)",
    explanationHe: "כשספק מרוחק אינו זמין — נפילה גלויה למנוע המקומי, לעולם לא שקטה.",
    allowedHe: "גלויה תמיד",
    owner: SETTINGS_OWNER,
    schema: z.string(),
    defaultValue: "נפילה גלויה למנוע המקומי — עם הודעה חובה למשתמש",
    sensitive: false,
    requiresApproval: false,
    editable: false,
    readOnlyReasonHe: "מדיניות הנפילה היא חוזה ה-ProviderRegistry — אינה העדפת משתמש",
    control: "text",
  },
  // ── זיכרון וידע ────────────────────────────────────────────────────────
  {
    key: "memory.exportIncludeSensitive",
    group: "memory-knowledge",
    labelHe: "הכללת רשומות רגישות בייצוא",
    explanationHe: "הכללת רגישים נקבעת ידנית ובמפורש בכל ייצוא בנפרד.",
    allowedHe: "החלטה פר-ייצוא בלבד",
    owner: SETTINGS_OWNER,
    schema: z.literal(false),
    defaultValue: false,
    sensitive: false,
    requiresApproval: false,
    editable: false,
    readOnlyReasonHe: "אין ברירת מחדל גורפת לרגישים — ההחלטה אנושית בכל ייצוא (חוזה W6-B)",
    control: "toggle",
  },
  {
    key: "knowledge.reviewIntervalDays",
    group: "memory-knowledge",
    labelHe: "מחזור סקירת ידע (ימים)",
    explanationHe: "מחזור הסקירה מנוהל בתוך ממשל הידע (knowledgeReviews).",
    allowedHe: "מנוהל במודול הידע",
    owner: SETTINGS_OWNER,
    schema: z.number().int().min(30).max(365),
    defaultValue: 90,
    sensitive: false,
    requiresApproval: false,
    editable: false,
    readOnlyReasonHe: "מחזורי סקירה נקבעים פר-מאמר בממשל הידע — ערך גורף כאן היה מתעלם מהם",
    control: "number",
  },
  // ── אבטחה (רגיש — audit + אישור קנוני) ─────────────────────────────────
  {
    key: "security.destructiveConfirm",
    group: "security",
    labelHe: "אישור כפול לפעולות הרסניות",
    explanationHe:
      "כשפעיל — איפוס נתוני ההדגמה מחייב הקלדת אישור. צרכן אמיתי: פעולת האיפוס בקבוצת ההדגמה.",
    allowedHe: "פעיל / כבוי — שינוי דורש אישור",
    owner: SETTINGS_OWNER,
    schema: z.boolean(),
    defaultValue: true,
    sensitive: true,
    requiresApproval: true,
    editable: true,
    readOnlyReasonHe: null,
    control: "toggle",
  },
  {
    key: "security.slaResponseTargetHours",
    group: "security",
    labelHe: "יעד SLA לתגובה (שעות)",
    explanationHe:
      "יעד תגובה ארגוני לפניות שירות. שינוי יעד SLA הוא החלטה ניהולית — עובר דרך מנגנון האישורים.",
    allowedHe: "מספר שלם בין 1 ל-72 — שינוי דורש אישור",
    owner: SETTINGS_OWNER,
    schema: z.number().int().min(1).max(72),
    defaultValue: 8,
    sensitive: true,
    requiresApproval: true,
    editable: true,
    readOnlyReasonHe: null,
    control: "number",
  },
  // ── הדגמה ──────────────────────────────────────────────────────────────
  {
    key: "demo.destructiveProtection",
    group: "demo",
    labelHe: "הגנת פעולות הרסניות (מצב הדגמה)",
    explanationHe:
      "מפעיל את דגל מצב-ההדגמה (useDemoModeGuard) — מודולים מחווטים מסרבים לפעולות הרסניות בזמן הדגמה לבוחן.",
    allowedHe: "פעיל / כבוי — חל מיידית על הדגל",
    owner: SETTINGS_OWNER,
    schema: z.boolean(),
    defaultValue: false,
    sensitive: false,
    requiresApproval: false,
    editable: true,
    readOnlyReasonHe: null,
    control: "toggle",
  },
] as const;

export function settingDefinition(key: string): SettingDefinition {
  const def = SETTING_DEFINITIONS.find((d) => d.key === key);
  if (!def) throw new Error(`הגדרה לא מוכרת: ${key}`);
  return def;
}

export function definitionsForGroup(group: SettingGroupId): SettingDefinition[] {
  return SETTING_DEFINITIONS.filter((d) => d.group === group);
}

// ---------------------------------------------------------------------------
// persistence — meta collection, record id "settings"
// ---------------------------------------------------------------------------

export const SETTINGS_META_ID = "settings";

export interface SettingChangeMeta {
  at: ISODate;
  by: string;
}

export interface PendingSettingChange {
  approvalId: string;
  requestedValue: SettingValue;
  requestedAt: ISODate;
  requestedBy: string;
}

export interface SettingsRecord extends BaseEntity {
  values: Record<string, SettingValue>;
  lastChanged: Record<string, SettingChangeMeta>;
  pending: Record<string, PendingSettingChange>;
}

export interface SettingsStores {
  collection<T extends BaseEntity = BaseEntity>(key: CollectionKey): Repository<T>;
  agentStores: () => AgentStores;
  now: () => ISODate;
}

export function productionSettingsStores(): SettingsStores {
  return {
    collection: <T extends BaseEntity = BaseEntity>(key: CollectionKey) => getRepository<T>(key),
    agentStores,
    now: () => new Date().toISOString(),
  };
}

export async function readSettingsRecord(stores: SettingsStores): Promise<SettingsRecord> {
  const repo = stores.collection<SettingsRecord>("meta");
  const existing = await repo.get(SETTINGS_META_ID);
  if (existing) return existing;
  const now = stores.now();
  return repo.create({
    id: SETTINGS_META_ID,
    createdAt: now,
    updatedAt: now,
    values: {},
    lastChanged: {},
    pending: {},
  });
}

/** effective value: stored (validated) or the definition default. */
export function effectiveValue(record: SettingsRecord, def: SettingDefinition): SettingValue {
  const raw = record.values[def.key];
  if (raw === undefined) return def.defaultValue;
  const parsed = def.schema.safeParse(raw);
  return parsed.success ? parsed.data : def.defaultValue;
}

// ---------------------------------------------------------------------------
// change flow
// ---------------------------------------------------------------------------

export class SettingChangeError extends Error {
  readonly reasonHe: string;
  constructor(reasonHe: string) {
    super(reasonHe);
    this.name = "SettingChangeError";
    this.reasonHe = reasonHe;
  }
}

export interface SetSettingResult {
  status: "applied" | "pending-approval";
  approvalId: string | null;
}

async function writeSettingAudit(
  stores: SettingsStores,
  def: SettingDefinition,
  detailsHe: string,
  actor: string,
): Promise<void> {
  const audit = stores.collection<AuditEvent>("auditEvents");
  const all = await audit.list();
  const now = stores.now();
  await audit.create({
    id: nextId("aud-set", all.map((a) => a.id)),
    createdAt: now,
    updatedAt: now,
    at: now,
    actor,
    action: `setting-change:${def.key}`,
    entityRef: `meta:${SETTINGS_META_ID}`,
    details: detailsHe,
    correlationId: null,
  });
}

export const SETTINGS_APPROVAL_RUN_ID = "run-settings";

/**
 * Change a setting. Validation → editability → (approval | apply+audit).
 * Approval-required changes DO NOT apply here — they wait for a human
 * decision in the approval center and are applied by
 * applyDecidedSettingApprovals().
 */
export async function setSetting(
  stores: SettingsStores,
  key: string,
  value: SettingValue,
  actor: string,
): Promise<SetSettingResult> {
  const def = settingDefinition(key);
  if (!def.editable) {
    throw new SettingChangeError(def.readOnlyReasonHe ?? "הגדרה זו אינה ניתנת לעריכה");
  }
  const parsed = def.schema.safeParse(value);
  if (!parsed.success) {
    throw new SettingChangeError(`ערך לא חוקי עבור «${def.labelHe}» — הטווח המותר: ${def.allowedHe}`);
  }
  const repo = stores.collection<SettingsRecord>("meta");
  const record = await readSettingsRecord(stores);
  const now = stores.now();

  if (def.requiresApproval) {
    const engine = new ApprovalEngine({ stores: stores.agentStores(), clock: stores.now });
    const approval = await engine.requestApproval({
      runId: SETTINGS_APPROVAL_RUN_ID,
      subjectRef: `setting:${def.key}`,
      action: "permission-change",
      requestedById: actor,
      executionPayload: null,
      previewHe: `שינוי «${def.labelHe}» ל-«${String(parsed.data)}» (${def.allowedHe})`,
    });
    await repo.update(SETTINGS_META_ID, {
      pending: {
        ...record.pending,
        [def.key]: {
          approvalId: approval.id,
          requestedValue: parsed.data,
          requestedAt: now,
          requestedBy: actor,
        },
      },
      updatedAt: now,
    });
    await writeSettingAudit(
      stores,
      def,
      `נדרש אישור לשינוי «${def.labelHe}» ל-«${String(parsed.data)}» — אישור ${approval.id}`,
      actor,
    );
    return { status: "pending-approval", approvalId: approval.id };
  }

  await repo.update(SETTINGS_META_ID, {
    values: { ...record.values, [def.key]: parsed.data },
    lastChanged: { ...record.lastChanged, [def.key]: { at: now, by: actor } },
    updatedAt: now,
  });
  if (def.sensitive) {
    await writeSettingAudit(
      stores,
      def,
      `הוחל שינוי רגיש: «${def.labelHe}» ⇒ «${String(parsed.data)}»`,
      actor,
    );
  }
  return { status: "applied", approvalId: null };
}

export interface ApprovalSyncResult {
  applied: string[];
  rejected: string[];
  stillPending: string[];
}

/**
 * Reconcile pending setting changes against the approvals collection:
 * אושר ⇒ apply value (+ audit) · נדחה ⇒ drop the pending change (+ audit) ·
 * ממתין ⇒ keep waiting. Decisions themselves happen in the approval center.
 */
export async function applyDecidedSettingApprovals(
  stores: SettingsStores,
): Promise<ApprovalSyncResult> {
  const repo = stores.collection<SettingsRecord>("meta");
  const record = await readSettingsRecord(stores);
  const approvals = stores.agentStores().approvals;
  const result: ApprovalSyncResult = { applied: [], rejected: [], stillPending: [] };
  const values = { ...record.values };
  const lastChanged = { ...record.lastChanged };
  const pending = { ...record.pending };
  let dirty = false;

  for (const [key, change] of Object.entries(record.pending)) {
    const approval = await approvals.get(change.approvalId);
    if (!approval || approval.status === "ממתין") {
      result.stillPending.push(key);
      continue;
    }
    const def = settingDefinition(key);
    delete pending[key];
    dirty = true;
    if (approval.status === "אושר") {
      values[key] = change.requestedValue;
      lastChanged[key] = { at: stores.now(), by: approval.decidedById ?? "לא ידוע" };
      result.applied.push(key);
      await writeSettingAudit(
        stores,
        def,
        `שינוי מאושר הוחל: «${def.labelHe}» ⇒ «${String(change.requestedValue)}» (אישור ${approval.id})`,
        approval.decidedById ?? "system",
      );
    } else {
      result.rejected.push(key);
      await writeSettingAudit(
        stores,
        def,
        `שינוי נדחה ולא הוחל: «${def.labelHe}» (אישור ${approval.id})`,
        approval.decidedById ?? "system",
      );
    }
  }

  if (dirty) {
    await repo.update(SETTINGS_META_ID, {
      values,
      lastChanged,
      pending,
      updatedAt: stores.now(),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// UI application — the settings that REALLY apply, applied for real
// ---------------------------------------------------------------------------

export const DENSITY_FONT_SIZE: Record<string, string> = {
  רגיל: "",
  צפוף: "93.75%",
};

/**
 * Apply the interface settings that have a real mechanism today:
 * density ⇒ root font-size scale (immediate, reversible). Boot re-application
 * is requested from the Integration Lead (docs/integration-requests-w8d.md).
 */
export function applyUiSettings(record: SettingsRecord, doc: Document | null = null): void {
  const target = doc ?? (typeof document === "undefined" ? null : document);
  if (!target) return;
  const density = effectiveValue(record, settingDefinition("interface.density"));
  target.documentElement.style.fontSize = DENSITY_FONT_SIZE[String(density)] ?? "";
}
