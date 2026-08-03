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
import { useMemo } from "react";
import type { ReactElement } from "react";
import { DataTable, EmptyState, Panel, SectionTitle } from "@/design-system";
import { useDomainCollection, domainReadMessage } from "@/app/data/useDomainCollection";
import type { Contact } from "@/domain/types";
import { primaryChip } from "./contactChips";

export function CustomerContactsPanel({ customerId }: { customerId: string }): ReactElement {
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

  return (
    <div style={{ display: "grid", gap: "var(--os-space-3)" }} data-testid="customer-contacts">
      <SectionTitle title="אנשי קשר" subtitle={`${contacts.length} אנשי קשר ללקוח זה`} />
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
          ]}
        />
      </Panel>
    </div>
  );
}
