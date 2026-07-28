// /service — שירות ותיקונים (Wave 4). Ticket workbench: creation with printer
// selection, deterministic initial diagnosis (labeled, never "verified"), 6-step
// status journey, technician assignment, parts, tests, quality check and a full
// per-ticket timeline (RepairActions + Activities from the same repositories
// the Command Center reads).
import { useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { PageRail } from "@/app/rail";
import {
  DataTable,
  Drawer,
  EmptyState,
  KpiCard,
  Modal,
  OsButton,
  Panel,
  SectionTitle,
  StatusChip,
  Stepper,
  useToast,
  type DataTableColumn,
  type OsStatus,
} from "@/design-system";
import "./service.css";
import type {
  Activity,
  Customer,
  CustomerPrinter,
  PrinterModel,
  RepairAction,
  ServiceTicket,
  TicketPriority,
  TicketStatus,
  User,
} from "@/domain/types";
import { getRepository, nextId } from "@/repositories";
import { CEO_USER_ID, DEMO_DATA_LABEL } from "@/repositories/seed";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import {
  ACTION_KINDS,
  actionKindOf,
  allowedTransitions,
  DIAGNOSIS_DISCLAIMER,
  hasQualityCheck,
  isClosedStatus,
  JOURNEY_STEPS,
  journeyStep,
  makeActionDescription,
  openByPriority,
  partsCostTotal,
  RULES_ENGINE_LABEL,
  slaInfo,
  slaRiskQueue,
  suggestDiagnosis,
  technicianLoad,
  type ActionKind,
} from "./lib";

const kpiRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "var(--os-space-5)",
};

