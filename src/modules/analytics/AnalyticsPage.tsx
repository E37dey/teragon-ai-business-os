// /analytics — דוחות וניתוחים (W8-A, Phases 8.2+8.3).
// The 6 mandated metric groups over the HONEST engine (src/analytics):
// value null ⇒ "טרם נמדד" (never 0) · comparison chips with the 6 honest
// states · every chart point clickable → drilldown of the ACTUAL records ·
// saved views (analyticsViews) · real CSV Blob download · print (browser
// Save-as-PDF only) · the 7 canonical reports · rail "מבקר המדדים".
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { Link } from "react-router-dom";
import { PageRail } from "@/app/rail";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import {
  DataTable,
  Drawer,
  EmptyState,
  KpiCard,
  Modal,
  OsButton,
  Panel,
  SectionTitle,
  Tabs,
  useToast,
  type IconName,
  type OsAccent,
} from "@/design-system";
import type {
  Activity,
  AIRecommendation,
  Approval,
  AuditEvent,
  Automation,
  AutomationRun,
  Customer,
  Enrollment,
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
import {
  ANALYTICS_GROUP_ORDER,
  ANALYTICS_GROUP_TITLES,
  COMPARISON_STATE_HE,
  NOT_MEASURED_HE,
  RANGE_PRESET_HE,
  compareMetric,
  analyticsViewSchema,
  type AnalyticsFilter,
  type AnalyticsGroupKey,
  type AnalyticsMetricDef,
  type AnalyticsRangePreset,
  type AnalyticsView,
  type DrilldownRecord,
  type MetricAuditFinding,
  type MetricComparison,
  type MetricSeries,
  type ReportDefinition,
  type ReportRun,
} from "@/domain/analytics";
import {
  ANALYTICS_METRICS,
  CSV_BOM,
  auditMetrics,
  bootstrapReportDefinitions,
  buildReportRun,
  computeBucket,
  computeSeries,
  drilldownRecords,
  metricByKey,
  previousRange,
  reportRunToCsv,
  seriesToCsv,
  visibleMetrics,
  wholeRange,
  applyFilter,
  type AnalyticsPeriod,
  type AnalyticsSources,
} from "@/analytics";
import { SUBMISSION_METRICS } from "@/domain/submission/metricLevels";
import { getRepository, nextId } from "@/repositories";
import { CEO_USER_ID, DEMO_DATA_LABEL } from "@/repositories/seed";
import { MetricChart } from "./MetricChart";
import { ANALYTICS_PRINT_CSS, ReportRunPrintView } from "./reportPrint";
import { downloadTextFile, fmtPointValue, latestMeasured, shortDateHe } from "./lib";

// VC-F density: the page opens on ONE group (business outcomes) — never all six
// simultaneously. The grouped nav (segmented control) reaches the other five.
const DEFAULT_FILTER: AnalyticsFilter = {
  rangePreset: "90d",
  group: "ו",
  ownerId: null,
  entityType: null,
  status: null,
  comparePrevious: true,
};

// VC-F: the 4 primary business metrics + the single primary trend chart shown
// above the grouped breakdown. Chosen because they drive the operator workflow
// (funnel → conversion → approved revenue → automation reliability).
const PRIMARY_METRIC_KEYS = [
  "leads_new",
  "quotation_conversion",
  "approved_revenue",
  "automation_success",
] as const;
const PRIMARY_CHART_KEY = "approved_revenue";
const PRIMARY_KPI_ICON: Readonly<Record<string, IconName>> = {
  leads_new: "users",
  quotation_conversion: "target",
  approved_revenue: "gauge",
  automation_success: "bot",
};

// VC-F: charts render a SINGLE steel-blue series by default (accent="blue" ⇒
// var(--accent-primary-text)). No per-group rainbow accents.
const SERIES_ACCENT: OsAccent = "blue";

const kpiRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: "var(--os-space-5)",
};

const selectStyle: CSSProperties = {
  background: "var(--os-bg-raised)",
  color: "var(--os-text-1)",
  border: "1px solid var(--os-border)",
  borderRadius: "6px",
  padding: "0.35rem 0.5rem",
  fontSize: "0.82rem",
};

function kindChip(kind: AnalyticsMetricDef["kind"]): ReactElement {
  const cls =
    kind === "מחושב" ? "os-chip--success" : kind === "יעד פיילוט" ? "os-chip--warning" : "os-chip--muted";
  return <span className={`os-chip ${cls}`}>{kind}</span>;
}

function comparisonChip(c: MetricComparison, betterWhen: AnalyticsMetricDef["betterWhen"]): ReactElement {
  const cls =
    c.state === "improved"
      ? "os-chip--success"
      : c.state === "declined"
        ? "os-chip--danger"
        : c.state === "unchanged"
          ? "os-chip--blue"
          : "os-chip--muted";
  const title =
    c.state === "improved" || c.state === "declined"
      ? `כיוון "טוב" למדד זה: ${betterWhen === "lower" ? "נמוך יותר" : "גבוה יותר"}`
      : COMPARISON_STATE_HE[c.state];
  return (
    <span className={`os-chip ${cls}`} title={title}>
      {c.labelHe}
    </span>
  );
}

interface DrillState {
  def: AnalyticsMetricDef;
  period: AnalyticsPeriod;
  contextHe: string;
}

