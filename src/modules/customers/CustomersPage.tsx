// Wave 3 — לקוחות (/customers): index list feeding the Customer-360 screen.
import { useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import {
  DataTable,
  EmptyState,
  KpiCard,
  OsButton,
  Panel,
  SectionTitle,
  StatusChip,
  useToast,
} from "@/design-system";
import { PageRail } from "@/app/rail";
import { useDomainCollection, domainReadMessage } from "@/app/data/useDomainCollection";
import { PERSISTENCE_PROVIDER } from "@/persistence/provider";
import type { Customer, CustomerType } from "@/domain/types";
import { totalRevenue } from "@/domain/selectors";
import {
  createCustomer,
  customerInputSchema,
  type CustomerInput,
} from "@/app/quick-create/actions";
import { ils } from "@/modules/quotations/fmt";
import { Modal } from "@/design-system";

const railTitle: CSSProperties = {
  fontSize: "var(--os-text-2xs, 11px)",
  fontWeight: 600,
  color: "var(--os-text-2)",
  marginBlockEnd: 6,
  letterSpacing: "0.04em",
};

const selStyle: CSSProperties = {
  background: "var(--os-raised)",
  color: "var(--os-text)",
  border: "1px solid var(--os-border)",
  borderRadius: "var(--os-radius-sm, 6px)",
  paddingBlock: "4px",
  paddingInline: "8px",
  fontSize: "var(--os-text-sm, 13px)",
};

const TYPES: readonly (CustomerType | "הכול")[] = ["הכול", "פרטי", "עסק", "בית ספר", "ארגון"];

function contactChip(state: Customer["contactState"]): ReactElement {
  if (state === "פעיל") return <StatusChip status="פעיל" />;
  if (state === "ממתין למענה") return <StatusChip status="אזהרה" label="ממתין למענה" />;
  return <StatusChip status="מושבת" label="לא פעיל" />;
}

export default function CustomersPage(): ReactElement {
  const navigate = useNavigate();
  const { toast } = useToast();
  // Read through the composition boundary: LOCAL → IndexedDB (unchanged);
  // SUPABASE → authenticated remote read, no local fallback (S9.2-A1b).
  const isSupabase = PERSISTENCE_PROVIDER === "SUPABASE";
  const customersQ = useDomainCollection<Customer>("customers");
  const customers = useMemo(() => customersQ.data ?? [], [customersQ.data]);

  const [type, setType] = useState<CustomerType | "הכול">("הכול");
  const [text, setText] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({
    name: "",
    type: "פרטי",
    phone: "",
    email: "",
    city: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(
    () =>
      customers.filter((c) => {
        if (type !== "הכול" && c.type !== type) return false;
        const t = text.trim();
        if (t && !`${c.name} ${c.city} ${c.email} ${c.printerSummary}`.includes(t)) return false;
        return true;
      }),
    [customers, type, text],
  );

  const revenue = useMemo(() => totalRevenue(customers), [customers]);
  const waiting = customers.filter((c) => c.contactState === "ממתין למענה");
  const topByRevenue = [...customers].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const submit = async (): Promise<void> => {
    const parsed = customerInputSchema.safeParse(values);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = String(i.path[0] ?? "");
        if (k && !(k in errs)) errs[k] = i.message;
      }
      setErrors(errs);
      return;
    }
    setBusy(true);
    try {
      const created = await createCustomer(parsed.data as CustomerInput);
      toast(`הלקוח «${created.name}» נוצר`, "success");
      setCreateOpen(false);
      setErrors({});
      setValues({ name: "", type: "פרטי", phone: "", email: "", city: "" });
    } catch {
      toast("יצירת הלקוח נכשלה — נסו שוב", "danger");
    } finally {
      setBusy(false);
    }
  };

  if (customersQ.isError) {
    const safe = domainReadMessage(customersQ.error);
    return (
      <EmptyState
        icon="alert"
        title="טעינת הלקוחות נכשלה"
        reason={
          safe ??
          (isSupabase
            ? "קריאת הלקוחות מהשרת נכשלה. רעננו את הדף או התחברו מחדש."
            : "קריאת הנתונים מ-IndexedDB המקומי נכשלה. רעננו את הדף.")
        }
      />
    );
  }
  if (customersQ.isLoading) {
    return (
      <div style={{ padding: "var(--os-space-6)", color: "var(--os-text-2)" }} role="status">
        {isSupabase ? "טוען לקוחות מהשרת…" : "טוען לקוחות מהמאגר המקומי…"}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--os-space-5)" }} data-testid="customers-page">
      <PageRail>
        <div style={{ display: "grid", gap: "var(--os-space-5)" }}>
          <div>
            <div style={railTitle}>מובילים בהכנסות</div>
            <div style={{ display: "grid", gap: 6, fontSize: "var(--os-text-sm, 12px)" }}>
              {topByRevenue.map((c) => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{c.name}</span>
                  <span className="os-num" style={{ color: "var(--success-text)" }}>
                    {ils(c.revenue)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={railTitle}>ממתינים למענה</div>
            <div style={{ display: "grid", gap: 6, fontSize: "var(--os-text-sm, 12px)" }}>
              {waiting.length === 0 ? (
                <span style={{ color: "var(--os-muted)" }}>אין לקוחות שממתינים למענה</span>
              ) : (
                waiting.map((c) => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{c.name}</span>
                    <span style={{ color: "var(--warning-text)" }}>ממתין</span>
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
        <h1 style={{ margin: 0, fontSize: "var(--os-text-xl, 20px)" }}>לקוחות</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--os-space-2)" }}>
          <OsButton variant="ghost" icon="clock" onClick={() => void customersQ.refetch()}>
            {customersQ.isFetching ? "מרענן…" : "רענון"}
          </OsButton>
          {isSupabase ? (
            <span
              style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-muted)" }}
              role="note"
            >
              יצירת לקוח עדיין אינה זמינה בסביבת התצוגה
            </span>
          ) : (
            <OsButton icon="plus" onClick={() => setCreateOpen(true)}>
              לקוח חדש
            </OsButton>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "var(--os-space-3)",
        }}
      >
        <KpiCard title="סה״כ לקוחות" value={customers.length} accent="blue" icon="users" />
        <KpiCard
          title="לקוחות פעילים"
          value={customers.filter((c) => c.contactState === "פעיל").length}
          accent="success"
          icon="check"
        />
        <KpiCard title="ממתינים למענה" value={waiting.length} accent="warning" icon="alert" />
        <KpiCard title="הכנסות מצטברות" value={ils(revenue)} accent="cyan" icon="briefcase" glow />
      </div>

      <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
        <SectionTitle title="רשימת הלקוחות" subtitle="לחיצה על שורה פותחת את כרטיס הלקוח (360°)" />
        <div
          style={{
            display: "flex",
            gap: "var(--os-space-2)",
            marginBlock: "var(--os-space-3)",
            flexWrap: "wrap",
          }}
        >
          <input
            type="search"
            className="os-qc-input"
            style={{ maxInlineSize: 220 }}
            placeholder="חיפוש לקוח…"
            aria-label="חיפוש לקוח"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <select
            style={selStyle}
            aria-label="סינון לפי סוג לקוח"
            value={type}
            onChange={(e) => setType(e.target.value as CustomerType | "הכול")}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t === "הכול" ? "כל הסוגים" : t}
              </option>
            ))}
          </select>
        </div>
        <DataTable<Customer>
          rows={filtered}
          rowKey="id"
          onRowClick={(c) => void navigate(`/customers/${c.id}`)}
          emptyText="אין לקוחות להצגה"
          emptyReason="הסינון הנוכחי לא תואם אף לקוח — נקו את הסינון או צרו לקוח חדש."
          columns={[
            { key: "name", header: "שם" },
            { key: "type", header: "סוג" },
            { key: "city", header: "עיר" },
            { key: "printerSummary", header: "מדפסות" },
            {
              key: "revenue",
              header: "הכנסות",
              render: (c) => <span className="os-num">{ils(c.revenue)}</span>,
            },
            { key: "contactState", header: "מצב קשר", render: (c) => contactChip(c.contactState) },
          ]}
        />
      </Panel>

      {!isSupabase && createOpen && (
        <Modal open onClose={() => setCreateOpen(false)} title="לקוח חדש">
          <form
            className="os-qc-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {(
              [
                { name: "name", label: "שם הלקוח", type: "text" },
                { name: "type", label: "סוג", type: "select" },
                { name: "phone", label: "טלפון", type: "text" },
                { name: "email", label: "אימייל", type: "text" },
                { name: "city", label: "עיר", type: "text" },
              ] as const
            ).map((f) => (
              <div key={f.name} className="os-qc-field">
                <label className="os-qc-label" htmlFor={`cust-${f.name}`}>
                  {f.label}
                </label>
                {f.type === "select" ? (
                  <select
                    id={`cust-${f.name}`}
                    className="os-qc-input"
                    value={values[f.name] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  >
                    {(["פרטי", "עסק", "בית ספר", "ארגון"] as const).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`cust-${f.name}`}
                    className="os-qc-input"
                    type="text"
                    value={values[f.name] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  />
                )}
                {errors[f.name] && (
                  <span className="os-qc-error" role="alert">
                    {errors[f.name]}
                  </span>
                )}
              </div>
            ))}
            <div className="os-qc-actions">
              {busy ? (
                <OsButton type="submit" disabled disabledReason="שמירה מתבצעת…">
                  שומר…
                </OsButton>
              ) : (
                <OsButton type="submit">שמירה</OsButton>
              )}
              <OsButton variant="ghost" onClick={() => setCreateOpen(false)}>
                ביטול
              </OsButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
