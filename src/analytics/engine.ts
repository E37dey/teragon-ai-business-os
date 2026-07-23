// W8-A — the honest metric ENGINE: pure, deterministic series computation over
// the canonical repositories. Same sources + same query ⇒ same result (no
// Math.random, no Date.now() inside — the clock arrives as nowISO).
//
// Honesty rules enforced here:
// - value: null whenever the data cannot honestly support a number (ratio with
//   empty denominator, median over an empty sample, unmeasured metric);
// - null is NEVER coerced to 0; counts of real records may honestly be 0;
// - every point carries source / calculationMethod / limitations / sampleSize /
//   dataCompleteness; measured=false whenever value is null.
import type {
  Activity,
  AIRecommendation,
  Approval,
  AuditEvent,
  Automation,
  AutomationRun,
  Customer,
  Enrollment,
  ISODate,
  Lead,
  MetricDefinition,
  MetricObservation,
  Quotation,
  ServiceTicket,
  SupportRequest,
  Task,
  User,
} from "@/domain/types";
import type { AgentRun } from "@/domain/agents/types";
import type { KnowledgeUsage } from "@/domain/knowledge/types";
import type { MemoryUsage } from "@/domain/memory/types";
import type {
  AnalyticsFilter,
  AnalyticsMetricDef,
  AnalyticsRangePreset,
  DataCompleteness,
  DrilldownRecord,
  MetricPoint,
  MetricSeries,
} from "@/domain/analytics";
import {
  courseCompletion,
  automationSuccessRate,
  openTickets,
  quotationTotal,
  revenuePipeline,
  totalRevenue,
} from "@/domain/selectors/dashboardKpis";
import { isOverdueTask } from "@/domain/selectors/badges";
import { effectiveSupport, supportSla } from "@/modules/support/lib";
import { ANALYTICS_METRICS } from "./catalogue";

// ---------------------------------------------------------------------------
// sources
// ---------------------------------------------------------------------------

export interface AnalyticsSources {
  leads: readonly Lead[];
  activities: readonly Activity[];
  quotations: readonly Quotation[];
  serviceTickets: readonly ServiceTicket[];
  approvals: readonly Approval[];
  supportRequests: readonly SupportRequest[];
  enrollments: readonly Enrollment[];
  tasks: readonly Task[];
  customers: readonly Customer[];
  agentRuns: readonly AgentRun[];
  aiRecommendations: readonly AIRecommendation[];
  auditEvents: readonly AuditEvent[];
  knowledgeUsage: readonly KnowledgeUsage[];
  memoryUsage: readonly MemoryUsage[];
  automations: readonly Automation[];
  automationRuns: readonly AutomationRun[];
  metricDefinitions: readonly MetricDefinition[];
  metricObservations: readonly MetricObservation[];
  users: readonly User[];
  /** the deterministic clock */
  nowISO: ISODate;
}

// ---------------------------------------------------------------------------
// periods
// ---------------------------------------------------------------------------

export interface AnalyticsPeriod {
  startISO: ISODate;
  /** exclusive end */
  endISO: ISODate;
  labelHe: string;
}

const DAY_MS = 86_400_000;

function iso(ms: number): ISODate {
  return new Date(ms).toISOString();
}

