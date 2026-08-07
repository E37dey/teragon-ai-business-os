// Wave 3 — ניהול לקוחות ולידים (/crm): TanStack Table over the real leads
// collection — sorting, filtering, saved views, pagination, row expansion,
// create + owner assignment + status updates, all persisted via repositories.
import { useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
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
  type OsStatus,
} from "@/design-system";
import { PageRail } from "@/app/rail";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import { getRepository } from "@/repositories";
import type { Customer, Lead, LeadStatus, User } from "@/domain/types";
import { funnelDistribution } from "@/domain/selectors";
import {
  createCustomer,
  createLead,
  customerInputSchema,
  leadInputSchema,
  type CustomerInput,
  type LeadInput,
} from "@/app/quick-create/actions";
import { dateHe, todayIso } from "@/modules/quotations/fmt";
import {
  agingAlerts,
  conversionRate,
  EMPTY_FILTERS,
  filterLeads,
  hottestLeads,
  leadSources,
  newThisWeek,
  type LeadFilters,
} from "./selectors";
import { loadSavedViews, saveSavedViews, type SavedView } from "./savedViews";
import "./crm.css";

const LEAD_STATUSES: readonly LeadStatus[] = [
  "חדש",
  "נוצר קשר",
  "קיבל פרטים",
  "ממתין לתשובה",
  "נשלחה הצעה",
  "במשא ומתן",
  "נסגר כלקוח",
  "לא רלוונטי",
];

/** lead status → one of the 8 canonical chip statuses (color discipline). */
function leadChip(status: LeadStatus): { chip: OsStatus; label: string } {
  switch (status) {
    case "חדש":
      return { chip: "פעיל", label: status };
    case "נסגר כלקוח":
      return { chip: "הושלם", label: status };
    case "לא רלוונטי":
      return { chip: "מושבת", label: status };
    case "במשא ומתן":
      return { chip: "דורש אישור", label: status };
    case "ממתין לתשובה":
      return { chip: "אזהרה", label: status };
    default:
      return { chip: "ממתין", label: status };
  }
}

const selStyle: CSSProperties = {
  background: "var(--os-raised)",
  color: "var(--os-text)",
  border: "1px solid var(--os-border)",
  borderRadius: "var(--os-radius-sm, 6px)",
  paddingBlock: "4px",
  paddingInline: "8px",
  fontSize: "var(--os-text-sm, 13px)",
};

const railTitle: CSSProperties = {
  fontSize: "var(--os-text-2xs, 11px)",
  fontWeight: 600,
  color: "var(--os-text-2)",
  marginBlockEnd: 6,
  letterSpacing: "0.04em",
};

interface FieldSpec {
  name: string;
  label: string;
  type: "text" | "textarea" | "select";
  options?: readonly string[];
}

interface CreateModalProps {
  title: string;
  fields: readonly FieldSpec[];
  onSubmit: (values: Record<string, string>) => Promise<void>;
  errors: Record<string, string>;
  onClose: () => void;
}

