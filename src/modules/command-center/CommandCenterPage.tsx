// Wave 3 — מרכז הפיקוד (/): the operational home screen.
// Every metric is derived from repository data via selectors — no hardcoded KPIs.
// W5-D (Phase 5.13): the agent-network band is LIVE engine data
// (AgentNetworkLive), the decision center opens evidence/related records/
// audit trails and drives the canonical ApprovalPanel for engine approvals.
import { useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { Link } from "react-router-dom";
import {
  ConfidenceBar,
  EmptyState,
  KpiCard,
  Modal,
  OsButton,
  Panel,
  SectionTitle,
  Sparkline,
  useToast,
  type OsAccent,
} from "@/design-system";
import { HideShellRail } from "@/app/rail";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import { getRepository } from "@/repositories";
import { CEO_USER_ID, SEED_ANCHOR } from "@/repositories/seed";
import type {
  Activity,
  Agent,
  AgentConflict,
  AgentHandoff,
  AgentMessage,
  AgentTask,
  AIRecommendation,
  Approval,
  AuditEvent,
  Customer,
  Enrollment,
  Evidence,
  Lead,
  Meeting,
  Quotation,
  ServiceTicket,
  Task,
  User,
} from "@/domain/types";
import type { AgentRun } from "@/domain/agents";
import { pendingApprovals } from "@/agents";
import { ProviderStateBadge } from "@/components/ai";
import { ApprovalPanel } from "@/components/approval";
import { AgentNetworkLive } from "./AgentNetworkLive";
import { ManagementBand } from "./ManagementBand";
import { MemoryBand } from "./MemoryBand";
import { OperationsBrief } from "./OperationsBrief";
import { useCopilot } from "@/modules/ai-copilot/copilotApi";
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
  onOpenDetails: (rec: AIRecommendation) => void;
  busy: boolean;
}

