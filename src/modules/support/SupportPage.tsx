// /support — תמיכה לאחר ההשקה (Wave 4, per docs/references/19.png).
// Three real tiers (TierCard) with escalation logic, a support queue with a
// real SLA timer per tier target, escalation / assignment / resolution /
// feedback flows, deterministic recurring-issue detection and related
// knowledge notes. Tier & assignee persist via description markers
// (integration request filed for real fields).
import { useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { PageRail } from "@/app/rail";
import {
  ConfidenceBar,
  DataTable,
  Drawer,
  EmptyState,
  KpiCard,
  Modal,
  OsButton,
  Panel,
  SectionTitle,
  StatusChip,
  TierCard,
  useToast,
  type DataTableColumn,
} from "@/design-system";
import type {
  Activity,
  KnowledgeNote,
  SupportRequest,
  Task,
  TicketPriority,
  User,
} from "@/domain/types";
import { getRepository, nextId } from "@/repositories";
import { CEO_USER_ID, DEMO_DATA_LABEL } from "@/repositories/seed";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import {
  categorize,
  championLoad,
  parseSupport,
  recurringIssues,
  relatedKnowledge,
  RULES_ENGINE_LABEL,
  slaCompliancePercent,
  supportSla,
  TIER_INFO,
  withSupportMarkers,
  type Tier,
} from "./lib";

const kpiRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "var(--os-space-5)",
};

/** Disabled-with-reason props while an async action runs (OsButton honesty contract). */
function busyDisabled(
  busy: boolean,
  reason = "פעולה קודמת עדיין רצה",
): { disabled: true; disabledReason: string } | { disabled?: false } {
  return busy ? { disabled: true, disabledReason: reason } : {};
}

function fmtElapsed(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} דק'`;
  return `${hours.toLocaleString("he-IL")} שע'`;
}

function tierChip(tier: Tier): ReactElement {
  const cls = tier === 1 ? "os-chip--cyan" : tier === 2 ? "os-chip--blue" : "os-chip--violet";
  return <span className={`os-chip ${cls}`}>Tier {tier}</span>;
}

async function logSupportActivity(text: string, entityRef: string | null): Promise<void> {
  const repo = getRepository<Activity>("activities");
  const all = await repo.list();
  const now = new Date().toISOString();
  await repo.create({
    id: nextId(
      "act",
      all.map((a) => a.id),
    ),
    kind: "תמיכה",
    text,
    actorId: CEO_USER_ID,
    entityRef,
    at: now,
    createdAt: now,
    updatedAt: now,
  });
}

