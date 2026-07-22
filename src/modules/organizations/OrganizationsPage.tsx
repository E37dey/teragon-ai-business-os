// /organizations — ארגונים ומוסדות (Wave 4). Org registry + detail panel:
// contacts by department, printer fleet, training groups, quotations,
// documents, tasks & meetings and a cross-entity timeline. The demo org
// "בית ספר שבילי העמק" is seeded idempotently through the repositories.
import { useEffect, useMemo, useState } from "react";
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
  Contact,
  Customer,
  CustomerPrinter,
  CustomerType,
  Document,
  Enrollment,
  Meeting,
  Organization,
  PrinterModel,
  Quotation,
  ServiceTicket,
  Task,
} from "@/domain/types";
import { getRepository, nextId } from "@/repositories";
import { DEMO_DATA_LABEL } from "@/repositories/seed";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import {
  contactsByDepartment,
  DEMO_ORG_NAME,
  orgCustomers,
  orgEngagement,
  orgMeetings,
  orgOpenItems,
  orgSupportAgreementNote,
} from "./lib";

const kpiRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "var(--os-space-5)",
};

function fmtDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Disabled-with-reason props while an async action runs (OsButton honesty contract). */
function busyDisabled(
  busy: boolean,
  reason = "פעולה קודמת עדיין רצה",
): { disabled: true; disabledReason: string } | { disabled?: false } {
  return busy ? { disabled: true, disabledReason: reason } : {};
}

/**
 * Idempotent module seed (PAGE_CONTRACT: through repositories, labeled demo):
 * creates the demo school org + one linked customer + one contact, only when
 * an org with that name does not exist yet.
 */
