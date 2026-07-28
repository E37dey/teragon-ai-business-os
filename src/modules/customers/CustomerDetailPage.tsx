// Wave 3 — כרטיס לקוח 360° (/customers/:id): identity header + 9 working tabs,
// every tab reads real repository data with honest empty states.
import { useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";
import {
  DataTable,
  Drawer,
  EmptyState,
  KpiCard,
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
import type {
  Activity,
  Contact,
  Course,
  Customer,
  CustomerPrinter,
  Document,
  Opportunity,
  Organization,
  PrinterModel,
  Quotation,
  ServiceTicket,
  Task,
  User,
} from "@/domain/types";
import { CEO_USER_ID } from "@/repositories/seed";
import { quoteTotals } from "@/modules/quotations/quoteMath";
import { ils, dateHe, dateTimeHe } from "@/modules/quotations/fmt";
import { customerOpenItems, customerTimeline, tasksForCustomer } from "./selectors";
import { Customer360MemoryTab } from "./Customer360MemoryTab";

const railTitle: CSSProperties = {
  fontSize: "var(--os-text-2xs, 11px)",
  fontWeight: 600,
  color: "var(--os-text-2)",
  marginBlockEnd: 6,
  letterSpacing: "0.04em",
};

const TAB_ITEMS = [
  { id: "timeline", label: "ציר זמן" },
  { id: "contact", label: "פרטי קשר" },
  { id: "printers", label: "מדפסות" },
  { id: "courses", label: "קורסים" },
  { id: "quotes", label: "הצעות מחיר" },
  { id: "tickets", label: "קריאות שירות" },
  { id: "documents", label: "מסמכים" },
  { id: "tasks", label: "משימות" },
  { id: "memory", label: "זיכרון לקוח" },
] as const;

type TabId = (typeof TAB_ITEMS)[number]["id"];

function entityChip(status: Customer["status"]): ReactElement {
  if (status === "פעיל") return <StatusChip status="פעיל" />;
  if (status === "לא פעיל") return <StatusChip status="מושבת" label="לא פעיל" />;
  return <StatusChip status="מושבת" label="בארכיון" />;
}

const contactEditSchema = z.object({
  phone: z.string().min(1, "טלפון הוא שדה חובה"),
  email: z.string().min(1, "אימייל הוא שדה חובה"),
  city: z.string(),
  contactState: z.enum(["פעיל", "ממתין למענה", "לא פעיל"]),
});

function ticketChip(status: ServiceTicket["status"]): ReactElement {
  const map: Record<string, { chip: OsStatus; label: string }> = {
    חדש: { chip: "פעיל", label: "חדש" },
    בבדיקה: { chip: "ממתין", label: "בבדיקה" },
    "ממתין ללקוח": { chip: "אזהרה", label: "ממתין ללקוח" },
    "ממתין לחלק": { chip: "אזהרה", label: "ממתין לחלק" },
    טופל: { chip: "הושלם", label: "טופל" },
    נסגר: { chip: "הושלם", label: "נסגר" },
  };
  const m = map[status] ?? { chip: "ממתין" as OsStatus, label: status };
  return <StatusChip status={m.chip} label={m.label} />;
}

export default function CustomerDetailPage(): ReactElement {
  const { id } = useParams();
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [tab, setTab] = useState<TabId>("timeline");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const customersQ = useCollection<Customer>("customers");
  const orgsQ = useCollection<Organization>("organizations");
  const contactsQ = useCollection<Contact>("contacts");
  const printersQ = useCollection<CustomerPrinter>("customerPrinters");
  const modelsQ = useCollection<PrinterModel>("printerModels");
  const coursesQ = useCollection<Course>("courses");
  const quotationsQ = useCollection<Quotation>("quotations");
  const ticketsQ = useCollection<ServiceTicket>("serviceTickets");
  const documentsQ = useCollection<Document>("documents");
  const tasksQ = useCollection<Task>("tasks");
  const activitiesQ = useCollection<Activity>("activities");
  const usersQ = useCollection<User>("users");
  const oppsQ = useCollection<Opportunity>("opportunities");

  const customers = customersQ.data ?? [];
  const customer = customers.find((c) => c.id === id);

  const contacts = (contactsQ.data ?? []).filter((c) => c.customerId === id);
  const printers = (printersQ.data ?? []).filter((p) => p.customerId === id);
  const models = modelsQ.data ?? [];
  const courses = coursesQ.data ?? [];
  const quotations = (quotationsQ.data ?? []).filter((q) => q.customerId === id);
  const tickets = (ticketsQ.data ?? []).filter((t) => t.customerId === id);
  const documents = documentsQ.data ?? [];
  const tasks = tasksQ.data ?? [];
  const activities = activitiesQ.data ?? [];
  const users = usersQ.data ?? [];
  const opps = (oppsQ.data ?? []).filter((o) => o.customerId === id);

  const allQuotations = quotationsQ.data ?? [];
  const allTickets = ticketsQ.data ?? [];

  // demo-scale data: plain derivation each render (pure selectors, no memo needed)
  const timeline = customer
    ? customerTimeline(customer, activities, allTickets, allQuotations)
    : [];
  const customerTasks = customer
    ? tasksForCustomer(customer, tasks, allTickets, allQuotations)
    : [];
  const openItems = customer
    ? customerOpenItems(customer, allTickets, allQuotations, tasks)
    : { openTickets: 0, openQuotes: 0, openTasks: 0 };

  const isLoading = customersQ.isLoading;
  const isError = customersQ.isError;

  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title="טעינת כרטיס הלקוח נכשלה"
        reason="קריאת הנתונים מ-IndexedDB המקומי נכשלה. רעננו את הדף."
      />
    );
  }
  if (isLoading) {
    return (
      <div style={{ padding: "var(--os-space-6)", color: "var(--os-text-2)" }} role="status">
        טוען את כרטיס הלקוח מהמאגר המקומי…
      </div>
    );
  }
  if (!customer) {
    return (
      <EmptyState
        icon="users"
        title="לקוח לא נמצא"
        reason={`אין לקוח עם המזהה «${id ?? ""}» במאגר. ייתכן שנמחק או שהקישור שגוי.`}
        action={
          <Link to="/customers" style={{ color: "var(--os-cyan-text)" }}>
            חזרה לרשימת הלקוחות
          </Link>
        }
      />
    );
  }

  const org = (orgsQ.data ?? []).find((o) => o.id === customer.organizationId);
  const ownerId = opps[0]?.ownerId ?? CEO_USER_ID;
  const ownerName = users.find((u) => u.id === ownerId)?.name ?? ownerId;

  // next action: earliest open task, else earliest open quote expiry, else honest none
  const openTask = customerTasks
    .filter((t) => t.status === "פתוחה" || t.status === "בתהליך")
    .sort((a, b) => (a.due < b.due ? -1 : 1))[0];
  const openQuote = quotations
    .filter((q) => q.status === "טיוטה" || q.status === "נשלחה")
    .sort((a, b) => (a.validUntil < b.validUntil ? -1 : 1))[0];
  const actionRequired = Boolean(openTask || openQuote);
  const nextAction = openTask
    ? `${openTask.title} · עד ${dateHe(openTask.due)}`
    : openQuote
      ? `מעקב הצעה «${openQuote.title}» · בתוקף עד ${dateHe(openQuote.validUntil)}`
      : "אין פעולה מתוכננת — קבעו את הצעד הבא";

  const customerCourses = courses.filter((c) => customer.courseNames.includes(c.name));
  const courseIds = new Set(customerCourses.map((c) => c.id));
  const customerDocs = documents.filter((d) => d.courseId !== null && courseIds.has(d.courseId));

  const startEdit = (): void => {
    setEditValues({
      phone: customer.phone,
      email: customer.email,
      city: customer.city,
      contactState: customer.contactState,
    });
    setEditErrors({});
    setEditing(true);
  };

  const saveEdit = async (): Promise<void> => {
    const parsed = contactEditSchema.safeParse(editValues);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = String(i.path[0] ?? "");
        if (k && !(k in errs)) errs[k] = i.message;
      }
      setEditErrors(errs);
      return;
    }
    setBusy(true);
    try {
      await getRepository<Customer>("customers").update(customer.id, {
        ...parsed.data,
        updatedAt: new Date().toISOString(),
      });
      await invalidate(["customers"]);
      toast("פרטי הקשר עודכנו", "success");
      setEditing(false);
    } catch {
      toast("שמירת הפרטים נכשלה — נסו שוב", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: "var(--os-space-5)" }} data-testid="customer-detail">
      <PageRail>
        <div style={{ display: "grid", gap: "var(--os-space-5)" }}>
          <div>
            <div style={railTitle}>מצב הקשר</div>
            <div style={{ display: "grid", gap: 6, fontSize: "var(--os-text-sm, 12px)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>מצב</span>
                <span>{customer.contactState}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>הכנסות מצטברות</span>
                <span className="os-num" style={{ color: "var(--success-text)" }}>
                  {ils(customer.revenue)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>ביקורת</span>
                <span>
                  {customer.review ? `${customer.review.rating}/5 ★` : "טרם התקבלה ביקורת"}
                </span>
              </div>
            </div>
          </div>
          <div>
            <div style={railTitle}>ראיות והיסטוריה</div>
            <OsButton size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
              פתחו ציר ראיות ({timeline.length})
            </OsButton>
          </div>
        </div>
      </PageRail>

      {/* identity header */}
      <Panel variant="raised" style={{ padding: "var(--os-space-5)" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "var(--os-space-4)",
            alignItems: "flex-start",
          }}
        >
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ display: "flex", gap: "var(--os-space-3)", alignItems: "center" }}>
              <h1 style={{ margin: 0, fontSize: "var(--os-text-xl, 20px)" }}>{customer.name}</h1>
              {entityChip(customer.status)}
              <span
                className="os-num"
                style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs, 11px)" }}
              >
                {customer.id}
              </span>
            </div>
            <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-md, 14px)" }}>
              {customer.type}
              {org ? ` · ${org.name}` : ""} · {customer.city}
            </div>
          </div>
          <div style={{ fontSize: "var(--os-text-md, 14px)", textAlign: "start" }}>
            <span style={{ color: "var(--os-muted)" }}>בעלים: </span>
            {ownerName}
          </div>
        </div>

        {/* NEXT ACTION — the operator's primary cue. Amber only when an action is
            actually required; calm neutral surface otherwise (no default glow). */}
        <div
          style={{
            display: "flex",
            gap: "var(--os-space-3)",
            alignItems: "center",
            flexWrap: "wrap",
            marginBlockStart: "var(--os-space-4)",
            padding: "var(--os-space-3) var(--os-space-4)",
            borderRadius: "var(--os-radius-md)",
            border: `1px solid ${actionRequired ? "var(--os-warning-border)" : "var(--os-border)"}`,
            background: actionRequired ? "var(--os-warning-soft)" : "transparent",
            fontSize: "var(--os-text-md, 14px)",
          }}
        >
          <span
            style={{
              color: actionRequired ? "var(--warning-text)" : "var(--os-muted)",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            הפעולה הבאה
          </span>
          <span>{nextAction}</span>
        </div>
      </Panel>

      {/* VC-C: ≤4 primary KPIs — only the action-driving open-work counts. Each
          stays amber only while it needs attention; a zero is neutral (muted),
          not success and not attention. No default glow. Passive totals
          (revenue, printers, satisfaction) move to "מדדים נוספים" below. */}
      <div
        data-testid="customer-metrics"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--os-space-3)",
        }}
      >
        <KpiCard
          title="הצעות מחיר פתוחות"
          value={openItems.openQuotes}
          accent="warning"
          icon="doc"
          muted={openItems.openQuotes === 0}
        />
        <KpiCard
          title="קריאות שירות פתוחות"
          value={openItems.openTickets}
          accent="warning"
          icon="wrench"
          muted={openItems.openTickets === 0}
        />
        <KpiCard
          title="משימות פתוחות"
          value={openItems.openTasks}
          accent="warning"
          icon="clock"
          muted={openItems.openTasks === 0}
        />
      </div>

      <details data-testid="customer-more-metrics" className="os-more-metrics">
        <summary>מדדים נוספים</summary>
        <div className="os-more-metrics__grid">
          <div className="os-more-metrics__item">
            <span>הכנסות מצטברות</span>
            <span className="os-num">{ils(customer.revenue)}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>מדפסות רשומות</span>
            <span className="os-num">{printers.length}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>שביעות רצון</span>
            <span className="os-num">
              {customer.review ? `${customer.review.rating}/5` : "טרם נמדד"}
            </span>
          </div>
          <div className="os-more-metrics__item">
            <span>מצב קשר</span>
            <span>{customer.contactState}</span>
          </div>
        </div>
      </details>

      <Tabs
        ariaLabel="כרטיס לקוח"
        items={TAB_ITEMS.map((t) => ({ ...t }))}
        activeId={tab}
        onChange={(next) => setTab(next as TabId)}
      />

      {tab === "timeline" && (
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="ציר זמן" subtitle="פעילויות, קריאות שירות והצעות מחיר — כרונולוגי" />
          <div
            style={{
              display: "grid",
              gap: "var(--os-space-2)",
              marginBlockStart: "var(--os-space-3)",
            }}
          >
            {timeline.length === 0 ? (
              <EmptyState
                icon="clock"
                title="אין אירועים בציר הזמן"
                reason="ללקוח זה אין עדיין פעילויות, קריאות או הצעות מתועדות."
              />
            ) : (
              timeline.map((e) => (
                <div
                  key={e.id}
                  style={{
                    display: "flex",
                    gap: "var(--os-space-3)",
                    fontSize: "var(--os-text-sm, 13px)",
                    borderBlockEnd: "1px solid var(--os-border)",
                    paddingBlockEnd: 6,
                  }}
                >
                  <span className="os-num" style={{ color: "var(--os-cyan-text)", minInlineSize: 84 }}>
                    {dateTimeHe(e.at)}
                  </span>
                  <span style={{ color: "var(--os-muted)", minInlineSize: 80 }}>{e.kind}</span>
                  <span>{e.text}</span>
                </div>
              ))
            )}
          </div>
        </Panel>
      )}

      {tab === "contact" && (
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle
            title="פרטי קשר"
            action={
              editing ? undefined : (
                <OsButton size="sm" variant="ghost" onClick={startEdit}>
                  עריכה
                </OsButton>
              )
            }
          />
          {editing ? (
            <form
              className="os-qc-form"
              noValidate
              style={{ marginBlockStart: "var(--os-space-3)", maxInlineSize: 420 }}
              onSubmit={(e) => {
                e.preventDefault();
                void saveEdit();
              }}
            >
              {(
                [
                  { name: "phone", label: "טלפון" },
                  { name: "email", label: "אימייל" },
                  { name: "city", label: "עיר" },
                ] as const
              ).map((f) => (
                <div key={f.name} className="os-qc-field">
                  <label className="os-qc-label" htmlFor={`edit-${f.name}`}>
                    {f.label}
                  </label>
                  <input
                    id={`edit-${f.name}`}
                    className="os-qc-input"
                    type="text"
                    value={editValues[f.name] ?? ""}
                    onChange={(e) => setEditValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  />
                  {editErrors[f.name] && (
                    <span className="os-qc-error" role="alert">
                      {editErrors[f.name]}
                    </span>
                  )}
                </div>
              ))}
              <div className="os-qc-field">
                <label className="os-qc-label" htmlFor="edit-contactState">
                  מצב קשר
                </label>
                <select
                  id="edit-contactState"
                  className="os-qc-input"
                  value={editValues["contactState"] ?? "פעיל"}
                  onChange={(e) => setEditValues((v) => ({ ...v, contactState: e.target.value }))}
                >
                  {(["פעיל", "ממתין למענה", "לא פעיל"] as const).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="os-qc-actions">
                {busy ? (
                  <OsButton type="submit" disabled disabledReason="שמירה מתבצעת…">
                    שומר…
                  </OsButton>
                ) : (
                  <OsButton type="submit">שמירה</OsButton>
                )}
                <OsButton variant="ghost" onClick={() => setEditing(false)}>
                  ביטול
                </OsButton>
              </div>
            </form>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 8,
                marginBlockStart: "var(--os-space-3)",
                fontSize: "var(--os-text-sm, 13px)",
              }}
            >
              <div>
                טלפון: <span className="os-ltr os-num">{customer.phone}</span>
              </div>
              <div>
                אימייל: <span className="os-ltr">{customer.email}</span>
              </div>
              <div>עיר: {customer.city}</div>
              <div>מצב קשר: {customer.contactState}</div>
            </div>
          )}
          <div style={{ marginBlockStart: "var(--os-space-5)" }}>
            <SectionTitle title="אנשי קשר" />
            {contacts.length === 0 ? (
              <EmptyState
                title="אין אנשי קשר נוספים"
                reason="ללקוח זה לא הוגדרו אנשי קשר מעבר לפרטי הלקוח הראשיים."
              />
            ) : (
              <DataTable<Contact>
                rows={contacts}
                rowKey="id"
                columns={[
                  { key: "name", header: "שם" },
                  { key: "role", header: "תפקיד" },
                  {
                    key: "phone",
                    header: "טלפון",
                    render: (c) => <span className="os-ltr os-num">{c.phone}</span>,
                  },
                  {
                    key: "email",
                    header: "אימייל",
                    render: (c) => <span className="os-ltr">{c.email}</span>,
                  },
                  {
                    key: "isPrimary",
                    header: "ראשי",
                    render: (c) => (c.isPrimary ? "כן" : "לא"),
                  },
                ]}
              />
            )}
          </div>
        </Panel>
      )}

      {tab === "printers" && (
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="מדפסות הלקוח" />
          {printers.length === 0 ? (
            <EmptyState
              icon="printer"
              title="אין מדפסות רשומות"
              reason="ללקוח זה לא רשומה מדפסת. מדפסות נרשמות בעת מסירת עסקה או קריאת שירות."
            />
          ) : (
            <DataTable<CustomerPrinter>
              rows={printers}
              rowKey="id"
              columns={[
                {
                  key: "printerModelId",
                  header: "דגם",
                  render: (p) =>
                    models.find((m) => m.id === p.printerModelId)?.name ?? p.printerModelId,
                },
                {
                  key: "serialNumber",
                  header: "מס' סידורי",
                  render: (p) => <span className="os-ltr os-num">{p.serialNumber}</span>,
                },
                {
                  key: "purchasedAt",
                  header: "נרכשה",
                  render: (p) => <span className="os-num">{dateHe(p.purchasedAt)}</span>,
                },
                {
                  key: "underWarranty",
                  header: "אחריות",
                  render: (p) =>
                    p.underWarranty ? (
                      <StatusChip status="פעיל" label="באחריות" />
                    ) : (
                      <StatusChip status="מושבת" label="פגה" />
                    ),
                },
                { key: "notes", header: "הערות" },
              ]}
            />
          )}
        </Panel>
      )}

      {tab === "courses" && (
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="קורסים" />
          {customerCourses.length === 0 ? (
            <EmptyState
              icon="graduation"
              title="הלקוח לא רשום לקורסים"
              reason="ללקוח זה אין קורסים משויכים. שיוך קורס נעשה בעת הרשמה."
            />
          ) : (
            <DataTable<Course>
              rows={customerCourses}
              rowKey="id"
              columns={[
                { key: "name", header: "קורס" },
                {
                  key: "start",
                  header: "התחלה",
                  render: (c) => <span className="os-num">{dateHe(c.start)}</span>,
                },
                {
                  key: "end",
                  header: "סיום",
                  render: (c) => <span className="os-num">{dateHe(c.end)}</span>,
                },
                { key: "status", header: "סטטוס" },
                {
                  key: "price",
                  header: "מחיר",
                  render: (c) => <span className="os-num">{ils(c.price)}</span>,
                },
              ]}
            />
          )}
        </Panel>
      )}

      {tab === "quotes" && (
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="הצעות מחיר" />
          {quotations.length === 0 ? (
            <EmptyState
              icon="doc"
              title="אין הצעות מחיר"
              reason="ללקוח זה לא הופקו הצעות מחיר. ניתן ליצור הצעה במסך המסמכים."
            />
          ) : (
            <DataTable<Quotation>
              rows={quotations}
              rowKey="id"
              columns={[
                { key: "title", header: "כותרת" },
                { key: "status", header: "סטטוס" },
                {
                  key: "total",
                  header: 'סה"כ (כולל מע"מ)',
                  render: (q) => (
                    <span className="os-num">
                      {ils(quoteTotals(q.lines, q.discountPercent).grandTotal)}
                    </span>
                  ),
                },
                {
                  key: "validUntil",
                  header: "בתוקף עד",
                  render: (q) => <span className="os-num">{dateHe(q.validUntil)}</span>,
                },
              ]}
            />
          )}
        </Panel>
      )}

      {tab === "tickets" && (
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="קריאות שירות" />
          {tickets.length === 0 ? (
            <EmptyState
              icon="wrench"
              title="אין קריאות שירות"
              reason="ללקוח זה לא נפתחו קריאות שירות."
            />
          ) : (
            <DataTable<ServiceTicket>
              rows={tickets}
              rowKey="id"
              columns={[
                { key: "issue", header: "תקלה" },
                { key: "printer", header: "מדפסת" },
                { key: "priority", header: "עדיפות" },
                { key: "status", header: "סטטוס", render: (t) => ticketChip(t.status) },
                {
                  key: "openedAt",
                  header: "נפתחה",
                  render: (t) => <span className="os-num">{dateHe(t.openedAt)}</span>,
                },
                { key: "solution", header: "פתרון" },
              ]}
            />
          )}
        </Panel>
      )}

      {tab === "documents" && (
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="מסמכים" subtitle="מסמכים של הקורסים שהלקוח רשום אליהם" />
          {customerDocs.length === 0 ? (
            <EmptyState
              icon="doc"
              title="אין מסמכים משויכים"
              reason="ללקוח זה אין מסמכים — מסמכים משויכים דרך הקורסים שהלקוח רשום אליהם."
            />
          ) : (
            <DataTable<Document>
              rows={customerDocs}
              rowKey="id"
              columns={[
                { key: "name", header: "שם" },
                { key: "type", header: "סוג" },
                { key: "description", header: "תיאור" },
                {
                  key: "courseId",
                  header: "קורס",
                  render: (d) => courses.find((c) => c.id === d.courseId)?.name ?? "—",
                },
              ]}
            />
          )}
        </Panel>
      )}

      {tab === "tasks" && (
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="משימות" />
          {customerTasks.length === 0 ? (
            <EmptyState
              icon="clock"
              title="אין משימות מקושרות"
              reason="אין משימות שמפנות ללקוח זה או לישויות שלו (קריאות/הצעות)."
            />
          ) : (
            <DataTable<Task>
              rows={customerTasks}
              rowKey="id"
              columns={[
                { key: "title", header: "משימה" },
                { key: "status", header: "סטטוס" },
                { key: "priority", header: "עדיפות" },
                {
                  key: "due",
                  header: "יעד",
                  render: (t) => <span className="os-num">{dateHe(t.due)}</span>,
                },
                {
                  key: "ownerId",
                  header: "בעלים",
                  render: (t) => users.find((u) => u.id === t.ownerId)?.name ?? t.ownerId,
                },
              ]}
            />
          )}
        </Panel>
      )}

      {tab === "memory" && <Customer360MemoryTab customer={customer} />}

      {/* Secondary history/evidence on demand — kept out of the always-on view
          so the identity + next action + open work stay the focus. */}
      <Drawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="ציר ראיות והיסטוריה"
      >
        {timeline.length === 0 ? (
          <EmptyState
            icon="clock"
            title="אין אירועים מתועדים"
            reason="ללקוח זה אין עדיין פעילויות, קריאות או הצעות מתועדות."
          />
        ) : (
          <div style={{ display: "grid", gap: "var(--os-space-3)" }}>
            {timeline.map((e) => (
              <div
                key={e.id}
                style={{
                  display: "grid",
                  gap: 2,
                  fontSize: "var(--os-text-md, 14px)",
                  borderBlockEnd: "1px solid var(--os-border)",
                  paddingBlockEnd: "var(--os-space-2)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "var(--os-space-3)",
                    color: "var(--os-muted)",
                    fontSize: "var(--os-text-sm, 13px)",
                  }}
                >
                  <span className="os-num">{dateTimeHe(e.at)}</span>
                  <span>{e.kind}</span>
                </div>
                <span>{e.text}</span>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}