function DecisionCard({
  rec,
  agents,
  evidence,
  onDecide,
  onOpenDetails,
  busy,
}: DecisionCardProps): ReactElement {
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
        <OsButton
          variant="ghost"
          size="sm"
          icon="evidence"
          onClick={() => onOpenDetails(rec)}
          data-testid="decision-open-details"
        >
          פתח ראיות
        </OsButton>
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

// Copilot is provided app-wide by OsShell (W5-D integration complete).
export default function CommandCenterPage(): ReactElement {
  return <CommandCenterInner />;
}

function CopilotOpenButton(): ReactElement {
  const { openCopilot } = useCopilot();
  return (
    <OsButton
      variant="cyan"
      size="sm"
      icon="sparkle"
      onClick={openCopilot}
      data-testid="open-copilot"
    >
      AI Copilot
    </OsButton>
  );
}

function CommandCenterInner(): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [busyRec, setBusyRec] = useState<string | null>(null);
  const [detailsRec, setDetailsRec] = useState<AIRecommendation | null>(null);

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
  const agentRunsQ = useCollection<AgentRun>("agentRuns");
  const agentMessagesQ = useCollection<AgentMessage>("agentMessages");
  const agentConflictsQ = useCollection<AgentConflict>("agentConflicts");
  const auditQ = useCollection<AuditEvent>("auditEvents");

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
    agentRunsQ,
    agentMessagesQ,
    agentConflictsQ,
    auditQ,
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
  const agentRuns = agentRunsQ.data ?? [];
  const agentMessages = agentMessagesQ.data ?? [];
  const agentConflicts = agentConflictsQ.data ?? [];
  const auditEvents = auditQ.data ?? [];

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

  // engine approvals — pending approvals that belong to persisted agent runs
  const pendingEngineApprovals = pendingApprovals(approvals)
    .map((a) => {
      const run = agentRuns.find((r) => r.approvalIds.includes(a.id));
      return run ? { approval: a, run } : null;
    })
    .filter((x): x is { approval: Approval; run: AgentRun } => x !== null);

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

  return (
    <div style={stack("var(--os-space-5)")} data-testid="command-center">
      {/* VC density round-2: the Command Center no longer publishes a heavy
          left rail. The per-agent status list (repeated the centre band) was
          removed; the memory/knowledge and local-health context moved into the
          "פירוט נוסף" disclosure below. The shell rail is hidden here so the
          first viewport is not competing with a secondary column. */}
      <HideShellRail />

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
        <div style={{ display: "flex", gap: "var(--os-space-2)", alignItems: "center" }}>
          <CopilotOpenButton />
          <DemoBadge />
        </div>
      </div>

      {/* Phase 7 — executive AI-operations brief + action inbox (real signals only). */}
      <OperationsBrief />

      {/* VC-C — four PRIMARY KPIs only: the operational counts that genuinely
          drive the operator's next action. Zero stays neutral (muted) because a
          zero count is neither success nor attention. Amber marks a metric only
          when there is real work to act on; pending approvals is the single
          most important item, so it alone carries the restrained accent glow.
          Passive analytics (revenue, pipeline value, course %) moved to
          "מדדים נוספים" — quieter, but never deleted. */}
      <div
        style={gridStyle("repeat(auto-fit, minmax(min(100%, 180px), 1fr))", "var(--os-space-4)")}
        data-testid="command-kpis"
      >
        <KpiCard
          title="אישורים ממתינים להחלטה"
          value={kpis.pendingApprovalCount}
          accent="warning"
          icon="shield"
          muted={kpis.pendingApprovalCount === 0}
          glow={kpis.pendingApprovalCount > 0}
        />
        <KpiCard
          title="קריאות שירות פתוחות"
          value={kpis.openTicketCount}
          accent="warning"
          icon="wrench"
          muted={kpis.openTicketCount === 0}
        />
        <KpiCard
          title="לידים פתוחים"
          value={kpis.openLeads}
          accent="blue"
          icon="users"
          muted={kpis.openLeads === 0}
        />
        <KpiCard
          title="שלבים ממתינים לבדיקת מדריך"
          value={kpis.courseCompletion.awaitingInstructor}
          accent="warning"
          icon="graduation"
          muted={kpis.courseCompletion.awaitingInstructor === 0}
        />
      </div>

      <details className="os-more-metrics" data-testid="command-more-metrics">
        <summary>מדדים נוספים ותובנות</summary>
        <div className="os-more-metrics__grid">
          <div className="os-more-metrics__item">
            <span>שווי צבר פתוח</span>
            <span className="os-num">{ils(kpis.pipeline.openValue)}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>הכנסות מאושרות</span>
            <span className="os-num">{ils(kpis.pipeline.approvedValue)}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>השלמת שלבי קורס</span>
            <span className="os-num">
              {kpis.courseCompletion.completionPercent === null
                ? "טרם נמדד"
                : `${kpis.courseCompletion.completionPercent}%`}
            </span>
          </div>
          <div className="os-more-metrics__item">
            <span>תלמידים חסומים / זקוקים לעזרה</span>
            <span className="os-num">{kpis.courseCompletion.blockedStudents}</span>
          </div>
        </div>
      </details>

      {/* W8-E — management band (Phase 8.13): derived attention items, click-through */}
      <ManagementBand />

      {/* PRIMARY FOCAL AREA — מרכז ההחלטות. Full-width, raised, accent frame:
          nothing else on the initial viewport competes with it for size, border
          strength or colour. The sales funnel and all trend/timeline panels move
          into the "פירוט נוסף" disclosure below. */}
      <div style={stack()}>
        <Panel
          variant="raised"
          className="os-focal-panel"
          style={{ padding: "var(--os-space-6)" }}
          data-testid="decision-focal"
        >
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
                  onOpenDetails={setDetailsRec}
                  busy={busyRec === rec.id}
                />
              ))
            )}
          </div>
          {/* engine approvals — the canonical approval workflow (W5-D) */}
          <div
            style={{ ...stack("var(--os-space-3)"), marginBlockStart: "var(--os-space-4)" }}
            data-testid="engine-approvals"
          >
            <SectionTitle
              title="אישורי מנוע התזמור"
              subtitle="בקשות אישור חיות מריצות סוכנים — ההחלטה דרך מנוע האישורים הקנוני"
              icon="shield"
            />
            {pendingEngineApprovals.length === 0 ? (
              <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
                אין בקשות אישור ממתינות מריצות המנוע.{" "}
                {/* underline: links inside a text block must not rely on colour alone
                    (axe link-in-text-block, W9-C a11y fix) */}
                <Link
                  to="/agents/collaboration"
                  style={{ color: "var(--os-cyan-text)", textDecoration: "underline" }}
                >
                  להרצת תרחיש בחדר התיאום ←
                </Link>
              </div>
            ) : (
              pendingEngineApprovals.map(({ approval, run }) => (
                <div key={approval.id} style={stack("var(--os-space-2)")}>
                  <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)" }}>
                    ריצה: {run.goal} ·{" "}
                    {/* underline: see a11y note above (axe link-in-text-block) */}
                    <Link
                      to="/agents/collaboration"
                      style={{ color: "var(--os-cyan-text)", textDecoration: "underline" }}
                    >
                      לריצה בחדר התיאום ←
                    </Link>
                  </div>
                  <ApprovalPanel
                    runId={run.id}
                    approvalId={approval.id}
                    compact
                    onChanged={() =>
                      void invalidate(["approvals", "agentRuns", "agentEvents", "auditEvents"])
                    }
                  />
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      {/* ONE agent-status summary — LIVE engine data (W5-D Phase 5.13). Kept
          visible per the operator contract, but subordinate to the focal panel. */}
      <AgentNetworkLive
        agents={agents}
        agentTasks={agentTasks}
        runs={agentRuns}
        approvals={approvals}
        conflicts={agentConflicts}
        messages={agentMessages}
        handoffs={handoffs}
        ownerName={userName(CEO_USER_ID)}
      />

      {/* S13.1 declutter: the follow-up queue is secondary to the AI decision
          center and the agent summary, so it opens on demand instead of always
          competing on the first viewport. Still in the DOM (searchable). */}
      <details className="os-more-metrics" data-testid="ops-summary">
        <summary>תור פולואו-אפ · לידים שמועד המעקב שלהם הגיע</summary>
        <Panel
          variant="panel"
          style={{ padding: "var(--os-space-5)", marginBlockStart: "var(--os-space-3)" }}
        >
        <SectionTitle
          title="תור פולואו-אפ"
          subtitle="לידים פתוחים שמועד המעקב שלהם הגיע"
          icon="alert"
          action={
            <Link to="/crm" style={{ color: "var(--os-cyan-text)", fontSize: "var(--os-text-2xs)" }}>
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
                <span className="os-num" style={{ color: "var(--warning-text)" }}>
                  {dateHe(l.followUp)}
                </span>
              </div>
            ))
          )}
        </div>
        </Panel>
      </details>

      {/* SECONDARY — moved out of the initial focal view into ONE disclosure:
          sales funnel, course/service/revenue trends, today's timeline and the
          activity feed. Still in the DOM (searchable), just not competing with
          מרכז ההחלטות for attention. */}
      <details className="os-more-metrics" data-testid="cc-secondary">
        <summary>פירוט נוסף · משפך מכירות, מגמות, ציר זמן ופעילות</summary>
        <div style={{ ...stack("var(--os-space-4)"), marginBlockStart: "var(--os-space-4)" }}>
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
                        <div
                          key={m.month}
                          style={{ display: "flex", justifyContent: "space-between" }}
                        >
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
                        style={{ minInlineSize: 42, color: "var(--os-cyan-text)", fontWeight: 600 }}
                      >
                        {e.time ?? "היום"}
                      </span>
                      <span>{e.title}</span>
                      <span
                        style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs, 11px)" }}
                      >
                        {e.kind}
                        {e.priority ? ` · ${e.priority}` : ""}
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

          {/* memory/knowledge + local health — moved here from the left rail */}
          <div style={gridStyle("repeat(auto-fit, minmax(260px, 1fr))")}>
            <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
              <SectionTitle title="זיכרון · ידע · למידה" icon="inbox" />
              <div style={{ marginBlockStart: "var(--os-space-3)" }}>
                <MemoryBand />
              </div>
            </Panel>

            <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
              <SectionTitle title="בריאות המערכת" icon="gauge" />
              <div
                style={{
                  marginBlockStart: "var(--os-space-3)",
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
                <ProviderStateBadge provider="local-rules" />
              </div>
            </Panel>
          </div>
        </div>
      </details>

      {/* decision details — evidence, related records, run link, audit trail */}
      {detailsRec &&
        (() => {
          const rec = detailsRec;
          const recEvidence = evidence.filter((e) => rec.evidenceIds.includes(e.id));
          const relatedRun = agentRuns.find(
            (r) => rec.approvalId !== null && r.approvalIds.includes(rec.approvalId),
          );
          const linkedTask = agentTasks.find((t) => t.approvalId === rec.approvalId);
          const recAudit = auditEvents
            .filter(
              (a) =>
                (rec.approvalId !== null && a.entityRef === `approval:${rec.approvalId}`) ||
                a.entityRef === rec.entityRef ||
                a.entityRef === `ai-recommendation:${rec.id}`,
            )
            .sort((a, b) => b.at.localeCompare(a.at));
          return (
            <Modal open onClose={() => setDetailsRec(null)} title={`ראיות והקשר: ${rec.title}`}>
              <div style={stack("var(--os-space-3)")} data-testid="decision-details-modal">
                <div style={{ fontSize: "var(--os-text-sm, 13px)", fontWeight: 600 }}>
                  ראיות ({recEvidence.length})
                </div>
                {recEvidence.length === 0 ? (
                  <div style={{ fontSize: "var(--os-text-2xs, 12px)", color: "var(--os-muted)" }}>
                    לא צורפו רשומות ראיה להמלצה זו
                  </div>
                ) : (
                  <ul
                    style={{
                      margin: 0,
                      paddingInlineStart: "1.2em",
                      fontSize: "var(--os-text-2xs, 12px)",
                      color: "var(--os-text-2)",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    {recEvidence.map((e) => (
                      <li key={e.id}>
                        {e.claim}{" "}
                        <span className="os-ltr" style={{ color: "var(--os-muted)" }}>
                          ({e.sourceRef})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div style={{ fontSize: "var(--os-text-2xs, 12px)", color: "var(--os-text-2)" }}>
                  <strong style={{ color: "var(--os-text)" }}>רשומה קשורה: </strong>
                  {rec.entityRef ? (
                    <span className="os-ltr">{rec.entityRef}</span>
                  ) : (
                    "לא קושרה רשומה"
                  )}
                  {linkedTask && (
                    <>
                      {" "}
                      · משימת סוכן: {linkedTask.title} ({linkedTask.status})
                    </>
                  )}
                </div>
                <div style={{ fontSize: "var(--os-text-2xs, 12px)", color: "var(--os-text-2)" }}>
                  <strong style={{ color: "var(--os-text)" }}>ריצת סוכן: </strong>
                  {relatedRun ? (
                    <Link to="/agents/collaboration" style={{ color: "var(--os-cyan-text)" }}>
                      {relatedRun.goal} ({relatedRun.status}) — לחדר התיאום ←
                    </Link>
                  ) : (
                    "ההמלצה אינה מקושרת לריצת מנוע (רשומת seed)"
                  )}
                </div>
                {rec.approvalId !== null && relatedRun && (
                  <ApprovalPanel
                    runId={relatedRun.id}
                    approvalId={rec.approvalId}
                    compact
                    onChanged={() =>
                      void invalidate(["approvals", "agentRuns", "agentEvents", "auditEvents"])
                    }
                  />
                )}
                <div style={{ fontSize: "var(--os-text-sm, 13px)", fontWeight: 600 }}>
                  יומן ביקורת ({recAudit.length})
                </div>
                {recAudit.length === 0 ? (
                  <div style={{ fontSize: "var(--os-text-2xs, 12px)", color: "var(--os-muted)" }}>
                    לא נרשמו אירועי ביקורת עבור המלצה זו
                  </div>
                ) : (
                  <ul
                    style={{
                      margin: 0,
                      paddingInlineStart: "1.2em",
                      fontSize: "var(--os-text-2xs, 12px)",
                      color: "var(--os-text-2)",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    {recAudit.map((a) => (
                      <li key={a.id}>
                        <span className="os-num">{dateTimeHe(a.at)}</span> · {a.actor} ·{" "}
                        <span className="os-ltr">{a.action}</span> — {a.details}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Modal>
          );
        })()}
    </div>
  );
}
