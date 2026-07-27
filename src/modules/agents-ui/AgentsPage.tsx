// W5-D — /agents (Phase 5.10): the governed agent fleet. All 7 agents from
// the repository joined with the frozen W5-C definitions; every number derives
// from real records (queue sizes, success/failure counts, last run/failure,
// pending approvals). Usage shows ONLY measured spend — otherwise "טרם נמדד".
// Emergency disable persists to the agents repository; a disabled agent
// refuses new tasks via the UI-side guard (assertAgentsEnabled).
import { useEffect, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { Link } from "react-router-dom";
import "./agents.css";
import {
  DataTable,
  Drawer,
  EmptyState,
  KpiCard,
  OsButton,
  OsIcon,
  Panel,
  SectionTitle,
  StatusChip,
  Tabs,
  useToast,
  type DataTableColumn,
  type OsStatus,
} from "@/design-system";
import { PageRail } from "@/app/rail";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import { getRepository } from "@/repositories";
import type { Agent, AgentTask, Approval, AuditEvent } from "@/domain/types";
import type { AgentErrorRecord, AgentEventRecord, AgentRun } from "@/domain/agents";
import type { AIProviderHealth } from "@/ai/contracts/AIProvider";
import { ProviderStateBadge, getAgentEngine, AGENT_DISABLED_STATUS } from "@/components/ai";
import { dateTimeHe } from "@/modules/quotations/fmt";
import { fleetRows, fleetSummary, type AgentFleetRow } from "./lib";

const stack = (gap = "var(--os-space-4)"): CSSProperties => ({ display: "grid", gap });

function runStatusChip(status: AgentRun["status"]): ReactElement {
  const map: Record<AgentRun["status"], OsStatus> = {
    טיוטה: "ממתין",
    רץ: "פעיל",
    "ממתין לאישור": "דורש אישור",
    הושלם: "הושלם",
    נכשל: "חסום",
    בוטל: "מושבת",
  };
  return <StatusChip status={map[status]} label={status} />;
}

function taskStatusChip(status: AgentTask["status"]): ReactElement {
  const map: Record<AgentTask["status"], OsStatus> = {
    בתור: "ממתין",
    רץ: "פעיל",
    "ממתין לאישור": "דורש אישור",
    אושר: "הושלם",
    נדחה: "חסום",
    הושלם: "הושלם",
    נכשל: "חסום",
  };
  return <StatusChip status={map[status]} label={status} />;
}

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div style={{ display: "grid", gap: 2, fontSize: "var(--os-text-sm, 13px)" }}>
      <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs, 11px)" }}>
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}

interface DetailDrawerProps {
  row: AgentFleetRow;
  runs: readonly AgentRun[];
  tasks: readonly AgentTask[];
  errors: readonly AgentErrorRecord[];
  audit: readonly AuditEvent[];
  health: AIProviderHealth | null;
  onClose: () => void;
}