function todayISO(): string {
  // local-time "today" — must match the wall clock in the header, not UTC
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function ticketStatusChip(status: TicketStatus): ReactElement {
  const map: Record<TicketStatus, { chip: OsStatus; label: string }> = {
    חדש: { chip: "ממתין", label: "נפתחה" },
    בבדיקה: { chip: "פעיל", label: "באבחון" },
    "ממתין ללקוח": { chip: "אזהרה", label: "ממתין ללקוח" },
    "ממתין לחלק": { chip: "אזהרה", label: "ממתין לחלק" },
    טופל: { chip: "הושלם", label: "טופלה" },
    נסגר: { chip: "מושבת", label: "נסגרה" },
  };
  const m = map[status];
  return <StatusChip status={m.chip} label={m.label} />;
}

/** Disabled-with-reason props while an async action runs (OsButton honesty contract). */
function busyDisabled(
  busy: boolean,
  reason = "פעולה קודמת עדיין רצה",
): { disabled: true; disabledReason: string } | { disabled?: false } {
  return busy ? { disabled: true, disabledReason: reason } : {};
}

async function logServiceActivity(text: string, entityRef: string | null): Promise<void> {
  const repo = getRepository<Activity>("activities");
  const all = await repo.list();
  const now = new Date().toISOString();
  await repo.create({
    id: nextId(
      "act",
      all.map((a) => a.id),
    ),
    kind: "קריאת שירות",
    text,
    actorId: CEO_USER_ID,
    entityRef,
    at: now,
    createdAt: now,
    updatedAt: now,
  });
}

// ── page ────────────────────────────────────────────────────────────────────
export default function ServicePage(): ReactElement {
  const ticketsQ = useCollection<ServiceTicket>("serviceTickets");
  const actionsQ = useCollection<RepairAction>("repairActions");
  const activitiesQ = useCollection<Activity>("activities");
  const customersQ = useCollection<Customer>("customers");
  const printersQ = useCollection<CustomerPrinter>("customerPrinters");
  const modelsQ = useCollection<PrinterModel>("printerModels");
  const usersQ = useCollection<User>("users");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("open");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  const tickets = useMemo(() => ticketsQ.data ?? [], [ticketsQ.data]);
  const actions = useMemo(() => actionsQ.data ?? [], [actionsQ.data]);
  const activities = useMemo(() => activitiesQ.data ?? [], [activitiesQ.data]);
  const customers = useMemo(() => customersQ.data ?? [], [customersQ.data]);
  const customerPrinters = useMemo(() => printersQ.data ?? [], [printersQ.data]);
  const models = useMemo(() => modelsQ.data ?? [], [modelsQ.data]);
  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);

  const today = todayISO();
  const open = tickets.filter((t) => !isClosedStatus(t.status));
  const risk = useMemo(() => slaRiskQueue(tickets, today), [tickets, today]);
  const byPriority = useMemo(() => openByPriority(tickets), [tickets]);
  const load = useMemo(() => technicianLoad(tickets), [tickets]);
  const closedThisWeek = tickets.filter(
    (t) => isClosedStatus(t.status) && daysAgo(t.updatedAt) <= 7,
  ).length;
  const slaBreaches = risk.filter((r) => r.sla.level === "חריגה").length;
  const slaAtRisk = risk.filter((r) => r.sla.level === "בסיכון").length;

  const filtered = tickets
    .filter((t) =>
      statusFilter === "open"
        ? !isClosedStatus(t.status)
        : statusFilter === "closed"
          ? isClosedStatus(t.status)
          : true,
    )
    .filter((t) => priorityFilter === "all" || t.priority === priorityFilter)
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt));

  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  if (ticketsQ.isError || actionsQ.isError) {
    return (
      <EmptyState
        icon="alert"
        title="שגיאה בטעינת קריאות השירות"
        reason="קריאת ה-repositories נכשלה — נסו לרענן את הדף."
      />
    );
  }
  if (ticketsQ.isLoading || actionsQ.isLoading || customersQ.isLoading) {
    return (
      <Panel style={{ padding: "var(--os-space-8)", color: "var(--os-text-2)" }}>
        טוען קריאות שירות…
      </Panel>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)" }}>
      <PageRail>
        <ServiceRail risk={risk} byPriority={byPriority} load={load} users={users} />
      </PageRail>

      <SectionTitle
        icon="wrench"
        title="שירות ותיקונים"
        subtitle={DEMO_DATA_LABEL}
        action={
          <OsButton icon="plus" onClick={() => setCreateOpen(true)}>
            קריאה חדשה
          </OsButton>
        }
      />

      {/* VC-D: four quiet, action-driving KPIs only — the operator's live queue
          state. Zero is neutral (muted), never success; amber/red appear only
          when action is genuinely required; no glow. Passive totals move to
          "מדדים נוספים". */}
      <div style={kpiRowStyle}>
        <KpiCard
          title="קריאות פתוחות"
          value={open.length}
          accent="cyan"
          icon="wrench"
          muted={open.length === 0}
        />
        <KpiCard
          title="עדיפות גבוהה"
          value={byPriority["גבוהה"]}
          accent="warning"
          icon="alert"
          muted={byPriority["גבוהה"] === 0}
        />
        <KpiCard
          title="חריגות SLA"
          value={slaBreaches}
          accent="danger"
          icon="clock"
          muted={slaBreaches === 0}
        />
        <KpiCard
          title="בסיכון SLA"
          value={slaAtRisk}
          accent="warning"
          icon="clock"
          muted={slaAtRisk === 0}
        />
      </div>

      <details className="os-more-metrics">
        <summary>מדדים נוספים</summary>
        <div className="os-more-metrics__grid">
          <div className="os-more-metrics__item">
            <span>נסגרו השבוע</span>
            <span className="os-num">{closedThisWeek}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>סך הקריאות במערכת</span>
            <span className="os-num">{tickets.length}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>קריאות סגורות</span>
            <span className="os-num">{tickets.length - open.length}</span>
          </div>
        </div>
      </details>

      <div style={{ display: "flex", gap: "var(--os-space-4)", flexWrap: "wrap" }}>
        <select
          className="os-qc-input"
          style={{ maxInlineSize: 180 }}
          aria-label="סינון סטטוס"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="open">פתוחות בלבד</option>
          <option value="closed">סגורות בלבד</option>
          <option value="all">הכול</option>
        </select>
        <select
          className="os-qc-input"
          style={{ maxInlineSize: 180 }}
          aria-label="סינון עדיפות"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
        >
          <option value="all">כל העדיפויות</option>
          <option value="גבוהה">גבוהה</option>
          <option value="בינונית">בינונית</option>
          <option value="נמוכה">נמוכה</option>
        </select>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: selected ? "minmax(300px, 420px) 1fr" : "1fr",
          gap: "var(--os-space-6)",
          alignItems: "start",
        }}
      >
        <TicketQueue
          tickets={filtered}
          today={today}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
          compact={selected !== null}
        />
        {selected && (
          <TicketWorkbench
            key={selected.id}
            ticket={selected}
            actions={actions}
            activities={activities}
            users={users}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>

      {createOpen && (
        <NewTicketModal
          customers={customers}
          customerPrinters={customerPrinters}
          models={models}
          users={users}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => setSelectedId(id)}
        />
      )}
    </div>
  );
}