export default function SupportPage(): ReactElement {
  const requestsQ = useCollection<SupportRequest>("supportRequests");
  const usersQ = useCollection<User>("users");
  const notesQ = useCollection<KnowledgeNote>("knowledgeNotes");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("open");
  const [createOpen, setCreateOpen] = useState(false);

  const requests = useMemo(() => requestsQ.data ?? [], [requestsQ.data]);
  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);
  const notes = useMemo(() => notesQ.data ?? [], [notesQ.data]);

  const nowMs = Date.now();
  const open = requests.filter((r) => r.status !== "נסגרה");
  const compliance = useMemo(() => slaCompliancePercent(requests, nowMs), [requests, nowMs]);
  const recurring = useMemo(() => recurringIssues(requests, nowMs), [requests, nowMs]);
  const load = useMemo(() => championLoad(requests), [requests]);
  const breaches = open.filter((r) => supportSla(r, nowMs).level === "חריגה").length;
  const closedThisWeek = requests.filter(
    (r) => r.status === "נסגרה" && nowMs - new Date(r.updatedAt).getTime() <= 7 * 86_400_000,
  ).length;

  const filtered = requests
    .filter((r) =>
      statusFilter === "open"
        ? r.status !== "נסגרה"
        : statusFilter === "closed"
          ? r.status === "נסגרה"
          : true,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  if (requestsQ.isError) {
    return (
      <EmptyState
        icon="alert"
        title="שגיאה בטעינת פניות התמיכה"
        reason="קריאת ה-repositories נכשלה — נסו לרענן את הדף."
      />
    );
  }
  if (requestsQ.isLoading || usersQ.isLoading) {
    return (
      <Panel style={{ padding: "var(--os-space-8)", color: "var(--os-text-2)" }}>
        טוען פניות תמיכה…
      </Panel>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)" }}>
      <PageRail>
        <SupportRail compliance={compliance} recurring={recurring} load={load} users={users} />
      </PageRail>

      <SectionTitle
        icon="shield"
        title="תמיכה לאחר ההשקה"
        subtitle={DEMO_DATA_LABEL}
        action={
          <OsButton icon="plus" onClick={() => setCreateOpen(true)}>
            פנייה חדשה
          </OsButton>
        }
      />

      <div style={kpiRowStyle}>
        <KpiCard title="פניות פתוחות" value={open.length} accent="cyan" icon="inbox" />
        <KpiCard
          title="עמידה ב-SLA (סגורות)"
          value={compliance === null ? "טרם נמדד" : `${compliance}%`}
          accent="success"
          icon="gauge"
        />
        <KpiCard
          title="חריגות SLA כעת"
          value={breaches}
          accent="danger"
          icon="clock"
          glow={breaches > 0}
        />
        <KpiCard title="בעיות חוזרות" value={recurring.length} accent="warning" icon="alert" />
        <KpiCard title="נסגרו השבוע" value={closedThisWeek} accent="blue" icon="check" />
      </div>

      {/* tier model — ref 19: Tier 1 at inline-start (right in RTL), dashed escalation arrows */}
      <div>
        <SectionTitle icon="network" title="מודל תמיכה תלת-שלבי" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr auto 1fr",
            gap: "var(--os-space-4)",
            alignItems: "stretch",
          }}
        >
          <TierCard
            title={TIER_INFO[1].title}
            subtitle={TIER_INFO[1].subtitle}
            accent="cyan"
            icon="book"
            items={["שאלות נפוצות (FAQ)", "מאגר ידע", "סוכן AI פנימי", "חומרים והדרכות"]}
            footerTime={TIER_INFO[1].footerTime}
          />
          <EscalationArrow label="אם לא נפתר בזמן SLA" />
          <TierCard
            title={TIER_INFO[2].title}
            subtitle={TIER_INFO[2].subtitle}
            accent="blue"
            icon="users"
            items={["צ'אט ייעודי", "תמיכה מעמיתים", "Champion מקומי", "הכוונה ופתרון בעיות"]}
            footerTime={TIER_INFO[2].footerTime}
          />
          <EscalationArrow label="אם נדרש פתרון עומק" />
          <TierCard
            title={TIER_INFO[3].title}
            subtitle={TIER_INFO[3].subtitle}
            accent="violet"
            icon="shield"
            items={["נושאים מורכבים", "החלטות מדיניות", "הסלמה טכנית", "בדיקות ותאימות"]}
            footerTime={TIER_INFO[3].footerTime}
          />
        </div>
      </div>

      {/* queue */}
      <div>
        <SectionTitle
          icon="inbox"
          title="תור פניות תמיכה לפי שלב"
          action={
            <select
              className="os-qc-input"
              style={{ maxInlineSize: 160 }}
              aria-label="סינון סטטוס פניות"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="open">פתוחות</option>
              <option value="closed">סגורות</option>
              <option value="all">הכול</option>
            </select>
          }
        />
        <SupportQueue
          requests={filtered}
          users={users}
          nowMs={nowMs}
          onSelect={(id) => setSelectedId(id)}
        />
      </div>

      {selected && (
        <RequestDrawer
          key={selected.id}
          request={selected}
          users={users}
          notes={notes}
          nowMs={nowMs}
          onClose={() => setSelectedId(null)}
        />
      )}

      {createOpen && <NewRequestModal users={users} onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

function EscalationArrow({ label }: { label: string }): ReactElement {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        color: "var(--os-muted)",
        fontSize: "var(--os-text-2xs)",
        inlineSize: 90,
        textAlign: "center",
        gap: 4,
      }}
      aria-hidden="true"
    >
      <span style={{ letterSpacing: 2, color: "var(--os-cyan)" }}>◄╌╌╌</span>
      <span>{label}</span>
    </div>
  );
}

