// W6 WIRING — Customer-360 "זיכרון לקוח" tab (Phase 6.17).
// Consumes the customer360 memory derivations (approved-only by default),
// honors the sensitivity gate (רגיש/מוגבל hidden behind an explicit reveal
// with a mandatory reason — the reveal itself is audited), shows pending
// proposals / interaction observations / preferences / promised follow-ups /
// purchased printers / recurring issues, and offers the governed
// "הצע הוספה לזיכרון" mini-form. There is NO direct permanent-write path:
// every submission goes through MemoryProposalWorkflow → ApprovalEngine.
import { useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { Link } from "react-router-dom";
import { EmptyState, OsButton, Panel, SectionTitle, useToast } from "@/design-system";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import { getRepository } from "@/repositories";
import { nextId } from "@/repositories/Repository";
import type {
  AuditEvent,
  Customer,
  CustomerPrinter,
  MemoryRecord,
  PrinterModel,
  ServiceTicket,
} from "@/domain/types";
import type {
  MemoryProposal,
  MemoryRecordV2,
  MemorySource,
} from "@/domain/memory";
import { getMemoryEngine } from "@/memory/core/engine";
import { CEO_NAME_HE } from "@/memory/adapters/legacyBridge";
import { CEO_USER_ID } from "@/repositories/seed";
import {
  customer360MemoryTabView,
  recurringCustomerIssues,
  type Customer360MemoryDetail,
} from "@/integration/customer360MemoryExtras";
import { dateHe } from "@/modules/quotations/fmt";

const stack = (gap = "var(--os-space-3)"): CSSProperties => ({ display: "grid", gap });

const chipStyle = (danger: boolean): CSSProperties => ({
  fontSize: "var(--os-text-2xs, 11px)",
  border: `1px solid ${danger ? "var(--danger-text)" : "var(--os-border)"}`,
  color: danger ? "var(--danger-text)" : "var(--os-text-2)",
  borderRadius: "var(--os-radius-full, 999px)",
  paddingBlock: 1,
  paddingInline: 8,
  whiteSpace: "nowrap",
});

const inputStyle: CSSProperties = {
  font: "inherit",
  fontSize: "var(--os-text-sm, 13px)",
  background: "var(--os-bg-2, transparent)",
  color: "var(--os-text)",
  border: "1px solid var(--os-border)",
  borderRadius: "var(--os-radius-sm, 6px)",
  paddingBlock: 6,
  paddingInline: 10,
};

interface RevealState {
  reason: string;
  revealed: boolean;
}

function MemoryDetailCard({
  detail,
  reveal,
  onReasonChange,
  onReveal,
}: {
  detail: Customer360MemoryDetail;
  reveal: RevealState;
  onReasonChange: (reason: string) => void;
  onReveal: () => void;
}): ReactElement {
  const hidden = detail.hiddenByDefault && !reveal.revealed;
  return (
    <Panel variant="raised" style={{ padding: "var(--os-space-4)" }} data-testid="c360-memory-item">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600 }}>{detail.title}</span>
        <span className="os-num" style={chipStyle(false)}>
          גרסה {detail.version}
        </span>
        <span style={chipStyle(detail.hiddenByDefault)} data-testid="c360-sensitivity-chip">
          {detail.sensitivity}
        </span>
        {detail.kind === "preference" && <span style={chipStyle(false)}>העדפה</span>}
        {detail.kind === "follow-up" && <span style={chipStyle(false)}>מעקב מובטח</span>}
      </div>
      <div
        style={{
          fontSize: "var(--os-text-2xs, 11px)",
          color: "var(--os-muted)",
          marginBlock: 4,
        }}
      >
        {detail.folder} · תגיות: {detail.tags.join(", ") || "—"} · עודכן{" "}
        <span className="os-num">{dateHe(detail.updatedAt)}</span> ·{" "}
        {detail.approvedBy
          ? `אושר על ידי ${detail.approvedBy}`
          : "ללא אישור בשם (ייבוא דור 1)"}{" "}
        ·{" "}
        <Link to={detail.memoryRoute} style={{ color: "var(--os-cyan-text)" }}>
          לגרסאות ולפריט המלא ←
        </Link>
      </div>
      {hidden ? (
        <div style={stack("var(--os-space-2)")} data-testid="c360-sensitive-gate">
          <div style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-2)" }}>
            תוכן ברגישות «{detail.sensitivity}» — מוסתר. חשיפה מחייבת נימוק מפורש (נרשם ביומן
            הביקורת).
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              aria-label={`נימוק חשיפה — ${detail.title}`}
              placeholder="נימוק לחשיפה…"
              value={reveal.reason}
              onChange={(e) => onReasonChange(e.target.value)}
              style={inputStyle}
            />
            {reveal.reason.trim().length > 0 ? (
              <OsButton size="sm" variant="ghost" icon="shield" onClick={onReveal}>
                חשוף עם נימוק
              </OsButton>
            ) : (
              <OsButton size="sm" variant="ghost" disabled disabledReason="חשיפה מחייבת נימוק">
                חשוף עם נימוק
              </OsButton>
            )}
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              fontSize: "var(--os-text-sm, 13px)",
              color: "var(--os-text-2)",
              whiteSpace: "pre-wrap",
            }}
            data-testid="c360-memory-body"
          >
            {detail.bodyMarkdown}
          </div>
          <div style={{ marginBlockStart: 6, fontSize: "var(--os-text-2xs, 11px)" }}>
            <span style={{ color: "var(--os-muted)" }}>ראיות ומקורות: </span>
            {detail.evidence.length === 0 ? (
              <span style={{ color: "var(--os-muted)" }}>
                אין רשומות מקור מתועדות לפריט זה (רשומת דור 1)
              </span>
            ) : (
              detail.evidence.map((e, i) => (
                <span key={e.sourceId} style={{ color: "var(--os-text-2)" }}>
                  {i > 0 && " · "}
                  {e.titleHe} — «{e.excerpt.slice(0, 80)}»{" "}
                  <span className="os-ltr" style={{ color: "var(--os-muted)" }}>
                    ({e.refId})
                  </span>
                  {!e.verified && <span style={{ color: "var(--warning-text)" }}> · לא אומת</span>}
                </span>
              ))
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

/** governed mini-form — same flow as /memory's NewProposalForm, customer pre-filled */
function ProposeForCustomerForm({
  customer,
  onDone,
}: {
  customer: Customer;
  onDone: () => void;
}): ReactElement {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const canSubmit = title.trim().length > 0 && body.trim().length > 0;

  const submit = async (): Promise<void> => {
    setBusy(true);
    try {
      const { stores, workflow } = getMemoryEngine();
      const now = new Date().toISOString();
      const existing = await stores.sources.list();
      const source: MemorySource = {
        id: `msrc-${existing.length + 1}`,
        createdAt: now,
        updatedAt: now,
        kind: "entity",
        refId: `customers:${customer.id}`,
        titleHe: `לקוח: ${customer.name}`,
        excerpt: `תצפית שנרשמה מתוך כרטיס הלקוח «${customer.name}» (360)`,
        capturedAt: now,
        verified: true, // the customer record is the loaded source entity
      };
      await stores.sources.create(source);
      await workflow.submitProposal({
        observationHe: `תצפית מכרטיס לקוח 360 «${customer.name}»`,
        proposedById: CEO_USER_ID,
        proposedByName: CEO_NAME_HE,
        draft: {
          title: title.trim(),
          bodyMarkdown: body.trim(),
          memoryLayer: "customer",
          folder: "לקוחות",
          entityLinks: [{ collection: "customers", entityId: customer.id, label: customer.name }],
          tags: ["לקוחות"],
          sourceIds: [source.id],
          sensitivity: "פנימי",
          retentionPolicy: "קבוע",
          reviewDate: null,
        },
      });
      setTitle("");
      setBody("");
      toast("נוצרה הצעת זיכרון — ממתינה לאישור אנושי בתור", "info");
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "יצירת ההצעה נכשלה", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={stack("var(--os-space-2)")} data-testid="c360-propose-form">
      <input
        aria-label="כותרת הצעת זיכרון"
        placeholder="כותרת"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={inputStyle}
      />
      <textarea
        aria-label="תוכן הצעת זיכרון"
        placeholder={`תצפית על «${customer.name}» (Markdown)`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        style={{ ...inputStyle, resize: "vertical" }}
      />
      <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
        המקור מוזן אוטומטית: הלקוח «{customer.name}» ({customer.id}). ההצעה נכנסת לתור האישורים —
        שום דבר לא נכתב לזיכרון הקבוע ישירות.
      </div>
      {canSubmit && !busy ? (
        <OsButton
          variant="primary"
          size="sm"
          icon="plus"
          onClick={() => void submit()}
          data-testid="c360-propose-submit"
        >
          שלח לתור האישורים
        </OsButton>
      ) : (
        <OsButton
          variant="primary"
          size="sm"
          disabled
          disabledReason={busy ? "ההצעה נשלחת…" : "נדרשים כותרת ותוכן"}
        >
          שלח לתור האישורים
        </OsButton>
      )}
    </div>
  );
}

export function Customer360MemoryTab({ customer }: { customer: Customer }): ReactElement {
  const invalidate = useInvalidateCollections();
  const [reveals, setReveals] = useState<Record<string, RevealState>>({});
  const [showForm, setShowForm] = useState(false);

  const recordsQ = useCollection<MemoryRecord | MemoryRecordV2>("memoryRecords");
  const proposalsQ = useCollection<MemoryProposal>("memoryProposals");
  const sourcesQ = useCollection<MemorySource>("memorySources");
  const printersQ = useCollection<CustomerPrinter>("customerPrinters");
  const modelsQ = useCollection<PrinterModel>("printerModels");
  const ticketsQ = useCollection<ServiceTicket>("serviceTickets");

  const view = customer360MemoryTabView(
    customer.id,
    customer.name,
    recordsQ.data ?? [],
    proposalsQ.data ?? [],
    sourcesQ.data ?? [],
  );
  const printers = (printersQ.data ?? []).filter((p) => p.customerId === customer.id);
  const models = modelsQ.data ?? [];
  const customerTickets = (ticketsQ.data ?? []).filter((t) => t.customerId === customer.id);
  const recurring = recurringCustomerIssues(customerTickets);

  const revealOf = (id: string): RevealState => reveals[id] ?? { reason: "", revealed: false };

  const doReveal = async (detail: Customer360MemoryDetail): Promise<void> => {
    const state = revealOf(detail.id);
    if (state.reason.trim().length === 0) return;
    // permission-honest: the reveal is a recorded governance event
    const audit = getRepository<AuditEvent>("auditEvents");
    const ids = (await audit.list()).map((a) => a.id);
    const now = new Date().toISOString();
    await audit.create({
      id: nextId("aud-reveal", ids),
      createdAt: now,
      updatedAt: now,
      at: now,
      actor: CEO_USER_ID,
      action: "memory.sensitive-reveal",
      entityRef: `memory-record:${detail.id}`,
      details: `נחשף פריט זיכרון רגיש «${detail.title}» בכרטיס לקוח «${customer.name}» — נימוק: ${state.reason.trim()}`,
      correlationId: null,
    });
    await invalidate(["auditEvents"]);
    setReveals((prev) => ({ ...prev, [detail.id]: { ...state, revealed: true } }));
  };

  return (
    <Panel variant="panel" style={{ padding: "var(--os-space-5)" }} data-testid="c360-memory-tab">
      <SectionTitle
        title="זיכרון לקוח"
        subtitle="זיכרון מאושר בלבד כברירת מחדל · פריטים רגישים מאחורי חשיפה מנומקת · כל הוספה באישור אנושי"
        action={
          <OsButton
            size="sm"
            variant="cyan"
            icon="plus"
            onClick={() => setShowForm((v) => !v)}
            data-testid="c360-propose-btn"
          >
            הצע הוספה לזיכרון
          </OsButton>
        }
      />
      <div style={{ ...stack("var(--os-space-4)"), marginBlockStart: "var(--os-space-3)" }}>
        {showForm && <ProposeForCustomerForm customer={customer} onDone={() => {
          setShowForm(false);
          void invalidate(["memoryProposals", "memorySources", "approvals", "auditEvents"]);
        }} />}

        {/* approved memory (default view) */}
        <div style={stack()} data-testid="c360-approved">
          {view.approved.length === 0 ? (
            <EmptyState
              icon="memory"
              title="אין זיכרון מאושר ללקוח זה"
              reason="אף פריט זיכרון מאושר אינו מקושר ללקוח. ניתן להציע פריט — ההחלטה אנושית."
            />
          ) : (
            view.approved.map((d) => (
              <MemoryDetailCard
                key={d.id}
                detail={d}
                reveal={revealOf(d.id)}
                onReasonChange={(reason) =>
                  setReveals((prev) => ({
                    ...prev,
                    [d.id]: { ...revealOf(d.id), reason },
                  }))
                }
                onReveal={() => void doReveal(d)}
              />
            ))
          )}
        </div>

        {/* pending proposals */}
        <div style={stack("var(--os-space-2)")} data-testid="c360-pending">
          <SectionTitle title={`הצעות ממתינות (${view.pending.length})`} icon="shield" />
          {view.pending.length === 0 ? (
            <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
              אין הצעות זיכרון ממתינות ללקוח זה.
            </div>
          ) : (
            view.pending.map((p) => (
              <div
                key={p.id}
                style={{
                  fontSize: "var(--os-text-sm, 13px)",
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <span>«{p.title}»</span>
                <span style={chipStyle(false)}>{p.status}</span>
                <Link to={`/memory?proposal=${p.id}`} style={{ color: "var(--os-cyan-text)" }}>
                  לתור האישורים ←
                </Link>
              </div>
            ))
          )}
        </div>

        {/* interaction-derived observations */}
        <div style={stack("var(--os-space-2)")} data-testid="c360-observations">
          <SectionTitle title="תצפיות מאינטראקציות" icon="inbox" />
          {view.observations.length === 0 ? (
            <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
              אין תצפיות מתועדות — תצפיות נגזרות מהצעות זיכרון שנרשמו בהקשר הלקוח.
            </div>
          ) : (
            view.observations.map((o, i) => (
              <div key={i} style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-2)" }}>
                {o}
              </div>
            ))
          )}
        </div>

        {/* preferences + promised follow-ups (derived from tagging) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--os-space-4)" }}>
          <div style={stack("var(--os-space-2)")} data-testid="c360-preferences">
            <SectionTitle title={`העדפות (${view.preferences.length})`} icon="sparkle" />
            {view.preferences.length === 0 ? (
              <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
                לא תועדו העדפות בזיכרון המאושר (נגזר מתיוג — לא מומצא).
              </div>
            ) : (
              view.preferences.map((p) => (
                <div key={p.id} style={{ fontSize: "var(--os-text-sm, 13px)" }}>
                  «{p.title}»
                </div>
              ))
            )}
          </div>
          <div style={stack("var(--os-space-2)")} data-testid="c360-followups">
            <SectionTitle title={`מעקבים מובטחים (${view.followUps.length})`} icon="clock" />
            {view.followUps.length === 0 ? (
              <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
                לא תועדו מעקבים מובטחים בזיכרון המאושר (נגזר מתיוג — לא מומצא).
              </div>
            ) : (
              view.followUps.map((f) => (
                <div key={f.id} style={{ fontSize: "var(--os-text-sm, 13px)" }}>
                  «{f.title}»
                </div>
              ))
            )}
          </div>
        </div>

        {/* purchased printers + recurring issues (existing joins) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--os-space-4)" }}>
          <div style={stack("var(--os-space-2)")} data-testid="c360-printers">
            <SectionTitle title={`מדפסות שנרכשו (${printers.length})`} icon="printer" />
            {printers.length === 0 ? (
              <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
                אין מדפסות רשומות ללקוח זה.
              </div>
            ) : (
              printers.map((p) => (
                <div key={p.id} style={{ fontSize: "var(--os-text-sm, 13px)" }}>
                  {models.find((m) => m.id === p.printerModelId)?.name ?? p.printerModelId}{" "}
                  <span className="os-ltr os-num" style={{ color: "var(--os-muted)" }}>
                    {p.serialNumber}
                  </span>
                </div>
              ))
            )}
          </div>
          <div style={stack("var(--os-space-2)")} data-testid="c360-recurring">
            <SectionTitle title={`תקלות חוזרות (${recurring.length})`} icon="wrench" />
            {recurring.length === 0 ? (
              <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
                אין דפוס תקלות חוזר (נדרשות ≥2 קריאות על אותה מדפסת).
              </div>
            ) : (
              recurring.map((r) => (
                <div key={r.printer} style={{ fontSize: "var(--os-text-sm, 13px)" }}>
                  {r.printer} — <span className="os-num">{r.count}</span> קריאות (
                  {r.issues.join(", ")})
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