async function ensureDemoOrg(): Promise<boolean> {
  const orgRepo = getRepository<Organization>("organizations");
  const orgs = await orgRepo.list();
  if (orgs.some((o) => o.name === DEMO_ORG_NAME)) return false;
  const now = new Date().toISOString();
  const org = await orgRepo.create({
    id: nextId(
      "org",
      orgs.map((o) => o.id),
    ),
    name: DEMO_ORG_NAME,
    type: "בית ספר",
    phone: "04-6543210",
    email: "office@shvily-haemek.edu",
    city: "עפולה",
    notes: `${DEMO_DATA_LABEL} — מגמת רובוטיקה, מעוניינים במעבדת תלת־ממד`,
    status: "פעיל",
    createdAt: now,
    updatedAt: now,
  });
  const custRepo = getRepository<Customer>("customers");
  const customers = await custRepo.list();
  let customer = customers.find((c) => c.name === DEMO_ORG_NAME);
  if (!customer) {
    customer = await custRepo.create({
      id: nextId(
        "cu",
        customers.map((c) => c.id),
      ),
      name: DEMO_ORG_NAME,
      type: "בית ספר",
      phone: "04-6543210",
      email: "office@shvily-haemek.edu",
      city: "עפולה",
      organizationId: org.id,
      printerSummary: "",
      courseNames: [],
      revenue: 0,
      contactState: "פעיל",
      review: null,
      status: "פעיל",
      createdAt: now,
      updatedAt: now,
    });
  }
  const contactRepo = getRepository<Contact>("contacts");
  const contacts = await contactRepo.list();
  if (!contacts.some((c) => c.customerId === customer.id)) {
    await contactRepo.create({
      id: nextId(
        "ct",
        contacts.map((c) => c.id),
      ),
      customerId: customer.id,
      name: "רחל אביטל",
      role: "רכזת מגמת רובוטיקה",
      phone: "052-7654321",
      email: "rachel@shvily-haemek.edu",
      isPrimary: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  return true;
}

export default function OrganizationsPage(): ReactElement {
  const orgsQ = useCollection<Organization>("organizations");
  const customersQ = useCollection<Customer>("customers");
  const contactsQ = useCollection<Contact>("contacts");
  const printersQ = useCollection<CustomerPrinter>("customerPrinters");
  const modelsQ = useCollection<PrinterModel>("printerModels");
  const enrollmentsQ = useCollection<Enrollment>("enrollments");
  const ticketsQ = useCollection<ServiceTicket>("serviceTickets");
  const tasksQ = useCollection<Task>("tasks");
  const meetingsQ = useCollection<Meeting>("meetings");
  const quotationsQ = useCollection<Quotation>("quotations");
  const documentsQ = useCollection<Document>("documents");
  const activitiesQ = useCollection<Activity>("activities");

  const invalidate = useInvalidateCollections();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");

  // idempotent demo-org seed (runs once per mount; no-op when it exists)
  useEffect(() => {
    void ensureDemoOrg().then((created) => {
      if (created) void invalidate(["organizations", "customers", "contacts"]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const orgs = useMemo(() => orgsQ.data ?? [], [orgsQ.data]);
  const customers = useMemo(() => customersQ.data ?? [], [customersQ.data]);
  const contacts = useMemo(() => contactsQ.data ?? [], [contactsQ.data]);
  const printers = useMemo(() => printersQ.data ?? [], [printersQ.data]);
  const models = useMemo(() => modelsQ.data ?? [], [modelsQ.data]);
  const enrollments = useMemo(() => enrollmentsQ.data ?? [], [enrollmentsQ.data]);
  const tickets = useMemo(() => ticketsQ.data ?? [], [ticketsQ.data]);
  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const meetings = useMemo(() => meetingsQ.data ?? [], [meetingsQ.data]);
  const quotations = useMemo(() => quotationsQ.data ?? [], [quotationsQ.data]);
  const documents = useMemo(() => documentsQ.data ?? [], [documentsQ.data]);
  const activities = useMemo(() => activitiesQ.data ?? [], [activitiesQ.data]);

  const engagements = useMemo(
    () =>
      orgs.map((o) =>
        orgEngagement(o, customers, printers, enrollments, tickets, tasks, quotations),
      ),
    [orgs, customers, printers, enrollments, tickets, tasks, quotations],
  );

  const totalOpen = engagements.reduce((s, e) => s + e.openItems, 0);
  const totalRevenue = engagements.reduce((s, e) => s + e.revenue, 0);
  const linkedCustomers = engagements.reduce((s, e) => s + e.customers, 0);
  const fleetSize = engagements.reduce((s, e) => s + e.printers, 0);

  const selected = orgs.find((o) => o.id === selectedId) ?? null;

  if (orgsQ.isError || customersQ.isError) {
    return (
      <EmptyState
        icon="alert"
        title="שגיאה בטעינת הארגונים"
        reason="קריאת ה-repositories נכשלה — נסו לרענן את הדף."
      />
    );
  }
  if (orgsQ.isLoading || customersQ.isLoading) {
    return (
      <Panel style={{ padding: "var(--os-space-8)", color: "var(--os-text-2)" }}>
        טוען ארגונים…
      </Panel>
    );
  }

  const rows = engagements.filter((e) => typeFilter === "all" || e.org.type === typeFilter);

  const columns: DataTableColumn<(typeof engagements)[number]>[] = [
    { key: "name", header: "ארגון", render: (e) => <b>{e.org.name}</b> },
    { key: "type", header: "סוג", render: (e) => e.org.type },
    { key: "city", header: "עיר", render: (e) => e.org.city },
    {
      key: "customers",
      header: "לקוחות",
      numeric: true,
      render: (e) => <span className="os-table__num">{e.customers}</span>,
    },
    {
      key: "printers",
      header: "מדפסות",
      numeric: true,
      render: (e) => <span className="os-table__num">{e.printers}</span>,
    },
    {
      key: "open",
      header: "פריטים פתוחים",
      render: (e) =>
        e.openItems > 0 ? (
          <StatusChip status="אזהרה" label={`${e.openItems} פתוחים`} />
        ) : (
          <StatusChip status="הושלם" label="אין פתוחים" />
        ),
    },
    {
      key: "revenue",
      header: "הכנסות",
      numeric: true,
      render: (e) => <span className="os-table__num">₪{e.revenue.toLocaleString("he-IL")}</span>,
    },
  ];

  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)" }}>
      <PageRail>
        <OrgsRail engagements={engagements} />
      </PageRail>

      <SectionTitle
        icon="building"
        title="ארגונים ומוסדות"
        subtitle={DEMO_DATA_LABEL}
        action={
          <OsButton icon="plus" onClick={() => setCreateOpen(true)}>
            ארגון חדש
          </OsButton>
        }
      />

      <div style={kpiRowStyle}>
        <KpiCard title="ארגונים" value={orgs.length} accent="cyan" icon="building" />
        <KpiCard title="לקוחות מקושרים" value={linkedCustomers} accent="blue" icon="users" />
        <KpiCard title="מדפסות בציי ארגונים" value={fleetSize} accent="violet" icon="printer" />
        <KpiCard
          title="פריטים פתוחים"
          value={totalOpen}
          accent="warning"
          icon="alert"
          glow={totalOpen > 0}
        />
        <KpiCard
          title="הכנסות מארגונים"
          value={`₪${totalRevenue.toLocaleString("he-IL")}`}
          accent="success"
          icon="briefcase"
        />
      </div>

      <div style={{ display: "flex", gap: "var(--os-space-4)" }}>
        <select
          className="os-qc-input"
          style={{ maxInlineSize: 200 }}
          aria-label="סינון סוג ארגון"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">כל הסוגים</option>
          <option value="עסק">עסק</option>
          <option value="בית ספר">בית ספר</option>
          <option value="ארגון">ארגון</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(e) => e.org.id}
        onRowClick={(e) => setSelectedId(e.org.id)}
        emptyText="אין ארגונים"
        emptyReason="לא נמצאו ארגונים בסינון הנוכחי."
      />

      {selected && (
        <OrgDrawer
          org={selected}
          customers={customers}
          contacts={contacts}
          printers={printers}
          models={models}
          enrollments={enrollments}
          tickets={tickets}
          tasks={tasks}
          meetings={meetings}
          quotations={quotations}
          documents={documents}
          activities={activities}
          onClose={() => setSelectedId(null)}
        />
      )}

      {createOpen && <NewOrgModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

// ── rail ────────────────────────────────────────────────────────────────────
function OrgsRail({
  engagements,
}: {
  engagements: readonly ReturnType<typeof orgEngagement>[];
}): ReactElement {
  const byOpen = [...engagements].sort((a, b) => b.openItems - a.openItems);
  const byRevenue = [...engagements].sort((a, b) => b.revenue - a.revenue);
  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)", fontSize: "var(--os-text-sm)" }}>
      <div>
        <div style={railTitle}>מעורבות — פריטים פתוחים</div>
        {byOpen.slice(0, 5).map((e) => (
          <div key={e.org.id} style={railRow}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {e.org.name}
            </span>
            <span
              className="os-num"
              style={{ color: e.openItems > 0 ? "var(--os-warning)" : "var(--os-muted)" }}
            >
              {e.openItems}
            </span>
          </div>
        ))}
      </div>
      <div>
        <div style={railTitle}>הכנסות מובילות</div>
        {byRevenue.slice(0, 5).map((e) => (
          <div key={e.org.id} style={railRow}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {e.org.name}
            </span>
            <span className="os-num" style={{ color: "var(--os-success)" }}>
              ₪{e.revenue.toLocaleString("he-IL")}
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
const railRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--os-space-3)",
  marginBlockEnd: "var(--os-space-3)",
};

// ── drawer ──────────────────────────────────────────────────────────────────
function OrgDrawer({
  org,
  customers,
  contacts,
  printers,
  models,
  enrollments,
  tickets,
  tasks,
  meetings,
  quotations,
  documents,
  activities,
  onClose,
}: {
  org: Organization;
  customers: readonly Customer[];
  contacts: readonly Contact[];
  printers: readonly CustomerPrinter[];
  models: readonly PrinterModel[];
  enrollments: readonly Enrollment[];
  tickets: readonly ServiceTicket[];
  tasks: readonly Task[];
  meetings: readonly Meeting[];
  quotations: readonly Quotation[];
  documents: readonly Document[];
  activities: readonly Activity[];
  onClose: () => void;
}): ReactElement {
  const [tab, setTab] = useState("overview");
  const members = orgCustomers(org, customers);
  const memberIds = new Set(members.map((c) => c.id));
  const memberNames = new Set(members.map((c) => c.name));
  const departments = contactsByDepartment(org, customers, contacts);
  const openItems = orgOpenItems(org, customers, tickets, tasks, quotations);
  const fleet = printers.filter((p) => memberIds.has(p.customerId));
  const orgQuotes = quotations.filter(
    (q) => (q.customerId && memberIds.has(q.customerId)) || memberNames.has(q.customerName),
  );
  const orgTasks = tasks.filter((t) =>
    t.relatedRef ? [...memberIds].some((id) => t.relatedRef?.endsWith(`:${id}`)) : false,
  );
  const orgMeets = orgMeetings(org, customers, meetings);
  const trainingGroups = enrollments.filter((e) => memberNames.has(e.studentName));
  const timeline = activities
    .filter((a) => {
      if (!a.entityRef) return false;
      if ([...memberIds].some((id) => a.entityRef?.endsWith(`:${id}`))) return true;
      const linkedTickets = tickets.filter((t) => t.customerId && memberIds.has(t.customerId));
      return linkedTickets.some((t) => a.entityRef === `ticket:${t.id}`);
    })
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Drawer open onClose={onClose} title={org.name}>
      <div style={{ display: "grid", gap: "var(--os-space-5)" }}>
        <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
          {org.type} · {org.city} · <span dir="ltr">{org.phone}</span>
          <br />
          {org.notes}
        </div>

        <Tabs
          ariaLabel="כרטיסיית פרטי הארגון"
          items={[
            { id: "overview", label: "סקירה" },
            { id: "fleet", label: "מדפסות", badge: fleet.length },
            { id: "quotes", label: "הצעות", badge: orgQuotes.length },
            { id: "work", label: "משימות ופגישות", badge: orgTasks.length + orgMeets.length },
            { id: "docs", label: "מסמכים" },
            { id: "timeline", label: "ציר זמן", badge: timeline.length },
          ]}
          activeId={tab}
          onChange={setTab}
        />

        {tab === "overview" && (
          <div style={{ display: "grid", gap: "var(--os-space-4)" }}>
            <Panel
              variant="raised"
              style={{ padding: "var(--os-space-4)", display: "grid", gap: 4 }}
            >
              {(
                [
                  ["לקוחות מקושרים", members.length],
                  ["קבוצות הדרכה (רישומי קורס)", trainingGroups.length],
                  ["פריטים פתוחים", openItems.total],
                ] as const
              ).map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--os-muted)" }}>{label}</span>
                  <span className="os-num">{value}</span>
                </div>
              ))}
            </Panel>
            <div>
              <SectionTitle icon="users" title="אנשי קשר לפי מחלקה" />
              {departments.size === 0 && (
                <EmptyState
                  title="אין אנשי קשר"
                  reason="לא הוגדרו אנשי קשר ללקוחות המקושרים לארגון."
                />
              )}
              {[...departments.entries()].map(([dept, list]) => (
                <div key={dept} style={{ marginBlockEnd: "var(--os-space-4)" }}>
                  <div style={{ color: "var(--os-cyan)", fontSize: "var(--os-text-xs)" }}>
                    {dept}
                  </div>
                  {list.map((c) => (
                    <div
                      key={c.id}
                      style={{ fontSize: "var(--os-text-sm)", display: "flex", gap: 8 }}
                    >
                      <span>{c.name}</span>
                      {c.isPrimary && <StatusChip status="פעיל" label="ראשי" />}
                      <span style={{ color: "var(--os-muted)" }} dir="ltr">
                        {c.phone}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div>
              <SectionTitle icon="shield" title="הסכמי תמיכה" />
              <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
                {orgSupportAgreementNote()}
              </div>
            </div>
          </div>
        )}

        {tab === "fleet" &&
          (fleet.length === 0 ? (
            <EmptyState title="אין מדפסות" reason="ללקוחות הארגון אין מדפסות רשומות בצי." />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {fleet.map((p) => {
                const model = models.find((m) => m.id === p.printerModelId);
                return (
                  <Panel key={p.id} variant="raised" style={{ padding: "var(--os-space-4)" }}>
                    <div style={{ fontWeight: 600 }}>{model?.name ?? p.printerModelId}</div>
                    <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>
                      S/N <span className="os-num">{p.serialNumber}</span> · נרכשה{" "}
                      <span className="os-num">{fmtDate(p.purchasedAt)}</span>
                      {p.notes ? ` · ${p.notes}` : ""}
                    </div>
                  </Panel>
                );
              })}
            </div>
          ))}

        {tab === "quotes" &&
          (orgQuotes.length === 0 ? (
            <EmptyState title="אין הצעות מחיר" reason="לא נוצרו הצעות מחיר ללקוחות הארגון." />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {orgQuotes.map((q) => (
                <Panel key={q.id} variant="raised" style={{ padding: "var(--os-space-4)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>{q.title}</span>
                    <StatusChip
                      status={
                        q.status === "אושרה"
                          ? "הושלם"
                          : q.status === "נדחתה" || q.status === "פג תוקף"
                            ? "מושהה"
                            : "ממתין"
                      }
                      label={q.status}
                    />
                  </div>
                  <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
                    בתוקף עד <span className="os-num">{fmtDate(q.validUntil)}</span>
                  </div>
                </Panel>
              ))}
            </div>
          ))}

        {tab === "work" && (
          <div style={{ display: "grid", gap: "var(--os-space-4)" }}>
            <SectionTitle icon="check" title="משימות" />
            {orgTasks.length === 0 && (
              <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-sm)" }}>
                אין משימות מקושרות לארגון.
              </div>
            )}
            {orgTasks.map((t) => (
              <div key={t.id} style={{ fontSize: "var(--os-text-sm)", display: "flex", gap: 8 }}>
                <StatusChip
                  status={
                    t.status === "הושלמה" ? "הושלם" : t.status === "בתהליך" ? "פעיל" : "ממתין"
                  }
                  label={t.status}
                />
                <span>{t.title}</span>
              </div>
            ))}
            <SectionTitle icon="clock" title="פגישות" />
            {orgMeets.length === 0 && (
              <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-sm)" }}>
                אין פגישות מקושרות לארגון.
              </div>
            )}
            {orgMeets.map((m) => (
              <div key={m.id} style={{ fontSize: "var(--os-text-sm)" }}>
                📅 {m.title} ·{" "}
                <span className="os-num" dir="ltr">
                  {new Date(m.scheduledAt).toLocaleString("he-IL", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === "docs" && (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
              למסמכים אין קישור ארגוני בדומיין — מוצגים מסמכים גלויים בלבד (בקשת אינטגרציה W4).
            </div>
            {documents
              .filter((d) => d.visible)
              .map((d) => (
                <div key={d.id} style={{ fontSize: "var(--os-text-sm)" }}>
                  📄 {d.name}{" "}
                  <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
                    ({d.type})
                  </span>
                </div>
              ))}
          </div>
        )}

        {tab === "timeline" &&
          (timeline.length === 0 ? (
            <EmptyState
              title="אין אירועים"
              reason="לא נמצאו אירועי פעילות שמקושרים ללקוחות הארגון."
            />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {timeline.map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    gap: 8,
                    fontSize: "var(--os-text-sm)",
                    color: "var(--os-text-2)",
                    borderBlockEnd: "1px solid var(--os-border)",
                    paddingBlockEnd: 6,
                  }}
                >
                  <span className="os-num" style={{ color: "var(--os-muted)", minInlineSize: 70 }}>
                    {fmtDate(a.at)}
                  </span>
                  <span style={{ color: "var(--os-cyan)" }}>{a.kind}</span>
                  <span>{a.text}</span>
                </div>
              ))}
            </div>
          ))}
      </div>
    </Drawer>
  );
}

// ── create modal ────────────────────────────────────────────────────────────
function NewOrgModal({ onClose }: { onClose: () => void }): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomerType>("עסק");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (): void => {
    if (name.trim().length < 2) {
      setErrorMsg("שם ארגון חייב להכיל לפחות 2 תווים");
      return;
    }
    setBusy(true);
    const repo = getRepository<Organization>("organizations");
    void repo
      .list()
      .then((all) => {
        if (all.some((o) => o.name === name.trim())) {
          setErrorMsg("ארגון בשם הזה כבר קיים");
          setBusy(false);
          return null;
        }
        const now = new Date().toISOString();
        return repo.create({
          id: nextId(
            "org",
            all.map((o) => o.id),
          ),
          name: name.trim(),
          type,
          phone: phone.trim(),
          email: email.trim(),
          city: city.trim(),
          notes: "",
          status: "פעיל",
          createdAt: now,
          updatedAt: now,
        });
      })
      .then(async (created) => {
        if (!created) return;
        await invalidate(["organizations"]);
        toast("הארגון נוצר בהצלחה", "success");
        onClose();
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="ארגון חדש"
      footer={
        <div style={{ display: "flex", gap: "var(--os-space-3)" }}>
          <OsButton icon="plus" {...busyDisabled(busy)} onClick={submit}>
            יצירת ארגון
          </OsButton>
          <OsButton variant="ghost" onClick={onClose}>
            ביטול
          </OsButton>
        </div>
      }
    >
      <div className="os-qc-form">
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="no-name">
            שם הארגון
          </label>
          <input
            id="no-name"
            className="os-qc-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="no-type">
            סוג
          </label>
          <select
            id="no-type"
            className="os-qc-input"
            value={type}
            onChange={(e) => setType(e.target.value as CustomerType)}
          >
            <option value="עסק">עסק</option>
            <option value="בית ספר">בית ספר</option>
            <option value="ארגון">ארגון</option>
          </select>
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="no-city">
            עיר
          </label>
          <input
            id="no-city"
            className="os-qc-input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="no-phone">
            טלפון
          </label>
          <input
            id="no-phone"
            className="os-qc-input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="no-email">
            אימייל
          </label>
          <input
            id="no-email"
            className="os-qc-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {errorMsg && <div className="os-qc-error">{errorMsg}</div>}
      </div>
    </Modal>
  );
}
