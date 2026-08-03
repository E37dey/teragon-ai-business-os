// S9.3-B — אנשי קשר (/contacts): READ-ONLY contact list.
//
// Reads through the SAME composition boundary as customers (S9.2-A1b):
//   LOCAL    → IndexedDB, unchanged.
//   SUPABASE → authenticated remote read scoped to the CANONICAL identity's
//              organization, no local fallback, fail-closed on error.
// The organization is injected by the repository mapper from the canonical
// identity — never from this component, a form, the URL or localStorage.
//
// Deliberately read-only: no create/update/delete, no contact detail route, no
// joins and no new schema fields. Contacts is READ_CONNECTED_LOCAL_TESTED, NOT
// LIVE_VALIDATED.
import { useMemo } from "react";
import type { ReactElement } from "react";
import { DataTable, EmptyState, Panel, SectionTitle } from "@/design-system";
import { useDomainCollection, domainReadMessage } from "@/app/data/useDomainCollection";
import { PERSISTENCE_PROVIDER } from "@/persistence/provider";
import type { Contact } from "@/domain/types";
import { primaryChip } from "./contactChips";

export default function ContactsPage(): ReactElement {
  const isSupabase = PERSISTENCE_PROVIDER === "SUPABASE";
  const contactsQ = useDomainCollection<Contact>("contacts");
  const contacts = useMemo(() => contactsQ.data ?? [], [contactsQ.data]);
  const primaryCount = useMemo(() => contacts.filter((c) => c.isPrimary).length, [contacts]);

  // Fail-closed: a read failure shows the SAFE typed message and NO rows. In
  // SUPABASE mode there is no IndexedDB fallback — stale local data is never
  // shown in place of a failed authenticated read.
  if (contactsQ.isError) {
    const safe = domainReadMessage(contactsQ.error);
    return (
      <EmptyState
        icon="alert"
        title="טעינת אנשי הקשר נכשלה"
        reason={
          safe ??
          (isSupabase
            ? "קריאת אנשי הקשר מהשרת נכשלה. רעננו את הדף או התחברו מחדש."
            : "קריאת הנתונים מ-IndexedDB המקומי נכשלה. רעננו את הדף.")
        }
      />
    );
  }

  if (contactsQ.isLoading) {
    return (
      <div style={{ padding: "var(--os-space-6)", color: "var(--os-text-2)" }} role="status">
        {isSupabase ? "טוען אנשי קשר מהשרת…" : "טוען אנשי קשר מהמאגר המקומי…"}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--os-space-5)" }} data-testid="contacts-page">
      <SectionTitle title="אנשי קשר" subtitle={`${contacts.length} אנשי קשר · ${primaryCount} ראשיים`} />
      <Panel>
        <DataTable<Contact>
          rows={contacts}
          rowKey="id"
          emptyText="אין אנשי קשר להצגה"
          emptyReason="לא נמצאו אנשי קשר עבור הארגון שלכם."
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