function AgentDetailDrawer({
  row,
  runs,
  tasks,
  errors,
  audit,
  health,
  onClose,
}: DetailDrawerProps): ReactElement {
  const [tab, setTab] = useState("overview");
  const def = row.definition;
  const myTasks = tasks.filter((t) => t.agentId === row.agent.id);
  const myRuns = runs.filter(
    (r) => row.agent.id === "ag-orchestrator" || r.specialistAgentIds.includes(row.agent.id),
  );
  const myErrors = errors.filter((e) => e.agentId === row.agent.id);
  const myAudit = audit
    .filter((a) => a.actor === row.agent.id)
    .sort((a, b) => b.at.localeCompare(a.at));

  const taskCols: DataTableColumn<AgentTask>[] = [
    { key: "title", header: "משימה" },
    { key: "status", header: "סטטוס", render: (t) => taskStatusChip(t.status) },
    {
      key: "evidence",
      header: "ראיות",
      numeric: true,
      render: (t) => <span className="os-num">{t.evidenceIds.length}</span>,
    },
    {
      key: "updated",
      header: "עודכן",
      render: (t) => <span className="os-num">{dateTimeHe(t.updatedAt)}</span>,
    },
  ];
  const runCols: DataTableColumn<AgentRun>[] = [
    { key: "goal", header: "יעד" },
    { key: "status", header: "סטטוס", render: (r) => runStatusChip(r.status) },
    {
      key: "started",
      header: "התחילה",
      render: (r) => <span className="os-num">{dateTimeHe(r.startedAt)}</span>,
    },
    {
      key: "calls",
      header: "קריאות מנוע",
      numeric: true,
      render: (r) => <span className="os-num">{r.counters.modelCalls}</span>,
    },
  ];
  const errorCols: DataTableColumn<AgentErrorRecord>[] = [
    { key: "code", header: "קוד", render: (e) => <span className="os-ltr">{e.code}</span> },
    { key: "detailHe", header: "פירוט" },
    {
      key: "at",
      header: "מתי",
      render: (e) => <span className="os-num">{dateTimeHe(e.at)}</span>,
    },
  ];
  const auditCols: DataTableColumn<AuditEvent>[] = [
    { key: "action", header: "פעולה", render: (a) => <span className="os-ltr">{a.action}</span> },
    { key: "details", header: "פירוט" },
    {
      key: "at",
      header: "מתי",
      render: (a) => <span className="os-num">{dateTimeHe(a.at)}</span>,
    },
  ];

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        def && def.codeName !== row.agent.name
          ? `${row.agent.name} · ${def.codeName}`
          : row.agent.name
      }
    >
      <div style={stack("var(--os-space-3)")} data-testid="agent-detail-drawer">
        <Tabs
          items={[
            { id: "overview", label: "סקירה" },
            { id: "tasks", label: "משימות", badge: myTasks.length },
            { id: "permissions", label: "הרשאות" },
            { id: "tools", label: "כלים" },
            { id: "runs", label: "ריצות", badge: myRuns.length },
            { id: "errors", label: "שגיאות", badge: myErrors.length },
            { id: "audit", label: "Audit", badge: myAudit.length },
          ]}
          activeId={tab}
          onChange={setTab}
        />
        {tab === "overview" && (
          <div style={stack("var(--os-space-3)")}>
            <Field label="ייעוד">{def?.purposeHe ?? row.agent.purpose}</Field>
            <Field label="מדיניות ספק">
              <span
                style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
              >
                <span className="os-ltr">{def?.providerPolicy ?? "local-first"}</span>
                <ProviderStateBadge
                  provider="local-rules"
                  healthState={health ? health.state : null}
                />
              </span>
            </Field>
            <Field label="שימוש ועלות">
              {row.measuredUsageILS === null ? (
                "טרם נמדד"
              ) : (
                <span className="os-num">{row.measuredUsageILS} ₪ (נמדד)</span>
              )}
            </Field>
            <Field label="ריצה אחרונה">
              {row.lastRun ? (
                <>
                  {row.lastRun.goal} · {runStatusChip(row.lastRun.status)}{" "}
                  <span className="os-num">{dateTimeHe(row.lastRun.startedAt)}</span>
                </>
              ) : (
                "אין ריצות עדיין"
              )}
            </Field>
            <Field label="כשל אחרון">
              {row.lastError ? (
                <>
                  <span className="os-ltr">{row.lastError.code}</span> — {row.lastError.detailHe}
                </>
              ) : (
                "לא נרשמו כשלים"
              )}
            </Field>
            <Field label="גרסת פרומפט">
              <span className="os-ltr">{row.agent.promptVersion}</span>
            </Field>
            <Field label="מגבלות קשיחות">
              {def ? (
                <span className="os-num">
                  ריצה ≤ {def.maxExecutionMs / 1000} שניות · תקציב {def.maxUsageBudgetILS} ₪ · עומק
                  העברות ≤ {def.maxHandoffs}
                </span>
              ) : (
                "אין הגדרה קפואה לסוכן זה"
              )}
            </Field>
          </div>
        )}
        {tab === "tasks" && (
          <DataTable
            columns={taskCols}
            rows={myTasks}
            rowKey="id"
            emptyText="אין משימות"
            emptyReason="לסוכן זה לא הוקצו משימות עדיין."
          />
        )}
        {tab === "permissions" && (
          <div style={stack("var(--os-space-3)")}>
            {def ? (
              <>
                <Field label="פעולות מותרות">
                  <span className="os-ltr">{def.allowedOperations.join(" · ")}</span>
                </Field>
                <Field label="תחומים מותרים">
                  <span className="os-ltr">{def.allowedDomains.join(" · ")}</span>
                </Field>
                <Field label="תחומים אסורים (deny-by-default)">
                  <span className="os-ltr">{def.prohibitedDomains.join(" · ")}</span>
                </Field>
                <Field label="איסורים מוצהרים">{def.prohibitedActionsHe.join(" · ")}</Field>
                <Field label="פעולות המחייבות אישור אנושי">
                  <span className="os-ltr">
                    {def.approvalRequiredFor.length > 0 ? def.approvalRequiredFor.join(" · ") : "—"}
                  </span>
                </Field>
              </>
            ) : (
              <EmptyState
                title="אין הגדרת הרשאות קפואה"
                reason="הסוכן אינו אחד משבעת הסוכנים המנוהלים של W5-C."
              />
            )}
          </div>
        )}
        {tab === "tools" && (
          <div style={stack("var(--os-space-3)")}>
            <Field label="כלים (הגדרה קפואה)">{def ? def.tools.join(" · ") : "—"}</Field>
            <Field label="כלים (רשומת המאגר)">{row.agent.allowedTools.join(" · ")}</Field>
          </div>
        )}
        {tab === "runs" && (
          <DataTable
            columns={runCols}
            rows={[...myRuns].sort((a, b) => b.startedAt.localeCompare(a.startedAt))}
            rowKey="id"
            emptyText="אין ריצות"
            emptyReason="הסוכן טרם השתתף בריצת תזמור."
          />
        )}
        {tab === "errors" && (
          <DataTable
            columns={errorCols}
            rows={[...myErrors].sort((a, b) => b.at.localeCompare(a.at))}
            rowKey="id"
            emptyText="אין שגיאות"
            emptyReason="לא נרשמו רשומות שגיאה לסוכן זה."
          />
        )}
        {tab === "audit" && (
          <DataTable
            columns={auditCols}
            rows={myAudit}
            rowKey="id"
            emptyText="אין רשומות ביקורת"
            emptyReason="הסוכן טרם ביצע פעולה שנרשמה ביומן הביקורת."
          />
        )}
      </div>
    </Drawer>
  );
}

