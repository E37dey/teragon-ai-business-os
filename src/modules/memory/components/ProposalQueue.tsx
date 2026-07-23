// W6-A — proposal queue: every pending proposal with ALL mandated fields and
// the 7 governed controls, each routed through MemoryProposalWorkflow (which
// wraps the canonical ApprovalEngine — no bypass path exists in this UI).
import { useState } from "react";
import type { ReactElement } from "react";
import { EmptyState, OsButton, SectionTitle, StatusChip, type OsStatus } from "@/design-system";
import type {
  MemoryCheckResult,
  MemoryProposal,
  MemoryRecordV2,
  MemorySensitivity,
} from "@/domain/memory";
import { MEMORY_LAYER_LABELS_HE, MEMORY_SENSITIVITIES } from "@/domain/memory";

const CHECK_STATUS: Record<MemoryCheckResult["outcome"], OsStatus> = {
  עבר: "הושלם",
  אזהרה: "אזהרה",
  נכשל: "חסום",
};

const inputStyle = {
  font: "inherit",
  fontSize: "var(--os-text-2xs, 11px)",
  background: "var(--os-bg-2, transparent)",
  color: "var(--os-text)",
  border: "1px solid var(--os-border)",
  borderRadius: "var(--os-radius-sm, 6px)",
  paddingBlock: 4,
  paddingInline: 8,
} as const;

function CheckLine({ label, check }: { label: string; check: MemoryCheckResult }): ReactElement {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <StatusChip status={CHECK_STATUS[check.outcome]} label={`${label}: ${check.outcome}`} />
      <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)" }}>{check.detailHe}</span>
    </div>
  );
}

export interface ProposalControls {
  approve(proposalId: string): Promise<void>;
  editAndApprove(proposalId: string, editedBody: string): Promise<void>;
  requestMoreSources(proposalId: string, requestHe: string): Promise<void>;
  merge(proposalId: string, targetRecordId: string): Promise<void>;
  reject(proposalId: string, reasonHe: string): Promise<void>;
  markSensitive(proposalId: string, sensitivity: MemorySensitivity): Promise<void>;
  cancel(proposalId: string): Promise<void>;
}

export interface ProposalQueueProps {
  proposals: readonly MemoryProposal[];
  records: readonly MemoryRecordV2[];
  controls: ProposalControls;
  busy: boolean;
}

