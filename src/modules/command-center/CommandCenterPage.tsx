// Wave 3 — מרכז הפיקוד (/): the operational home screen.
// Every metric is derived from repository data via selectors — no hardcoded KPIs.
// AI content is the seeded local demo trace, clearly labeled "מצב הדגמה מקומי".
import { useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AgentCard,
  ConfidenceBar,
  EmptyState,
  KpiCard,
  OsButton,
  OsIcon,
  Panel,
  SectionTitle,
  Sparkline,
  StatusChip,
  useToast,
  type OsAccent,
  type OsStatus,
} from "@/design-system";
import { PageRail } from "@/app/rail";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import { getRepository } from "@/repositories";
import { CEO_USER_ID, SEED_ANCHOR } from "@/repositories/seed";
import type {
  Activity,
  Agent,
  AgentHandoff,
  AgentTask,
  AIRecommendation,
  Approval,
  Customer,
  Enrollment,
  Evidence,
  Lead,
  Meeting,
  MemoryRecord,
  Quotation,
  ServiceTicket,
  Task,
  User,
} from "@/domain/types";
import { dashboardKpis, salesFunnel, recentActivity } from "@/domain/selectors";
import {
  followUpQueue,
  greetingForHour,
  pendingRecommendations,
  revenueByMonth,
  todayTimeline,
} from "./selectors";
import { ils, dateHe, dateTimeHe, todayIso } from "@/modules/quotations/fmt";

const gridStyle = (cols: string, gap = "var(--os-space-4)"): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: cols,
  gap,
});

const stack = (gap = "var(--os-space-4)"): CSSProperties => ({
  display: "grid",
  gap,
});

const AGENT_ACCENT: Record<string, OsAccent> = {
  "ag-orchestrator": "blue",
  "ag-hunter": "cyan",
  "ag-fixer": "warning",
  "ag-mentor": "violet",
  "ag-nexa": "blue",
  "ag-wiki": "cyan",
  "ag-flow": "success",
};

function agentStatusChip(status: Agent["status"]): OsStatus {
  return status;
}

function DemoBadge(): ReactElement {
  return (
    <span
      style={{
        fontSize: "var(--os-text-2xs, 11px)",
        color: "var(--os-text-2)",
        border: "1px solid var(--os-border)",
        borderRadius: "var(--os-radius-full, 999px)",
        paddingBlock: "2px",
        paddingInline: "10px",
        whiteSpace: "nowrap",
      }}
    >
      מצב הדגמה מקומי · נתוני הדגמה
    </span>
  );
}

interface DecisionCardProps {
  rec: AIRecommendation;
  agents: readonly Agent[];
  evidence: readonly Evidence[];
  onDecide: (rec: AIRecommendation, decision: "אושר" | "נדחה") => void;
  busy: boolean;
}

function DecisionCard({ rec, agents, evidence, onDecide, busy }: DecisionCardProps): ReactElement {
  const agent = agents.find((a) => a.id === rec.agentId);
  const evidenceItems = evidence.filter((e) => rec.evidenceIds.includes(e.id));
  return (
    <Panel variant="raised" style={{ padding: "var(--os-space-5)", ...stack("var(--os-space-3)") }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--os-space-3)" }}>
        <div style={{ fontWeight: 600 }}>{rec.title}</div>
        <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)" }}>
          {agent ? agent.name : rec.agentId}
        </span>
      </div>
      <div style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-2)" }}>
        <strong style={{ color: "var(--os-text)" }}>למה: </strong>
        {rec.reason}
      </div>
      {evidenceItems.length > 0 ? (
        <ul
          style={{
            margin: 0,
            paddingInlineStart: "1.1em",
            fontSize: "var(--os-text-2xs, 11px)",
            color: "var(--os-text-2)",
            display: "grid",
            gap: "2px",
          }}
        >
          {evidenceItems.map((e) => (
            <li key={e.id}>{e.claim}</li>
          ))}
        </ul>
      ) : (
        <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
          לא צורפו ראיות להמלצה זו
        </div>
      )}
      <ConfidenceBar value={null} label="רמת ביטחון" />
      <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)" }}>
        {rec.confidenceMethod
          ? `שיטת הערכה: ${rec.confidenceMethod} (ערך מספרי טרם נמדד)`
          : "שיטת הערכה: טרם נמדדה"}
      </div>
      <div style={{ fontSize: "var(--os-text-sm, 13px)" }}>
        <strong>הפעולה הבאה: </strong>
        {rec.nextAction}
      </div>
      <div style={{ display: "flex", gap: "var(--os-space-3)" }}>
        {busy ? (
          <OsButton variant="approve" size="sm" disabled disabledReason="ההחלטה נשמרת…">
            אשר
          </OsButton>
        ) : (
          <OsButton variant="approve" size="sm" icon="check" onClick={() => onDecide(rec, "אושר")}>
            אשר
          </OsButton>
        )}
        {busy ? (
          <OsButton variant="reject" size="sm" disabled disabledReason="ההחלטה נשמרת…">
            דחה
          </OsButton>
        ) : (
          <OsButton variant="reject" size="sm" icon="x" onClick={() => onDecide(rec, "נדחה")}>
            דחה
          </OsButton>
        )}
      </div>
    </Panel>
  );
}