function CreateModal({ title, fields, onSubmit, errors, onClose }: CreateModalProps): ReactElement {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of fields) v[f.name] = f.type === "select" ? (f.options?.[0] ?? "") : "";
    return v;
  });
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={title}>
      <form
        className="os-qc-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void onSubmit(values).finally(() => setBusy(false));
        }}
      >
        {fields.map((f) => {
          const id = `crm-create-${f.name}`;
          const error = errors[f.name];
          return (
            <div key={f.name} className="os-qc-field">
              <label className="os-qc-label" htmlFor={id}>
                {f.label}
              </label>
              {f.type === "select" ? (
                <select
                  id={id}
                  className="os-qc-input"
                  value={values[f.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                >
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  id={id}
                  className="os-qc-input os-qc-input--area"
                  rows={3}
                  value={values[f.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              ) : (
                <input
                  id={id}
                  className="os-qc-input"
                  type="text"
                  value={values[f.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              )}
              {error && (
                <span className="os-qc-error" role="alert">
                  {error}
                </span>
              )}
            </div>
          );
        })}
        <div className="os-qc-actions">
          {busy ? (
            <OsButton type="submit" disabled disabledReason="שמירה מתבצעת…">
              שומר…
            </OsButton>
          ) : (
            <OsButton type="submit">שמירה</OsButton>
          )}
          <OsButton variant="ghost" onClick={onClose}>
            ביטול
          </OsButton>
        </div>
      </form>
    </Modal>
  );
}

interface StatusModalProps {
  lead: Lead;
  onClose: () => void;
}

function StatusModal({ lead, onClose }: StatusModalProps): ReactElement {
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [followUp, setFollowUp] = useState(lead.followUp.slice(0, 10));
  const [nextAction, setNextAction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();

  const save = async (): Promise<void> => {
    if (!followUp) {
      setError("יש לקבוע תאריך מעקב לפעולה הבאה");
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const entryText = nextAction.trim()
        ? `סטטוס עודכן ל"${status}" · הפעולה הבאה: ${nextAction.trim()}`
        : `סטטוס עודכן ל"${status}"`;
      await getRepository<Lead>("leads").update(lead.id, {
        status,
        followUp,
        updatedAt: now,
        history: [...lead.history, { date: now.slice(0, 10), text: entryText }],
      });
      await invalidate(["leads", "notifications"]);
      toast(`הליד «${lead.name}» עודכן`, "success");
      onClose();
    } catch {
      toast("עדכון הליד נכשל — נסו שוב", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`עדכון סטטוס — ${lead.name}`}>
      <div className="os-qc-form">
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="crm-status-select">
            סטטוס חדש
          </label>
          <select
            id="crm-status-select"
            className="os-qc-input"
            value={status}
            onChange={(e) => setStatus(e.target.value as LeadStatus)}
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="crm-status-next">
            הפעולה הבאה
          </label>
          <input
            id="crm-status-next"
            className="os-qc-input"
            type="text"
            placeholder="למשל: לשלוח הצעת מחיר מעודכנת"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="crm-status-followup">
            תאריך מעקב
          </label>
          <input
            id="crm-status-followup"
            className="os-qc-input"
            type="date"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
          />
          {error && (
            <span className="os-qc-error" role="alert">
              {error}
            </span>
          )}
        </div>
        <div className="os-qc-actions">
          {busy ? (
            <OsButton disabled disabledReason="שמירה מתבצעת…">
              שומר…
            </OsButton>
          ) : (
            <OsButton onClick={() => void save()}>שמירת עדכון</OsButton>
          )}
          <OsButton variant="ghost" onClick={onClose}>
            ביטול
          </OsButton>
        </div>
      </div>
    </Modal>
  );
}

const columnHelper = createColumnHelper<Lead>();

export default function CrmPage(): ReactElement {
  const navigate = useNavigate();
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();

  const leadsQ = useCollection<Lead>("leads");
  const usersQ = useCollection<User>("users");
  const customersQ = useCollection<Customer>("customers");

  const leads = useMemo(() => leadsQ.data ?? [], [leadsQ.data]);
  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);
  const customers = useMemo(() => customersQ.data ?? [], [customersQ.data]);
  const today = todayIso();

  const [tab, setTab] = useState<"leads" | "customers">("leads");
  const [filters, setFilters] = useState<LeadFilters>(EMPTY_FILTERS);
  const [sorting, setSorting] = useState<SortingState>([{ id: "followUp", desc: false }]);
  const [views, setViews] = useState<SavedView[]>(() => loadSavedViews());
  const [activeView, setActiveView] = useState<string>("");
  const [createKind, setCreateKind] = useState<"lead" | "customer" | null>(null);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [statusLead, setStatusLead] = useState<Lead | null>(null);
  // selected record + on-demand detail drawers (progressive disclosure —
  // detail/activity are never a permanent panel). Store ids so the open
  // drawer always reflects the live record after an update.
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const detailLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  );
  const detailCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const filtered = useMemo(() => filterLeads(leads, filters), [leads, filters]);
  const sources = useMemo(() => leadSources(leads), [leads]);
  const conversion = useMemo(() => conversionRate(leads), [leads]);
  const weekNew = useMemo(() => newThisWeek(leads, today), [leads, today]);
  const aging = useMemo(() => agingAlerts(leads, today), [leads, today]);
  const hottest = useMemo(() => hottestLeads(leads), [leads]);
  const pipeline = useMemo(() => funnelDistribution(leads), [leads]);
  const openLeads = useMemo(
    () => leads.filter((l) => l.status !== "נסגר כלקוח" && l.status !== "לא רלוונטי").length,
    [leads],
  );

  // owner reassignment is a SECONDARY action — it lives in the detail drawer,
  // not as a permanent control in every row.
  const assignOwner = async (lead: Lead, ownerId: string): Promise<void> => {
    try {
      await getRepository<Lead>("leads").update(lead.id, {
        ownerId,
        updatedAt: new Date().toISOString(),
      });
      await invalidate(["leads"]);
      toast(
        `«${lead.name}» הועבר לבעלות ${users.find((u) => u.id === ownerId)?.name ?? ownerId}`,
        "success",
      );
    } catch {
      toast("שינוי הבעלות נכשל — נסו שוב", "danger");
    }
  };

  const columns = useMemo(() => {
    return [
      columnHelper.accessor("name", { header: "שם" }),
      columnHelper.accessor("status", {
        header: "סטטוס",
        // status must be scanned across rows ⇒ a display-only chip (updating it
        // is a secondary action, moved into the row's detail drawer).
        cell: ({ row }) => {
          const { chip, label } = leadChip(row.original.status);
          return <StatusChip status={chip} label={label} />;
        },
      }),
      columnHelper.accessor("ownerId", {
        header: "בעלים",
        cell: ({ row }) => users.find((u) => u.id === row.original.ownerId)?.name ?? row.original.ownerId,
      }),
      columnHelper.accessor("source", { header: "מקור" }),
      columnHelper.accessor("interest", { header: "תחום עניין" }),
      columnHelper.accessor("followUp", {
        header: "מעקב הבא",
        // amber ONLY when action is required (past the follow-up date).
        cell: (c) => (
          <span
            className="os-num"
            style={c.getValue() < today ? { color: "var(--warning-text)" } : undefined}
          >
            {dateHe(c.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("updatedAt", {
        header: "עודכן",
        cell: (c) => <span className="os-num">{dateHe(c.getValue())}</span>,
      }),
    ];
  }, [users, today]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  const applyView = (id: string): void => {
    setActiveView(id);
    const v = views.find((x) => x.id === id);
    if (v) {
      setFilters(v.filters);
      setSorting(v.sorting);
    } else {
      setFilters(EMPTY_FILTERS);
    }
  };

  const saveCurrentView = (): void => {
    const name = window.prompt("שם לתצוגה השמורה:");
    if (!name?.trim()) return;
    const view: SavedView = {
      id: `view-${Date.now()}`,
      name: name.trim(),
      filters,
      sorting: sorting.map((s) => ({ id: s.id, desc: s.desc })),
    };
    const next = [...views, view];
    setViews(next);
    saveSavedViews(next);
    setActiveView(view.id);
    toast(`התצוגה «${view.name}» נשמרה`, "success");
  };

  const submitCreate = async (values: Record<string, string>): Promise<void> => {
    if (createKind === "lead") {
      const parsed = leadInputSchema.safeParse(values);
      if (!parsed.success) {
        const errs: Record<string, string> = {};
        for (const i of parsed.error.issues) {
          const k = String(i.path[0] ?? "");
          if (k && !(k in errs)) errs[k] = i.message;
        }
        setCreateErrors(errs);
        return;
      }
      await createLead(parsed.data as LeadInput);
      toast("הליד נוצר ונשמר במאגר", "success");
    } else if (createKind === "customer") {
      const parsed = customerInputSchema.safeParse(values);
      if (!parsed.success) {
        const errs: Record<string, string> = {};
        for (const i of parsed.error.issues) {
          const k = String(i.path[0] ?? "");
          if (k && !(k in errs)) errs[k] = i.message;
        }
        setCreateErrors(errs);
        return;
      }
      await createCustomer(parsed.data as CustomerInput);
      toast("הלקוח נוצר ונשמר במאגר", "success");
    }
    setCreateErrors({});
    setCreateKind(null);
  };

  if (leadsQ.isError || usersQ.isError || customersQ.isError) {
    return (
      <EmptyState
        icon="alert"
        title="טעינת ה-CRM נכשלה"
        reason="קריאת הנתונים מ-IndexedDB המקומי נכשלה. רעננו את הדף."
      />
    );
  }
  if (leadsQ.isLoading || usersQ.isLoading || customersQ.isLoading) {
    return (
      <div style={{ padding: "var(--os-space-6)", color: "var(--os-text-2)" }} role="status">
        טוען לידים ולקוחות מהמאגר המקומי…
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--os-space-5)" }} data-testid="crm-page">
      <PageRail>
        <div style={{ display: "grid", gap: "var(--os-space-5)" }}>
          <div>
            <div style={railTitle}>תמונת צנרת</div>
            <div style={{ display: "grid", gap: 4, fontSize: "var(--os-text-2xs, 11px)" }}>
              {pipeline.map((s) => (
                <div
                  key={s.stage}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "var(--os-text-2)",
                  }}
                >
                  <span>{s.stage}</span>
                  <span className="os-num">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={railTitle}>הלידים החמים</div>
            <div style={{ display: "grid", gap: 6, fontSize: "var(--os-text-sm, 12px)" }}>
              {hottest.length === 0 ? (
                <span style={{ color: "var(--os-muted)" }}>אין לידים בשלבים מתקדמים כרגע</span>
              ) : (
                hottest.map((l) => (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{l.name}</span>
                    <span style={{ color: "var(--os-cyan-text)" }}>{l.status}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <div style={railTitle}>התראות התיישנות</div>
            <div style={{ display: "grid", gap: 6, fontSize: "var(--os-text-sm, 12px)" }}>
              {aging.length === 0 ? (
                <span style={{ color: "var(--os-muted)" }}>אין לידים שחצו את מועד המעקב</span>
              ) : (
                aging.map(({ lead, daysOverdue }) => (
                  <div key={lead.id} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{lead.name}</span>
                    <span className="os-num" style={{ color: "var(--danger-text)" }}>
                      {daysOverdue} ימים
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </PageRail>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "var(--os-space-3)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "var(--os-text-xl, 20px)" }}>ניהול לקוחות ולידים (CRM)</h1>
        <div style={{ display: "flex", gap: "var(--os-space-2)" }}>
          <OsButton icon="plus" onClick={() => setCreateKind("lead")}>
            ליד חדש
          </OsButton>
          <OsButton variant="cyan" icon="plus" onClick={() => setCreateKind("customer")}>
            לקוח חדש
          </OsButton>
        </div>
      </div>

      {/* VC-C: 4 quiet primary KPIs that drive the workflow. Neutral by default;
          amber only where action is required (overdue follow-ups); zero is never
          success and never attention (muted). Passive analytics → "מדדים נוספים". */}
      <div
        data-testid="crm-metrics"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--os-space-3)",
        }}
      >
        <KpiCard title="לידים פתוחים" value={openLeads} icon="users" muted />
        <KpiCard title="חדשים השבוע" value={weekNew} icon="plus" muted />
        <KpiCard
          title="חצו מועד מעקב"
          value={aging.length}
          accent="warning"
          icon="alert"
          muted={aging.length === 0}
        />
        <KpiCard title="לידים חמים" value={hottest.length} icon="target" muted />
      </div>

      <details data-testid="crm-more-metrics" className="os-more-metrics">
        <summary>מדדים נוספים</summary>
        <div className="os-more-metrics__grid">
          <div className="os-more-metrics__item">
            <span>אחוז המרה (הוכרעו)</span>
            <span className="os-num">{conversion === null ? "טרם נמדד" : `${conversion}%`}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>סה״כ לידים</span>
            <span className="os-num">{leads.length}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>סה״כ לקוחות</span>
            <span className="os-num">{customers.length}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>מקורות פעילים</span>
            <span className="os-num">{sources.length}</span>
          </div>
        </div>
      </details>

      <Tabs
        ariaLabel="לידים או לקוחות"
        items={[
          { id: "leads", label: "לידים", badge: leads.length },
          { id: "customers", label: "לקוחות", badge: customers.length },
        ]}
        activeId={tab}
        onChange={(id) => setTab(id as "leads" | "customers")}
      />

      {tab === "leads" ? (
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle
            title="טבלת הלידים"
            subtitle="מיון בלחיצה על כותרת · סינון · תצוגות שמורות"
          />
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--os-space-2)",
              marginBlock: "var(--os-space-3)",
              alignItems: "center",
            }}
          >
            <input
              type="search"
              className="os-qc-input"
              style={{ maxInlineSize: 200 }}
              placeholder="חיפוש חופשי…"
              aria-label="חיפוש חופשי בלידים"
              value={filters.text}
              onChange={(e) => setFilters((f) => ({ ...f, text: e.target.value }))}
            />
            <select
              style={selStyle}
              aria-label="סינון לפי סטטוס"
              value={filters.status}
              onChange={(e) =>
                setFilters((f) => ({ ...f, status: e.target.value as LeadFilters["status"] }))
              }
            >
              <option value="הכול">כל הסטטוסים</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              style={selStyle}
              aria-label="סינון לפי בעלים"
              value={filters.ownerId}
              onChange={(e) => setFilters((f) => ({ ...f, ownerId: e.target.value }))}
            >
              <option value="הכול">כל הבעלים</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <select
              style={selStyle}
              aria-label="סינון לפי מקור"
              value={filters.source}
              onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))}
            >
              <option value="הכול">כל המקורות</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              style={selStyle}
              aria-label="תצוגה שמורה"
              value={activeView}
              onChange={(e) => applyView(e.target.value)}
            >
              <option value="">ללא תצוגה שמורה</option>
              {views.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <OsButton variant="ghost" size="sm" onClick={saveCurrentView}>
              שמירת תצוגה
            </OsButton>
          </div>

          <div className="os-table-wrap">
            <div className="os-table-scroll">
              <table className="os-table" data-testid="leads-table">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {hg.headers.map((h) => (
                        <th
                          key={h.id}
                          onClick={h.column.getToggleSortingHandler()}
                          style={h.column.getCanSort() ? { cursor: "pointer" } : undefined}
                          aria-sort={
                            h.column.getIsSorted() === "asc"
                              ? "ascending"
                              : h.column.getIsSorted() === "desc"
                                ? "descending"
                                : undefined
                          }
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {h.column.getIsSorted() === "asc"
                            ? " ▲"
                            : h.column.getIsSorted() === "desc"
                              ? " ▼"
                              : ""}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length}>
                        <div className="os-table__empty" role="status">
                          <span>אין לידים להצגה</span>
                          <span className="os-table__empty-reason">
                            הסינון הנוכחי לא תואם אף ליד — נקו את הסינון או צרו ליד חדש.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <tr
                        key={row.id}
                        className={`os-table__row--clickable crm-lead-row${
                          selectedLeadId === row.original.id ? " is-selected" : ""
                        }`}
                        tabIndex={0}
                        aria-label={`פתיחת פרטי הליד ${row.original.name}`}
                        onClick={() => setSelectedLeadId(row.original.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedLeadId(row.original.id);
                          }
                        }}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="os-table__footer">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "var(--os-space-3)",
                }}
              >
                <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)" }}>
                  <span className="os-num">{filtered.length}</span> לידים ·{" "}
                  <span className="os-num">
                    עמוד {table.getState().pagination.pageIndex + 1} מתוך{" "}
                    {Math.max(1, table.getPageCount())}
                  </span>
                </span>
                <span style={{ display: "flex", gap: "var(--os-space-2)" }}>
                  {table.getCanPreviousPage() ? (
                    <OsButton variant="ghost" size="sm" onClick={() => table.previousPage()}>
                      הקודם
                    </OsButton>
                  ) : (
                    <OsButton variant="ghost" size="sm" disabled disabledReason="זהו העמוד הראשון">
                      הקודם
                    </OsButton>
                  )}
                  {table.getCanNextPage() ? (
                    <OsButton variant="ghost" size="sm" onClick={() => table.nextPage()}>
                      הבא
                    </OsButton>
                  ) : (
                    <OsButton variant="ghost" size="sm" disabled disabledReason="זהו העמוד האחרון">
                      הבא
                    </OsButton>
                  )}
                </span>
              </div>
            </div>
          </div>
        </Panel>
      ) : (
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="לקוחות" subtitle="לחיצה על שורה פותחת תצוגת לקוח מהירה — הכרטיס המלא (360°) לפי דרישה" />
          <DataTable<Customer>
            rows={customers}
            rowKey="id"
            onRowClick={(c) => setSelectedCustomerId(c.id)}
            rowClassName={(c) => (selectedCustomerId === c.id ? "crm-row--selected" : "")}
            emptyText="אין לקוחות להצגה"
            emptyReason="טרם נוצרו לקוחות במערכת."
            columns={[
              { key: "name", header: "שם" },
              { key: "type", header: "סוג" },
              { key: "city", header: "עיר" },
              {
                key: "revenue",
                header: "הכנסות",
                render: (c) => (
                  <span className="os-num">{c.revenue.toLocaleString("he-IL")} ₪</span>
                ),
              },
              { key: "contactState", header: "מצב קשר" },
            ]}
          />
        </Panel>
      )}

      {createKind === "lead" && (
        <CreateModal
          title="ליד חדש"
          errors={createErrors}
          onClose={() => {
            setCreateKind(null);
            setCreateErrors({});
          }}
          onSubmit={submitCreate}
          fields={[
            { name: "name", label: "שם מלא", type: "text" },
            { name: "phone", label: "טלפון", type: "text" },
            { name: "email", label: "אימייל", type: "text" },
            {
              name: "source",
              label: "מקור",
              type: "select",
              options: ["אתר", "וואטסאפ", "טלפון", "פייסבוק", "אינסטגרם", "המלצה", "לקוח חוזר"],
            },
            { name: "interest", label: "תחום עניין", type: "text" },
            { name: "notes", label: "הערות", type: "textarea" },
          ]}
        />
      )}
      {createKind === "customer" && (
        <CreateModal
          title="לקוח חדש"
          errors={createErrors}
          onClose={() => {
            setCreateKind(null);
            setCreateErrors({});
          }}
          onSubmit={submitCreate}
          fields={[
            { name: "name", label: "שם הלקוח", type: "text" },
            {
              name: "type",
              label: "סוג",
              type: "select",
              options: ["פרטי", "עסק", "בית ספר", "ארגון"],
            },
            { name: "phone", label: "טלפון", type: "text" },
            { name: "email", label: "אימייל", type: "text" },
            { name: "city", label: "עיר", type: "text" },
          ]}
        />
      )}
      {statusLead && <StatusModal lead={statusLead} onClose={() => setStatusLead(null)} />}

      {/* Lead detail — on demand, in a drawer (not a permanent panel). Holds the
          secondary actions (status update, owner reassignment) and the activity
          history behind an accordion. */}
      <Drawer
        open={detailLead !== null}
        onClose={() => setSelectedLeadId(null)}
        title={detailLead ? `ליד — ${detailLead.name}` : "ליד"}
      >
        {detailLead && (
          <>
            <div className="crm-drawer__field">
              <span className="crm-drawer__label">סטטוס</span>
              <span className="crm-drawer__value">
                <StatusChip
                  status={leadChip(detailLead.status).chip}
                  label={leadChip(detailLead.status).label}
                />
              </span>
            </div>
            <div className="crm-drawer__field">
              <span className="crm-drawer__label">מקור</span>
              <span className="crm-drawer__value">{detailLead.source}</span>
            </div>
            <div className="crm-drawer__field">
              <span className="crm-drawer__label">תחום עניין</span>
              <span className="crm-drawer__value">{detailLead.interest}</span>
            </div>
            <div className="crm-drawer__field">
              <span className="crm-drawer__label">מעקב הבא</span>
              <span className="crm-drawer__value os-num">{dateHe(detailLead.followUp)}</span>
            </div>
            <div className="crm-drawer__field">
              <label className="crm-drawer__label" htmlFor="crm-drawer-owner">
                בעלים
              </label>
              <select
                id="crm-drawer-owner"
                style={selStyle}
                value={detailLead.ownerId}
                aria-label={`שיוך בעלים לליד ${detailLead.name}`}
                onChange={(e) => void assignOwner(detailLead, e.target.value)}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <details className="crm-drawer__disclosure">
              <summary>היסטוריית פעילות ({detailLead.history.length})</summary>
              <div
                style={{
                  display: "grid",
                  gap: 6,
                  marginBlockStart: "var(--os-space-3)",
                  fontSize: "var(--os-text-md, 14px)",
                  color: "var(--os-text-2)",
                }}
              >
                {detailLead.history.length === 0 ? (
                  <span>אין רשומות היסטוריה לליד זה.</span>
                ) : (
                  detailLead.history.map((h, i) => (
                    <div key={i}>
                      <span className="os-num">{dateHe(h.date)}</span> · {h.text}
                    </div>
                  ))
                )}
                {detailLead.notes && <div>הערות: {detailLead.notes}</div>}
              </div>
            </details>

            <div className="crm-drawer__actions">
              <OsButton onClick={() => setStatusLead(detailLead)}>עדכון סטטוס</OsButton>
            </div>
          </>
        )}
      </Drawer>

      {/* Customer quick view — summary in a drawer; the full 360° card opens on
          demand (activity/evidence live there, never a permanent panel here). */}
      <Drawer
        open={detailCustomer !== null}
        onClose={() => setSelectedCustomerId(null)}
        title={detailCustomer ? `לקוח — ${detailCustomer.name}` : "לקוח"}
      >
        {detailCustomer && (
          <>
            <div className="crm-drawer__field">
              <span className="crm-drawer__label">סוג</span>
              <span className="crm-drawer__value">{detailCustomer.type}</span>
            </div>
            <div className="crm-drawer__field">
              <span className="crm-drawer__label">עיר</span>
              <span className="crm-drawer__value">{detailCustomer.city}</span>
            </div>
            <div className="crm-drawer__field">
              <span className="crm-drawer__label">הכנסות</span>
              <span className="crm-drawer__value os-num">
                {detailCustomer.revenue.toLocaleString("he-IL")} ₪
              </span>
            </div>
            <div className="crm-drawer__field">
              <span className="crm-drawer__label">מצב קשר</span>
              <span className="crm-drawer__value">{detailCustomer.contactState}</span>
            </div>

            <details className="crm-drawer__disclosure">
              <summary>פעילות ומסמכים</summary>
              <div
                style={{
                  marginBlockStart: "var(--os-space-3)",
                  fontSize: "var(--os-text-md, 14px)",
                  color: "var(--os-text-2)",
                }}
              >
                היסטוריית הפעילות, המסמכים והראיות של הלקוח מוצגים בכרטיס הלקוח המלא.
              </div>
            </details>

            <div className="crm-drawer__actions">
              <OsButton
                variant="cyan"
                onClick={() => void navigate(`/customers/${detailCustomer.id}`)}
              >
                פתח כרטיס לקוח מלא (360°)
              </OsButton>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}