// ── rail ────────────────────────────────────────────────────────────────────
function SupportRail({
  compliance,
  recurring,
  load,
  users,
}: {
  compliance: number | null;
  recurring: ReturnType<typeof recurringIssues>;
  load: Map<string, number>;
  users: readonly User[];
}): ReactElement {
  const nameOf = (id: string): string => users.find((u) => u.id === id)?.name ?? id;
  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)", fontSize: "var(--os-text-sm)" }}>
      <div>
        <div style={railTitle}>עמידה ב-SLA</div>
        <ConfidenceBar value={compliance} label="פניות סגורות בתוך היעד" />
        <div
          style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)", marginBlockStart: 4 }}
        >
          נגזר מהפניות הסגורות בלבד — לא הערכה.
        </div>
      </div>
      <div>
        <div style={railTitle}>בעיות חוזרות ({recurring.length})</div>
        {recurring.length === 0 && (
          <div style={railMuted}>אין קטגוריה עם 3+ פניות בחודש האחרון.</div>
        )}
        {recurring.map((r) => (
          <div key={r.category} style={railRow}>
            <span>{r.category}</span>
            <span className="os-num" style={{ color: "var(--os-warning)" }}>
              {r.count} פניות
            </span>
          </div>
        ))}
      </div>
      <div>
        <div style={railTitle}>עומס Champions</div>
        {load.size === 0 && <div style={railMuted}>אין פניות פתוחות משויכות למטפל.</div>}
        {[...load.entries()].map(([id, count]) => (
          <div key={id} style={railRow}>
            <span>{nameOf(id)}</span>
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

// ── queue table ─────────────────────────────────────────────────────────────
function SupportQueue({
  requests,
  users,
  nowMs,
  onSelect,
}: {
  requests: readonly SupportRequest[];
  users: readonly User[];
  nowMs: number;
  onSelect: (id: string) => void;
}): ReactElement {
  const columns: DataTableColumn<SupportRequest>[] = [
    { key: "subject", header: "נושא הפנייה", render: (r) => <b>{r.subject}</b> },
    {
      key: "requester",
      header: "פונה",
      render: (r) => users.find((u) => u.id === r.requesterId)?.name ?? r.requesterId,
    },
    { key: "channel", header: "ערוץ" },
    {
      key: "tier",
      header: "שלב נוכחי",
      render: (r) => tierChip(parseSupport(r.description).tier),
    },
    {
      key: "category",
      header: "קטגוריה (כללים)",
      render: (r) => (
        <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>
          {categorize(r.subject, parseSupport(r.description).clean)}
        </span>
      ),
    },
    {
      key: "sla",
      header: "SLA",
      render: (r) => {
        const s = supportSla(r, nowMs);
        return (
          <span
            className="os-table__num"
            style={{
              color:
                s.level === "חריגה"
                  ? "var(--os-danger)"
                  : s.level === "בסיכון"
                    ? "var(--os-warning)"
                    : "var(--os-success)",
            }}
          >
            {fmtElapsed(s.elapsedHours)} / {s.targetHours} שע'
          </span>
        );
      },
    },
    {
      key: "status",
      header: "סטטוס",
      render: (r) => (
        <StatusChip
          status={r.status === "נסגרה" ? "הושלם" : r.status === "בטיפול" ? "פעיל" : "ממתין"}
          label={r.status}
        />
      ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={requests}
      rowKey="id"
      onRowClick={(r) => onSelect(r.id)}
      emptyText="אין פניות תמיכה"
      emptyReason="לא נמצאו פניות בסינון הנוכחי — פתחו פנייה חדשה."
    />
  );
}

// ── request drawer ──────────────────────────────────────────────────────────
function RequestDrawer({
  request,
  users,
  notes,
  nowMs,
  onClose,
}: {
  request: SupportRequest;
  users: readonly User[];
  notes: readonly KnowledgeNote[];
  nowMs: number;
  onClose: () => void;
}): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const parsed = parseSupport(request.description);
  const sla = supportSla(request, nowMs);
  const category = categorize(request.subject, parsed.clean);
  const knowledge = relatedKnowledge(category, notes);
  const [resolution, setResolution] = useState(request.resolution);
  const [busy, setBusy] = useState(false);
  const closed = request.status === "נסגרה";

  async function update(
    patch: Partial<Omit<SupportRequest, "id">>,
    activityText: string,
  ): Promise<void> {
    setBusy(true);
    try {
      const repo = getRepository<SupportRequest>("supportRequests");
      await repo.update(request.id, { ...patch, updatedAt: new Date().toISOString() });
      await logSupportActivity(activityText, `supportRequest:${request.id}`);
      await invalidate(["supportRequests", "activities"]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open onClose={onClose} title={request.subject}>
      <div style={{ display: "grid", gap: "var(--os-space-5)" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {tierChip(parsed.tier)}
          <StatusChip
            status={closed ? "הושלם" : request.status === "בטיפול" ? "פעיל" : "ממתין"}
            label={request.status}
          />
          <span className="os-chip os-chip--muted">{category}</span>
          <span
            className="os-num"
            style={{
              color:
                sla.level === "חריגה"
                  ? "var(--os-danger)"
                  : sla.level === "בסיכון"
                    ? "var(--os-warning)"
                    : "var(--os-success)",
              fontSize: "var(--os-text-xs)",
            }}
          >
            ⏱ {fmtElapsed(sla.elapsedHours)} מתוך {sla.targetHours} שע'
          </span>
        </div>

        <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
          {parsed.clean}
        </div>
        <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
          קטגוריה נקבעה על ידי {RULES_ENGINE_LABEL} — לא מודל.
        </div>

        {/* escalation + assignment */}
        <Panel variant="raised" style={{ padding: "var(--os-space-4)", display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {closed || parsed.tier >= 3 ? (
              <OsButton
                size="sm"
                variant="violet"
                icon="network"
                disabled
                disabledReason={
                  closed ? "הפנייה סגורה — אין הסלמה" : "הפנייה כבר ב-Tier 3 — אין שלב גבוה יותר"
                }
              >
                הסלמה לשלב הבא
              </OsButton>
            ) : (
              <OsButton
                size="sm"
                variant="violet"
                icon="network"
                {...busyDisabled(busy)}
                onClick={() => {
                  const next = (parsed.tier + 1) as Tier;
                  void update(
                    {
                      description: withSupportMarkers(
                        parsed.clean,
                        next,
                        parsed.assigneeId,
                        parsed.feedback,
                      ),
                      status: "בטיפול",
                    },
                    `הפנייה «${request.subject}» הוסלמה ל-Tier ${next}`,
                  ).then(() => toast(`הפנייה הוסלמה ל-Tier ${next}`, "success"));
                }}
              >
                הסלמה ל-Tier {parsed.tier + 1}
              </OsButton>
            )}
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <label className="os-qc-label" htmlFor="sr-assign" style={{ margin: 0 }}>
                מטפל/ת
              </label>
              <select
                id="sr-assign"
                className="os-qc-input"
                style={{ inlineSize: 150 }}
                value={parsed.assigneeId ?? ""}
                disabled={closed}
                onChange={(e) => {
                  const id = e.target.value || null;
                  const u = users.find((x) => x.id === id);
                  void update(
                    {
                      description: withSupportMarkers(
                        parsed.clean,
                        parsed.tier,
                        id,
                        parsed.feedback,
                      ),
                      status: request.status === "פתוחה" ? "בטיפול" : request.status,
                    },
                    `הפנייה «${request.subject}» שויכה ל${u?.name ?? "ללא מטפל"}`,
                  ).then(() => toast("השיוך עודכן", "success"));
                }}
              >
                <option value="">— ללא —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </span>
            <OsButton
              size="sm"
              variant="ghost"
              icon="clock"
              {...busyDisabled(busy)}
              onClick={() => {
                void (async () => {
                  const repo = getRepository<Task>("tasks");
                  const all = await repo.list();
                  const now = new Date().toISOString();
                  const due = new Date(nowMs + 2 * 86_400_000).toISOString().slice(0, 10);
                  await repo.create({
                    id: nextId(
                      "task",
                      all.map((t) => t.id),
                    ),
                    title: `מעקב תמיכה: ${request.subject}`,
                    description: `פולואו-אפ לפנייה ${request.id} (Tier ${parsed.tier})`,
                    status: "פתוחה",
                    priority: request.priority,
                    due,
                    ownerId: parsed.assigneeId ?? CEO_USER_ID,
                    relatedRef: `supportRequest:${request.id}`,
                    createdAt: now,
                    updatedAt: now,
                  });
                  await logSupportActivity(
                    `נוצרה משימת מעקב לפנייה «${request.subject}»`,
                    `supportRequest:${request.id}`,
                  );
                  await invalidate(["tasks", "activities"]);
                  toast("משימת מעקב נוצרה בתור המשימות", "success");
                })();
              }}
            >
              משימת מעקב
            </OsButton>
          </div>
        </Panel>

        {/* related knowledge */}
        <div>
          <SectionTitle icon="book" title="ידע קשור" subtitle={RULES_ENGINE_LABEL} />
          {knowledge.length === 0 ? (
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-sm)" }}>
              לא נמצאה רשומת ידע תואמת לקטגוריה «{category}».
            </div>
          ) : (
            knowledge.map((n) => (
              <div key={n.id} style={{ fontSize: "var(--os-text-sm)", marginBlockEnd: 4 }}>
                📚 {n.title}{" "}
                <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
                  ({n.category})
                </span>
              </div>
            ))
          )}
        </div>

        {/* resolution flow */}
        <div style={{ display: "grid", gap: 6 }}>
          <label className="os-qc-label" htmlFor="sr-resolution">
            פתרון
          </label>
          <textarea
            id="sr-resolution"
            className="os-qc-input os-qc-input--area"
            rows={2}
            value={resolution}
            disabled={closed}
            onChange={(e) => setResolution(e.target.value)}
            placeholder="מה נעשה כדי לפתור את הפנייה?"
          />
          {closed ? (
            <OsButton icon="check" disabled disabledReason="הפנייה כבר נסגרה">
              סגירת הפנייה עם פתרון
            </OsButton>
          ) : resolution.trim().length > 0 ? (
            <OsButton
              icon="check"
              variant="success"
              {...busyDisabled(busy)}
              onClick={() => {
                void update(
                  { resolution: resolution.trim(), status: "נסגרה" },
                  `הפנייה «${request.subject}» נסגרה עם פתרון`,
                ).then(() => toast("הפנייה נסגרה", "success"));
              }}
            >
              סגירת הפנייה עם פתרון
            </OsButton>
          ) : (
            <OsButton icon="check" disabled disabledReason="סגירה מחייבת תיעוד פתרון">
              סגירת הפנייה עם פתרון
            </OsButton>
          )}
        </div>

        {/* feedback capture */}
        <div>
          <SectionTitle icon="sparkle" title="משוב הפונה" />
          {parsed.feedback ? (
            <StatusChip
              status={parsed.feedback === "חיובי" ? "הושלם" : "אזהרה"}
              label={`משוב ${parsed.feedback}`}
            />
          ) : closed ? (
            <div style={{ display: "flex", gap: 8 }}>
              <OsButton
                size="sm"
                variant="approve"
                {...busyDisabled(busy)}
                onClick={() => {
                  void update(
                    {
                      description: withSupportMarkers(
                        parsed.clean,
                        parsed.tier,
                        parsed.assigneeId,
                        "חיובי",
                      ),
                    },
                    `נקלט משוב חיובי לפנייה «${request.subject}»`,
                  ).then(() => toast("המשוב נשמר", "success"));
                }}
              >
                👍 חיובי
              </OsButton>
              <OsButton
                size="sm"
                variant="reject"
                {...busyDisabled(busy)}
                onClick={() => {
                  void update(
                    {
                      description: withSupportMarkers(
                        parsed.clean,
                        parsed.tier,
                        parsed.assigneeId,
                        "שלילי",
                      ),
                    },
                    `נקלט משוב שלילי לפנייה «${request.subject}»`,
                  ).then(() => toast("המשוב נשמר — כדאי לפתוח משימת מעקב", "warning"));
                }}
              >
                👎 שלילי
              </OsButton>
            </div>
          ) : (
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
              משוב נאסף רק אחרי סגירת הפנייה.
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}

// ── create modal ────────────────────────────────────────────────────────────
function NewRequestModal({
  users,
  onClose,
}: {
  users: readonly User[];
  onClose: () => void;
}): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [requesterId, setRequesterId] = useState(CEO_USER_ID);
  const [channel, setChannel] = useState<SupportRequest["channel"]>("מערכת");
  const [priority, setPriority] = useState<TicketPriority>("בינונית");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (): void => {
    if (subject.trim().length < 3) {
      setErrorMsg("נושא הפנייה קצר מדי (לפחות 3 תווים)");
      return;
    }
    setBusy(true);
    const repo = getRepository<SupportRequest>("supportRequests");
    void repo
      .list()
      .then((all) => {
        const now = new Date().toISOString();
        return repo.create({
          id: nextId(
            "sr",
            all.map((r) => r.id),
          ),
          subject: subject.trim(),
          description: description.trim(),
          requesterId,
          channel,
          status: "פתוחה",
          priority,
          resolution: "",
          createdAt: now,
          updatedAt: now,
        });
      })
      .then(async (created) => {
        await logSupportActivity(
          `נפתחה פניית תמיכה: «${created.subject}» (Tier 1)`,
          `supportRequest:${created.id}`,
        );
        await invalidate(["supportRequests", "activities"]);
      })
      .then(() => {
        toast("הפנייה נפתחה ב-Tier 1", "success");
        onClose();
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="פניית תמיכה חדשה"
      footer={
        <div style={{ display: "flex", gap: "var(--os-space-3)" }}>
          <OsButton icon="plus" {...busyDisabled(busy)} onClick={submit}>
            פתיחת פנייה
          </OsButton>
          <OsButton variant="ghost" onClick={onClose}>
            ביטול
          </OsButton>
        </div>
      }
    >
      <div className="os-qc-form">
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="nr-subject">
            נושא
          </label>
          <input
            id="nr-subject"
            className="os-qc-input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="nr-desc">
            תיאור
          </label>
          <textarea
            id="nr-desc"
            className="os-qc-input os-qc-input--area"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="nr-requester">
            פונה
          </label>
          <select
            id="nr-requester"
            className="os-qc-input"
            value={requesterId}
            onChange={(e) => setRequesterId(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="nr-channel">
            ערוץ
          </label>
          <select
            id="nr-channel"
            className="os-qc-input"
            value={channel}
            onChange={(e) => setChannel(e.target.value as SupportRequest["channel"])}
          >
            <option value="מערכת">מערכת</option>
            <option value="וואטסאפ">וואטסאפ</option>
            <option value="טלפון">טלפון</option>
            <option value="מייל">מייל</option>
          </select>
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="nr-priority">
            עדיפות
          </label>
          <select
            id="nr-priority"
            className="os-qc-input"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TicketPriority)}
          >
            <option value="גבוהה">גבוהה</option>
            <option value="בינונית">בינונית</option>
            <option value="נמוכה">נמוכה</option>
          </select>
        </div>
        {errorMsg && <div className="os-qc-error">{errorMsg}</div>}
      </div>
    </Modal>
  );
}