function MiniBarRow({
  label,
  value,
  max,
  accent,
}: {
  label: string;
  value: number;
  max: number;
  accent: OsAccent;
}): ReactElement {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: "grid", gap: "3px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "var(--os-text-2xs, 11px)",
          color: "var(--os-text-2)",
        }}
      >
        <span>{label}</span>
        <span className="os-num">{value}</span>
      </div>
      <div
        style={{
          blockSize: 6,
          borderRadius: 4,
          background: "var(--os-highlight)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            blockSize: "100%",
            inlineSize: `${pct}%`,
            borderRadius: 4,
            background: `var(--os-${accent})`,
            opacity: 0.85,
          }}
        />
      </div>
    </div>
  );
}

function SidePanel({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <div style={stack("var(--os-space-3)")}>
      <div
        style={{
          fontSize: "var(--os-text-2xs, 11px)",
          fontWeight: 600,
          color: "var(--os-text-2)",
          letterSpacing: "0.04em",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

export default function CommandCenterPage(): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [busyRec, setBusyRec] = useState<string | null>(null);

  const leadsQ = useCollection<Lead>("leads");
  const ticketsQ = useCollection<ServiceTicket>("serviceTickets");
  const quotationsQ = useCollection<Quotation>("quotations");
  const customersQ = useCollection<Customer>("customers");
  const enrollmentsQ = useCollection<Enrollment>("enrollments");
  const approvalsQ = useCollection<Approval>("approvals");
  const activitiesQ = useCollection<Activity>("activities");
  const tasksQ = useCollection<Task>("tasks");
  const meetingsQ = useCollection<Meeting>("meetings");
  const agentsQ = useCollection<Agent>("agents");
  const agentTasksQ = useCollection<AgentTask>("agentTasks");
  const handoffsQ = useCollection<AgentHandoff>("agentHandoffs");
  const recsQ = useCollection<AIRecommendation>("aiRecommendations");
  const evidenceQ = useCollection<Evidence>("evidence");
  const usersQ = useCollection<User>("users");
  const memoryQ = useCollection<MemoryRecord>("memoryRecords");

  const queries = [
    leadsQ,
    ticketsQ,
    quotationsQ,
    customersQ,
    enrollmentsQ,
    approvalsQ,
    activitiesQ,
    tasksQ,
    meetingsQ,
    agentsQ,
    agentTasksQ,
    handoffsQ,
    recsQ,
    evidenceQ,
    usersQ,
    memoryQ,
  ];
  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);

  const leads = leadsQ.data ?? [];
  const tickets = ticketsQ.data ?? [];
  const quotations = quotationsQ.data ?? [];
  const customers = customersQ.data ?? [];
  const enrollments = enrollmentsQ.data ?? [];
  const approvals = approvalsQ.data ?? [];
  const activities = activitiesQ.data ?? [];
  const tasks = tasksQ.data ?? [];
  const meetings = meetingsQ.data ?? [];
  const agents = agentsQ.data ?? [];
  const agentTasks = agentTasksQ.data ?? [];
  const handoffs = handoffsQ.data ?? [];
  const recs = recsQ.data ?? [];
  const evidence = evidenceQ.data ?? [];
  const users = usersQ.data ?? [];
  const memoryRecords = memoryQ.data ?? [];

  const today = todayIso();
  const greeting = greetingForHour(new Date().getHours());

  // demo-scale data: plain derivation each render keeps the selectors honest and simple
  const kpis = dashboardKpis({ leads, tickets, quotations, customers, enrollments, approvals });
  const funnel = salesFunnel(leads);
  const months = revenueByMonth(quotations);
  const queue = followUpQueue(leads, today);
  const timeline = todayTimeline(tasks, meetings, today);
  const pendingRecs = pendingRecommendations(recs, approvals);
  const feed = recentActivity(activities, 8);

  const userName = (id: string): string => users.find((u) => u.id === id)?.name ?? id;

  const decide = async (rec: AIRecommendation, decision: "אושר" | "נדחה"): Promise<void> => {
    if (rec.approvalId === null) {
      toast("להמלצה זו אין רשומת אישור מקושרת — לא ניתן להחליט", "warning");
      return;
    }
    setBusyRec(rec.id);
    try {
      const now = new Date().toISOString();
      await getRepository<Approval>("approvals").update(rec.approvalId, {
        status: decision,
        decidedById: CEO_USER_ID,
        decidedAt: now,
        updatedAt: now,
      });
      // reflect the decision on the linked agent task, when there is one
      const linkedTask = agentTasks.find((t) => t.approvalId === rec.approvalId);
      if (linkedTask) {
        await getRepository<AgentTask>("agentTasks").update(linkedTask.id, {
          status: decision,
          updatedAt: now,
        });
      }
      await invalidate(["approvals", "agentTasks", "aiRecommendations", "notifications"]);
      toast(
        decision === "אושר" ? `ההמלצה «${rec.title}» אושרה` : `ההמלצה «${rec.title}» נדחתה`,
        decision === "אושר" ? "success" : "info",
      );
    } catch {
      toast("שמירת ההחלטה נכשלה — נסו שוב", "danger");
    } finally {
      setBusyRec(null);
    }
  };

  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title="טעינת מרכז הפיקוד נכשלה"
        reason="קריאת הנתונים מ-IndexedDB המקומי נכשלה. רעננו את הדף; אם הבעיה חוזרת — אפסו את נתוני ההדגמה."
      />
    );
  }
  if (isLoading) {
    return (
      <div style={{ padding: "var(--os-space-6)", color: "var(--os-text-2)" }} role="status">
        טוען את נתוני מרכז הפיקוד מהמאגר המקומי…
      </div>
    );
  }

  const maxFunnel = funnel[0]?.count ?? 0;
  const lastMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2];
  const revenueDelta =
    lastMonth && prevMonth && prevMonth.approved > 0
      ? Math.round(((lastMonth.approved - prevMonth.approved) / prevMonth.approved) * 100)
      : null;

  const memorySorted = [...memoryRecords].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const lastMemory = memorySorted[0];

  return (
    <div style={stack("var(--os-space-5)")} data-testid="command-center">
      <PageRail>
        <div style={stack("var(--os-space-4)")}>
          <SidePanel title="סוכני המערכת (מצב הדגמה מקומי)">
            <div style={stack("var(--os-space-2)")}>
              {agents.slice(0, 6).map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "var(--os-space-2)",
                    border: "1px solid var(--os-border)",
                    borderRadius: "var(--os-radius-sm, 6px)",
                    paddingBlock: "var(--os-space-2)",
                    paddingInline: "var(--os-space-3)",
                    fontSize: "var(--os-text-sm, 13px)",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <OsIcon name="bot" size={13} />
                    {a.name}
                  </span>
                  <StatusChip status={agentStatusChip(a.status)} />
                </div>
              ))}
            </div>
          </SidePanel>
          <SidePanel title="זיכרון ארגוני · Obsidian">
            <div style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-2)" }}>
              <div>
                <span className="os-num">{memoryRecords.length}</span> רשומות זיכרון
              </div>
              {lastMemory ? (
                <div style={{ marginBlockStart: 4 }}>
                  עודכן לאחרונה: {lastMemory.title}
                  <span style={{ color: "var(--os-muted)" }}>
                    {" "}
                    · {dateHe(lastMemory.updatedAt)}
                  </span>
                </div>
              ) : (
                <div>אין רשומות זיכרון עדיין</div>
              )}
            </div>
          </SidePanel>
          <SidePanel title="בריאות המערכת">
            <div
              style={{
                fontSize: "var(--os-text-2xs, 11px)",
                color: "var(--os-text-2)",
                display: "grid",
                gap: 4,
              }}
            >
              <div>אחסון: IndexedDB מקומי (דפדפן) — פעיל</div>
              <div>
                נתוני הדגמה נזרעו לעוגן <span className="os-num">{dateHe(SEED_ANCHOR)}</span>
              </div>
              <div>ספק AI מרוחק: לא מחובר — כל הלוגיקה דטרמיניסטית מקומית</div>
            </div>
          </SidePanel>
        </div>
      </PageRail>

      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "var(--os-space-4)",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--os-text-xl, 20px)" }}>{greeting}</h1>
          <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm, 13px)" }}>
            מרכז הפיקוד של טרגון טכנולוגיות · {dateHe(today)}
          </div>
        </div>
        <DemoBadge />
      </div>

      {/* KPI strip — all values from dashboardKpis selectors */}
      <div style={gridStyle("repeat(auto-fit, minmax(160px, 1fr))", "var(--os-space-3)")}>
        <KpiCard title="לידים פתוחים" value={kpis.openLeads} accent="blue" icon="users" />
        <KpiCard
          title="שווי צבר פתוח"
          value={ils(kpis.pipeline.openValue)}
          accent="cyan"
          icon="briefcase"
        />
        <KpiCard
          title="הכנסות מאושרות"
          value={ils(kpis.pipeline.approvedValue)}
          accent="success"
          icon="target"
          {...(revenueDelta !== null ? { delta: revenueDelta, deltaLabel: "מהחודש הקודם" } : {})}
          {...(months.length > 1 ? { spark: months.map((m) => m.approved) } : {})}
          glow
        />
        <KpiCard
          title="קריאות פתוחות"
          value={kpis.openTicketCount}
          accent="warning"
          icon="wrench"
        />
        <KpiCard
          title="אישורים ממתינים"
          value={kpis.pendingApprovalCount}
          accent="violet"
          icon="shield"
        />
        <KpiCard
          title="השלמת שלבי קורס"
          value={
            kpis.courseCompletion.completionPercent === null
              ? "טרם נמדד"
              : `${kpis.courseCompletion.completionPercent}%`
          }
          accent="cyan"
          icon="graduation"
        />
      </div>

      {/* decision center + funnel */}
      <div style={gridStyle("minmax(0, 2fr) minmax(0, 1fr)")}>
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle
            title="מרכז ההחלטות של ה-AI"
            subtitle="כל המלצה מוצגת עם המעטפת המלאה: סיבה, ראיות, ביטחון והפעולה הבאה — ההחלטה תמיד אנושית"
            icon="brain"
          />
          <div
            style={{
              ...gridStyle("repeat(auto-fit, minmax(280px, 1fr))", "var(--os-space-3)"),
              marginBlockStart: "var(--os-space-3)",
            }}
          >
            {pendingRecs.length === 0 ? (
              <EmptyState
                icon="check"
                title="אין המלצות שממתינות להחלטה"
                reason="כל בקשות האישור של הסוכנים הוכרעו. המלצות חדשות יופיעו כאן כשסוכן יבקש אישור."
              />
            ) : (
              pendingRecs.map((rec) => (
                <DecisionCard
                  key={rec.id}
                  rec={rec}
                  agents={agents}
                  evidence={evidence}
                  onDecide={(r, d) => void decide(r, d)}
                  busy={busyRec === rec.id}
                />
              ))
            )}
          </div>
        </Panel>

        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="משפך המכירות" subtitle="מצטבר, נגזר מהלידים בפועל" icon="target" />
          <div style={{ ...stack("var(--os-space-2)"), marginBlockStart: "var(--os-space-3)" }}>
            {funnel.map((s) => (
              <MiniBarRow
                key={s.stage}
                label={s.stage}
                value={s.count}
                max={maxFunnel}
                accent="cyan"
              />
            ))}
          </div>
        </Panel>
      </div>

      {/* agent network */}
      <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
        <SectionTitle
          title="רשת הסוכנים התפעולית"
          subtitle="מצב הדגמה מקומי — האירועים נזרעו מראש; אף מודל שפה מרוחק אינו פועל"
          icon="network"
        />
        <div
          style={{
            ...gridStyle("repeat(auto-fit, minmax(210px, 1fr))", "var(--os-space-3)"),
            marginBlockStart: "var(--os-space-3)",
          }}
        >
          {agents.map((a) => {
            const openTasks = agentTasks.filter((t) => t.agentId === a.id);
            const lastTask = openTasks[openTasks.length - 1];
            const evidenceCount = lastTask ? lastTask.evidenceIds.length : null;
            return (
              <AgentCard
                key={a.id}
                name={a.name}
                role={a.purpose.split(":")[0] ?? a.purpose}
                accent={AGENT_ACCENT[a.id] ?? "blue"}
                owner={userName(CEO_USER_ID)}
                {...(lastTask ? { input: lastTask.title } : {})}
                {...(lastTask ? { output: lastTask.status } : {})}
                status={agentStatusChip(a.status)}
                evidenceCount={evidenceCount}
              />
            );
          })}
        </div>
        {handoffs.length > 0 && (
          <div
            style={{
              marginBlockStart: "var(--os-space-4)",
              display: "grid",
              gap: "var(--os-space-2)",
              fontSize: "var(--os-text-2xs, 11px)",
              color: "var(--os-text-2)",
            }}
          >
            <strong style={{ color: "var(--os-text)" }}>מסירות (Handoffs) אחרונות:</strong>
            {handoffs.map((h: AgentHandoff) => (
              <div key={h.id}>
                {agents.find((a) => a.id === h.fromAgentId)?.name ?? h.fromAgentId} ←{" "}
                {agents.find((a) => a.id === h.toAgentId)?.name ?? h.toAgentId} · {h.reason} ·{" "}
                {dateTimeHe(h.at)}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* course / service / revenue */}
      <div style={gridStyle("repeat(auto-fit, minmax(260px, 1fr))")}>
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="מצב הקורסים" icon="graduation" />
          <div style={{ ...stack("var(--os-space-2)"), marginBlockStart: "var(--os-space-3)" }}>
            <ConfidenceBar
              value={kpis.courseCompletion.completionPercent}
              label="שלבי לימוד שאושרו"
            />
            <div style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-2)" }}>
              <div>
                <span className="os-num">{kpis.courseCompletion.awaitingInstructor}</span> שלבים
                ממתינים לבדיקת מדריך
              </div>
              <div>
                <span className="os-num">{kpis.courseCompletion.blockedStudents}</span> תלמידים
                חסומים / זקוקים לעזרה
              </div>
            </div>
          </div>
        </Panel>

        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="מצב השירות" icon="wrench" />
          <div style={{ ...stack("var(--os-space-2)"), marginBlockStart: "var(--os-space-3)" }}>
            <MiniBarRow
              label="עדיפות גבוהה"
              value={kpis.openTicketsByPriority["גבוהה"]}
              max={kpis.openTicketCount}
              accent="danger"
            />
            <MiniBarRow
              label="עדיפות בינונית"
              value={kpis.openTicketsByPriority["בינונית"]}
              max={kpis.openTicketCount}
              accent="warning"
            />
            <MiniBarRow
              label="עדיפות נמוכה"
              value={kpis.openTicketsByPriority["נמוכה"]}
              max={kpis.openTicketCount}
              accent="blue"
            />
          </div>
        </Panel>

        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="מגמת הכנסות" subtitle="נגזר מהצעות מחיר לפי חודש" icon="gauge" />
          <div style={{ marginBlockStart: "var(--os-space-3)" }}>
            {months.length > 1 ? (
              <>
                <Sparkline values={months.map((m) => m.approved)} accent="success" />
                <div
                  style={{
                    display: "grid",
                    gap: 4,
                    marginBlockStart: "var(--os-space-3)",
                    fontSize: "var(--os-text-2xs, 11px)",
                    color: "var(--os-text-2)",
                  }}
                >
                  {months.map((m) => (
                    <div key={m.month} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="os-num">{m.month}</span>
                      <span className="os-num">
                        מאושר {ils(m.approved)} · פתוח {ils(m.open)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState
                title="אין מספיק נתונים למגמה"
                reason="נדרשים לפחות שני חודשי פעילות של הצעות מחיר כדי לצייר מגמה."
              />
            )}
          </div>
        </Panel>
      </div>

      {/* timeline / follow-up / activity */}
      <div style={gridStyle("repeat(auto-fit, minmax(260px, 1fr))")}>
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="ציר הזמן של היום" icon="clock" />
          <div style={{ ...stack("var(--os-space-2)"), marginBlockStart: "var(--os-space-3)" }}>
            {timeline.length === 0 ? (
              <EmptyState
                icon="clock"
                title="אין משימות או פגישות להיום"
                reason="לא נמצאו משימות פתוחות עם יעד היום ולא פגישות שמתוזמנות להיום."
              />
            ) : (
              timeline.map((e) => (
                <div
                  key={e.id}
                  style={{
                    display: "flex",
                    gap: "var(--os-space-3)",
                    alignItems: "center",
                    fontSize: "var(--os-text-sm, 13px)",
                  }}
                >
                  <span
                    className="os-num"
                    style={{ minInlineSize: 42, color: "var(--os-cyan)", fontWeight: 600 }}
                  >
                    {e.time ?? "היום"}
                  </span>
                  <span>{e.title}</span>
                  <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs, 11px)" }}>
                    {e.kind}
                    {e.priority ? ` · ${e.priority}` : ""}
                  </span>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle
            title="תור פולואו-אפ"
            subtitle="לידים פתוחים שמועד המעקב שלהם הגיע"
            icon="alert"
            action={
              <Link to="/crm" style={{ color: "var(--os-cyan)", fontSize: "var(--os-text-2xs)" }}>
                ל-CRM ←
              </Link>
            }
          />
          <div style={{ ...stack("var(--os-space-2)"), marginBlockStart: "var(--os-space-3)" }}>
            {queue.length === 0 ? (
              <EmptyState
                icon="check"
                title="אין לידים שממתינים לפולואו-אפ"
                reason="לכל הלידים הפתוחים יש מועד מעקב עתידי."
              />
            ) : (
              queue.map((l) => (
                <div
                  key={l.id}
                  data-testid="followup-lead"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "var(--os-space-2)",
                    fontSize: "var(--os-text-sm, 13px)",
                    borderBlockEnd: "1px solid var(--os-border)",
                    paddingBlockEnd: 4,
                  }}
                >
                  <span>
                    {l.name}
                    <span style={{ color: "var(--os-muted)" }}> · {l.interest}</span>
                  </span>
                  <span className="os-num" style={{ color: "var(--os-warning)" }}>
                    {dateHe(l.followUp)}
                  </span>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="פעילות אחרונה" icon="inbox" />
          <div style={{ ...stack("var(--os-space-2)"), marginBlockStart: "var(--os-space-3)" }}>
            {feed.length === 0 ? (
              <EmptyState title="אין פעילות" reason="טרם נרשמו אירועי פעילות במערכת." />
            ) : (
              feed.map((a) => (
                <div
                  key={a.id}
                  style={{
                    fontSize: "var(--os-text-2xs, 12px)",
                    color: "var(--os-text-2)",
                    display: "flex",
                    gap: "var(--os-space-2)",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{a.text}</span>
                  <span
                    className="os-num"
                    style={{ color: "var(--os-muted)", whiteSpace: "nowrap" }}
                  >
                    {dateTimeHe(a.at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
