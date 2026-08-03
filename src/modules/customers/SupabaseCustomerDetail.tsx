// TERAGON AI BUSINESS OS — Gate S9.2-A1d1: SUPABASE customer detail (read-only
// core + edit). A calm, presentation-ready reduction of the Customer-360 page:
// it mounts ONLY remotely-connected data. S9.3-C adds the customer's CONTACTS
// section (read-only, org-scoped, narrowed by customerId). Every still-
// disconnected Customer-360 section (opportunities, quotations, printers,
// service, courses, tasks, approvals, activity…) remains unmounted behind ONE
// compact Hebrew deferred notice — no wall of placeholders, no IndexedDB hook.
import { useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import {
  EmptyState,
  Modal,
  OsButton,
  Panel,
  StatusChip,
  useToast,
  type OsStatus,
} from "@/design-system";
import type { Customer } from "@/domain/types";
import { dateTimeHe } from "@/modules/quotations/fmt";
import { useDomainRecord } from "@/app/data/useDomainRecord";
import { domainReadMessage } from "@/app/data/useDomainCollection";
import { useCustomerMutation } from "@/app/data/useCustomerMutation";
import { customerInputSchema, type CustomerInput } from "@/app/quick-create/actions";
import { CustomerContactsPanel } from "@/modules/contacts/CustomerContactsPanel";

const backLink: CSSProperties = { color: "var(--os-cyan-text)", fontSize: "var(--os-text-sm)" };
const rowLabel: CSSProperties = {
  fontSize: "var(--os-text-2xs, 11px)",
  color: "var(--os-text-2)",
  letterSpacing: "0.04em",
};

function statusChip(status: Customer["status"]): ReactElement {
  if (status === "פעיל") return <StatusChip status="פעיל" />;
  if (status === "לא פעיל") return <StatusChip status={"מושבת" as OsStatus} label="לא פעיל" />;
  return <StatusChip status={"מושבת" as OsStatus} label="בארכיון" />;
}

function InfoRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <span style={rowLabel}>{label}</span>
      <span style={{ fontSize: "var(--os-text-sm)" }}>{value || "—"}</span>
    </div>
  );
}

export function SupabaseCustomerDetail(): ReactElement {
  const { id } = useParams();
  const { toast } = useToast();
  const { update, isSubmitting } = useCustomerMutation();
  const recordQ = useDomainRecord<Customer>("customers", id);

  const [editOpen, setEditOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!id) {
    return (
      <EmptyState
        icon="alert"
        title="מזהה לקוח שגוי"
        reason="הקישור אינו כולל מזהה לקוח תקין."
        action={
          <Link to="/customers" style={backLink}>
            חזרה לרשימת הלקוחות
          </Link>
        }
      />
    );
  }
  if (recordQ.isError) {
    return (
      <EmptyState
        icon="alert"
        title="טעינת כרטיס הלקוח נכשלה"
        reason={domainReadMessage(recordQ.error) ?? "קריאת הלקוח מהשרת נכשלה. רעננו או התחברו מחדש."}
        action={
          <Link to="/customers" style={backLink}>
            חזרה לרשימת הלקוחות
          </Link>
        }
      />
    );
  }
  if (recordQ.isLoading) {
    return (
      <div style={{ padding: "var(--os-space-6)", color: "var(--os-text-2)" }} role="status">
        טוען את כרטיס הלקוח מהשרת…
      </div>
    );
  }

  const customer = recordQ.data;
  if (!customer) {
    return (
      <EmptyState
        icon="users"
        title="לקוח לא נמצא"
        reason={`אין לקוח עם המזהה «${id}» בשרת. ייתכן שנמחק או שהקישור שגוי.`}
        action={
          <Link to="/customers" style={backLink}>
            חזרה לרשימת הלקוחות
          </Link>
        }
      />
    );
  }

  const openEdit = (): void => {
    setValues({
      name: customer.name,
      type: customer.type,
      phone: customer.phone,
      email: customer.email,
      city: customer.city,
    });
    setErrors({});
    setEditOpen(true);
  };

  const submitEdit = async (): Promise<void> => {
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
    const res = await update(customer.id, values as unknown as CustomerInput);
    if (res.ok) {
      toast(`הלקוח «${res.data.name}» עודכן`, "success");
      setEditOpen(false);
      void recordQ.refetch(); // re-read the verified remote record
    } else {
      toast(res.error.message, "danger");
    }
  };

  return (
    <div
      style={{ display: "grid", gap: "var(--os-space-5)" }}
      data-testid="customer-detail-supabase"
    >
      <div>
        <Link to="/customers" style={backLink}>
          → חזרה לרשימת הלקוחות
        </Link>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "var(--os-space-3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--os-space-3)" }}>
          <h1 style={{ margin: 0, fontSize: "var(--os-text-xl, 20px)" }}>{customer.name}</h1>
          {statusChip(customer.status)}
          <span style={{ fontSize: "var(--os-text-sm)", color: "var(--os-text-2)" }}>
            {customer.type}
          </span>
        </div>
        <OsButton variant="ghost" icon="gear" onClick={openEdit}>
          עריכת לקוח
        </OsButton>
      </div>

      <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "var(--os-space-4)",
          }}
        >
          <InfoRow label="אימייל" value={customer.email} />
          <InfoRow label="טלפון" value={customer.phone} />
          <InfoRow label="עיר" value={customer.city} />
          <InfoRow label="סוג לקוח" value={customer.type} />
          <InfoRow label="נוצר" value={dateTimeHe(customer.createdAt)} />
          <InfoRow label="עודכן" value={dateTimeHe(customer.updatedAt)} />
        </div>
      </Panel>

      {/* S9.3-C: contacts is the FIRST connected Customer-360 section. Every
          other section stays deferred behind the notice below. */}
      <CustomerContactsPanel customerId={id} />

      <p
        role="note"
        style={{
          margin: 0,
          padding: "var(--os-space-4)",
          fontSize: "var(--os-text-sm)",
          color: "var(--os-text-muted)",
          background: "var(--os-raised)",
          borderRadius: "var(--os-radius-sm, 6px)",
          border: "1px solid var(--os-border)",
        }}
      >
        שאר המידע המשלים יחובר בשלבי ההטמעה הבאים
      </p>

      {editOpen && (
        <Modal open onClose={() => setEditOpen(false)} title={`עריכת לקוח — ${customer.name}`}>
          <form
            className="os-qc-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submitEdit();
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
                <label className="os-qc-label" htmlFor={`cd-${f.name}`}>
                  {f.label}
                </label>
                {f.type === "select" ? (
                  <select
                    id={`cd-${f.name}`}
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
                    id={`cd-${f.name}`}
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
              {isSubmitting ? (
                <OsButton type="submit" disabled disabledReason="שמירה מתבצעת…">
                  שומר…
                </OsButton>
              ) : (
                <OsButton type="submit">שמירה</OsButton>
              )}
              <OsButton variant="ghost" onClick={() => setEditOpen(false)}>
                ביטול
              </OsButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
