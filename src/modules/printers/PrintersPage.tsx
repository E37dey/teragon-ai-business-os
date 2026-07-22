// /printers — מדפסות וציוד (Wave 4). Fleet registry: models catalogue,
// customer-owned printers (serial / derived warranty / maintenance schedule),
// per-printer lifecycle timeline (tickets + repair actions), related courses
// (deterministic rules) and a derived maintenance-reminders queue.
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
  Tabs,
  useToast,
  type DataTableColumn,
} from "@/design-system";
import type {
  Activity,
  Course,
  Customer,
  CustomerPrinter,
  PrinterModel,
  RepairAction,
  ServiceTicket,
  Task,
} from "@/domain/types";
import { getRepository, nextId } from "@/repositories";
import { CEO_USER_ID, DEMO_DATA_LABEL } from "@/repositories/seed";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import {
  fleetHealth,
  maintenanceInfo,
  relatedCourses,
  RULES_ENGINE_LABEL,
  ticketsForPrinter,
  warrantyState,
  warrantyUntil,
  type WarrantyState,
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

function warrantyChip(state: WarrantyState): ReactElement {
  return state === "בתוקף" ? (
    <StatusChip status="פעיל" label="אחריות בתוקף" />
  ) : state === "פג בקרוב" ? (
    <StatusChip status="אזהרה" label="אחריות פגה בקרוב" />
  ) : (
    <StatusChip status="מושבת" label="ללא אחריות" />
  );
}

/** Disabled-with-reason props while an async action runs (OsButton honesty contract). */
function busyDisabled(
  busy: boolean,
  reason = "פעולה קודמת עדיין רצה",
): { disabled: true; disabledReason: string } | { disabled?: false } {
  return busy ? { disabled: true, disabledReason: reason } : {};
}

export default function PrintersPage(): ReactElement {
  const printersQ = useCollection<CustomerPrinter>("customerPrinters");
  const modelsQ = useCollection<PrinterModel>("printerModels");
  const customersQ = useCollection<Customer>("customers");
  const ticketsQ = useCollection<ServiceTicket>("serviceTickets");
  const actionsQ = useCollection<RepairAction>("repairActions");
  const coursesQ = useCollection<Course>("courses");

  const [tab, setTab] = useState("fleet");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [manufacturerFilter, setManufacturerFilter] = useState("all");

  const printers = useMemo(() => printersQ.data ?? [], [printersQ.data]);
  const models = useMemo(() => modelsQ.data ?? [], [modelsQ.data]);
  const customers = useMemo(() => customersQ.data ?? [], [customersQ.data]);
  const tickets = useMemo(() => ticketsQ.data ?? [], [ticketsQ.data]);
  const actions = useMemo(() => actionsQ.data ?? [], [actionsQ.data]);
  const courses = useMemo(() => coursesQ.data ?? [], [coursesQ.data]);

  const today = todayISO();
  const health = useMemo(
    () => fleetHealth(printers, models, tickets, actions, today),
    [printers, models, tickets, actions, today],
  );
  const modelOf = (id: string): PrinterModel | undefined => models.find((m) => m.id === id);
  const customerOf = (id: string): Customer | undefined => customers.find((c) => c.id === id);

  const reminders = useMemo(() => {
    return printers
      .map((p) => {
        const model = models.find((m) => m.id === p.printerModelId);
        const maint = maintenanceInfo(p, model, tickets, actions, today);
        const w = warrantyState(p, today);
        return { printer: p, model, maint, warranty: w };
      })
      .filter((r) => r.maint.due || r.warranty === "פג בקרוב")
      .sort((a, b) => b.maint.overdueDays - a.maint.overdueDays);
  }, [printers, models, tickets, actions, today]);

  const selected = printers.find((p) => p.id === selectedId) ?? null;

  if (printersQ.isError || modelsQ.isError) {
    return (
      <EmptyState
        icon="alert"
        title="שגיאה בטעינת צי המדפסות"
        reason="קריאת ה-repositories נכשלה — נסו לרענן את הדף."
      />
    );
  }
  if (printersQ.isLoading || modelsQ.isLoading || customersQ.isLoading) {
    return (
      <Panel style={{ padding: "var(--os-space-8)", color: "var(--os-text-2)" }}>
        טוען את צי המדפסות…
      </Panel>
    );
  }

  const fleetColumns: DataTableColumn<CustomerPrinter>[] = [
    {
      key: "model",
      header: "דגם",
      render: (p) => modelOf(p.printerModelId)?.name ?? p.printerModelId,
    },
    {
      key: "customer",
      header: "לקוח",
      render: (p) => customerOf(p.customerId)?.name ?? p.customerId,
    },
    {
      key: "serial",
      header: "מס' סידורי",
      render: (p) => <span className="os-table__num">{p.serialNumber}</span>,
    },
    {
      key: "purchased",
      header: "נרכשה",
      render: (p) => <span className="os-table__num">{fmtDate(p.purchasedAt)}</span>,
    },
    {
      key: "warranty",
      header: "אחריות עד",
      render: (p) => (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <span className="os-table__num">{fmtDate(warrantyUntil(p))}</span>
          {warrantyChip(warrantyState(p, today))}
        </span>
      ),
    },
    {
      key: "maintenance",
      header: "תחזוקה",
      render: (p) => {
        const m = maintenanceInfo(p, modelOf(p.printerModelId), tickets, actions, today);
        return m.due ? (
          <StatusChip status="אזהרה" label={`נדרשת (+${m.overdueDays} ימים)`} />
        ) : (
          <span className="os-table__num" style={{ color: "var(--os-text-2)" }}>
            עד {fmtDate(m.nextDue)}
          </span>
        );
      },
    },
  ];

  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)" }}>
      <PageRail>
        <PrintersRail health={health} reminders={reminders} customers={customers} today={today} />
      </PageRail>

      <SectionTitle
        icon="printer"
        title="מדפסות וציוד"
        subtitle={DEMO_DATA_LABEL}
        action={
          <OsButton icon="plus" onClick={() => setRegisterOpen(true)}>
            רישום מדפסת ללקוח
          </OsButton>
        }
      />

      <div style={kpiRowStyle}>
        <KpiCard title="מדפסות בצי" value={health.total} accent="cyan" icon="printer" />
        <KpiCard
          title="באחריות בתוקף"
          value={health.underWarranty}
          accent="success"
          icon="shield"
        />
        <KpiCard
          title="אחריות פגה בקרוב"
          value={health.warrantyExpiringSoon}
          accent="warning"
          icon="clock"
        />
        <KpiCard
          title="תחזוקה נדרשת"
          value={health.maintenanceDue}
          accent="danger"
          icon="wrench"
          glow={health.maintenanceDue > 0}
        />
        <KpiCard
          title="עם קריאה פתוחה"
          value={health.withOpenTicket}
          accent="violet"
          icon="alert"
        />
      </div>

      <Tabs
        ariaLabel="אזורי מודול המדפסות"
        items={[
          { id: "fleet", label: "צי הלקוחות", badge: printers.length },
          { id: "catalog", label: "קטלוג דגמים", badge: models.length },
          { id: "reminders", label: "תזכורות תחזוקה", badge: reminders.length },
        ]}
        activeId={tab}
        onChange={setTab}
      />

      {tab === "fleet" && (
        <DataTable
          columns={fleetColumns}
          rows={printers}
          rowKey="id"
          onRowClick={(p) => setSelectedId(p.id)}
          emptyText="אין מדפסות רשומות"
          emptyReason="רשמו מדפסת ראשונה ללקוח כדי להתחיל לנהל את הצי."
        />
      )}

      {tab === "catalog" && (
        <div style={{ display: "grid", gap: "var(--os-space-4)" }}>
          <div style={{ display: "flex", gap: "var(--os-space-4)" }}>
            <select
              className="os-qc-input"
              style={{ maxInlineSize: 220 }}
              aria-label="סינון יצרן"
              value={manufacturerFilter}
              onChange={(e) => setManufacturerFilter(e.target.value)}
            >
              <option value="all">כל היצרנים</option>
              {[...new Set(models.map((m) => m.manufacturer))].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
              gap: "var(--os-space-5)",
            }}
          >
            {models
              .filter((m) => manufacturerFilter === "all" || m.manufacturer === manufacturerFilter)
              .map((m) => {
                const owned = printers.filter((p) => p.printerModelId === m.id).length;
                return (
                  <Panel key={m.id} variant="raised" style={{ padding: "var(--os-space-5)" }}>
                    <div style={{ fontWeight: 600 }}>{m.name}</div>
                    <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>
                      {m.manufacturer} · {m.technology}
                    </div>
                    <div className="os-num" style={{ color: "var(--os-cyan)", marginBlock: 6 }}>
                      ₪{m.price.toLocaleString("he-IL")}
                    </div>
                    <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
                      {m.note}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBlockStart: 8 }}>
                      {m.tags.map((t) => (
                        <span key={t} className="os-chip os-chip--blue">
                          {t}
                        </span>
                      ))}
                    </div>
                    <div
                      style={{
                        marginBlockStart: 8,
                        color: "var(--os-muted)",
                        fontSize: "var(--os-text-xs)",
                      }}
                    >
                      {owned > 0 ? `${owned} בצי הלקוחות` : "אין יחידות בצי"}
                    </div>
                  </Panel>
                );
              })}
          </div>
        </div>
      )}

      {tab === "reminders" && (
        <RemindersQueue
          reminders={reminders}
          customers={customers}
          onOpen={(id) => setSelectedId(id)}
        />
      )}

      {selected && (
        <PrinterDrawer
          printer={selected}
          model={modelOf(selected.printerModelId)}
          customer={customerOf(selected.customerId)}
          tickets={tickets}
          actions={actions}
          courses={courses}
          today={today}
          onClose={() => setSelectedId(null)}
        />
      )}

      {registerOpen && (
        <RegisterPrinterModal
          customers={customers}
          models={models}
          onClose={() => setRegisterOpen(false)}
        />
      )}
    </div>
  );
}

