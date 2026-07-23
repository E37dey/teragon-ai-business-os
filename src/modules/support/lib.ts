// Support module — pure derivations: tier model (ref 19), SLA timers vs
// per-tier targets, deterministic category classifier, recurring-issue
// detection. Wave 6 (m002): tier/assigneeId/category/feedback live on the
// record (extension typing in src/integration/domainExtensions.ts until the
// lead folds them into domain/types.ts); reading FALLS BACK to the legacy
// ⟦…⟧ description markers for un-migrated records. Unit-tested.
import type { KnowledgeNote, SupportRequest } from "@/domain/types";
import type { SupportRequestX } from "@/integration/domainExtensions";

export const RULES_ENGINE_LABEL = "מנוע מקומי מבוסס כללים";

export type Tier = 1 | 2 | 3;

export const TIER_INFO: Record<Tier, { title: string; subtitle: string; footerTime: string }> = {
  1: { title: "Tier 1", subtitle: "שירות עצמי", footerTime: "מיידי" },
  2: { title: "Tier 2", subtitle: "Champions", footerTime: "שעתיים" },
  3: { title: "Tier 3", subtitle: "AI Implementer + IT + Compliance", footerTime: "יום עבודה" },
};

/** SLA resolution target per tier, in hours (ref 19: מיידי / שעתיים / יום עבודה). */
export const TIER_SLA_HOURS: Record<Tier, number> = { 1: 1, 2: 2, 3: 8 };

// ── markers (module-local persistence inside description) ───────────────────
const TIER_MARKER = /\s*⟦Tier:([123])⟧/;
const ASSIGNEE_MARKER = /\s*⟦מטפל:([^⟧]+)⟧/;
const FEEDBACK_MARKER = /\s*⟦משוב:(חיובי|שלילי)⟧/;

export interface ParsedSupport {
  tier: Tier;
  assigneeId: string | null;
  feedback: "חיובי" | "שלילי" | null;
  clean: string;
}

export function parseSupport(description: string): ParsedSupport {
  let clean = description;
  let tier: Tier = 1;
  const tm = TIER_MARKER.exec(clean);
  if (tm?.[1]) tier = Number(tm[1]) as Tier;
  clean = clean.replace(TIER_MARKER, "");
  const am = ASSIGNEE_MARKER.exec(clean);
  const assigneeId = am?.[1] ?? null;
  clean = clean.replace(ASSIGNEE_MARKER, "");
  const fm = FEEDBACK_MARKER.exec(clean);
  const feedback = (fm?.[1] as "חיובי" | "שלילי" | undefined) ?? null;
  clean = clean.replace(FEEDBACK_MARKER, "").trim();
  return { tier, assigneeId, feedback, clean };
}

/**
 * Effective support fields: canonical record fields (m002) win; legacy ⟦…⟧
 * markers in the description are the fallback for un-migrated records.
 */
export function effectiveSupport(sr: SupportRequest): ParsedSupport {
  const ext = sr as SupportRequestX;
  const parsed = parseSupport(sr.description);
  return {
    tier: ext.tier ?? parsed.tier,
    assigneeId: ext.assigneeId !== undefined ? ext.assigneeId : parsed.assigneeId,
    feedback: ext.feedback !== undefined ? ext.feedback : parsed.feedback,
    clean: parsed.clean,
  };
}

/** Effective category: persisted snapshot (m002) → deterministic classifier. */
export function effectiveCategory(sr: SupportRequest): SupportCategory {
  const ext = (sr as SupportRequestX).category;
  if (ext && (SUPPORT_CATEGORIES as readonly string[]).includes(ext)) {
    return ext as SupportCategory;
  }
  return categorize(sr.subject, effectiveSupport(sr).clean);
}

export function withSupportMarkers(
  clean: string,
  tier: Tier,
  assigneeId: string | null,
  feedback: "חיובי" | "שלילי" | null,
): string {
  const parts = [clean.trim()];
  if (tier !== 1) parts.push(`⟦Tier:${tier}⟧`);
  if (assigneeId) parts.push(`⟦מטפל:${assigneeId}⟧`);
  if (feedback) parts.push(`⟦משוב:${feedback}⟧`);
  return parts.filter(Boolean).join(" ");
}

// ── SLA ─────────────────────────────────────────────────────────────────────
export interface SupportSla {
  /** hours since opening (clock stops at updatedAt for closed requests) */
  elapsedHours: number;
  targetHours: number;
  ratio: number;
  level: "תקין" | "בסיכון" | "חריגה";
  closed: boolean;
}