function shortDate(isoStr: ISODate): string {
  const d = new Date(isoStr);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}`;
}

export const RANGE_PRESET_DAYS: Readonly<Record<AnalyticsRangePreset, number>> = {
  "30d": 30,
  "90d": 90,
  "365d": 365,
};

/**
 * Deterministic bucket layout per preset, ending at nowISO:
 * 30d → 5 buckets of 6 days · 90d → 6 buckets of 15 days · 365d → 12 of ~30.4.
 * Bucket edges are exact millisecond divisions — no calendar drift, no overlap.
 */
export function buildPeriods(nowISO: ISODate, preset: AnalyticsRangePreset): AnalyticsPeriod[] {
  const bucketCount = preset === "30d" ? 5 : preset === "90d" ? 6 : 12;
  const totalMs = RANGE_PRESET_DAYS[preset] * DAY_MS;
  const end = Date.parse(nowISO);
  const start = end - totalMs;
  const step = totalMs / bucketCount;
  const periods: AnalyticsPeriod[] = [];
  for (let i = 0; i < bucketCount; i += 1) {
    const s = start + i * step;
    const e = start + (i + 1) * step;
    periods.push({ startISO: iso(s), endISO: iso(e), labelHe: shortDate(iso(s)) });
  }
  return periods;
}

/** whole-range period for a preset (used for aggregates + comparison windows) */
export function wholeRange(nowISO: ISODate, preset: AnalyticsRangePreset): AnalyticsPeriod {
  const end = Date.parse(nowISO);
  const start = end - RANGE_PRESET_DAYS[preset] * DAY_MS;
  return { startISO: iso(start), endISO: iso(end), labelHe: "התקופה הנוכחית" };
}

/** the preceding equal-length window (honest comparison baseline) */
export function previousRange(nowISO: ISODate, preset: AnalyticsRangePreset): AnalyticsPeriod {
  const cur = wholeRange(nowISO, preset);
  const len = Date.parse(cur.endISO) - Date.parse(cur.startISO);
  return {
    startISO: iso(Date.parse(cur.startISO) - len),
    endISO: cur.startISO,
    labelHe: "התקופה הקודמת",
  };
}

function inPeriod(at: ISODate, p: AnalyticsPeriod): boolean {
  const t = Date.parse(at);
  return t >= Date.parse(p.startISO) && t < Date.parse(p.endISO);
}

// ---------------------------------------------------------------------------
// filter application (owner / status apply to record-level sources)
// ---------------------------------------------------------------------------

export function applyFilter(sources: AnalyticsSources, filter: AnalyticsFilter): AnalyticsSources {
  const { ownerId, status } = filter;
  if (ownerId === null && status === null) return sources;
  const byOwner = <T extends { ownerId?: string }>(items: readonly T[]): readonly T[] =>
    ownerId === null ? items : items.filter((x) => x.ownerId === ownerId);
  const byStatus = <T extends { status?: string }>(items: readonly T[]): readonly T[] =>
    status === null ? items : items.filter((x) => x.status === status);
  return {
    ...sources,
    leads: byStatus(byOwner(sources.leads)),
    quotations: byStatus(byOwner(sources.quotations)),
    serviceTickets: byStatus(byOwner(sources.serviceTickets)),
    tasks: byStatus(byOwner(sources.tasks)),
    supportRequests: byStatus(sources.supportRequests),
  };
}

/** metrics visible under a filter (group + entity-type narrowing) */
export function visibleMetrics(filter: AnalyticsFilter): readonly AnalyticsMetricDef[] {
  return ANALYTICS_METRICS.filter(
    (m) =>
      (filter.group === null || m.group === filter.group) &&
      (filter.entityType === null || m.entityType === filter.entityType),
  );
}

// ---------------------------------------------------------------------------
// per-metric bucket computation
// ---------------------------------------------------------------------------

interface BucketResult {
  value: number | null;
  sampleSize: number | null;
  dataCompleteness: DataCompleteness;
  methodNoteHe: string;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const m =
    sorted.length % 2 === 1 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return Math.round((m ?? 0) * 10) / 10;
}

function pct(part: number, whole: number): number {
  return Math.round((part / whole) * 100);
}

function count(n: number, noteHe: string): BucketResult {
  return { value: n, sampleSize: n, dataCompleteness: "מלא", methodNoteHe: noteHe };
}

function unmeasured(noteHe: string): BucketResult {
  return { value: null, sampleSize: null, dataCompleteness: "אין נתונים", methodNoteHe: noteHe };
}

const DECIDED_QUOTE_STATUSES: readonly string[] = ["אושרה", "נדחתה", "פג תוקף"];

function firstResponseDiffs(
  leads: readonly Lead[],
  activities: readonly Activity[],
  p: AnalyticsPeriod,
): { leadId: string; hours: number }[] {
  const out: { leadId: string; hours: number }[] = [];
  for (const lead of leads) {
    if (!inPeriod(lead.createdAt, p)) continue;
    const created = Date.parse(lead.createdAt);
    const responses = activities
      .filter(
        (a) =>
          a.entityRef === `lead:${lead.id}` &&
          Date.parse(a.at) > created &&
          !a.text.startsWith("ליד חדש"),
      )
      .map((a) => Date.parse(a.at))
      .sort((a, b) => a - b);
    const first = responses[0];
    if (first !== undefined) out.push({ leadId: lead.id, hours: (first - created) / 3_600_000 });
  }
  return out;
}

function isFallbackAudit(e: AuditEvent): boolean {
  return e.action === "ai.fallback" || e.details.includes("מנוע המקומי");
}

/**
 * Compute one bucket for one metric. Pure. Unknown/unmeasured ⇒ value null
 * (NEVER 0); real record counts may honestly be 0.
 */
export function computeBucket(
  def: AnalyticsMetricDef,
  s: AnalyticsSources,
  p: AnalyticsPeriod,
): BucketResult {
  if (def.kind !== "מחושב") {
    return unmeasured(def.sourceHe);
  }
  const nowMs = Date.parse(s.nowISO);
  switch (def.key) {
    case "activities_count": {
      const n = s.activities.filter((a) => inPeriod(a.at, p)).length;
      return count(n, `ספירת ${n} פעילויות בתקופה`);
    }
    case "knowledge_usage_count": {
      const n = s.knowledgeUsage.filter((u) => inPeriod(u.usedAt, p)).length;
      return count(n, `ספירת ${n} שימושי ידע בתקופה`);
    }
    case "memory_usage_count": {
      const n = s.memoryUsage.filter((u) => inPeriod(u.usedAt, p)).length;
      return count(n, `ספירת ${n} שימושי זיכרון בתקופה`);
    }
    case "support_volume": {
      const n = s.supportRequests.filter((r) => inPeriod(r.createdAt, p)).length;
      return count(n, `ספירת ${n} פניות שנפתחו בתקופה`);
    }
    case "leads_new": {
      const n = s.leads.filter((l) => inPeriod(l.createdAt, p)).length;
      return count(n, `ספירת ${n} לידים שנוצרו בתקופה`);
    }
    case "lead_first_response_hours": {
      const diffs = firstResponseDiffs(s.leads, s.activities, p);
      if (diffs.length === 0) return unmeasured("אין לידים עם פעילות תגובה מתועדת בתקופה");
      return {
        value: median(diffs.map((d) => d.hours)),
        sampleSize: diffs.length,
        dataCompleteness: diffs.length < 5 ? "חלקי" : "מלא",
        methodNoteHe: `חציון על ${diffs.length} לידים עם תגובה מתועדת`,
      };
    }
    case "quotations_created": {
      const n = s.quotations.filter((q) => inPeriod(q.createdAt, p)).length;
      return count(n, `ספירת ${n} הצעות שנוצרו בתקופה`);
    }
    case "quotation_conversion": {
      const decided = s.quotations.filter((q) => DECIDED_QUOTE_STATUSES.includes(q.status));
      if (decided.length === 0) return unmeasured("אין הצעות שהוכרעו");
      const approved = decided.filter((q) => q.status === "אושרה").length;
      return {
        value: pct(approved, decided.length),
        sampleSize: decided.length,
        dataCompleteness: decided.length < 5 ? "חלקי" : "מלא",
        methodNoteHe: `${approved} אושרו מתוך ${decided.length} שהוכרעו (מצטבר)`,
      };
    }
    case "pipeline_value": {
      const pipe = revenuePipeline(s.quotations);
      return {
        value: pipe.openValue,
        sampleSize: pipe.openCount,
        dataCompleteness: "מלא",
        methodNoteHe: `${pipe.openCount} הצעות פתוחות (טיוטה/נשלחה) אחרי הנחה`,
      };
    }
    case "service_resolution_days": {
      const closedInPeriod = s.serviceTickets.filter(
        (t) => typeof t.closedAt === "string" && t.closedAt.length > 0 && inPeriod(t.closedAt, p),
      );
      const diffs = closedInPeriod
        .map((t) => (Date.parse(t.closedAt as string) - Date.parse(t.openedAt)) / DAY_MS)
        .filter((d) => d >= 0);
      if (diffs.length === 0) return unmeasured("אין קריאות שנסגרו (עם closedAt) בתקופה");
      return {
        value: median(diffs),
        sampleSize: diffs.length,
        dataCompleteness: diffs.length < 5 ? "חלקי" : "מלא",
        methodNoteHe: `חציון על ${diffs.length} קריאות שנסגרו בתקופה`,
      };
    }
    case "sla_breaches": {
      const breaching = s.supportRequests.filter(
        (r) => r.status !== "נסגרה" && supportSla(r, nowMs).level === "חריגה",
      );
      return count(breaching.length, `${breaching.length} פניות פתוחות בחריגת SLA כעת`);
    }
    case "tasks_overdue": {
      const overdue = s.tasks.filter((t) => isOverdueTask(t, new Date(nowMs)));
      return count(overdue.length, `${overdue.length} משימות פתוחות שמועדן חלף`);
    }
    case "escalation_rate": {
      if (s.supportRequests.length === 0) return unmeasured("אין פניות תמיכה");
      const escalated = s.supportRequests.filter((r) => effectiveSupport(r).tier >= 2).length;
      return {
        value: pct(escalated, s.supportRequests.length),
        sampleSize: s.supportRequests.length,
        dataCompleteness: s.supportRequests.length < 5 ? "חלקי" : "מלא",
        methodNoteHe: `${escalated} פניות Tier 2+ מתוך ${s.supportRequests.length}`,
      };
    }
    case "open_tickets": {
      const open = openTickets([...s.serviceTickets]);
      return count(open.length, `${open.length} קריאות שאינן טופל/נסגר`);
    }
    case "enrollment_progress": {
      const cc = courseCompletion(s.enrollments);
      if (cc.completionPercent === null) return unmeasured("אין שלבי למידה פעילים");
      return {
        value: cc.completionPercent,
        sampleSize: cc.totalStages,
        dataCompleteness: "מלא",
        methodNoteHe: `${cc.approvedStages} שלבים אושרו מתוך ${cc.totalStages}`,
      };
    }
    case "rec_approved_rate":
    case "rec_edited_rate":
    case "rec_rejected_rate": {
      const decided = s.approvals.filter((a) => a.status !== "ממתין");
      if (decided.length === 0) return unmeasured("אין אישורים שהוכרעו");
      let n = 0;
      if (def.key === "rec_approved_rate") n = decided.filter((a) => a.status === "אושר").length;
      else if (def.key === "rec_rejected_rate")
        n = decided.filter((a) => a.status === "נדחה").length;
      else n = decided.filter((a) => a.extendedState === "edited").length;
      return {
        value: pct(n, decided.length),
        sampleSize: decided.length,
        dataCompleteness: decided.length < 5 ? "חלקי" : "מלא",
        methodNoteHe: `${n} מתוך ${decided.length} אישורים שהוכרעו`,
      };
    }
    case "ai_runs_count": {
      const n = s.agentRuns.filter((r) => inPeriod(r.startedAt, p)).length;
      return count(n, `ספירת ${n} ריצות סוכנים בתקופה`);
    }
    case "ai_recommendations_count": {
      const n = s.aiRecommendations.filter((r) => inPeriod(r.createdAt, p)).length;
      return count(n, `ספירת ${n} המלצות שנוצרו בתקופה`);
    }
    case "ai_fallbacks": {
      const n = s.auditEvents.filter((e) => isFallbackAudit(e) && inPeriod(e.at, p)).length;
      return count(n, `ספירת ${n} אירועי fallback מתועדים בתקופה`);
    }
    case "automation_success": {
      const r = automationSuccessRate([...s.automations], [...s.automationRuns]);
      if (r.successPercent === null) return unmeasured("אין ריצות אוטומציה מתועדות");
      return {
        value: r.successPercent,
        sampleSize: r.totalRuns,
        dataCompleteness: r.totalRuns < 5 ? "חלקי" : "מלא",
        methodNoteHe: `${r.successfulRuns} הצליחו מתוך ${r.totalRuns} ריצות`,
      };
    }
    case "approved_revenue": {
      const approved = s.quotations.filter(
        (q) => q.status === "אושרה" && inPeriod(q.updatedAt, p),
      );
      const total = approved.reduce((sum, q) => sum + quotationTotal(q), 0);
      return {
        value: total,
        sampleSize: approved.length,
        dataCompleteness: approved.length === 0 ? "מלא" : "חלקי",
        methodNoteHe: `${approved.length} הצעות שאושרו (שיוך לפי updatedAt — קירוב)`,
      };
    }
    case "revenue_total": {
      return {
        value: totalRevenue(s.customers),
        sampleSize: s.customers.length,
        dataCompleteness: "מלא",
        methodNoteHe: `סכום revenue של ${s.customers.length} לקוחות`,
      };
    }
    default:
      return unmeasured("אין חישוב מוגדר למדד זה");
  }
}

// ---------------------------------------------------------------------------
// series
// ---------------------------------------------------------------------------

function toPoint(
  def: AnalyticsMetricDef,
  s: AnalyticsSources,
  p: AnalyticsPeriod,
): MetricPoint {
  const b = computeBucket(def, s, p);
  return {
    metricDefinitionId: def.key,
    periodStart: p.startISO,
    periodEnd: p.endISO,
    value: b.value,
    unit: def.unit,
    source: def.sourceHe,
    calculationMethod: `${def.calculationMethodHe} · ${b.methodNoteHe}`,
    measured: b.value !== null,
    calculatedAt: s.nowISO,
    limitations: def.limitationsHe,
    sampleSize: b.sampleSize,
    dataCompleteness: b.dataCompleteness,
  };
}

/**
 * Compute the full series for one metric under a preset. Series metrics get
 * one point per bucket; snapshot/unmeasured metrics get ONE point spanning the
 * whole range (value null for unmeasured — "טרם נמדד", never 0).
 */
export function computeSeries(
  def: AnalyticsMetricDef,
  sources: AnalyticsSources,
  preset: AnalyticsRangePreset,
): MetricSeries {
  const points =
    def.temporality === "series" && def.kind === "מחושב"
      ? buildPeriods(sources.nowISO, preset).map((p) => toPoint(def, sources, p))
      : [toPoint(def, sources, wholeRange(sources.nowISO, preset))];
  return {
    metricKey: def.key,
    titleHe: def.titleHe,
    group: def.group,
    unit: def.unit,
    betterWhen: def.betterWhen,
    kind: def.kind,
    temporality: def.temporality,
    points,
    sourceCollections: def.sourceCollections,
    ownerId: def.ownerId,
  };
}

/** aggregate one metric over an arbitrary window (used for comparison chips) */
export function aggregateValue(
  def: AnalyticsMetricDef,
  sources: AnalyticsSources,
  period: AnalyticsPeriod,
): number | null {
  return computeBucket(def, sources, period).value;
}

// ---------------------------------------------------------------------------
// gap handling — a null point BREAKS the line; segments are never bridged
// ---------------------------------------------------------------------------

export interface SeriesSegment {
  /** indexes into points; every point in a segment has value !== null */
  indexes: number[];
}

/** split a point list into drawable segments at null values — NO interpolation */
export function splitSegments(points: readonly MetricPoint[]): SeriesSegment[] {
  const segments: SeriesSegment[] = [];
  let current: number[] = [];
  points.forEach((pt, i) => {
    if (pt.value === null) {
      if (current.length > 0) segments.push({ indexes: current });
      current = [];
    } else {
      current.push(i);
    }
  });
  if (current.length > 0) segments.push({ indexes: current });
  return segments;
}

// ---------------------------------------------------------------------------
// drilldown — a chart point resolves to the ACTUAL records behind it
// ---------------------------------------------------------------------------

function rec(
  collection: DrilldownRecord["collection"],
  id: string,
  titleHe: string,
  route: string,
  detailHe = "",
): DrilldownRecord {
  return { collection, id, titleHe, route, detailHe };
}

/**
 * The records that produced one point of one metric. Every entry is a REAL
 * record id from the sources — the drawer links to the owning screen.
 */
export function drilldownRecords(
  def: AnalyticsMetricDef,
  s: AnalyticsSources,
  p: AnalyticsPeriod,
): DrilldownRecord[] {
  const nowMs = Date.parse(s.nowISO);
  switch (def.key) {
    case "activities_count":
      return s.activities
        .filter((a) => inPeriod(a.at, p))
        .map((a) => rec("activities", a.id, a.text, "/", a.at.slice(0, 10)));
    case "knowledge_usage_count":
      return s.knowledgeUsage
        .filter((u) => inPeriod(u.usedAt, p))
        .map((u) =>
          rec("knowledgeUsage", u.id, `שימוש במאמר ${u.articleId} (v${u.articleVersion})`, "/knowledge", u.usedAt.slice(0, 10)),
        );
    case "memory_usage_count":
      return s.memoryUsage
        .filter((u) => inPeriod(u.usedAt, p))
        .map((u) => rec("memoryUsage", u.id, `שימוש בזיכרון ${u.recordId}`, "/memory", u.operation));
    case "support_volume":
      return s.supportRequests
        .filter((r) => inPeriod(r.createdAt, p))
        .map((r) => rec("supportRequests", r.id, r.subject, "/support", r.status));
    case "leads_new":
      return s.leads
        .filter((l) => inPeriod(l.createdAt, p))
        .map((l) => rec("leads", l.id, l.name, "/crm", l.status));
    case "lead_first_response_hours":
      return firstResponseDiffs(s.leads, s.activities, p).map((d) => {
        const lead = s.leads.find((l) => l.id === d.leadId);
        return rec("leads", d.leadId, lead?.name ?? d.leadId, "/crm", `${Math.round(d.hours * 10) / 10} שעות`);
      });
    case "quotations_created":
      return s.quotations
        .filter((q) => inPeriod(q.createdAt, p))
        .map((q) => rec("quotations", q.id, q.title, "/sales", q.status));
    case "quotation_conversion":
    case "pipeline_value": {
      const pool =
        def.key === "quotation_conversion"
          ? s.quotations.filter((q) => DECIDED_QUOTE_STATUSES.includes(q.status))
          : s.quotations.filter((q) => q.status === "טיוטה" || q.status === "נשלחה");
      return pool.map((q) => rec("quotations", q.id, q.title, "/sales", q.status));
    }
    case "service_resolution_days":
      return s.serviceTickets
        .filter(
          (t) => typeof t.closedAt === "string" && t.closedAt.length > 0 && inPeriod(t.closedAt, p),
        )
        .map((t) => rec("serviceTickets", t.id, t.issue, "/service", t.status));
    case "sla_breaches":
      return s.supportRequests
        .filter((r) => r.status !== "נסגרה" && supportSla(r, nowMs).level === "חריגה")
        .map((r) => rec("supportRequests", r.id, r.subject, "/support", "חריגת SLA"));
    case "tasks_overdue":
      return s.tasks
        .filter((t) => isOverdueTask(t, new Date(nowMs)))
        .map((t) => rec("tasks", t.id, t.title, "/tasks", `יעד: ${t.due.slice(0, 10)}`));
    case "escalation_rate":
      return s.supportRequests
        .filter((r) => effectiveSupport(r).tier >= 2)
        .map((r) => rec("supportRequests", r.id, r.subject, "/support", `Tier ${effectiveSupport(r).tier}`));
    case "open_tickets":
      return openTickets([...s.serviceTickets]).map((t) =>
        rec("serviceTickets", t.id, t.issue, "/service", t.status),
      );
    case "enrollment_progress":
      return s.enrollments.map((en) =>
        rec("enrollments", en.id, en.studentName, "/courses", `${en.stages.length} שלבים`),
      );
    case "rec_approved_rate":
    case "rec_edited_rate":
    case "rec_rejected_rate":
      return s.approvals
        .filter((a) => a.status !== "ממתין")
        .map((a) => rec("approvals", a.id, a.subjectRef, "/agents", a.status));
    case "ai_runs_count":
      return s.agentRuns
        .filter((r) => inPeriod(r.startedAt, p))
        .map((r) => rec("agentRuns", r.id, r.goal, "/agents", r.status));
    case "ai_recommendations_count":
      return s.aiRecommendations
        .filter((r) => inPeriod(r.createdAt, p))
        .map((r) => rec("aiRecommendations", r.id, r.title, "/agents", ""));
    case "ai_fallbacks":
      return s.auditEvents
        .filter((e) => isFallbackAudit(e) && inPeriod(e.at, p))
        .map((e) => rec("auditEvents", e.id, e.action, "/agents", e.at.slice(0, 10)));
    case "automation_success":
      return s.automationRuns
        .filter((r) => r.outcome !== null)
        .map((r) => rec("automationRuns", r.id, `ריצה ${r.id}`, "/automations", r.outcome ?? ""));
    case "approved_revenue":
      return s.quotations
        .filter((q) => q.status === "אושרה" && inPeriod(q.updatedAt, p))
        .map((q) => rec("quotations", q.id, q.title, "/sales", `${quotationTotal(q)} ₪`));
    case "revenue_total":
      return s.customers.map((c) =>
        rec("customers", c.id, c.name, `/customers/${c.id}`, `${c.revenue} ₪`),
      );
    default:
      return [];
  }
}
