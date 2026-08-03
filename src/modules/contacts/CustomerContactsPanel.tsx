// S9.3-C — contacts belonging to ONE customer, rendered inside the SUPABASE
// customer detail. READ-ONLY.
//
// Scoping is defence-in-depth, in this order:
//   1. RLS on `contacts` (012_rls_policies.sql) — the server refuses rows outside
//      the caller's organization.
//   2. The repository mapper filters `.eq("organization_id", …)` from the
//      CANONICAL identity (never the component, a form, the URL or localStorage).
//   3. This component narrows the already org-scoped rows to the current
//      customerId, so another customer's contacts can never render here.
//
// The safe repository boundary exposes only `listSafe()` (no arguments), so there
// is no repository-side predicate to reuse — narrowing happens here, exactly as
// the LOCAL CustomerDetailPage does. Deliberately NOT introducing a generic query
// framework for this checkpoint.
import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { DataTable, EmptyState, Modal, OsButton, Panel, SectionTitle, useToast } from "@/design-system";
import { useDomainCollection, domainReadMessage } from "@/app/data/useDomainCollection";
import type { Contact } from "@/domain/types";
import { primaryChip } from "./contactChips";
import { contactInputSchema, useContactMutation, type ContactInput } from "@/app/data/useContactMutation";

/** Stable, deterministic contact id for ONE create submission (reused on retry). */
function freshSubmissionId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `ct-${rand}`;
}

function emptyValues(): ContactInput {
  return { name: "", role: "", phone: "", email: "", isPrimary: false };
}

export function CustomerContactsPanel({ customerId }: { customerId: string }): ReactElement {
  const { toast } = useToast();
  const { create, update, isSubmitting } = useContactMutation();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [values, setValues] = useState<ContactInput>(emptyValues());
  const [nameError, setNameError] = useState("");
  // One id per create form instance, so a double submit is ONE logical row.
  const [submissionId, setSubmissionId] = useState(freshSubmissionId);

  const contactsQ = useDomainCollection<Contact>("contacts");
  const contacts = useMemo(
    () => (contactsQ.data ?? []).filter((c) => c.customerId === customerId),
    [contactsQ.data, customerId],
  );

  // Fail closed: a failed read shows the SAFE typed message and NO rows — never
  // stale or unscoped data, and never an IndexedDB fallback in SUPABASE mode.
  if (contactsQ.isError) {
    return (
      <EmptyState
        icon="alert"
        title="טעינת אנשי הקשר נכשלה"
        reason={
          domainReadMessage(contactsQ.error) ??
          "קריאת אנשי הקשר מהשרת נכשלה. רעננו את הדף או התחברו מחדש."
        }
      />
    );
  }

  if (contactsQ.isLoading) {
    return (
      <div style={{ padding: "var(--os-space-5)", color: "var(--os-text-2)" }} role="status">
        טוען אנשי קשר…
      </div>
    );
  }

  const openCreate = (): void => {
    setEditing(null);
    setValues(emptyValues());
    setNameError("");
    setSubmissionId(freshSubmissionId()); // a NEW logical row per opened form
    setFormOpen(true);
  };

  const openEdit = (c: Contact): void => {
    // Only rows already narrowed to THIS customer are editable — the table below
    // renders `contacts`, which is org-scoped then filtered by customerId.
    setEditing(c);
    setValues({ name: c.name, role: c.role, phone: c.phone, email: c.email, isPrimary: c.isPrimary });
    setNameError("");
    setFormOpen(true);
  };

  const submit = async (): Promise<void> => {
    const parsed = contactInputSchema.safeParse(values);
    if (!parsed.success) {
      setNameError("שם איש הקשר הוא שדה חובה");
      return;
    }
    const res = editing
      ? await update(editing.id, parsed.data)
      : await create(parsed.data, customerId, submissionId);
    if (res.ok) {
      // The mutation seam already refreshed the scoped contacts query, so the
      // panel re-renders with the saved row.
      setFormOpen(false);
      toast(editing ? "איש הקשר עודכן" : "איש הקשר נוסף", "success");
      return;
    }
    toast(res.error.message, "danger");
  };

  return (
    <div style={{ display: "grid", gap: "var(--os-space-3)" }} data-testid="customer-contacts">
      <SectionTitle
        title="אנשי קשר"
        subtitle={`${contacts.length} אנשי קשר ללקוח זה`}
        action={
          <OsButton variant="ghost" onClick={openCreate}>
            איש קשר חדש
          </OsButton>
        }
      />
      <Panel>
        <DataTable<Contact>
          rows={contacts}
          rowKey="id"
          emptyText="אין אנשי קשר ללקוח זה"
          emptyReason="לא נמצאו אנשי קשר המשויכים ללקוח זה."
          columns={[
            { key: "name", header: "שם" },
            { key: "role", header: "תפקיד" },
            { key: "phone", header: "טלפון" },
            { key: "email", header: "דוא\"ל" },
            { key: "isPrimary", header: "איש קשר ראשי", render: (c) => primaryChip(c.isPrimary) },
            {
              key: "actions",
              header: "פעולות",
              render: (c) => (
                <OsButton variant="ghost" onClick={() => openEdit(c)}>
                  עריכה
                </OsButton>
              ),
            },
          ]}
        />
      </Panel>

      {formOpen && (
        <Modal
          open
          onClose={() => setFormOpen(false)}
          title={editing ? `עריכת איש קשר — ${editing.name}` : "איש קשר חדש"}
        >
          <form
            className="os-qc-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="os-qc-label" htmlFor="contact-name">
              שם *
            </label>
            <input
              id="contact-name"
              className="os-qc-input"
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            />
            {nameError && (
              <span role="alert" style={{ color: "var(--danger-text)", fontSize: "var(--os-text-2xs)" }}>
                {nameError}
              </span>
            )}

            <label className="os-qc-label" htmlFor="contact-role">
              תפקיד
            </label>
            <input
              id="contact-role"
              className="os-qc-input"
              value={values.role}
              onChange={(e) => setValues((v) => ({ ...v, role: e.target.value }))}
            />

            <label className="os-qc-label" htmlFor="contact-phone">
              טלפון
            </label>
            <input
              id="contact-phone"
              className="os-qc-input"
              value={values.phone}
              onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
            />

            <label className="os-qc-label" htmlFor="contact-email">
              דוא&quot;ל
            </label>
            <input
              id="contact-email"
              className="os-qc-input"
              value={values.email}
              onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
            />

            <label className="os-qc-label" htmlFor="contact-primary">
              איש קשר ראשי
            </label>
            <input
              id="contact-primary"
              type="checkbox"
              checked={values.isPrimary}
              onChange={(e) => setValues((v) => ({ ...v, isPrimary: e.target.checked }))}
            />

            <div style={{ display: "flex", gap: "var(--os-space-3)", marginBlockStart: "var(--os-space-4)" }}>
              {/* OsButton's honesty contract: a disabled button MUST explain itself. */}
              {isSubmitting ? (
                <OsButton type="submit" disabled disabledReason="שמירה מתבצעת…">
                  שומר…
                </OsButton>
              ) : (
                <OsButton type="submit">שמירה</OsButton>
              )}
              <OsButton variant="ghost" type="button" onClick={() => setFormOpen(false)}>
                ביטול
              </OsButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