export function supportSla(sr: SupportRequest, nowMs: number): SupportSla {
  const closed = sr.status === "נסגרה";
  const end = closed ? new Date(sr.updatedAt).getTime() : nowMs;
  const start = new Date(sr.createdAt).getTime();
  const elapsedHours = Math.max(0, Math.round(((end - start) / 3_600_000) * 10) / 10);
  const targetHours = TIER_SLA_HOURS[effectiveSupport(sr).tier];
  const ratio = Math.round((elapsedHours / targetHours) * 100) / 100;
  const level = ratio > 1 ? "חריגה" : ratio >= 0.75 ? "בסיכון" : "תקין";
  return { elapsedHours, targetHours, ratio, level, closed };
}

/** % of CLOSED requests that met their tier target. null when nothing closed (unmeasured). */
export function slaCompliancePercent(
  requests: readonly SupportRequest[],
  nowMs: number,
): number | null {
  const closed = requests.filter((r) => r.status === "נסגרה");
  if (closed.length === 0) return null;
  const met = closed.filter((r) => supportSla(r, nowMs).ratio <= 1).length;
  return Math.round((met / closed.length) * 100);
}

// ── deterministic category classifier ───────────────────────────────────────
export const SUPPORT_CATEGORIES = [
  "הרשאות ומשתמשים",
  "סוכני AI",
  "דוחות וייצוא",
  "תפעול המערכת",
  "כללי",
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

const CATEGORY_RULES: readonly { pattern: RegExp; category: SupportCategory }[] = [
  { pattern: /משתמש|הרשא|סיסמ|התחבר/, category: "הרשאות ומשתמשים" },
  { pattern: /סוכן|Hunter|Fixer|אוטומצי|התראות/i, category: "סוכני AI" },
  { pattern: /ייצוא|דוח|CSV|אקסל|Excel/i, category: "דוחות וייצוא" },
  { pattern: /מסך|כפתור|טעינה|שגיאה|איטי/, category: "תפעול המערכת" },
];

/** Same input ⇒ same category. Rules engine — not a model. */
export function categorize(subject: string, description: string): SupportCategory {
  const text = `${subject} ${description}`;
  for (const r of CATEGORY_RULES) {
    if (r.pattern.test(text)) return r.category;
  }
  return "כללי";
}

// ── recurring issues ────────────────────────────────────────────────────────
export interface RecurringIssue {
  category: SupportCategory;
  count: number;
  requestIds: string[];
}

/**
 * Deterministic recurring-issue detection: ≥ minCount requests with the same
 * derived category within the last periodDays.
 */
export function recurringIssues(
  requests: readonly SupportRequest[],
  nowMs: number,
  periodDays = 30,
  minCount = 3,
): RecurringIssue[] {
  const cutoff = nowMs - periodDays * 86_400_000;
  const byCategory = new Map<SupportCategory, string[]>();
  for (const r of requests) {
    if (new Date(r.createdAt).getTime() < cutoff) continue;
    const cat = effectiveCategory(r);
    const list = byCategory.get(cat) ?? [];
    list.push(r.id);
    byCategory.set(cat, list);
  }
  return [...byCategory.entries()]
    .filter(([, ids]) => ids.length >= minCount)
    .map(([category, requestIds]) => ({ category, count: requestIds.length, requestIds }))
    .sort((a, b) => b.count - a.count);
}

/** Open-request count per assignee (champion load). */
export function championLoad(requests: readonly SupportRequest[]): Map<string, number> {
  const load = new Map<string, number>();
  for (const r of requests) {
    if (r.status === "נסגרה") continue;
    const { assigneeId } = effectiveSupport(r);
    if (!assigneeId) continue;
    load.set(assigneeId, (load.get(assigneeId) ?? 0) + 1);
  }
  return load;
}

/** Knowledge notes whose title/category/tags mention the derived category keywords. */
export function relatedKnowledge(
  category: SupportCategory,
  notes: readonly KnowledgeNote[],
): KnowledgeNote[] {
  const keywords: Record<SupportCategory, RegExp> = {
    "הרשאות ומשתמשים": /הרשא|משתמש/,
    "סוכני AI": /סוכן|AI|אוטומצי/i,
    "דוחות וייצוא": /דוח|ייצוא/,
    "תפעול המערכת": /תפעול|מערכת|תקל/,
    כללי: /נוהל|מדריך/,
  };
  const re = keywords[category];
  return notes.filter((n) => re.test(`${n.title} ${n.category} ${n.tags.join(" ")}`));
}
