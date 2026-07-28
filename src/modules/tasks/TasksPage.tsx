// /tasks — משימות ופגישות (Wave 4). Combined human+agent work queue on a
// 6-state kanban board (extra states persisted via description markers —
// integration request filed for a real workState field), ownership chips,
// meetings by day + today's timeline, overdue highlighting. Every state
// change writes an Activity so badges/notifications derive from the same
// repositories.
import { useMemo, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { PageRail } from "@/app/rail";
import {
  Drawer,
  EmptyState,
  Modal,
  OsButton,
  Panel,
  SectionTitle,
  StatusChip,
  useToast,
  type OsStatus,
} from "@/design-system";
import type {
  Activity,
  Agent,
  AgentTask,
  Meeting,
  Task,
  TicketPriority,
  User,
} from "@/domain/types";
import { getRepository, nextId } from "@/repositories";
import { CEO_USER_ID, DEMO_DATA_LABEL } from "@/repositories/seed";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import {
  baseStatusFor,
  buildWorkItems,
  cleanDescription,
  dueToday,
  groupByState,
  isOverdue,
  isSharedTask,
  meetingsByDay,
  meetingsOn,
  overdueTasks,
  taskOwnership,
  taskWorkState,
  WORK_STATES,
  type WorkItem,
  type WorkState,
} from "./lib";
import type { TaskX } from "@/integration/domainExtensions";

// VC-C: compact operational summary — one quiet stat, amber only when action
// is required (overdue / waiting-for-approval), neutral (muted) at zero. 0 is
// not success and not attention.
function SummaryStat({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: number;
  attention?: boolean;
}): ReactElement {
  const active = attention && value > 0;
  return (
    <div style={{ display: "grid", gap: 2, minInlineSize: 92 }}>
      <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>{label}</span>
      <span
        className="os-num"
        style={{
          fontSize: "var(--os-text-lg)",
          fontWeight: 600,
          color: active ? "var(--warning-text)" : value === 0 ? "var(--os-muted)" : "var(--os-text)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function todayISO(): string {
  // local-time "today" — must match the wall clock in the header, not UTC
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
function fmtDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

/** Disabled-with-reason props while an async action runs (OsButton honesty contract). */
function busyDisabled(
  busy: boolean,
  reason = "פעולה קודמת עדיין רצה",
): { disabled: true; disabledReason: string } | { disabled?: false } {
  return busy ? { disabled: true, disabledReason: reason } : {};
}

const STATE_CHIP: Record<WorkState, OsStatus> = {
  לביצוע: "ממתין",
  בביצוע: "פעיל",
  "ממתין ללקוח": "אזהרה",
  "ממתין לאישור": "דורש אישור",
  חסום: "חסום",
  הושלם: "הושלם",
};

async function logTaskActivity(text: string, entityRef: string | null): Promise<void> {
  const repo = getRepository<Activity>("activities");
  const all = await repo.list();
  const now = new Date().toISOString();
  await repo.create({
    id: nextId(
      "act",
      all.map((a) => a.id),
    ),
    kind: "משימה",
    text,
    actorId: CEO_USER_ID,
    entityRef,
    at: now,
    createdAt: now,
    updatedAt: now,
  });
}

export default function TasksPage(): ReactElement {
  const tasksQ = useCollection<Task>("tasks");
  const agentTasksQ = useCollection<AgentTask>("agentTasks");
  const agentsQ = useCollection<Agent>("agents");
  const meetingsQ = useCollection<Meeting>("meetings");
  const usersQ = useCollection<User>("users");

  const [createOpen, setCreateOpen] = useState(false);
  const [createMeetingOpen, setCreateMeetingOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [ownerFilter, setOwnerFilter] = useState("all");

  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const agentTasks = useMemo(() => agentTasksQ.data ?? [], [agentTasksQ.data]);
  const agents = useMemo(() => agentsQ.data ?? [], [agentsQ.data]);
  const meetings = useMemo(() => meetingsQ.data ?? [], [meetingsQ.data]);
  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);

  const today = todayISO();
  const filteredTasks = tasks.filter((t) => ownerFilter === "all" || t.ownerId === ownerFilter);
  const items = useMemo(
    () => buildWorkItems(filteredTasks, ownerFilter === "all" ? agentTasks : []),
    [filteredTasks, agentTasks, ownerFilter],
  );
  const grouped = useMemo(() => groupByState(items), [items]);
  const overdue = useMemo(() => overdueTasks(tasks, today), [tasks, today]);
  const todayTasks = useMemo(() => dueToday(tasks, today), [tasks, today]);
  const todayMeetings = useMemo(() => meetingsOn(meetings, today), [meetings, today]);
  const weekMeetings = useMemo(() => meetingsByDay(meetings, today, 7), [meetings, today]);
  const doneThisWeek = tasks.filter(
    (t) =>
      t.status === "הושלמה" &&
      Math.round((Date.now() - new Date(t.updatedAt).getTime()) / 86_400_000) <= 7,
  ).length;

  if (tasksQ.isError || meetingsQ.isError) {
    return (
      <EmptyState
        icon="alert"
        title="שגיאה בטעינת המשימות"
        reason="קריאת ה-repositories נכשלה — נסו לרענן את הדף."
      />
    );
  }
  if (tasksQ.isLoading || meetingsQ.isLoading || agentTasksQ.isLoading) {
    return (
      <Panel style={{ padding: "var(--os-space-8)", color: "var(--os-text-2)" }}>
        טוען משימות ופגישות…
      </Panel>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)" }}>
      <PageRail>
        <TasksRail
          todayTasks={todayTasks}
          todayMeetings={todayMeetings}
          overdue={overdue}
          waiting={grouped["ממתין לאישור"]}
          users={users}
          agents={agents}
        />
      </PageRail>

      <SectionTitle
        icon="check"
        title="משימות ופגישות"
        subtitle={DEMO_DATA_LABEL}
        action={
          <span style={{ display: "inline-flex", gap: "var(--os-space-3)" }}>
            <OsButton icon="plus" onClick={() => setCreateOpen(true)}>
              משימה חדשה
            </OsButton>
            <OsButton variant="cyan" icon="clock" onClick={() => setCreateMeetingOpen(true)}>
              פגישה חדשה
            </OsButton>
          </span>
        }
      />

      {/* VC-C: work queue first. Compact toolbar — ownership filter + queue count
          + the three action-driving figures (no decorative KPI strip). Passive
          totals fold into "מדדים נוספים". */}
      <div
        style={{
          display: "flex",
          gap: "var(--os-space-5)",
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: "var(--os-space-3)", alignItems: "center", flexWrap: "wrap" }}>
          <select
            className="os-qc-input"
            style={{ maxInlineSize: 220 }}
            aria-label="סינון לפי בעלים"
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
          >
            <option value="all">כל הבעלים (כולל סוכנים)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
            {items.length} פריטי עבודה על הלוח
          </span>
        </div>
        <div style={{ display: "flex", gap: "var(--os-space-6)", alignItems: "baseline" }}>
          <SummaryStat label="לביצוע היום" value={todayTasks.length} />
          <SummaryStat label="באיחור" value={overdue.length} attention />
          <SummaryStat label="ממתין לאישור" value={grouped["ממתין לאישור"].length} attention />
        </div>
      </div>

      <details className="os-more-metrics">
        <summary>מדדים נוספים</summary>
        <div className="os-more-metrics__grid">
          <div className="os-more-metrics__item">
            <span>פגישות היום</span>
            <span className="os-num">{todayMeetings.length}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>הושלמו השבוע</span>
            <span className="os-num">{doneThisWeek}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>סה״כ פריטי עבודה</span>
            <span className="os-num">{items.length}</span>
          </div>
        </div>
      </details>

      {/* kanban board — the work queue */}
      <div className="os-table-scroll" style={{ overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${WORK_STATES.length}, minmax(200px, 1fr))`,
            gap: "var(--os-space-4)",
            minInlineSize: 1200,
            alignItems: "start",
          }}
        >
          {WORK_STATES.map((state) => (
            <KanbanColumn
              key={state}
              state={state}
              items={grouped[state]}
              users={users}
              agents={agents}
              today={today}
              onOpen={setDetailTask}
            />
          ))}
        </div>
      </div>

      {/* meetings */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--os-space-6)",
          alignItems: "start",
        }}
      >
        <Panel style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle icon="clock" title="ציר הזמן של היום" subtitle={fmtDate(today)} />
          {todayMeetings.length === 0 && todayTasks.length === 0 ? (
            <EmptyState title="היום פנוי" reason="אין פגישות או משימות שמיועדות להיום." />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {todayMeetings.map((m) => (
                <div key={m.id} style={{ display: "flex", gap: 10, fontSize: "var(--os-text-sm)" }}>
                  <span className="os-num" style={{ color: "var(--os-cyan-text)", minInlineSize: 44 }}>
                    {fmtTime(m.scheduledAt)}
                  </span>
                  <span>
                    {m.title}{" "}
                    <span style={{ color: "var(--os-muted)" }}>
                      ({m.durationMinutes} דק' · {m.location})
                    </span>
                  </span>
                </div>
              ))}
              {todayTasks.map((t) => (
                <div key={t.id} style={{ display: "flex", gap: 10, fontSize: "var(--os-text-sm)" }}>
                  <span style={{ color: "var(--warning-text)", minInlineSize: 44 }}>משימה</span>
                  <span>{t.title}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle icon="clock" title="פגישות — 7 הימים הקרובים" />
          {weekMeetings.length === 0 ? (
            <EmptyState title="אין פגישות קרובות" reason="לא נקבעו פגישות לשבוע הקרוב." />
          ) : (
            <div style={{ display: "grid", gap: "var(--os-space-4)" }}>
              {weekMeetings.map(([day, list]) => (
                <div key={day}>
                  <div style={{ color: "var(--os-cyan-text)", fontSize: "var(--os-text-xs)" }}>
                    {new Date(`${day}T00:00:00`).toLocaleDateString("he-IL", {
                      weekday: "long",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </div>
                  {list.map((m) => (
                    <div
                      key={m.id}
                      style={{ display: "flex", gap: 10, fontSize: "var(--os-text-sm)" }}
                    >
                      <span
                        className="os-num"
                        style={{ minInlineSize: 44, color: "var(--os-text-2)" }}
                      >
                        {fmtTime(m.scheduledAt)}
                      </span>
                      <span>{m.title}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {detailTask && (
        <TaskDetailDrawer
          task={detailTask}
          users={users}
          today={today}
          onEdit={(t) => {
            setDetailTask(null);
            setEditTask(t);
          }}
          onClose={() => setDetailTask(null)}
        />
      )}

      {(createOpen || editTask) && (
        <TaskModal
          task={editTask}
          users={users}
          onClose={() => {
            setCreateOpen(false);
            setEditTask(null);
          }}
        />
      )}
      {createMeetingOpen && (
        <MeetingModal users={users} onClose={() => setCreateMeetingOpen(false)} />
      )}
    </div>
  );
}

// ── rail ────────────────────────────────────────────────────────────────────
function TasksRail({
  todayTasks,
  todayMeetings,
  overdue,
  waiting,
  users,
  agents,
}: {
  todayTasks: readonly Task[];
  todayMeetings: readonly Meeting[];
  overdue: readonly Task[];
  waiting: readonly WorkItem[];
  users: readonly User[];
  agents: readonly Agent[];
}): ReactElement {
  const nameOf = (id: string): string =>
    users.find((u) => u.id === id)?.name ?? agents.find((a) => a.id === id)?.name ?? id;
  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)", fontSize: "var(--os-text-sm)" }}>
      <div>
        <div style={railTitle}>התוכנית להיום</div>
        {todayTasks.length === 0 && todayMeetings.length === 0 && (
          <div style={railMuted}>אין פריטים מתוכננים להיום.</div>
        )}
        {todayMeetings.map((m) => (
          <div key={m.id} style={railRow}>
            <span>📅 {m.title}</span>
            <span className="os-num">{fmtTime(m.scheduledAt)}</span>
          </div>
        ))}
        {todayTasks.map((t) => (
          <div key={t.id} style={railRow}>
            <span>☑ {t.title}</span>
          </div>
        ))}
      </div>
      <div>
        <div style={railTitle}>תור באיחור ({overdue.length})</div>
        {overdue.length === 0 && <div style={railMuted}>אין משימות באיחור.</div>}
        {overdue.slice(0, 5).map((t) => (
          <div key={t.id} style={railRow}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.title}
            </span>
            <span className="os-num" style={{ color: "var(--danger-text)" }}>
              {fmtDate(t.due)}
            </span>
          </div>
        ))}
      </div>
      <div>
        <div style={railTitle}>ממתין לאישור ({waiting.length})</div>
        {waiting.length === 0 && <div style={railMuted}>אין פריטים שממתינים לאישור.</div>}
        {waiting.slice(0, 5).map((w, i) => (
          <div key={i} style={railRow}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {w.kind === "human" ? w.task.title : w.agentTask.title}
            </span>
            <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
              {w.kind === "human" ? nameOf(w.task.ownerId) : nameOf(w.agentTask.agentId)}
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

// ── kanban ──────────────────────────────────────────────────────────────────
function KanbanColumn({
  state,
  items,
  users,
  agents,
  today,
  onOpen,
}: {
  state: WorkState;
  items: readonly WorkItem[];
  users: readonly User[];
  agents: readonly Agent[];
  today: string;
  onOpen: (task: Task) => void;
}): ReactElement {
  return (
    <Panel style={{ padding: "var(--os-space-4)", display: "grid", gap: "var(--os-space-3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <StatusChip status={STATE_CHIP[state]} label={state} />
        <span className="os-num" style={{ color: "var(--os-muted)" }}>
          {items.length}
        </span>
      </div>
      {items.length === 0 && (
        <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>אין פריטים</div>
      )}
      {items.map((item, i) =>
        item.kind === "human" ? (
          <HumanTaskCard key={item.task.id} task={item.task} users={users} today={today} onOpen={onOpen} />
        ) : (
          <AgentTaskCard key={`ag-${i}`} item={item.agentTask} agents={agents} />
        ),
      )}
    </Panel>
  );
}

// VC-C: card is a quiet summary that opens the detail drawer on click. No
// permanent per-card action control (state change lives in the drawer); border
// stays neutral, an amber inline-start rule marks only action-required (overdue).
function HumanTaskCard({
  task,
  users,
  today,
  onOpen,
}: {
  task: Task;
  users: readonly User[];
  today: string;
  onOpen: (task: Task) => void;
}): ReactElement {
  const overdue = isOverdue(task, today);
  const ownership = taskOwnership(task);
  const owner = users.find((u) => u.id === task.ownerId);
  const highPriority = task.priority === "גבוהה";

  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      title="פרטי המשימה"
      style={{
        all: "unset",
        boxSizing: "border-box",
        cursor: "pointer",
        display: "grid",
        gap: 6,
        inlineSize: "100%",
        background: "var(--os-raised)",
        border: "1px solid var(--os-border)",
        borderInlineStartWidth: overdue ? 3 : 1,
        borderInlineStartColor: overdue ? "var(--warning-text)" : "var(--os-border)",
        borderRadius: "var(--os-radius-md)",
        padding: "var(--os-space-4)",
      }}
    >
      <span style={{ fontWeight: 600, fontSize: "var(--os-text-sm)", color: "var(--os-text)" }}>
        {task.title}
      </span>
      <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {/* ownership: violet only when shared (agent involved); otherwise plain */}
        {ownership === "משימה משותפת" ? (
          <span className="os-chip os-chip--violet">{ownership}</span>
        ) : (
          <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>{ownership}</span>
        )}
        {/* priority chip only when it needs attention (high); else plain text */}
        {highPriority ? (
          <span className="os-chip os-chip--warning">עדיפות גבוהה</span>
        ) : (
          <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
            עדיפות {task.priority}
          </span>
        )}
      </span>
      <span
        style={{
          fontSize: "var(--os-text-xs)",
          color: overdue ? "var(--warning-text)" : "var(--os-muted)",
        }}
      >
        יעד: <span className="os-num">{fmtDate(task.due)}</span>
        {overdue && " · באיחור"}
        {" · "}
        {owner?.name ?? task.ownerId}
        {task.relatedRef && (
          <>
            {" · "}
            <span dir="ltr" className="os-num">
              {task.relatedRef}
            </span>
          </>
        )}
      </span>
    </button>
  );
}

// ── task detail drawer (progressive disclosure: summary → detail → action) ────
function TaskDetailDrawer({
  task,
  users,
  today,
  onEdit,
  onClose,
}: {
  task: Task;
  users: readonly User[];
  today: string;
  onEdit: (task: Task) => void;
  onClose: () => void;
}): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [busy, setBusy] = useState(false);
  const overdue = isOverdue(task, today);
  const ownership = taskOwnership(task);
  const owner = users.find((u) => u.id === task.ownerId);
  const clean = cleanDescription(task);
  const shared = isSharedTask(task);
  const state = taskWorkState(task);

  async function moveTo(next: WorkState): Promise<void> {
    if (next === state) return;
    setBusy(true);
    try {
      // W6 m001: canonical fields — the description stays clean, no ⟦…⟧ markers
      const repo = getRepository<TaskX>("tasks");
      await repo.update(task.id, {
        status: baseStatusFor(next),
        description: clean,
        workState: next,
        ownership: shared ? "משותפת" : "אנושית",
        updatedAt: new Date().toISOString(),
      });
      await logTaskActivity(`המשימה «${task.title}» עברה למצב «${next}»`, `task:${task.id}`);
      await invalidate(["tasks", "activities"]);
      toast(`המשימה עברה ל«${next}»`, "success");
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open onClose={onClose} title={task.title}>
      <div style={{ display: "grid", gap: "var(--os-space-4)", fontSize: "var(--os-text-sm)" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <StatusChip status={STATE_CHIP[state]} label={state} />
          {ownership === "משימה משותפת" && <span className="os-chip os-chip--violet">{ownership}</span>}
          {task.priority === "גבוהה" && <span className="os-chip os-chip--warning">עדיפות גבוהה</span>}
        </div>

        {clean.trim() !== "" && (
          <DrawerField label="תיאור">
            <span style={{ whiteSpace: "pre-wrap" }}>{clean}</span>
          </DrawerField>
        )}
        <DrawerField label="בעלים">{owner?.name ?? task.ownerId}</DrawerField>
        <DrawerField label="עדיפות">{task.priority}</DrawerField>
        <DrawerField label="תאריך יעד">
          <span className="os-num" style={{ color: overdue ? "var(--warning-text)" : undefined }}>
            {fmtDate(task.due)}
          </span>
          {overdue && <span style={{ color: "var(--warning-text)" }}> · באיחור</span>}
        </DrawerField>
        {task.relatedRef && (
          <DrawerField label="רשומה מקושרת">
            <span dir="ltr" className="os-num">
              {task.relatedRef}
            </span>
          </DrawerField>
        )}

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>שינוי מצב</span>
          <select
            className="os-qc-input"
            aria-label={`שינוי מצב עבור ${task.title}`}
            value={state}
            disabled={busy}
            onChange={(e) => void moveTo(e.target.value as WorkState)}
          >
            {WORK_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", gap: "var(--os-space-3)", marginBlockStart: "var(--os-space-2)" }}>
          <OsButton icon="wrench" {...busyDisabled(busy)} onClick={() => onEdit(task)}>
            עריכת המשימה
          </OsButton>
          <OsButton variant="ghost" onClick={onClose}>
            סגירה
          </OsButton>
        </div>
      </div>
    </Drawer>
  );
}

function DrawerField({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

function AgentTaskCard({
  item,
  agents,
}: {
  item: AgentTask;
  agents: readonly Agent[];
}): ReactElement {
  const agent = agents.find((a) => a.id === item.agentId);
  // Agent tasks are view-only here (managed on the agents screen). Neutral border
  // — the violet chip already carries the agent (AI) semantic; no accent border.
  return (
    <div
      style={{
        background: "var(--os-raised)",
        border: "1px solid var(--os-border)",
        borderRadius: "var(--os-radius-md)",
        padding: "var(--os-space-4)",
        display: "grid",
        gap: 6,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: "var(--os-text-sm)" }}>{item.title}</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <span className="os-chip os-chip--violet">משימת סוכן</span>
        <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
          {agent?.name ?? item.agentId}
        </span>
      </div>
      <div style={{ fontSize: "var(--os-text-2xs)", color: "var(--os-muted)" }}>
        ניהול משימות סוכן מתבצע במסך הסוכנים (גל 5) — כאן לצפייה בלבד.
      </div>
    </div>
  );
}

// ── task modal (create/edit) ────────────────────────────────────────────────
function TaskModal({
  task,
  users,
  onClose,
}: {
  task: Task | null;
  users: readonly User[];
  onClose: () => void;
}): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task ? cleanDescription(task) : "");
  const [priority, setPriority] = useState<TicketPriority>(task?.priority ?? "בינונית");
  const [due, setDue] = useState(task?.due.slice(0, 10) ?? todayISO());
  const [ownerId, setOwnerId] = useState(task?.ownerId ?? CEO_USER_ID);
  const [shared, setShared] = useState(task ? isSharedTask(task) : false);
  const [relatedRef, setRelatedRef] = useState(task?.relatedRef ?? "");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (): void => {
    if (title.trim().length < 2) {
      setErrorMsg("כותרת המשימה קצרה מדי");
      return;
    }
    if (!due) {
      setErrorMsg("נדרש תאריך יעד");
      return;
    }
    setBusy(true);
    // W6 m001: canonical fields — descriptions stay clean, no ⟦…⟧ markers
    const repo = getRepository<TaskX>("tasks");
    const ownership = shared ? ("משותפת" as const) : ("אנושית" as const);
    void (async () => {
      if (task) {
        await repo.update(task.id, {
          title: title.trim(),
          description,
          workState: taskWorkState(task),
          ownership,
          priority,
          due,
          ownerId,
          relatedRef: relatedRef.trim() || null,
          updatedAt: new Date().toISOString(),
        });
        await logTaskActivity(`המשימה «${title.trim()}» עודכנה`, `task:${task.id}`);
      } else {
        const all = await repo.list();
        const now = new Date().toISOString();
        const created = await repo.create({
          id: nextId(
            "task",
            all.map((t) => t.id),
          ),
          title: title.trim(),
          description,
          workState: "לביצוע",
          ownership,
          status: "פתוחה",
          priority,
          due,
          ownerId,
          relatedRef: relatedRef.trim() || null,
          createdAt: now,
          updatedAt: now,
        });
        await logTaskActivity(`נוצרה משימה חדשה: «${created.title}»`, `task:${created.id}`);
      }
      await invalidate(["tasks", "activities"]);
      toast(task ? "המשימה עודכנה" : "המשימה נוצרה", "success");
      onClose();
    })().finally(() => setBusy(false));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={task ? `עריכת משימה — ${task.title}` : "משימה חדשה"}
      footer={
        <div style={{ display: "flex", gap: "var(--os-space-3)" }}>
          <OsButton icon="check" {...busyDisabled(busy)} onClick={submit}>
            {task ? "שמירה" : "יצירה"}
          </OsButton>
          <OsButton variant="ghost" onClick={onClose}>
            ביטול
          </OsButton>
        </div>
      }
    >
      <div className="os-qc-form">
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="tm-title">
            כותרת
          </label>
          <input
            id="tm-title"
            className="os-qc-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="tm-desc">
            תיאור
          </label>
          <textarea
            id="tm-desc"
            className="os-qc-input os-qc-input--area"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="tm-priority">
            עדיפות
          </label>
          <select
            id="tm-priority"
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
          <label className="os-qc-label" htmlFor="tm-due">
            תאריך יעד
          </label>
          <input
            id="tm-due"
            type="date"
            className="os-qc-input"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="tm-owner">
            בעלים
          </label>
          <select
            id="tm-owner"
            className="os-qc-input"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="tm-related">
            רשומה מקושרת (למשל lead:l-10)
          </label>
          <input
            id="tm-related"
            className="os-qc-input"
            dir="ltr"
            value={relatedRef}
            onChange={(e) => setRelatedRef(e.target.value)}
          />
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          <span>משימה משותפת (אדם + סוכן)</span>
        </label>
        {errorMsg && <div className="os-qc-error">{errorMsg}</div>}
      </div>
    </Modal>
  );
}

// ── meeting modal ───────────────────────────────────────────────────────────
function MeetingModal({
  users,
  onClose,
}: {
  users: readonly User[];
  onClose: () => void;
}): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState("45");
  const [location, setLocation] = useState("זום");
  const [participants, setParticipants] = useState<ReadonlySet<string>>(new Set([CEO_USER_ID]));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (): void => {
    if (title.trim().length < 2) {
      setErrorMsg("כותרת הפגישה קצרה מדי");
      return;
    }
    if (!when) {
      setErrorMsg("נדרש מועד לפגישה");
      return;
    }
    const dur = Number(duration);
    if (!Number.isFinite(dur) || dur <= 0) {
      setErrorMsg("משך הפגישה חייב להיות מספר חיובי בדקות");
      return;
    }
    setBusy(true);
    const repo = getRepository<Meeting>("meetings");
    void repo
      .list()
      .then((all) => {
        const now = new Date().toISOString();
        return repo.create({
          id: nextId(
            "m",
            all.map((m) => m.id),
          ),
          title: title.trim(),
          scheduledAt: when.length === 16 ? `${when}:00` : when,
          durationMinutes: dur,
          location: location.trim(),
          participantIds: [...participants],
          agenda: "",
          relatedRef: null,
          createdAt: now,
          updatedAt: now,
        });
      })
      .then(async (created) => {
        await logTaskActivity(`נקבעה פגישה: «${created.title}»`, `meeting:${created.id}`);
        await invalidate(["meetings", "activities"]);
      })
      .then(() => {
        toast("הפגישה נקבעה", "success");
        onClose();
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="פגישה חדשה"
      footer={
        <div style={{ display: "flex", gap: "var(--os-space-3)" }}>
          <OsButton icon="check" {...busyDisabled(busy)} onClick={submit}>
            קביעת פגישה
          </OsButton>
          <OsButton variant="ghost" onClick={onClose}>
            ביטול
          </OsButton>
        </div>
      }
    >
      <div className="os-qc-form">
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="mm-title">
            כותרת
          </label>
          <input
            id="mm-title"
            className="os-qc-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="mm-when">
            מועד
          </label>
          <input
            id="mm-when"
            type="datetime-local"
            className="os-qc-input"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="mm-duration">
            משך (דקות)
          </label>
          <input
            id="mm-duration"
            type="number"
            className="os-qc-input"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="mm-location">
            מיקום
          </label>
          <input
            id="mm-location"
            className="os-qc-input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <span className="os-qc-label">משתתפים</span>
          {users.map((u) => (
            <label
              key={u.id}
              style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={participants.has(u.id)}
                onChange={(e) => {
                  setParticipants((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(u.id);
                    else next.delete(u.id);
                    return next;
                  });
                }}
              />
              <span>{u.name}</span>
            </label>
          ))}
        </div>
        {errorMsg && <div className="os-qc-error">{errorMsg}</div>}
      </div>
    </Modal>
  );
}