export default function AnalyticsPage(): ReactElement {
  const leadsQ = useCollection<Lead>("leads");
  const activitiesQ = useCollection<Activity>("activities");
  const quotationsQ = useCollection<Quotation>("quotations");
  const ticketsQ = useCollection<ServiceTicket>("serviceTickets");
  const approvalsQ = useCollection<Approval>("approvals");
  const supportQ = useCollection<SupportRequest>("supportRequests");
  const enrollmentsQ = useCollection<Enrollment>("enrollments");
  const tasksQ = useCollection<Task>("tasks");
  const customersQ = useCollection<Customer>("customers");
  const agentRunsQ = useCollection<AgentRun>("agentRuns");
  const aiRecsQ = useCollection<AIRecommendation>("aiRecommendations");
  const auditQ = useCollection<AuditEvent>("auditEvents");
  const knowledgeUsageQ = useCollection<KnowledgeUsage>("knowledgeUsage");
  const memoryUsageQ = useCollection<MemoryUsage>("memoryUsage");
  const automationsQ = useCollection<Automation>("automations");
  const automationRunsQ = useCollection<AutomationRun>("automationRuns");
  const metricDefsQ = useCollection<MetricDefinition>("metricDefinitions");
  const metricObsQ = useCollection<MetricObservation>("metricObservations");
  const usersQ = useCollection<User>("users");
  const viewsQ = useCollection<AnalyticsView>("analyticsViews");
  const reportDefsQ = useCollection<ReportDefinition>("reportDefinitions");
  const reportRunsQ = useCollection<ReportRun>("reportRuns");
  const invalidate = useInvalidateCollections();
  const { toast } = useToast();

  // deterministic per-mount clock — the engine never calls Date.now() itself
  const [nowISO] = useState(() => new Date().toISOString());
  const [filter, setFilter] = useState<AnalyticsFilter>(DEFAULT_FILTER);
  const [tab, setTab] = useState("metrics");
  const [tableMode, setTableMode] = useState(false);
  const [drill, setDrill] = useState<DrillState | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [viewError, setViewError] = useState<string | null>(null);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [printRunId, setPrintRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);
  const userName = (id: string | null): string =>
    users.find((u) => u.id === id)?.name ?? id ?? "לא הוקצה";

  const sources: AnalyticsSources = useMemo(
    () => ({
      leads: leadsQ.data ?? [],
      activities: activitiesQ.data ?? [],
      quotations: quotationsQ.data ?? [],
      serviceTickets: ticketsQ.data ?? [],
      approvals: approvalsQ.data ?? [],
      supportRequests: supportQ.data ?? [],
      enrollments: enrollmentsQ.data ?? [],
      tasks: tasksQ.data ?? [],
      customers: customersQ.data ?? [],
      agentRuns: agentRunsQ.data ?? [],
      aiRecommendations: aiRecsQ.data ?? [],
      auditEvents: auditQ.data ?? [],
      knowledgeUsage: knowledgeUsageQ.data ?? [],
      memoryUsage: memoryUsageQ.data ?? [],
      automations: automationsQ.data ?? [],
      automationRuns: automationRunsQ.data ?? [],
      metricDefinitions: metricDefsQ.data ?? [],
      metricObservations: metricObsQ.data ?? [],
      users,
      nowISO,
    }),
    [
      leadsQ.data,
      activitiesQ.data,
      quotationsQ.data,
      ticketsQ.data,
      approvalsQ.data,
      supportQ.data,
      enrollmentsQ.data,
      tasksQ.data,
      customersQ.data,
      agentRunsQ.data,
      aiRecsQ.data,
      auditQ.data,
      knowledgeUsageQ.data,
      memoryUsageQ.data,
      automationsQ.data,
      automationRunsQ.data,
      metricDefsQ.data,
      metricObsQ.data,
      users,
      nowISO,
    ],
  );

  // idempotent bootstrap of the 7 canonical report definitions
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const created = await bootstrapReportDefinitions(
        getRepository<ReportDefinition>("reportDefinitions"),
        nowISO,
      );
      if (!cancelled && created.length > 0) await invalidate(["reportDefinitions"]);
    })();
    return () => {
      cancelled = true;
    };
  }, [invalidate, nowISO]);

  const filteredSources = useMemo(() => applyFilter(sources, filter), [sources, filter]);
  const metrics = useMemo(() => visibleMetrics(filter), [filter]);
  const seriesByKey = useMemo(() => {
    const map = new Map<string, MetricSeries>();
    for (const m of metrics) map.set(m.key, computeSeries(m, filteredSources, filter.rangePreset));
    return map;
  }, [metrics, filteredSources, filter.rangePreset]);

  const comparisons = useMemo(() => {
    const map = new Map<string, MetricComparison>();
    if (!filter.comparePrevious) return map;
    const cur = wholeRange(nowISO, filter.rangePreset);
    const prev = previousRange(nowISO, filter.rangePreset);
    for (const m of metrics) {
      map.set(
        m.key,
        compareMetric(
          m,
          computeBucket(m, filteredSources, cur).value,
          computeBucket(m, filteredSources, prev).value,
        ),
      );
    }
    return map;
  }, [filter.comparePrevious, filter.rangePreset, metrics, filteredSources, nowISO]);

  // VC-F: the 4 primary business metrics + primary trend chart — computed
  // independently of the active group so the executive summary is always shown.
  const primaryDefs = useMemo(
    () =>
      PRIMARY_METRIC_KEYS.map((k) => metricByKey(k)).filter(
        (d): d is AnalyticsMetricDef => d !== undefined,
      ),
    [],
  );
  const chartDef = useMemo(() => metricByKey(PRIMARY_CHART_KEY) ?? null, []);
  const primarySeries = useMemo(() => {
    const map = new Map<string, MetricSeries>();
    for (const d of primaryDefs) map.set(d.key, computeSeries(d, filteredSources, filter.rangePreset));
    if (chartDef !== null && !map.has(chartDef.key))
      map.set(chartDef.key, computeSeries(chartDef, filteredSources, filter.rangePreset));
    return map;
  }, [primaryDefs, chartDef, filteredSources, filter.rangePreset]);

  const findings: MetricAuditFinding[] = useMemo(() => {
    const cur = wholeRange(nowISO, filter.rangePreset);
    const sampleSizes: Record<string, number | null> = {};
    for (const m of ANALYTICS_METRICS) {
      sampleSizes[m.key] = computeBucket(m, sources, cur).sampleSize;
    }
    return auditMetrics({
      catalogue: ANALYTICS_METRICS,
      submissionMetrics: SUBMISSION_METRICS,
      metricDefinitions: sources.metricDefinitions,
      metricObservations: sources.metricObservations,
      sampleSizes,
      nowISO,
    });
  }, [sources, nowISO, filter.rangePreset]);

  const computableCount = ANALYTICS_METRICS.filter((m) => m.kind === "מחושב").length;
  const unmeasuredNow = useMemo(() => {
    let n = 0;
    for (const s of seriesByKey.values()) if (latestMeasured(s.points) === null) n += 1;
    return n;
  }, [seriesByKey]);

  const entityTypes = useMemo(
    () => [...new Set(ANALYTICS_METRICS.flatMap((m) => (m.entityType === null ? [] : [m.entityType])))],
    [],
  );
  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of sources.leads) set.add(l.status);
    for (const q of sources.quotations) set.add(q.status);
    for (const t of sources.serviceTickets) set.add(t.status);
    for (const t of sources.tasks) set.add(t.status);
    return [...set].sort((a, b) => a.localeCompare(b, "he"));
  }, [sources.leads, sources.quotations, sources.serviceTickets, sources.tasks]);

  const drillRecords: DrilldownRecord[] = useMemo(
    () => (drill === null ? [] : drilldownRecords(drill.def, filteredSources, drill.period)),
    [drill, filteredSources],
  );

  const reportDefs = useMemo(
    () => [...(reportDefsQ.data ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
    [reportDefsQ.data],
  );
  const reportRuns = useMemo(
    () => [...(reportRunsQ.data ?? [])].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)),
    [reportRunsQ.data],
  );
  const openRun = reportRuns.find((r) => r.id === openRunId) ?? null;
  const printRun = reportRuns.find((r) => r.id === printRunId) ?? null;
  const printDef = printRun === null ? null : (reportDefs.find((d) => d.id === printRun.reportDefinitionId) ?? null);

  const openDrill = (def: AnalyticsMetricDef, period: AnalyticsPeriod, contextHe: string): void => {
    setDrill({ def, period, contextHe });
  };

  const saveView = async (): Promise<void> => {
    const repo = getRepository<AnalyticsView>("analyticsViews");
    const all = await repo.list();
    const record: AnalyticsView = {
      id: nextId("aview", all.map((v) => v.id)),
      createdAt: nowISO,
      updatedAt: nowISO,
      nameHe: viewName.trim(),
      filter,
      createdById: CEO_USER_ID,
    };
    const parsed = analyticsViewSchema.safeParse(record);
    if (!parsed.success) {
      setViewError(parsed.error.issues[0]?.message ?? "תצוגה לא תקינה");
      return;
    }
    await repo.create(record);
    await invalidate(["analyticsViews"]);
    setSaveOpen(false);
    setViewName("");
    setViewError(null);
    toast(`התצוגה "${record.nameHe}" נשמרה`, "success");
  };

  const generateReport = async (def: ReportDefinition): Promise<void> => {
    setBusy(true);
    try {
      const repo = getRepository<ReportRun>("reportRuns");
      const all = await repo.list();
      const run = buildReportRun(def, sources, CEO_USER_ID, nextId("rrun", all.map((r) => r.id)));
      await repo.create(run);
      await invalidate(["reportRuns"]);
      setOpenRunId(run.id);
      toast(`הדוח "${def.titleHe}" הופק מנתוני אמת`, "success");
    } finally {
      setBusy(false);
    }
  };

  const exportRunCsv = async (run: ReportRun): Promise<void> => {
    downloadTextFile(
      `report-${run.reportDefinitionId}-${run.generatedAt.slice(0, 10)}.csv`,
      CSV_BOM + reportRunToCsv(run),
      "text/csv;charset=utf-8",
    );
    await getRepository<ReportRun>("reportRuns").update(run.id, {
      exportState: { ...run.exportState, csvExportedAt: new Date().toISOString() },
      updatedAt: new Date().toISOString(),
    });
    await invalidate(["reportRuns"]);
  };

  const printReport = async (run: ReportRun): Promise<void> => {
    setPrintRunId(run.id);
    await getRepository<ReportRun>("reportRuns").update(run.id, {
      exportState: { ...run.exportState, printedAt: new Date().toISOString() },
      updatedAt: new Date().toISOString(),
    });
    await invalidate(["reportRuns"]);
    // let the print root mount before invoking the browser dialog
    window.setTimeout(() => window.print(), 50);
  };

  if (leadsQ.isError || activitiesQ.isError) {
    return (
      <EmptyState
        icon="alert"
        title="שגיאה בטעינת נתוני הניתוח"
        reason="קריאת ה-repositories נכשלה — נסו לרענן את הדף."
      />
    );
  }
  if (leadsQ.isLoading || quotationsQ.isLoading || approvalsQ.isLoading) {
    return (
      <Panel style={{ padding: "var(--os-space-8)", color: "var(--os-text-2)" }}>
        טוען נתוני מדדים…
      </Panel>
    );
  }

  const visibleGroups = ANALYTICS_GROUP_ORDER.filter(
    (g) => (filter.group === null || filter.group === g) && metrics.some((m) => m.group === g),
  );

  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)" }}>
      <style>{ANALYTICS_PRINT_CSS}</style>
      <PageRail>
        <MetricsAuditRail
          findings={findings}
          onOpen={(f) => {
            const def = metricByKey(f.metricKey);
            if (def !== undefined)
              openDrill(def, wholeRange(nowISO, filter.rangePreset), `${f.titleHe}: ${f.messageHe}`);
          }}
        />
      </PageRail>

      <SectionTitle
        icon="gauge"
        title="דוחות וניתוחים"
        subtitle={DEMO_DATA_LABEL}
        action={
          <div style={{ display: "flex", gap: "var(--os-space-3)" }}>
            <OsButton variant="ghost" icon="doc" onClick={() => setTableMode((v) => !v)}>
              {tableMode ? "תצוגת גרפים" : "תצוגת טבלה (נגיש)"}
            </OsButton>
            <OsButton
              variant="ghost"
              icon="send"
              onClick={() =>
                downloadTextFile(
                  `analytics-${nowISO.slice(0, 10)}.csv`,
                  CSV_BOM + seriesToCsv([...seriesByKey.values()]),
                  "text/csv;charset=utf-8",
                )
              }
            >
              ייצוא CSV
            </OsButton>
          </div>
        }
      />

      <Tabs
        items={[
          { id: "metrics", label: "מדדים" },
          { id: "reports", label: "דוחות", badge: reportDefs.length },
        ]}
        activeId={tab}
        onChange={setTab}
        ariaLabel="מדדים או דוחות"
      />

      {tab === "metrics" && (
        <>
          <FilterBar
            filter={filter}
            users={users}
            entityTypes={entityTypes}
            statusOptions={statusOptions}
            views={viewsQ.data ?? []}
            onChange={setFilter}
            onReset={() => setFilter(DEFAULT_FILTER)}
            onSave={() => setSaveOpen(true)}
          />

          {/* VC-F: 4 primary business metrics + ONE steel-blue primary trend chart */}
          <PrimarySummary
            defs={primaryDefs}
            series={primarySeries}
            chartDef={chartDef}
            tableMode={tableMode}
            onDrill={openDrill}
          />

          {/* VC-F: grouped metric navigation — reach the other groups one at a
              time instead of rendering all six simultaneously */}
          <GroupNav
            active={filter.group}
            onPick={(g) => setFilter({ ...filter, group: g })}
          />

          {visibleGroups.length === 0 && (
            <EmptyState
              icon="search"
              title="אין מדדים תואמים"
              reason="שילוב המסננים הנוכחי לא מותיר אף מדד — אפסו את המסננים."
              action={<OsButton onClick={() => setFilter(DEFAULT_FILTER)}>איפוס מסננים</OsButton>}
            />
          )}

          {visibleGroups.map((g) => (
            <section key={g} style={{ display: "grid", gap: "var(--os-space-4)" }}>
              <SectionTitle icon="target" title={ANALYTICS_GROUP_TITLES[g]} />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                  gap: "var(--os-space-4)",
                }}
              >
                {metrics
                  .filter((m) => m.group === g)
                  .map((m) => {
                    const series = seriesByKey.get(m.key);
                    if (series === undefined) return null;
                    return (
                      <MetricCard
                        key={m.key}
                        def={m}
                        series={series}
                        comparison={comparisons.get(m.key) ?? null}
                        tableMode={tableMode}
                        accent={SERIES_ACCENT}
                        onDrill={openDrill}
                      />
                    );
                  })}
              </div>
            </section>
          ))}

          {/* VC-F: detailed definitions, calculation methods, source records and
              passive catalogue totals live here — never in the primary view */}
          <MetricsMoreDisclosure
            groupDefs={metrics}
            catalogCount={ANALYTICS_METRICS.length}
            computableCount={computableCount}
            unmeasuredNow={unmeasuredNow}
            findingsCount={findings.length}
          />
        </>
      )}

      {tab === "reports" && (
        <ReportsSection
          defs={reportDefs}
          runs={reportRuns}
          busy={busy}
          userName={userName}
          onGenerate={generateReport}
          onOpenRun={setOpenRunId}
        />
      )}

      {/* drilldown drawer — the ACTUAL records behind a point */}
      <Drawer
        open={drill !== null}
        onClose={() => setDrill(null)}
        title={drill === null ? "" : `רשומות המקור — ${drill.def.titleHe}`}
      >
        {drill !== null && (
          <div style={{ display: "grid", gap: "var(--os-space-4)" }}>
            <p style={{ color: "var(--os-text-2)", fontSize: "0.85rem", margin: 0 }}>
              {drill.contextHe}
            </p>
            <p className="os-num" style={{ color: "var(--os-text-3)", fontSize: "0.78rem", margin: 0 }} dir="ltr">
              {drill.period.startISO.slice(0, 10)} → {drill.period.endISO.slice(0, 10)}
            </p>
            {drill.def.limitationsHe.length > 0 && (
              <ul style={{ margin: 0, paddingInlineStart: "1.1rem", color: "var(--os-text-3)", fontSize: "0.78rem" }}>
                {drill.def.limitationsHe.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
            <DataTable<DrilldownRecord>
              columns={[
                {
                  key: "titleHe",
                  header: "רשומה",
                  render: (r) => (
                    <Link to={r.route} style={{ color: "var(--os-accent-cyan, #20C4E8)" }}>
                      {r.titleHe}
                    </Link>
                  ),
                },
                { key: "detailHe", header: "פרטים" },
                { key: "collection", header: "אוסף", render: (r) => <span dir="ltr" className="os-num">{r.collection}/{r.id}</span> },
              ]}
              rows={drillRecords}
              rowKey={(r) => `${r.collection}:${r.id}`}
              emptyText="אין רשומות מקור"
              emptyReason="לנקודה זו אין רשומות בתקופה — או שהמדד אינו נמדד כלל (טרם נמדד)."
            />
          </div>
        )}
      </Drawer>

      {/* report-run drawer */}
      <Drawer
        open={openRun !== null}
        onClose={() => setOpenRunId(null)}
        title={openRun === null ? "" : `דוח — ${reportDefs.find((d) => d.id === openRun.reportDefinitionId)?.titleHe ?? openRun.id}`}
      >
        {openRun !== null && (
          <div style={{ display: "grid", gap: "var(--os-space-4)" }}>
            <p style={{ color: "var(--os-text-2)", fontSize: "0.82rem", margin: 0 }}>
              הופק על ידי {userName(openRun.generatedBy)} · {shortDateHe(openRun.generatedAt)} ·{" "}
              <span className="os-num" dir="ltr">
                {openRun.periodStart.slice(0, 10)} → {openRun.periodEnd.slice(0, 10)}
              </span>
            </p>
            <div style={{ display: "flex", gap: "var(--os-space-3)" }}>
              <OsButton variant="ghost" icon="send" onClick={() => void exportRunCsv(openRun)}>
                CSV
              </OsButton>
              <OsButton variant="ghost" icon="doc" onClick={() => void printReport(openRun)}>
                הדפסה / שמירה כ-PDF
              </OsButton>
            </div>
            <DataTable
              columns={[
                { key: "titleHe", header: "מדד" },
                {
                  key: "displayHe",
                  header: "ערך",
                  render: (r: ReportRun["rows"][number]) =>
                    r.value === null ? (
                      <span className="os-chip os-chip--muted">{NOT_MEASURED_HE}</span>
                    ) : (
                      <span className="os-num">{r.displayHe}</span>
                    ),
                },
                { key: "dataCompleteness", header: "שלמות" },
                {
                  key: "sampleSize",
                  header: "מדגם",
                  numeric: true,
                  render: (r: ReportRun["rows"][number]) =>
                    r.sampleSize === null ? "—" : <span className="os-num">{r.sampleSize}</span>,
                },
              ]}
              rows={openRun.rows}
              rowKey="metricKey"
              emptyText="אין שורות בדוח"
            />
            {openRun.limitations.length > 0 && (
              <ul style={{ margin: 0, paddingInlineStart: "1.1rem", color: "var(--os-text-3)", fontSize: "0.78rem" }}>
                {openRun.limitations.map((l) => (
                  <li key={l}>מגבלה: {l}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Drawer>

      {/* save-view modal */}
      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="שמירת תצוגה">
        <div style={{ display: "grid", gap: "var(--os-space-4)" }}>
          <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.85rem", color: "var(--os-text-2)" }}>
            שם התצוגה
            <input
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              style={selectStyle}
              placeholder="לדוגמה: מכירות — רבעון"
            />
          </label>
          {viewError !== null && (
            <p style={{ color: "var(--os-danger, #EC5D68)", fontSize: "0.8rem", margin: 0 }}>{viewError}</p>
          )}
          <div style={{ display: "flex", gap: "var(--os-space-3)" }}>
            <OsButton onClick={() => void saveView()}>שמירה</OsButton>
            <OsButton variant="ghost" onClick={() => setSaveOpen(false)}>
              ביטול
            </OsButton>
          </div>
        </div>
      </Modal>

      {/* print root (hidden on screen; visible only via @media print) */}
      {printRun !== null && printDef !== null && (
        <ReportRunPrintView
          definition={printDef}
          run={printRun}
          ownerNameHe={userName(printDef.ownerId)}
          generatedByNameHe={userName(printRun.generatedBy)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// sub-components
// ---------------------------------------------------------------------------

function FilterBar({
  filter,
  users,
  entityTypes,
  statusOptions,
  views,
  onChange,
  onReset,
  onSave,
}: {
  filter: AnalyticsFilter;
  users: readonly User[];
  entityTypes: readonly string[];
  statusOptions: readonly string[];
  views: readonly AnalyticsView[];
  onChange: (f: AnalyticsFilter) => void;
  onReset: () => void;
  onSave: () => void;
}): ReactElement {
  return (
    <Panel style={{ padding: "var(--os-space-4)", display: "flex", flexWrap: "wrap", gap: "var(--os-space-4)", alignItems: "center" }}>
      <select
        style={selectStyle}
        value={filter.rangePreset}
        onChange={(e) => onChange({ ...filter, rangePreset: e.target.value as AnalyticsRangePreset })}
        aria-label="טווח תאריכים"
      >
        {(Object.keys(RANGE_PRESET_HE) as AnalyticsRangePreset[]).map((p) => (
          <option key={p} value={p}>
            {RANGE_PRESET_HE[p]}
          </option>
        ))}
      </select>
      <select
        style={selectStyle}
        value={filter.ownerId ?? ""}
        onChange={(e) => onChange({ ...filter, ownerId: e.target.value === "" ? null : e.target.value })}
        aria-label="בעלים"
      >
        <option value="">כל הבעלים</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <select
        style={selectStyle}
        value={filter.entityType ?? ""}
        onChange={(e) => onChange({ ...filter, entityType: e.target.value === "" ? null : e.target.value })}
        aria-label="סוג ישות"
      >
        <option value="">כל סוגי הישויות</option>
        {entityTypes.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select
        style={selectStyle}
        value={filter.status ?? ""}
        onChange={(e) => onChange({ ...filter, status: e.target.value === "" ? null : e.target.value })}
        aria-label="סטטוס רשומות"
      >
        <option value="">כל הסטטוסים</option>
        {statusOptions.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", color: "var(--os-text-2)" }}>
        <input
          type="checkbox"
          checked={filter.comparePrevious}
          onChange={(e) => onChange({ ...filter, comparePrevious: e.target.checked })}
        />
        השוואה לתקופה קודמת
      </label>
      <SavedViewsPicker views={views} onPick={(v) => onChange(v.filter)} />
      <OsButton variant="ghost" size="sm" onClick={onSave}>
        שמירת תצוגה
      </OsButton>
      <OsButton variant="ghost" size="sm" onClick={onReset}>
        איפוס
      </OsButton>
    </Panel>
  );
}

function SavedViewsPicker({
  views,
  onPick,
}: {
  views: readonly AnalyticsView[];
  onPick: (v: AnalyticsView) => void;
}): ReactElement {
  return (
    <select
      style={selectStyle}
      value=""
      onChange={(e) => {
        const v = views.find((x) => x.id === e.target.value);
        if (v !== undefined) onPick(v);
      }}
      aria-label="תצוגות שמורות"
    >
      <option value="">
        {views.length === 0 ? "אין תצוגות שמורות" : `תצוגות שמורות (${views.length})`}
      </option>
      {views.map((v) => (
        <option key={v.id} value={v.id}>
          {v.nameHe}
        </option>
      ))}
    </select>
  );
}

function MetricCard({
  def,
  series,
  comparison,
  tableMode,
  accent,
  onDrill,
}: {
  def: AnalyticsMetricDef;
  series: MetricSeries;
  comparison: MetricComparison | null;
  tableMode: boolean;
  accent: OsAccent;
  onDrill: (def: AnalyticsMetricDef, period: AnalyticsPeriod, contextHe: string) => void;
}): ReactElement {
  const latest = latestMeasured(series.points);
  const measuredCount = series.points.filter((p) => p.value !== null).length;
  const isSeries = def.temporality === "series" && def.kind === "מחושב";
  const pointPeriod = (i: number): AnalyticsPeriod => {
    const p = series.points[i];
    return p === undefined
      ? { startISO: series.points[0]?.periodStart ?? "", endISO: series.points[0]?.periodEnd ?? "", labelHe: "" }
      : { startISO: p.periodStart, endISO: p.periodEnd, labelHe: "" };
  };

  return (
    <Panel variant="raised" style={{ padding: "var(--os-space-4)", display: "grid", gap: "var(--os-space-3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--os-space-3)", alignItems: "baseline" }}>
        <span style={{ fontSize: "0.88rem", color: "var(--os-text-1)", fontWeight: 600 }}>{def.titleHe}</span>
        {kindChip(def.kind)}
      </div>
      <button
        type="button"
        onClick={() =>
          onDrill(
            def,
            latest === null
              ? pointPeriod(0)
              : { startISO: latest.periodStart, endISO: latest.periodEnd, labelHe: "" },
            latest === null
              ? `המדד אינו נמדד — ${def.sourceHe}`
              : `הערך הנוכחי: ${fmtPointValue(latest.value, def.unit)} · ${latest.calculationMethod}`,
          )
        }
        style={{
          all: "unset",
          cursor: "pointer",
          fontSize: "1.35rem",
          fontWeight: 700,
          color: latest === null ? "var(--os-text-3)" : "var(--os-text-1)",
        }}
        aria-label={`${def.titleHe} — פתיחת רשומות המקור`}
      >
        {latest === null ? (
          NOT_MEASURED_HE
        ) : (
          <span className="os-num">{fmtPointValue(latest.value, def.unit)}</span>
        )}
      </button>
      {latest === null && (
        <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--os-text-3)" }}>{def.sourceHe}</p>
      )}
      {comparison !== null && (
        <div>{comparisonChip(comparison, def.betterWhen)}</div>
      )}
      {isSeries && !tableMode && (
        <MetricChart
          points={series.points}
          accent={accent}
          unit={def.unit}
          onPointClick={(i) => {
            const p = series.points[i];
            if (p !== undefined)
              onDrill(def, pointPeriod(i), `נקודה ${i + 1}: ${fmtPointValue(p.value, def.unit)} · ${p.calculationMethod}`);
          }}
        />
      )}
      {isSeries && tableMode && (
        <DataTable
          columns={[
            {
              key: "periodStart",
              header: "מתאריך",
              render: (p: MetricSeries["points"][number]) => (
                <span className="os-num" dir="ltr">{p.periodStart.slice(0, 10)}</span>
              ),
            },
            {
              key: "value",
              header: "ערך",
              render: (p: MetricSeries["points"][number]) =>
                p.value === null ? (
                  <span className="os-chip os-chip--muted">{NOT_MEASURED_HE}</span>
                ) : (
                  <span className="os-num">{fmtPointValue(p.value, p.unit)}</span>
                ),
            },
            {
              key: "sampleSize",
              header: "מדגם",
              render: (p: MetricSeries["points"][number]) =>
                p.sampleSize === null ? "—" : <span className="os-num">{p.sampleSize}</span>,
            },
          ]}
          rows={series.points}
          rowKey="periodStart"
          onRowClick={(p) => {
            const i = series.points.indexOf(p);
            onDrill(def, pointPeriod(i), `נקודה ${i + 1}: ${fmtPointValue(p.value, def.unit)}`);
          }}
          emptyText="אין נקודות"
        />
      )}
      {isSeries && (
        <p className="os-num" style={{ margin: 0, fontSize: "0.72rem", color: "var(--os-text-3)" }} dir="rtl">
          {measuredCount} נקודות מדודות מתוך {series.points.length}
        </p>
      )}
    </Panel>
  );
}

// VC-F: grouped metric navigation — a calm segmented control. One group is
// always active (steel), the rest quiet. Replaces rendering all six at once.
function GroupNav({
  active,
  onPick,
}: {
  active: AnalyticsGroupKey | null;
  onPick: (g: AnalyticsGroupKey) => void;
}): ReactElement {
  return (
    <div
      role="tablist"
      aria-label="קבוצות מדדים"
      style={{ display: "flex", flexWrap: "wrap", gap: "var(--os-space-2)" }}
    >
      {ANALYTICS_GROUP_ORDER.map((g) => {
        const isActive = active === g;
        return (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onPick(g)}
            style={{
              cursor: "pointer",
              border: `1px solid ${isActive ? "var(--accent-primary-border)" : "var(--os-border)"}`,
              background: isActive ? "var(--accent-primary-soft)" : "transparent",
              color: isActive ? "var(--accent-primary-text)" : "var(--os-text-2)",
              borderRadius: "8px",
              padding: "0.4rem 0.8rem",
              fontSize: "0.9rem",
              fontWeight: isActive ? 600 : 500,
            }}
          >
            {ANALYTICS_GROUP_TITLES[g]}
          </button>
        );
      })}
    </div>
  );
}

// VC-F: the executive summary — exactly 4 primary metrics + ONE steel-blue
// trend chart (with the accessible table alternative). Zero renders muted
// (0 is not success); null renders the honest "טרם נמדד".
function PrimarySummary({
  defs,
  series,
  chartDef,
  tableMode,
  onDrill,
}: {
  defs: readonly AnalyticsMetricDef[];
  series: Map<string, MetricSeries>;
  chartDef: AnalyticsMetricDef | null;
  tableMode: boolean;
  onDrill: (def: AnalyticsMetricDef, period: AnalyticsPeriod, contextHe: string) => void;
}): ReactElement {
  const chartSeries = chartDef === null ? null : (series.get(chartDef.key) ?? null);
  return (
    <div style={{ display: "grid", gap: "var(--os-space-5)" }}>
      <div style={kpiRowStyle}>
        {defs.map((def) => {
          const latest = latestMeasured(series.get(def.key)?.points ?? []);
          const isZero = latest !== null && latest.value === 0;
          return (
            <KpiCard
              key={def.key}
              title={def.titleHe}
              value={latest === null ? NOT_MEASURED_HE : fmtPointValue(latest.value, def.unit)}
              accent="blue"
              icon={PRIMARY_KPI_ICON[def.key]}
              muted={latest === null || isZero}
            />
          );
        })}
      </div>
      {chartDef !== null && chartSeries !== null && (
        <Panel variant="raised" style={{ padding: "var(--os-space-4)", display: "grid", gap: "var(--os-space-3)" }}>
          <SectionTitle icon="gauge" title={`מגמה — ${chartDef.titleHe}`} />
          {tableMode ? (
            <DataTable
              columns={[
                {
                  key: "periodStart",
                  header: "מתאריך",
                  render: (p: MetricSeries["points"][number]) => (
                    <span className="os-num" dir="ltr">{p.periodStart.slice(0, 10)}</span>
                  ),
                },
                {
                  key: "value",
                  header: "ערך",
                  render: (p: MetricSeries["points"][number]) =>
                    p.value === null ? (
                      <span className="os-chip os-chip--muted">{NOT_MEASURED_HE}</span>
                    ) : (
                      <span className="os-num">{fmtPointValue(p.value, p.unit)}</span>
                    ),
                },
                {
                  key: "sampleSize",
                  header: "מדגם",
                  render: (p: MetricSeries["points"][number]) =>
                    p.sampleSize === null ? "—" : <span className="os-num">{p.sampleSize}</span>,
                },
              ]}
              rows={chartSeries.points}
              rowKey="periodStart"
              onRowClick={(p) =>
                onDrill(
                  chartDef,
                  { startISO: p.periodStart, endISO: p.periodEnd, labelHe: "" },
                  `${fmtPointValue(p.value, chartDef.unit)} · ${p.calculationMethod}`,
                )
              }
              emptyText="אין נקודות מדודות בטווח"
            />
          ) : (
            <MetricChart
              points={chartSeries.points}
              accent={SERIES_ACCENT}
              unit={chartDef.unit}
              onPointClick={(i) => {
                const p = chartSeries.points[i];
                if (p !== undefined)
                  onDrill(
                    chartDef,
                    { startISO: p.periodStart, endISO: p.periodEnd, labelHe: "" },
                    `נקודה ${i + 1}: ${fmtPointValue(p.value, chartDef.unit)} · ${p.calculationMethod}`,
                  );
              }}
            />
          )}
        </Panel>
      )}
    </div>
  );
}

// VC-F: passive catalogue totals + the detailed definitions / calculation
// methods / sources for the active group — moved out of the primary view.
function MetricsMoreDisclosure({
  groupDefs,
  catalogCount,
  computableCount,
  unmeasuredNow,
  findingsCount,
}: {
  groupDefs: readonly AnalyticsMetricDef[];
  catalogCount: number;
  computableCount: number;
  unmeasuredNow: number;
  findingsCount: number;
}): ReactElement {
  return (
    <details className="os-more-metrics">
      <summary>מדדים נוספים · הגדרות ומקורות</summary>
      <div className="os-more-metrics__grid">
        <div className="os-more-metrics__item">
          <span>מדדים בקטלוג</span>
          <span className="os-num">{catalogCount}</span>
        </div>
        <div className="os-more-metrics__item">
          <span>מחושבים ממקורות אמת</span>
          <span className="os-num">{computableCount}</span>
        </div>
        <div className="os-more-metrics__item">
          <span>ללא מדידה כעת</span>
          <span className="os-num">{unmeasuredNow}</span>
        </div>
        <div className="os-more-metrics__item">
          <span>ממצאי מבקר המדדים</span>
          <span className="os-num">{findingsCount}</span>
        </div>
      </div>
      <div style={{ padding: "0 var(--os-space-5) var(--os-space-4)", display: "grid", gap: "var(--os-space-3)" }}>
        {groupDefs.map((d) => (
          <div
            key={d.key}
            style={{
              display: "grid",
              gap: 2,
              borderBlockStart: "1px solid var(--border-subtle)",
              paddingBlockStart: "var(--os-space-3)",
            }}
          >
            <span style={{ fontSize: "0.9rem", color: "var(--os-text-1)", fontWeight: 600 }}>
              {d.titleHe} · {d.unit}
            </span>
            <span style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-2)" }}>
              שיטת חישוב: {d.calculationMethodHe}
            </span>
            <span style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-3)" }}>
              מקור: {d.sourceHe}
            </span>
            {d.limitationsHe.length > 0 && (
              <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-3)" }}>
                מגבלות: {d.limitationsHe.join(" · ")}
              </span>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

function ReportsSection({
  defs,
  runs,
  busy,
  userName,
  onGenerate,
  onOpenRun,
}: {
  defs: readonly ReportDefinition[];
  runs: readonly ReportRun[];
  busy: boolean;
  userName: (id: string | null) => string;
  onGenerate: (def: ReportDefinition) => Promise<void>;
  onOpenRun: (id: string) => void;
}): ReactElement {
  if (defs.length === 0) {
    return (
      <EmptyState
        icon="doc"
        title="הגדרות הדוחות נטענות"
        reason="שבעת הדוחות הקנוניים נוצרים בעת טעינת העמוד (bootstrap אידמפוטנטי)."
      />
    );
  }
  return (
    <div style={{ display: "grid", gap: "var(--os-space-4)" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "var(--os-space-4)",
        }}
      >
        {defs.map((d) => (
          <Panel key={d.id} variant="raised" style={{ padding: "var(--os-space-4)", display: "grid", gap: "var(--os-space-3)" }}>
            <span style={{ fontWeight: 600, color: "var(--os-text-1)" }}>{d.titleHe}</span>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--os-text-2)" }}>{d.descriptionHe}</p>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--os-text-3)" }}>
              תדירות: {d.cadenceHe} · בעלים: {userName(d.ownerId)} ·{" "}
              <span className="os-num">{d.metricKeys.length}</span> מדדים
            </p>
            <div>
              {busy ? (
                <OsButton size="sm" disabled disabledReason="הפקה קודמת עדיין רצה">
                  הפקת דוח מנתוני אמת
                </OsButton>
              ) : (
                <OsButton size="sm" onClick={() => void onGenerate(d)}>
                  הפקת דוח מנתוני אמת
                </OsButton>
              )}
            </div>
          </Panel>
        ))}
      </div>
      <SectionTitle icon="doc" title="דוחות שהופקו" subtitle={`${runs.length} ריצות`} />
      <DataTable
        columns={[
          {
            key: "reportDefinitionId",
            header: "דוח",
            render: (r: ReportRun) => defs.find((d) => d.id === r.reportDefinitionId)?.titleHe ?? r.reportDefinitionId,
          },
          {
            key: "generatedAt",
            header: "הופק",
            render: (r: ReportRun) => <span className="os-num" dir="ltr">{r.generatedAt.slice(0, 16).replace("T", " ")}</span>,
          },
          { key: "generatedBy", header: "על ידי", render: (r: ReportRun) => userName(r.generatedBy) },
          {
            key: "exportState",
            header: "ייצוא",
            render: (r: ReportRun) => (
              <span style={{ fontSize: "0.75rem", color: "var(--os-text-3)" }}>
                {r.exportState.csvExportedAt !== null ? "CSV ✓" : ""}
                {r.exportState.printedAt !== null ? " הודפס ✓" : ""}
                {r.exportState.csvExportedAt === null && r.exportState.printedAt === null ? "—" : ""}
              </span>
            ),
          },
        ]}
        rows={runs}
        rowKey="id"
        onRowClick={(r) => onOpenRun(r.id)}
        emptyText="טרם הופקו דוחות"
        emptyReason='לחצו "הפקת דוח מנתוני אמת" על אחד משבעת הדוחות למעלה.'
      />
    </div>
  );
}

function MetricsAuditRail({
  findings,
  onOpen,
}: {
  findings: readonly MetricAuditFinding[];
  onOpen: (f: MetricAuditFinding) => void;
}): ReactElement {
  return (
    <div style={{ display: "grid", gap: "var(--os-space-3)" }}>
      <SectionTitle icon="shield" title="מבקר המדדים" subtitle={`${findings.length} ממצאים`} />
      {findings.length === 0 && (
        <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--os-text-2)" }}>
          אין ממצאים — כל המדדים עומדים בכללי הכנות.
        </p>
      )}
      {findings.map((f) => (
        <button
          key={`${f.kind}:${f.metricKey}:${f.messageHe}`}
          type="button"
          onClick={() => onOpen(f)}
          style={{
            all: "unset",
            cursor: "pointer",
            border: "1px solid var(--os-border)",
            borderRadius: "8px",
            padding: "var(--os-space-3)",
            display: "grid",
            gap: "0.25rem",
          }}
        >
          <span className="os-chip os-chip--warning">{f.titleHe}</span>
          <span style={{ fontSize: "0.78rem", color: "var(--os-text-2)" }}>{f.messageHe}</span>
        </button>
      ))}
    </div>
  );
}