function ProposalCard({
  proposal,
  records,
  controls,
  busy,
}: {
  proposal: MemoryProposal;
  records: readonly MemoryRecordV2[];
  controls: ProposalControls;
  busy: boolean;
}): ReactElement {
  const [editedBody, setEditedBody] = useState(proposal.draft.bodyMarkdown);
  const [rejectReason, setRejectReason] = useState("");
  const [sourceRequest, setSourceRequest] = useState("");
  const [mergeTarget, setMergeTarget] = useState(proposal.checks.duplicateCheck.relatedIds[0] ?? "");
  const [sensitivity, setSensitivity] = useState<MemorySensitivity>(proposal.draft.sensitivity);
  const d = proposal.draft;
  const pending = proposal.status === "ממתין לאישור";

  return (
    <div
      data-testid="memory-proposal-card"
      style={{
        border: "1px solid var(--os-border)",
        borderRadius: "var(--os-radius-sm, 6px)",
        padding: "var(--os-space-3)",
        display: "grid",
        gap: "var(--os-space-2)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: "var(--os-text-sm, 13px)" }}>{d.title}</strong>
        <StatusChip status={pending ? "דורש אישור" : "מושהה"} label={proposal.status} />
      </div>

      {/* all mandated proposal fields */}
      <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)", display: "grid", gap: 2 }}>
        <div>תצפית: {proposal.observationHe}</div>
        <div>
          הוצע על ידי: {proposal.proposedByName} (<span className="os-ltr">{proposal.proposedById}</span>) ·{" "}
          <span className="os-num">{proposal.createdAt.slice(0, 16).replace("T", " ")}</span>
        </div>
        <div>
          שכבה: {MEMORY_LAYER_LABELS_HE[d.memoryLayer]} · תיקייה: {d.folder || "—"} · רגישות: {d.sensitivity} ·
          שמירה: {d.retentionPolicy}
        </div>
        <div>
          מקורות: {d.sourceIds.length > 0 ? d.sourceIds.join(", ") : "אין"} · תגיות:{" "}
          {d.tags.length > 0 ? d.tags.join(", ") : "אין"} · slug: <span className="os-ltr">{d.slug}</span>
        </div>
        {proposal.moreSourcesRequestHe && <div>בקשת מקור נוסף: {proposal.moreSourcesRequestHe}</div>}
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        <CheckLine label="אימות מקורות" check={proposal.checks.sourceValidation} />
        <CheckLine label="בדיקת כפילות" check={proposal.checks.duplicateCheck} />
        <CheckLine label="בדיקת סתירות" check={proposal.checks.contradictionCheck} />
        <CheckLine label="בדיקת רגישות" check={proposal.checks.sensitivityCheck} />
      </div>

      <textarea
        aria-label="תוכן ההצעה (ניתן לעריכה לפני אישור)"
        value={editedBody}
        onChange={(e) => setEditedBody(e.target.value)}
        rows={4}
        style={{ ...inputStyle, resize: "vertical", inlineSize: "100%" }}
      />

      {pending ? (
        <div style={{ display: "grid", gap: "var(--os-space-2)" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {busy ? (
              <OsButton variant="primary" size="sm" disabled disabledReason="פעולה מתבצעת…">
                אשר לזיכרון
              </OsButton>
            ) : (
              <OsButton
                variant="primary"
                size="sm"
                icon="check"
                onClick={() => void controls.approve(proposal.id)}
                data-testid="proposal-approve"
              >
                אשר לזיכרון
              </OsButton>
            )}
            {editedBody !== d.bodyMarkdown && !busy ? (
              <OsButton
                variant="violet"
                size="sm"
                onClick={() => void controls.editAndApprove(proposal.id, editedBody)}
                data-testid="proposal-edit-approve"
              >
                ערוך ואשר
              </OsButton>
            ) : (
              <OsButton
                variant="violet"
                size="sm"
                disabled
                disabledReason={busy ? "פעולה מתבצעת…" : "ערכו את הטקסט למעלה — ואז האישור יכלול את העריכה"}
              >
                ערוך ואשר
              </OsButton>
            )}
            {busy ? (
              <OsButton variant="ghost" size="sm" disabled disabledReason="פעולה מתבצעת…">
                בטל הצעה
              </OsButton>
            ) : (
              <OsButton
                variant="ghost"
                size="sm"
                onClick={() => void controls.cancel(proposal.id)}
                data-testid="proposal-cancel"
              >
                בטל הצעה
              </OsButton>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input
              aria-label="נימוק דחייה"
              placeholder="נימוק דחייה (חובה)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              style={inputStyle}
            />
            {rejectReason.trim() ? (
              <OsButton
                variant="danger"
                size="sm"
                onClick={() => void controls.reject(proposal.id, rejectReason.trim())}
                data-testid="proposal-reject"
              >
                דחה
              </OsButton>
            ) : (
              <OsButton variant="danger" size="sm" disabled disabledReason="דחייה מחייבת נימוק — הזינו נימוק">
                דחה
              </OsButton>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input
              aria-label="בקשת מקור נוסף"
              placeholder="איזה מקור נוסף נדרש?"
              value={sourceRequest}
              onChange={(e) => setSourceRequest(e.target.value)}
              style={inputStyle}
            />
            {sourceRequest.trim() ? (
              <OsButton
                variant="ghost"
                size="sm"
                onClick={() => void controls.requestMoreSources(proposal.id, sourceRequest.trim())}
                data-testid="proposal-request-sources"
              >
                בקש מקור נוסף
              </OsButton>
            ) : (
              <OsButton variant="ghost" size="sm" disabled disabledReason="תארו את המקור הנדרש">
                בקש מקור נוסף
              </OsButton>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <select
              aria-label="פריט יעד למיזוג"
              value={mergeTarget}
              onChange={(e) => setMergeTarget(e.target.value)}
              style={inputStyle}
            >
              <option value="">בחרו פריט קיים למיזוג…</option>
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
            {mergeTarget ? (
              <OsButton
                variant="ghost"
                size="sm"
                onClick={() => void controls.merge(proposal.id, mergeTarget)}
                data-testid="proposal-merge"
              >
                מזג עם פריט קיים
              </OsButton>
            ) : (
              <OsButton variant="ghost" size="sm" disabled disabledReason="בחרו פריט יעד למיזוג">
                מזג עם פריט קיים
              </OsButton>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <select
              aria-label="רגישות"
              value={sensitivity}
              onChange={(e) => setSensitivity(e.target.value as MemorySensitivity)}
              style={inputStyle}
            >
              {MEMORY_SENSITIVITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {busy ? (
              <OsButton variant="ghost" size="sm" disabled disabledReason="פעולה מתבצעת…">
                סמן כרגיש
              </OsButton>
            ) : (
              <OsButton
                variant="ghost"
                size="sm"
                icon="shield"
                onClick={() => void controls.markSensitive(proposal.id, sensitivity)}
                data-testid="proposal-mark-sensitive"
              >
                סמן כרגיש
              </OsButton>
            )}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
          הצעה במצב טיוטה — אימות המקורות נכשל, ולכן לא נפתחה בקשת אישור. השלימו מקור ושלחו הצעה חדשה.
        </div>
      )}
    </div>
  );
}

export function ProposalQueue({ proposals, records, controls, busy }: ProposalQueueProps): ReactElement {
  return (
    <div style={{ display: "grid", gap: "var(--os-space-3)" }} data-testid="memory-proposal-queue">
      <SectionTitle
        title={`תור הצעות לזיכרון (${proposals.length})`}
        subtitle="כל כתיבה לזיכרון הקבוע עוברת אישור אנושי בשם דרך מנוע האישורים — אין נתיב עוקף"
        icon="shield"
      />
      {proposals.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="אין הצעות ממתינות"
          reason="תור ההצעות ריק — הצעה חדשה נוצרת מהטופס למטה או על ידי סוכן."
        />
      ) : (
        proposals.map((p) => (
          <ProposalCard key={p.id} proposal={p} records={records} controls={controls} busy={busy} />
        ))
      )}
    </div>
  );
}