function daysAgo(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// ── rail ────────────────────────────────────────────────────────────────────
function ServiceRail({
  risk,
  byPriority,
  load,
  users,
}: {
  risk: ReturnType<typeof slaRiskQueue>;
  byPriority: Record<TicketPriority, number>;
  load: Map<string, number>;
  users: readonly User[];
}): ReactElement {
  const nameOf = (id: string): string => users.find((u) => u.id === id)?.name ?? id;
  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)", fontSize: "var(--os-text-sm)" }}>
      <div>
        <div style={railTitle}>תור סיכוני SLA ({risk.length})</div>
        {risk.length === 0 && <div style={railMuted}>אין קריאות בסיכון SLA.</div>}
        {risk.slice(0, 5).map(({ ticket, sla }) => (
          <div key={ticket.id} style={railRow}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {ticket.customerName}
            </span>
            <StatusChip
              status={sla.level === "חריגה" ? "מושהה" : "אזהרה"}
              label={`${sla.elapsedDays}/${sla.targetDays} ימים`}
            />
          </div>
        ))}
      </div>
      <div>
        <div style={railTitle}>פתוחות לפי עדיפות</div>
        {(["גבוהה", "בינונית", "נמוכה"] as const).map((p) => (
          <div key={p} style={railRow}>
            <span>{p}</span>
            <span className="os-num" style={{ color: "var(--os-text)" }}>
              {byPriority[p]}
            </span>
          </div>
        ))}
      </div>
      <div>
        <div style={railTitle}>עומס טכנאים</div>
        {load.size === 0 && <div style={railMuted}>אין קריאות פתוחות משויכות.</div>}
        {[...load.entries()].map(([ownerId, count]) => (
          <div key={ownerId} style={railRow}>
            <span>{nameOf(ownerId)}</span>
            <span className="os-num" style={{ color: "var(--os-text)" }}>
              {count} פתוחות
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const railTitle: CSSProperties = {
  color: "var(--os-text)",
  fontWeight: 600,
  marginBlockEnd: "var(--os-space-3)",
};
const railMuted: CSSProperties = { color: "var(--os-muted)", fontSize: "var(--os-text-xs)" };
const railRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--os-space-3)",
  marginBlockEnd: "var(--os-space-3)",
};

// ── ticket queue ────────────────────────────────────────────────────────────
function TicketQueue({
  tickets,
  today,
  selectedId,
  onSelect,
  compact,
}: {
  tickets: readonly ServiceTicket[];
  today: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  compact: boolean;
}): ReactElement {
  const extraColumns: DataTableColumn<ServiceTicket>[] = compact
    ? []
    : [
        { key: "printer", header: "מדפסת" },
        { key: "issue", header: "תקלה" },
      ];
  const columns: DataTableColumn<ServiceTicket>[] = [
    {
      key: "id",
      header: "#",
      width: 48,
      render: (t) => <span className="os-table__num">{t.id}</span>,
    },
    { key: "customerName", header: "לקוח" },
    ...extraColumns,
    {
      key: "priority",
      header: "עדיפות",
      render: (t) => (
        <StatusChip
          status={t.priority === "גבוהה" ? "מושהה" : t.priority === "בינונית" ? "אזהרה" : "ממתין"}
          label={t.priority}
        />
      ),
    },
    { key: "status", header: "סטטוס", render: (t) => ticketStatusChip(t.status) },
    {
      key: "sla",
      header: "SLA",
      render: (t) => {
        const s = slaInfo(t, today);
        return (
          <span
            className="os-table__num"
            style={{
              color:
                s.level === "חריגה"
                  ? "var(--danger-text)"
                  : s.level === "בסיכון"
                    ? "var(--warning-text)"
                    : "var(--os-text-2)",
            }}
          >
            {s.elapsedDays}/{s.targetDays} ימים
          </span>
        );
      },
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={tickets}
      rowKey="id"
      onRowClick={(t) => onSelect(t.id)}
      rowClassName={(t) => (t.id === selectedId ? "os-service-row--selected" : "")}
      emptyText="אין קריאות שירות"
      emptyReason="לא נמצאו קריאות בסינון הנוכחי — פתחו קריאה חדשה או שנו סינון."
      maxHeight={520}
    />
  );
}

// ── workbench ───────────────────────────────────────────────────────────────
function TicketWorkbench({
  ticket,
  actions,
  activities,
  users,
  onClose,
}: {
  ticket: ServiceTicket;
  actions: readonly RepairAction[];
  activities: readonly Activity[];
  users: readonly User[];
  onClose: () => void;
}): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [actionKind, setActionKind] = useState<ActionKind>("אבחון");
  const [actionText, setActionText] = useState("");
  const [actionCost, setActionCost] = useState("");
  const [instructions, setInstructions] = useState("");

  const qc = hasQualityCheck(actions, ticket.id);
  const step = journeyStep(ticket.status, qc);
  const diag = suggestDiagnosis(ticket.issue, ticket.description);
  const ticketActions = actions
    .filter((a) => a.ticketId === ticket.id)
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  const ticketActivities = activities
    .filter((a) => a.entityRef === `ticket:${ticket.id}`)
    .sort((a, b) => b.at.localeCompare(a.at));
  const parts = partsCostTotal(actions, ticket.id);
  const performedChecks = new Set(
    ticketActions
      .filter((a) => actionKindOf(a.description) === "בדיקה")
      .map((a) => a.description.replace(/^בדיקה: /, "")),
  );

  async function updateTicket(
    patch: Partial<Omit<ServiceTicket, "id">>,
    activityText: string,
  ): Promise<void> {
    setBusy(true);
    try {
      const repo = getRepository<ServiceTicket>("serviceTickets");
      await repo.update(ticket.id, { ...patch, updatedAt: new Date().toISOString() });
      await logServiceActivity(activityText, `ticket:${ticket.id}`);
      await invalidate(["serviceTickets", "activities"]);
    } finally {
      setBusy(false);
    }
  }

  async function addAction(kind: ActionKind, text: string, cost: number): Promise<void> {
    setBusy(true);
    try {
      const repo = getRepository<RepairAction>("repairActions");
      const all = await repo.list();
      const now = new Date().toISOString();
      await repo.create({
        id: nextId(
          "ra",
          all.map((a) => a.id),
        ),
        ticketId: ticket.id,
        description: makeActionDescription(kind, text),
        performedById: ticket.ownerId,
        performedAt: todayISO(),
        partsCost: cost,
        createdAt: now,
        updatedAt: now,
      });
      await logServiceActivity(`${kind} תועד בקריאה ${ticket.id}: ${text}`, `ticket:${ticket.id}`);
      await invalidate(["repairActions", "activities"]);
    } finally {
      setBusy(false);
    }
  }

  const transitions = allowedTransitions(ticket.status);

  return (
    <div style={{ display: "grid", gap: "var(--os-space-5)" }}>
      <Panel style={{ padding: "var(--os-space-5)", display: "grid", gap: "var(--os-space-4)" }}>
        <SectionTitle
          icon="wrench"
          title={`קריאה ${ticket.id} — ${ticket.customerName}`}
          subtitle={`${ticket.printer} · נפתחה ${fmtDate(ticket.openedAt)}`}
          action={
            <div style={{ display: "flex", gap: "var(--os-space-3)", flexWrap: "wrap" }}>
              <OsButton
                size="sm"
                variant="ghost"
                icon="clock"
                onClick={() => setHistoryOpen(true)}
              >
                ציר זמן והיסטוריה ({ticketActions.length + ticketActivities.length})
              </OsButton>
              <OsButton size="sm" variant="ghost" icon="x" onClick={onClose}>
                סגירת חלונית
              </OsButton>
            </div>
          }
        />
        <div className="os-table-scroll" style={{ overflowX: "auto" }}>
          <Stepper steps={JOURNEY_STEPS.map((s) => ({ id: s, label: s }))} activeId={step} />
        </div>
        <div style={{ fontSize: "var(--os-text-sm)", color: "var(--os-text-2)" }}>
          <b style={{ color: "var(--os-text)" }}>{ticket.issue}</b> — {ticket.description}
        </div>
        {ticket.solution && (
          <div style={{ fontSize: "var(--os-text-sm)", color: "var(--success-text)" }}>
            פתרון/עדכון: {ticket.solution}
          </div>
        )}

        {/* status transitions + assignment */}
        <div
          style={{
            display: "flex",
            gap: "var(--os-space-3)",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {transitions.map((next) =>
            next === "נסגר" && !qc ? (
              <OsButton
                key={next}
                size="sm"
                variant="ghost"
                disabled
                disabledReason="סגירה מחייבת תיעוד בדיקת איכות (הוסיפו פעולה מסוג 'בדיקת איכות')"
              >
                העברה ל: נסגרה
              </OsButton>
            ) : (
              <OsButton
                key={next}
                size="sm"
                variant={next === "טופל" ? "success" : next === "נסגר" ? "primary" : "cyan"}
                {...busyDisabled(busy)}
                onClick={() => {
                  void updateTicket(
                    { status: next },
                    `קריאה ${ticket.id} עברה לסטטוס «${next}» (${ticket.customerName})`,
                  ).then(() => toast(`הקריאה עברה ל«${next}» ונרשמה בציר הזמן`, "success"));
                }}
              >
                העברה ל: {next === "טופל" ? "הושלמה" : next === "נסגר" ? "נסגרה" : next}
              </OsButton>
            ),
          )}
          <span
            style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 6 }}
          >
            <label className="os-qc-label" htmlFor="tech-assign" style={{ margin: 0 }}>
              טכנאי מטפל
            </label>
            <select
              id="tech-assign"
              className="os-qc-input"
              style={{ inlineSize: 150 }}
              value={ticket.ownerId}
              onChange={(e) => {
                const u = users.find((x) => x.id === e.target.value);
                void updateTicket(
                  { ownerId: e.target.value },
                  `קריאה ${ticket.id} שויכה ל${u?.name ?? e.target.value}`,
                ).then(() => toast("השיוך עודכן", "success"));
              }}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </span>
        </div>
      </Panel>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--os-space-5)",
          alignItems: "start",
        }}
      >
        {/* deterministic diagnosis + tests checklist */}
        <Panel
          variant="raised"
          style={{ padding: "var(--os-space-5)", display: "grid", gap: "var(--os-space-3)" }}
        >
          <SectionTitle icon="sparkle" title="אבחון ראשוני" subtitle={RULES_ENGINE_LABEL} />
          <div style={{ fontWeight: 600 }}>{diag.cause}</div>
          <div style={{ color: "var(--warning-text)", fontSize: "var(--os-text-sm)" }}>
            {DIAGNOSIS_DISCLAIMER} · חוק שהופעל: {diag.rule}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-sm)" }}>
              בדיקות מומלצות — סימון מתעד ביצוע בציר הזמן:
            </div>
            {diag.checks.map((c) => {
              const done = performedChecks.has(c);
              return (
                <label
                  key={c}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    fontSize: "var(--os-text-sm)",
                    color: done ? "var(--success-text)" : "var(--os-text-2)",
                    cursor: done || busy || isClosedStatus(ticket.status) ? "default" : "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={done}
                    disabled={done || busy || isClosedStatus(ticket.status)}
                    onChange={() => {
                      void addAction("בדיקה", c, 0).then(() =>
                        toast("הבדיקה תועדה בציר הזמן", "success"),
                      );
                    }}
                  />
                  {c}
                </label>
              );
            })}
          </div>
          {isClosedStatus(ticket.status) || qc ? (
            <OsButton
              variant="approve"
              icon="check"
              disabled
              disabledReason={
                qc ? "בדיקת איכות כבר תועדה לקריאה זו" : "הקריאה סגורה — אין תיעוד חדש"
              }
            >
              תיעוד בדיקת איכות
            </OsButton>
          ) : (
            <OsButton
              variant="approve"
              icon="check"
              {...busyDisabled(busy)}
              onClick={() => {
                void addAction("בדיקת איכות", "בוצעה בדיקת איכות מלאה לאחר התיקון", 0).then(() =>
                  toast("בדיקת האיכות תועדה — ניתן לסגור את הקריאה", "success"),
                );
              }}
            >
              תיעוד בדיקת איכות
            </OsButton>
          )}
        </Panel>

        {/* add repair action + parts + instructions */}
        <Panel style={{ padding: "var(--os-space-5)", display: "grid", gap: "var(--os-space-3)" }}>
          <SectionTitle
            icon="wrench"
            title="תיעוד פעולה"
            subtitle={`עלות חלקים מצטברת: ₪${parts.toLocaleString("he-IL")}`}
          />
          <div style={{ display: "grid", gap: 6 }}>
            <select
              className="os-qc-input"
              aria-label="סוג פעולה"
              value={actionKind}
              onChange={(e) => setActionKind(e.target.value as ActionKind)}
            >
              {ACTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input
              className="os-qc-input"
              aria-label="תיאור הפעולה"
              placeholder="מה בוצע / אובחן / הוחלף?"
              value={actionText}
              onChange={(e) => setActionText(e.target.value)}
            />
            <input
              className="os-qc-input"
              type="number"
              aria-label="עלות חלקים בשקלים"
              placeholder="עלות חלקים (₪, 0 אם אין)"
              value={actionCost}
              onChange={(e) => setActionCost(e.target.value)}
            />
            {actionText.trim().length > 0 && !isClosedStatus(ticket.status) ? (
              <OsButton
                icon="plus"
                {...busyDisabled(busy)}
                onClick={() => {
                  const cost = Number(actionCost) || 0;
                  void addAction(actionKind, actionText.trim(), Math.max(0, cost)).then(() => {
                    setActionText("");
                    setActionCost("");
                    toast("הפעולה תועדה בציר הזמן", "success");
                  });
                }}
              >
                הוספת פעולה
              </OsButton>
            ) : (
              <OsButton
                icon="plus"
                disabled
                disabledReason={
                  isClosedStatus(ticket.status)
                    ? "הקריאה סגורה — אין תיעוד פעולות חדש"
                    : "כתבו תיאור פעולה לפני התיעוד"
                }
              >
                הוספת פעולה
              </OsButton>
            )}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label className="os-qc-label" htmlFor="cust-instructions">
              הנחיות ללקוח
            </label>
            <input
              id="cust-instructions"
              className="os-qc-input"
              placeholder="הנחיות שיימסרו ללקוח (נשמר בשדה הפתרון)"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
            {instructions.trim().length > 0 ? (
              <OsButton
                variant="cyan"
                icon="send"
                {...busyDisabled(busy)}
                onClick={() => {
                  void updateTicket(
                    { solution: instructions.trim() },
                    `עודכנו הנחיות ללקוח בקריאה ${ticket.id}`,
                  ).then(() => {
                    setInstructions("");
                    toast("ההנחיות נשמרו על הקריאה", "success");
                  });
                }}
              >
                שמירת הנחיות
              </OsButton>
            ) : (
              <OsButton
                variant="cyan"
                icon="send"
                disabled
                disabledReason="כתבו הנחיות לפני השמירה"
              >
                שמירת הנחיות
              </OsButton>
            )}
          </div>
        </Panel>
      </div>

      {/* VC-D: full history/evidence/part-records are SECONDARY — kept off the
          primary workflow and opened on demand in a drawer. */}
      <Drawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={`ציר זמן והיסטוריה — קריאה ${ticket.id}`}
      >
        <div style={{ display: "grid", gap: "var(--os-space-4)" }}>
          <div style={{ fontSize: "var(--os-text-sm)", color: "var(--os-muted)" }}>
            {ticketActions.length} פעולות תיקון · {ticketActivities.length} אירועים ·
            עלות חלקים מצטברת ₪{parts.toLocaleString("he-IL")}
          </div>
          {ticketActions.length === 0 && ticketActivities.length === 0 && (
            <EmptyState
              title="אין אירועים עדיין"
              reason="פעולות תיקון ושינויי סטטוס יופיעו כאן ברגע שיתועדו."
            />
          )}
          <div style={{ display: "grid", gap: "var(--os-space-3)" }}>
            {ticketActivities.map((a) => (
              <div key={a.id} style={timelineRow}>
                <span className="os-num" style={timelineWhen} dir="ltr">
                  {new Date(a.at).toLocaleString("he-IL", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span style={{ color: "var(--accent-primary-text)" }}>אירוע</span>
                <span>{a.text}</span>
              </div>
            ))}
            {ticketActions.map((a) => (
              <div key={a.id} style={timelineRow}>
                <span className="os-num" style={timelineWhen}>
                  {fmtDate(a.performedAt)}
                </span>
                <span style={{ color: "var(--os-violet-text)" }}>
                  {actionKindOf(a.description) ?? "פעולה"}
                </span>
                <span>{a.description.replace(/^[^:]+: /, "")}</span>
                {a.partsCost > 0 && (
                  <span className="os-num" style={{ color: "var(--warning-text)" }}>
                    ₪{a.partsCost.toLocaleString("he-IL")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </Drawer>
    </div>
  );
}

const timelineRow: CSSProperties = {
  display: "flex",
  gap: "var(--os-space-4)",
  alignItems: "baseline",
  fontSize: "var(--os-text-sm)",
  color: "var(--os-text-2)",
  borderBlockEnd: "1px solid var(--os-border)",
  paddingBlockEnd: "var(--os-space-3)",
};
const timelineWhen: CSSProperties = { color: "var(--os-muted)", minInlineSize: 84 };

// ── create modal ────────────────────────────────────────────────────────────
function NewTicketModal({
  customers,
  customerPrinters,
  models,
  users,
  onClose,
  onCreated,
}: {
  customers: readonly Customer[];
  customerPrinters: readonly CustomerPrinter[];
  models: readonly PrinterModel[];
  users: readonly User[];
  onClose: () => void;
  onCreated: (id: string) => void;
}): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [customerId, setCustomerId] = useState("");
  const [printer, setPrinter] = useState("");
  const [issue, setIssue] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("בינונית");
  const [ownerId, setOwnerId] = useState("u-ran");
  const [mediaRef, setMediaRef] = useState("");
  const [estimate, setEstimate] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const printerOptions = customerId
    ? customerPrinters
        .filter((p) => p.customerId === customerId)
        .map((p) => {
          const model = models.find((m) => m.id === p.printerModelId);
          return `${model?.name ?? p.printerModelId} (S/N ${p.serialNumber})`;
        })
    : [];

  const submit = (): void => {
    if (!customer) {
      setErrorMsg("בחרו לקוח לפני פתיחת הקריאה");
      return;
    }
    if (printer.trim().length === 0) {
      setErrorMsg("בחרו מדפסת מרשימת הלקוח או הזינו ידנית");
      return;
    }
    if (issue.trim().length < 3) {
      setErrorMsg("תיאור תקלה קצר מדי (לפחות 3 תווים)");
      return;
    }
    setBusy(true);
    const repo = getRepository<ServiceTicket>("serviceTickets");
    const extra: string[] = [];
    if (mediaRef.trim()) extra.push(`מדיה: ${mediaRef.trim()}`);
    if (estimate.trim() && Number.isFinite(Number(estimate)))
      extra.push(`אומדן מחיר: ₪${Number(estimate).toLocaleString("he-IL")}`);
    void repo
      .list()
      .then((all) => {
        const now = new Date().toISOString();
        return repo.create({
          id: nextId(
            "t",
            all.map((t) => t.id),
          ),
          customerName: customer.name,
          customerId: customer.id,
          printer: printer.trim(),
          issue: issue.trim(),
          description: [description.trim(), ...extra].filter(Boolean).join(" · "),
          priority,
          status: "חדש",
          openedAt: todayISO(),
          ownerId,
          solution: "",
          createdAt: now,
          updatedAt: now,
        });
      })
      .then(async (created) => {
        await logServiceActivity(
          `נפתחה קריאה ${created.id}: ${created.issue} (${created.customerName})`,
          `ticket:${created.id}`,
        );
        await invalidate(["serviceTickets", "activities"]);
        return created;
      })
      .then((created) => {
        toast("הקריאה נפתחה ונרשמה בציר הזמן", "success");
        onCreated(created.id);
        onClose();
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="קריאת שירות חדשה"
      footer={
        <div style={{ display: "flex", gap: "var(--os-space-3)" }}>
          <OsButton icon="plus" {...busyDisabled(busy)} onClick={submit}>
            פתיחת קריאה
          </OsButton>
          <OsButton variant="ghost" onClick={onClose}>
            ביטול
          </OsButton>
        </div>
      }
    >
      <div className="os-qc-form">
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="nt-customer">
            לקוח
          </label>
          <select
            id="nt-customer"
            className="os-qc-input"
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setPrinter("");
            }}
          >
            <option value="">— בחירת לקוח —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="os-qc-field">
          <label
            className="os-qc-label"
            htmlFor={printerOptions.length > 0 ? "nt-printer-select" : "nt-printer-input"}
          >
            מדפסת {printerOptions.length > 0 ? "(מהצי של הלקוח)" : "(הזנה ידנית)"}
          </label>
          {printerOptions.length > 0 ? (
            <select
              id="nt-printer-select"
              className="os-qc-input"
              value={printer}
              onChange={(e) => setPrinter(e.target.value)}
            >
              <option value="">— בחירת מדפסת —</option>
              {printerOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="nt-printer-input"
              className="os-qc-input"
              placeholder="דגם המדפסת"
              value={printer}
              onChange={(e) => setPrinter(e.target.value)}
            />
          )}
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="nt-issue">
            תקלה
          </label>
          <input
            id="nt-issue"
            className="os-qc-input"
            placeholder='למשל: "שכבה ראשונה לא נדבקת"'
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="nt-desc">
            תיאור מפורט
          </label>
          <textarea
            id="nt-desc"
            className="os-qc-input os-qc-input--area"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="nt-priority">
            עדיפות
          </label>
          <select
            id="nt-priority"
            className="os-qc-input"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TicketPriority)}
          >
            <option value="גבוהה">גבוהה</option>
            <option value="בינונית">בינונית</option>
            <option value="נמוכה">נמוכה</option>
          </select>
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="nt-owner">
            טכנאי מטפל
          </label>
          <select
            id="nt-owner"
            className="os-qc-input"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="nt-media">
            קישור מדיה (תמונה/וידאו של התקלה)
          </label>
          <input
            id="nt-media"
            className="os-qc-input"
            placeholder="https://…"
            value={mediaRef}
            onChange={(e) => setMediaRef(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="nt-estimate">
            אומדן מחיר (₪, לא מחייב)
          </label>
          <input
            id="nt-estimate"
            className="os-qc-input"
            type="number"
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
          />
        </div>
        {errorMsg && <div className="os-qc-error">{errorMsg}</div>}
      </div>
    </Modal>
  );
}