export default function AgentsPage(): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [health, setHealth] = useState<AIProviderHealth | null>(null);
  const [busyAgent, setBusyAgent] = useState<string | null>(null);

  const agentsQ = useCollection<Agent>("agents");
  const tasksQ = useCollection<AgentTask>("agentTasks");
  const runsQ = useCollection<AgentRun>("agentRuns");
  const errorsQ = useCollection<AgentErrorRecord>("agentErrors");
  const eventsQ = useCollection<AgentEventRecord>("agentEvents");
  const approvalsQ = useCollection<Approval>("approvals");
  const auditQ = useCollection<AuditEvent>("auditEvents");

  const queries = [agentsQ, tasksQ, runsQ, errorsQ, eventsQ, approvalsQ, auditQ];
  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);

  const agents = agentsQ.data ?? [];
  const tasks = tasksQ.data ?? [];
  const runs = runsQ.data ?? [];
  const errors = errorsQ.data ?? [];
  const events = eventsQ.data ?? [];
  const approvals = approvalsQ.data ?? [];
  const audit = auditQ.data ?? [];

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const selection = await getAgentEngine().registry.select();
      if (!selection.provider || cancelled) return;
      const h = await selection.provider.health();
      if (!cancelled) setHealth(h);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // demo-scale data — plain per-render derivation keeps the selectors honest
  const rows = fleetRows({ agents, tasks, runs, errors, events, approvals });
  const summary = fleetSummary(agents, approvals, runs);

  // VC-E derived KPI figures
  const fleetFailures = rows.reduce((s, r) => s + r.counts.failure, 0);
  const fleetSuccesses = rows.reduce((s, r) => s + r.counts.success, 0);
  const measuredCostLabel = rows.some((r) => r.measuredUsageILS !== null)
    ? `${rows.reduce((s, r) => s + (r.measuredUsageILS ?? 0), 0)} ₪`
    : "טרם נמדד";

  const toggleDisable = async (agent: Agent): Promise<void> => {
    setBusyAgent(agent.id);
    try {
      const now = new Date().toISOString();
      const next = agent.status === AGENT_DISABLED_STATUS ? "פעיל" : AGENT_DISABLED_STATUS;
      await getRepository<Agent>("agents").update(agent.id, { status: next, updatedAt: now });
      await invalidate(["agents"]);
      toast(
        next === AGENT_DISABLED_STATUS
          ? `הסוכן ${agent.name} הושבת (השבתת חירום) — לא יקבל משימות חדשות`
          : `הסוכן ${agent.name} הופעל מחדש`,
        next === AGENT_DISABLED_STATUS ? "warning" : "success",
      );
    } catch {
      toast("שינוי מצב הסוכן נכשל — נסו שוב", "danger");
    } finally {
      setBusyAgent(null);
    }
  };

  // VC-E: one system-level emergency control (replaces a red button on every row).
  const [confirmStopAll, setConfirmStopAll] = useState(false);
  const activeAgentCount = rows.filter((r) => r.agent.status !== AGENT_DISABLED_STATUS).length;
  const emergencyStopAll = async (): Promise<void> => {
    setConfirmStopAll(false);
    for (const r of rows) {
      if (r.agent.status !== AGENT_DISABLED_STATUS) await toggleDisable(r.agent);
    }
  };

  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title="טעינת הסוכנים נכשלה"
        reason="קריאת הנתונים מהמאגר המקומי נכשלה. רעננו את הדף."
      />
    );
  }
  if (isLoading) {
    return (
      <div style={{ padding: "var(--os-space-6)", color: "var(--os-text-2)" }} role="status">
        טוען את צי הסוכנים מהמאגר המקומי…
      </div>
    );
  }

  const selectedRow = rows.find((r) => r.agent.id === selectedId) ?? null;

  return (
    <div style={stack("var(--os-space-5)")} data-testid="agents-page">
      <PageRail>
        <div style={stack("var(--os-space-4)")}>
          <div style={stack("var(--os-space-2)")}>
            <div
              style={{
                fontSize: "var(--os-text-2xs, 11px)",
                fontWeight: 600,
                color: "var(--os-text-2)",
              }}
            >
              תמונת צי
            </div>
            <div style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-2)" }}>
              {Object.entries(summary.byStatus).map(([status, n]) => (
                <div key={status} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{status}</span>
                  <span className="os-num">{n}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={stack("var(--os-space-2)")}>
            <div
              style={{
                fontSize: "var(--os-text-2xs, 11px)",
                fontWeight: 600,
                color: "var(--os-text-2)",
              }}
            >
              אישורים ממתינים
            </div>
            <div style={{ fontSize: "var(--os-text-sm, 13px)" }}>
              <span className="os-num">{summary.pendingApprovals}</span> בקשות ממתינות להחלטה אנושית
              ·{" "}
              <Link to="/agents/collaboration" style={{ color: "var(--os-cyan)", textDecoration: "underline" }}>
                לחדר התיאום ←
              </Link>
            </div>
          </div>
          <div style={stack("var(--os-space-2)")}>
            <div
              style={{
                fontSize: "var(--os-text-2xs, 11px)",
                fontWeight: 600,
                color: "var(--os-text-2)",
              }}
            >
              בריאות הספק
            </div>
            <ProviderStateBadge provider="local-rules" healthState={health ? health.state : null} />
            <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
              {health ? health.detail : "בודק חיבור…"}
            </div>
          </div>
        </div>
      </PageRail>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: "var(--os-space-3)",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--os-text-xl, 20px)" }}>סוכני AI</h1>
          <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm, 13px)" }}>
            שבעה סוכנים מנוהלים · הרשאות deny-by-default · כל פעולה משנה עוברת אישור אנושי
          </div>
        </div>
        <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
          מצב הדגמה מקומי
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "var(--os-space-3)",
        }}
      >
        {/* VC-E: 4 primary KPIs = active/pending/failed state (action-driving);
            zero stays neutral. Passive cost total moves to "מדדים נוספים". */}
        <KpiCard
          title="סוכנים בצי"
          value={summary.total}
          accent="blue"
          icon="bot"
          muted={summary.total === 0}
        />
        <KpiCard
          title="ריצות פעילות"
          value={summary.activeRuns}
          accent="blue"
          icon="network"
          muted={summary.activeRuns === 0}
        />
        <KpiCard
          title="אישורים ממתינים"
          value={summary.pendingApprovals}
          accent="warning"
          icon="shield"
          muted={summary.pendingApprovals === 0}
        />
        <KpiCard
          title="ריצות שנכשלו"
          value={fleetFailures}
          accent="danger"
          icon="alert"
          muted={fleetFailures === 0}
        />
      </div>

      <details data-testid="agents-more-metrics" className="os-more-metrics">
        <summary>מדדים נוספים</summary>
        <div className="os-more-metrics__grid">
          <div className="os-more-metrics__item">
            <span>עלות נמדדת</span>
            <span className="os-num">{measuredCostLabel}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>סה״כ ריצות מוצלחות</span>
            <span className="os-num">{fleetSuccesses}</span>
          </div>
        </div>
      </details>

      <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
        <SectionTitle
          title="הצי המנוהל"
          subtitle="כל הערכים נגזרים מרשומות אמיתיות — תור, ריצות, כשלים ואישורים"
          icon="bot"
          action={
            confirmStopAll ? (
              <div style={{ display: "flex", gap: "var(--os-space-2)" }}>
                <OsButton
                  variant="danger"
                  size="sm"
                  onClick={() => void emergencyStopAll()}
                  data-testid="agents-emergency-all"
                >
                  אישור השבתת {activeAgentCount} סוכנים
                </OsButton>
                <OsButton variant="ghost" size="sm" onClick={() => setConfirmStopAll(false)}>
                  ביטול
                </OsButton>
              </div>
            ) : activeAgentCount > 0 ? (
              <OsButton variant="danger" size="sm" onClick={() => setConfirmStopAll(true)}>
                השבתת חירום מערכתית
              </OsButton>
            ) : null
          }
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "var(--os-space-3)",
            marginBlockStart: "var(--os-space-3)",
          }}
        >
          {rows.map((row) => (
            <Panel
              key={row.agent.id}
              variant="raised"
              data-testid="agent-fleet-card"
              style={{ padding: "var(--os-space-4)", display: "grid", gap: "var(--os-space-2)" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(row.agent.id)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "var(--os-text)",
                    fontWeight: 600,
                    fontSize: "var(--os-text-md, 14px)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                  data-testid="agent-card-open"
                >
                  <OsIcon name="bot" size={14} />
                  {row.agent.name}
                  {row.definition && row.definition.codeName !== row.agent.name && (
                    <span className="os-ltr" style={{ color: "var(--os-muted)", fontWeight: 400 }}>
                      {row.definition.codeName}
                    </span>
                  )}
                </button>
                <StatusChip status={row.agent.status} />
              </div>
              <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)" }}>
                {row.currentTask ? (
                  <>משימה נוכחית: {row.currentTask.title}</>
                ) : (
                  "אין משימה פעילה כרגע"
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "var(--os-space-3)",
                  flexWrap: "wrap",
                  fontSize: "var(--os-text-2xs, 11px)",
                  color: "var(--os-text-2)",
                }}
              >
                <span>
                  תור: <span className="os-num">{row.queueSize}</span>
                </span>
                <span>
                  הצלחות: <span className="os-num">{row.counts.success}</span>
                </span>
                <span>
                  כשלים: <span className="os-num">{row.counts.failure}</span>
                </span>
                <span>
                  אישורים ממתינים: <span className="os-num">{row.pendingApprovalCount}</span>
                </span>
                <span>
                  עלות:{" "}
                  {row.measuredUsageILS === null ? (
                    "טרם נמדד"
                  ) : (
                    <span className="os-num">{row.measuredUsageILS} ₪</span>
                  )}
                </span>
              </div>
              <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
                {row.lastRun
                  ? `ריצה אחרונה: ${row.lastRun.status} · ${dateTimeHe(row.lastRun.startedAt)}`
                  : "לא השתתף בריצה עדיין"}
                {row.lastError ? ` · כשל אחרון: ${row.lastError.code}` : ""}
              </div>
              {/* VC-E: row actions behind a quiet menu — no permanent red button per row */}
              <details className="os-row-menu">
                <summary aria-label={`פעולות עבור ${row.agent.name}`}>פעולות</summary>
                <div className="os-row-menu__items">
                  <OsButton variant="ghost" size="sm" onClick={() => setSelectedId(row.agent.id)}>
                    פרטים
                  </OsButton>
                  {busyAgent === row.agent.id ? (
                    <OsButton variant="danger" size="sm" disabled disabledReason="מעדכן…">
                      השבתת חירום
                    </OsButton>
                  ) : row.agent.status === AGENT_DISABLED_STATUS ? (
                    <OsButton
                      variant="success"
                      size="sm"
                      onClick={() => void toggleDisable(row.agent)}
                      data-testid="agent-enable"
                    >
                      הפעל מחדש
                    </OsButton>
                  ) : (
                    <OsButton
                      variant="danger"
                      size="sm"
                      onClick={() => void toggleDisable(row.agent)}
                      data-testid="agent-disable"
                    >
                      השבתת חירום
                    </OsButton>
                  )}
                </div>
              </details>
            </Panel>
          ))}
        </div>
        {rows.length === 0 && (
          <EmptyState
            icon="bot"
            title="אין סוכנים במאגר"
            reason="אוסף agents ריק — אפסו את נתוני ההדגמה כדי לזרוע את שבעת הסוכנים."
          />
        )}
      </Panel>

      {selectedRow && (
        <AgentDetailDrawer
          row={selectedRow}
          runs={runs}
          tasks={tasks}
          errors={errors}
          audit={audit}
          health={health}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