// ── rail ────────────────────────────────────────────────────────────────────
function PrintersRail({
  health,
  reminders,
  customers,
  today,
}: {
  health: ReturnType<typeof fleetHealth>;
  reminders: readonly {
    printer: CustomerPrinter;
    model: PrinterModel | undefined;
    maint: ReturnType<typeof maintenanceInfo>;
    warranty: WarrantyState;
  }[];
  customers: readonly Customer[];
  today: string;
}): ReactElement {
  void today;
  const nameOf = (id: string): string => customers.find((c) => c.id === id)?.name ?? id;
  const maintDue = reminders.filter((r) => r.maint.due);
  const warrantySoon = reminders.filter((r) => r.warranty === "פג בקרוב");
  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)", fontSize: "var(--os-text-sm)" }}>
      <div>
        <div style={railTitle}>בריאות הצי</div>
        {(
          [
            ['סה"כ מדפסות', health.total],
            ["באחריות", health.underWarranty],
            ["תחזוקה נדרשת", health.maintenanceDue],
            ["קריאות פתוחות", health.withOpenTicket],
          ] as const
        ).map(([label, value]) => (
          <div key={label} style={railRow}>
            <span>{label}</span>
            <span className="os-num" style={{ color: "var(--os-text)" }}>
              {value}
            </span>
          </div>
        ))}
      </div>
      <div>
        <div style={railTitle}>תחזוקה נדרשת ({maintDue.length})</div>
        {maintDue.length === 0 && <div style={railMuted}>אין מדפסות שדורשות תחזוקה.</div>}
        {maintDue.slice(0, 5).map((r) => (
          <div key={r.printer.id} style={railRow}>
            <span>{r.model?.name ?? r.printer.printerModelId}</span>
            <span className="os-num" style={{ color: "var(--os-warning)" }}>
              +{r.maint.overdueDays} ימים
            </span>
          </div>
        ))}
      </div>
      <div>
        <div style={railTitle}>אחריות פגה בקרוב ({warrantySoon.length})</div>
        {warrantySoon.length === 0 && (
          <div style={railMuted}>אין אחריות שעומדת לפוג בחודש הקרוב.</div>
        )}
        {warrantySoon.map((r) => (
          <div key={r.printer.id} style={railRow}>
            <span>{nameOf(r.printer.customerId)}</span>
            <span className="os-num" style={{ color: "var(--os-warning)" }}>
              {fmtDate(warrantyUntil(r.printer))}
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

// ── reminders queue ─────────────────────────────────────────────────────────
function RemindersQueue({
  reminders,
  customers,
  onOpen,
}: {
  reminders: readonly {
    printer: CustomerPrinter;
    model: PrinterModel | undefined;
    maint: ReturnType<typeof maintenanceInfo>;
    warranty: WarrantyState;
  }[];
  customers: readonly Customer[];
  onOpen: (printerId: string) => void;
}): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function createMaintenanceTask(r: (typeof reminders)[number]): Promise<void> {
    setBusyId(r.printer.id);
    try {
      const repo = getRepository<Task>("tasks");
      const all = await repo.list();
      const customer = customers.find((c) => c.id === r.printer.customerId);
      const now = new Date().toISOString();
      const title = `תחזוקה תקופתית — ${r.model?.name ?? r.printer.printerModelId} (${customer?.name ?? ""})`;
      if (all.some((t) => t.title === title && t.status !== "הושלמה" && t.status !== "בוטלה")) {
        toast("כבר קיימת משימת תחזוקה פתוחה למדפסת זו", "warning");
        return;
      }
      await repo.create({
        id: nextId(
          "task",
          all.map((t) => t.id),
        ),
        title,
        description: `S/N ${r.printer.serialNumber} · תחזוקה אחרונה: ${fmtDate(r.maint.lastTouch)} · באיחור ${Math.max(0, r.maint.overdueDays)} ימים`,
        status: "פתוחה",
        priority: r.maint.overdueDays > 30 ? "גבוהה" : "בינונית",
        due: todayISO(),
        ownerId: "u-ran",
        relatedRef: `customerPrinter:${r.printer.id}`,
        createdAt: now,
        updatedAt: now,
      });
      const actRepo = getRepository<Activity>("activities");
      const acts = await actRepo.list();
      await actRepo.create({
        id: nextId(
          "act",
          acts.map((a) => a.id),
        ),
        kind: "מערכת",
        text: `נוצרה משימת תחזוקה למדפסת ${r.model?.name ?? ""} של ${customer?.name ?? ""}`,
        actorId: CEO_USER_ID,
        entityRef: `customerPrinter:${r.printer.id}`,
        at: now,
        createdAt: now,
        updatedAt: now,
      });
      await invalidate(["tasks", "activities"]);
      toast("משימת תחזוקה נוצרה בתור המשימות", "success");
    } finally {
      setBusyId(null);
    }
  }

  const columns: DataTableColumn<(typeof reminders)[number]>[] = [
    { key: "model", header: "דגם", render: (r) => r.model?.name ?? r.printer.printerModelId },
    {
      key: "customer",
      header: "לקוח",
      render: (r) =>
        customers.find((c) => c.id === r.printer.customerId)?.name ?? r.printer.customerId,
    },
    {
      key: "reason",
      header: "סיבה",
      render: (r) => (
        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
          {r.maint.due && (
            <StatusChip
              status="אזהרה"
              label={`תחזוקה באיחור ${Math.max(0, r.maint.overdueDays)} ימים`}
            />
          )}
          {r.warranty === "פג בקרוב" && <StatusChip status="אזהרה" label="אחריות פגה בקרוב" />}
        </span>
      ),
    },
    {
      key: "nextDue",
      header: "תחזוקה הבאה",
      render: (r) => <span className="os-table__num">{fmtDate(r.maint.nextDue)}</span>,
    },
    {
      key: "act",
      header: "",
      render: (r) => (
        <span style={{ display: "inline-flex", gap: 6 }}>
          <OsButton size="sm" variant="ghost" onClick={() => onOpen(r.printer.id)}>
            פתיחת כרטיס
          </OsButton>
          {busyId === r.printer.id ? (
            <OsButton size="sm" variant="cyan" disabled disabledReason="יצירת משימה רצה">
              משימת תחזוקה
            </OsButton>
          ) : (
            <OsButton size="sm" variant="cyan" onClick={() => void createMaintenanceTask(r)}>
              משימת תחזוקה
            </OsButton>
          )}
        </span>
      ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={reminders}
      rowKey={(r) => r.printer.id}
      emptyText="אין תזכורות תחזוקה"
      emptyReason="כל המדפסות בטווח התחזוקה והאחריות — התור ריק."
    />
  );
}

// ── printer drawer (lifecycle) ──────────────────────────────────────────────
function PrinterDrawer({
  printer,
  model,
  customer,
  tickets,
  actions,
  courses,
  today,
  onClose,
}: {
  printer: CustomerPrinter;
  model: PrinterModel | undefined;
  customer: Customer | undefined;
  tickets: readonly ServiceTicket[];
  actions: readonly RepairAction[];
  courses: readonly Course[];
  today: string;
  onClose: () => void;
}): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [notes, setNotes] = useState(printer.notes);
  const [busy, setBusy] = useState(false);

  const linked = ticketsForPrinter(printer, model, tickets);
  const maint = maintenanceInfo(printer, model, tickets, actions, today);
  const related = relatedCourses(model, courses);

  interface TimelineEvent {
    at: string;
    label: string;
    text: string;
  }
  const events: TimelineEvent[] = [
    {
      at: printer.purchasedAt.slice(0, 10),
      label: "התקנה",
      text: "המדפסת נרכשה והותקנה אצל הלקוח",
    },
    ...linked.map((t) => ({
      at: t.openedAt.slice(0, 10),
      label: "קריאת שירות",
      text: `${t.issue} (${t.status})`,
    })),
    ...actions
      .filter((a) => linked.some((t) => t.id === a.ticketId))
      .map((a) => ({ at: a.performedAt.slice(0, 10), label: "טיפול", text: a.description })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${model?.name ?? printer.printerModelId} — ${customer?.name ?? ""}`}
    >
      <div style={{ display: "grid", gap: "var(--os-space-5)" }}>
        <Panel variant="raised" style={{ padding: "var(--os-space-4)", display: "grid", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--os-muted)" }}>מס' סידורי</span>
            <span className="os-num">{printer.serialNumber}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--os-muted)" }}>נרכשה</span>
            <span className="os-num">{fmtDate(printer.purchasedAt)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--os-muted)" }}>אחריות עד (נגזר)</span>
            <span style={{ display: "inline-flex", gap: 6 }}>
              <span className="os-num">{fmtDate(warrantyUntil(printer))}</span>
              {warrantyChip(warrantyState(printer, today))}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--os-muted)" }}>תחזוקה הבאה (נגזר)</span>
            <span className="os-num" style={{ color: maint.due ? "var(--os-warning)" : undefined }}>
              {fmtDate(maint.nextDue)}
              {maint.due ? ` (באיחור ${maint.overdueDays} ימים)` : ""}
            </span>
          </div>
        </Panel>

        <div>
          <SectionTitle icon="clock" title="ציר חיים" subtitle={`${events.length} אירועים`} />
          <div style={{ display: "grid", gap: "var(--os-space-3)" }}>
            {events.map((e, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: "var(--os-space-4)",
                  fontSize: "var(--os-text-sm)",
                  color: "var(--os-text-2)",
                  borderBlockEnd: "1px solid var(--os-border)",
                  paddingBlockEnd: "var(--os-space-2)",
                }}
              >
                <span className="os-num" style={{ color: "var(--os-muted)", minInlineSize: 76 }}>
                  {fmtDate(e.at)}
                </span>
                <span style={{ color: "var(--os-cyan)", minInlineSize: 72 }}>{e.label}</span>
                <span>{e.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionTitle icon="graduation" title="קורסים קשורים" subtitle={RULES_ENGINE_LABEL} />
          {related.length === 0 ? (
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-sm)" }}>
              לא נמצאה התאמה דטרמיניסטית לקורס קיים.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {related.map((c) => (
                <div key={c.id} style={{ fontSize: "var(--os-text-sm)" }}>
                  🎓 {c.name} <span style={{ color: "var(--os-muted)" }}>({c.status})</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label className="os-qc-label" htmlFor="printer-notes">
            הערות על המדפסת
          </label>
          <textarea
            id="printer-notes"
            className="os-qc-input os-qc-input--area"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {notes !== printer.notes ? (
            <OsButton
              icon="check"
              {...busyDisabled(busy)}
              onClick={() => {
                setBusy(true);
                const repo = getRepository<CustomerPrinter>("customerPrinters");
                void repo
                  .update(printer.id, { notes, updatedAt: new Date().toISOString() })
                  .then(() => invalidate(["customerPrinters"]))
                  .then(() => toast("ההערות נשמרו", "success"))
                  .finally(() => setBusy(false));
              }}
            >
              שמירת הערות
            </OsButton>
          ) : (
            <OsButton icon="check" disabled disabledReason="אין שינוי לשמירה">
              שמירת הערות
            </OsButton>
          )}
        </div>
      </div>
    </Drawer>
  );
}

// ── register modal ──────────────────────────────────────────────────────────
function RegisterPrinterModal({
  customers,
  models,
  onClose,
}: {
  customers: readonly Customer[];
  models: readonly PrinterModel[];
  onClose: () => void;
}): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [customerId, setCustomerId] = useState("");
  const [modelId, setModelId] = useState("");
  const [serial, setSerial] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(todayISO());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (): void => {
    if (!customerId) {
      setErrorMsg("בחרו לקוח");
      return;
    }
    if (!modelId) {
      setErrorMsg("בחרו דגם מדפסת");
      return;
    }
    if (serial.trim().length < 3) {
      setErrorMsg("מס' סידורי קצר מדי");
      return;
    }
    if (!purchasedAt) {
      setErrorMsg("נדרש תאריך רכישה");
      return;
    }
    setBusy(true);
    const repo = getRepository<CustomerPrinter>("customerPrinters");
    void repo
      .list()
      .then((all) => {
        const now = new Date().toISOString();
        return repo.create({
          id: nextId(
            "cp",
            all.map((p) => p.id),
          ),
          customerId,
          printerModelId: modelId,
          serialNumber: serial.trim(),
          purchasedAt,
          underWarranty: true,
          notes: "",
          createdAt: now,
          updatedAt: now,
        });
      })
      .then(async () => {
        const actRepo = getRepository<Activity>("activities");
        const acts = await actRepo.list();
        const now = new Date().toISOString();
        const model = models.find((m) => m.id === modelId);
        const customer = customers.find((c) => c.id === customerId);
        await actRepo.create({
          id: nextId(
            "act",
            acts.map((a) => a.id),
          ),
          kind: "מערכת",
          text: `נרשמה מדפסת ${model?.name ?? modelId} ללקוח ${customer?.name ?? customerId}`,
          actorId: CEO_USER_ID,
          entityRef: null,
          at: now,
          createdAt: now,
          updatedAt: now,
        });
        await invalidate(["customerPrinters", "activities"]);
      })
      .then(() => {
        toast("המדפסת נרשמה בצי", "success");
        onClose();
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="רישום מדפסת ללקוח"
      footer={
        <div style={{ display: "flex", gap: "var(--os-space-3)" }}>
          <OsButton icon="plus" {...busyDisabled(busy)} onClick={submit}>
            רישום
          </OsButton>
          <OsButton variant="ghost" onClick={onClose}>
            ביטול
          </OsButton>
        </div>
      }
    >
      <div className="os-qc-form">
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="rp-customer">
            לקוח
          </label>
          <select
            id="rp-customer"
            className="os-qc-input"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
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
          <label className="os-qc-label" htmlFor="rp-model">
            דגם
          </label>
          <select
            id="rp-model"
            className="os-qc-input"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
          >
            <option value="">— בחירת דגם —</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.manufacturer})
              </option>
            ))}
          </select>
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="rp-serial">
            מס' סידורי
          </label>
          <input
            id="rp-serial"
            className="os-qc-input"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="rp-date">
            תאריך רכישה
          </label>
          <input
            id="rp-date"
            type="date"
            className="os-qc-input"
            value={purchasedAt}
            onChange={(e) => setPurchasedAt(e.target.value)}
          />
        </div>
        {errorMsg && <div className="os-qc-error">{errorMsg}</div>}
      </div>
    </Modal>
  );
}
