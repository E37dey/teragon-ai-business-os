// W5-D — the ONE approval panel. Every button drives the canonical
// ApprovalEngine (decide / execute / retry / cancel / rollback / workflowState).
// Nothing here mutates approvals directly; nothing fakes success.
// Canonical approver identity: צחי זוסטייהם (CEO_USER_ID).
import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { EmptyState, Modal, OsButton, OsIcon, StatusChip, useToast } from "@/design-system";
import type { Approval, AuditEvent, Evidence } from "@/domain/types";
import type { ExecutionPayload } from "@/domain/agents";
import type { ApprovalWorkflowState } from "@/agents";
import { AgentGovernanceError } from "@/agents";
import { AIError } from "@/ai/contracts/AIProvider";
import { invalidateCollections } from "@/app/data/hooks";
import { CEO_USER_ID } from "@/repositories/seed";
import { CANONICAL_USER } from "@/app/identity";
import { getAgentEngine } from "@/components/ai/engine";
import { WORKFLOW_STATE_LABELS_HE } from "./workflowLabels";

function stateChip(state: ApprovalWorkflowState): ReactElement {
  const map: Record<
    ApprovalWorkflowState,
    "ממתין" | "פעיל" | "הושלם" | "חסום" | "אזהרה" | "מושבת"
  > = {
    pending: "ממתין",
    approved: "פעיל",
    edited: "פעיל",
    rejected: "חסום",
    expired: "מושבת",
    cancelled: "מושבת",
    executed: "הושלם",
    "execution-failed": "אזהרה",
    "rolled-back": "אזהרה",
  };
  return <StatusChip status={map[state]} label={WORKFLOW_STATE_LABELS_HE[state]} />;
}

function errorMessageHe(err: unknown): string {
  if (err instanceof AgentGovernanceError) return err.userMessageHe;
  if (err instanceof AIError) return err.userMessageHe;
  if (err instanceof Error) return err.message;
  return "שגיאה לא מזוהה";
}

interface PanelData {
  approval: Approval | null;
  state: ApprovalWorkflowState;
  payload: ExecutionPayload | null;
  evidence: Evidence[];
  audit: AuditEvent[];
}

export interface ApprovalPanelProps {
  runId: string;
  approvalId: string;
  /** notify the page after any engine mutation (refetch queries etc.) */
  onChanged?: () => void;
  compact?: boolean;
}

type DialogKind = "edit" | "fix" | "reject" | "evidence" | null;

export function ApprovalPanel({
  runId,
  approvalId,
  onChanged,
  compact = false,
}: ApprovalPanelProps): ReactElement {
  const { toast } = useToast();
  const [data, setData] = useState<PanelData | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [noteText, setNoteText] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [lastError, setLastError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const { stores, approvalEngine } = getAgentEngine();
    const approval = (await stores.approvals.get(approvalId)) ?? null;
    const state = await approvalEngine.workflowState(runId, approvalId);
    // effective payload — derived from persisted events exactly like the engine
    const events = (await stores.events.list())
      .filter((e) => e.runId === runId)
      .sort((a, b) => a.seq - b.seq);
    let payload: ExecutionPayload | null = null;
    for (const rec of events) {
      const e = rec.event;
      if (e.type === "ApprovalRequested" && e.approvalId === approvalId) {
        payload = e.executionPayload;
      }
      if (
        e.type === "ApprovalDecided" &&
        e.approvalId === approvalId &&
        e.decision === "edited" &&
        e.editedPayload
      ) {
        payload = e.editedPayload;
      }
    }
    const evidence = (await stores.evidence.list()).filter((ev) =>
      ev.subjectRef.startsWith(`agent-task:${runId}-`),
    );
    const audit = (await stores.audit.list())
      .filter((a) => a.entityRef === `approval:${approvalId}`)
      .sort((a, b) => a.at.localeCompare(b.at));
    setData({ approval, state, payload, evidence, audit });
  }, [runId, approvalId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const afterChange = useCallback(async (): Promise<void> => {
    await refresh();
    await invalidateCollections([
      "approvals",
      "agentRuns",
      "agentEvents",
      "auditEvents",
      "tasks",
      "activities",
      "agentTasks",
      "agentConflicts",
      "notifications",
    ]);
    onChanged?.();
  }, [refresh, onChanged]);

  const run = useCallback(
    async (fn: () => Promise<void>): Promise<void> => {
      setBusy(true);
      setLastError(null);
      try {
        await fn();
      } catch (err) {
        const msg = errorMessageHe(err);
        setLastError(msg);
        toast(msg, "danger");
      } finally {
        setBusy(false);
        await afterChange();
      }
    },
    [afterChange, toast],
  );

  if (data === null) {
    return (
      <div role="status" style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-2)" }}>
        טוען את בקשת האישור…
      </div>
    );
  }
  if (data.approval === null) {
    return (
      <EmptyState
        icon="shield"
        title="בקשת האישור לא נמצאה"
        reason={`לא קיימת רשומת אישור "${approvalId}" במאגר.`}
      />
    );
  }

  const { approval, state, payload } = data;
  const engine = getAgentEngine().approvalEngine;
  const decidable = state === "pending";
  const executedOnce = state === "executed";
  const canRetry = state === "execution-failed";
  const editable = decidable && payload !== null && payload.kind === "external";

  const approve = (): void =>
    void run(async () => {
      await engine.decide({
        runId,
        approvalId,
        kind: "approve",
        decidedById: CEO_USER_ID,
      });
      if (payload !== null) {
        const result = await engine.execute(runId, approvalId, CEO_USER_ID);
        toast(
          result.outcome === "הצלחה"
            ? `אושר ובוצע: ${result.detailHe}`
            : `הביצוע נכשל: ${result.detailHe}`,
          result.outcome === "הצלחה" ? "success" : "danger",
        );
      } else {
        toast("ההמלצה אושרה (אישור המלצה בלבד — אין פעולת ביצוע)", "success");
      }
    });

  const openEdit = (): void => {
    if (payload?.kind === "external") {
      setEditDescription(payload.descriptionHe);
      const strings: Record<string, string> = {};
      for (const [k, v] of Object.entries(payload.data)) {
        if (typeof v === "string") strings[k] = v;
      }
      setEditData(strings);
    }
    setDialog("edit");
  };

  const submitEdit = (): void => {
    if (payload?.kind !== "external") return;
    setDialog(null);
    void run(async () => {
      const edited: ExecutionPayload = {
        ...payload,
        descriptionHe: editDescription,
        data: { ...payload.data, ...editData },
      };
      await engine.decide({
        runId,
        approvalId,
        kind: "edit",
        decidedById: CEO_USER_ID,
        noteHe: "נערך על ידי המאשר לפני ביצוע",
        editedPayload: edited,
      });
      const result = await engine.execute(runId, approvalId, CEO_USER_ID);
      toast(
        result.outcome === "הצלחה"
          ? `אושר עם עריכה ובוצע: ${result.detailHe}`
          : `הביצוע נכשל: ${result.detailHe}`,
        result.outcome === "הצלחה" ? "success" : "danger",
      );
    });
  };

  const submitNote = (kind: "fix" | "reject"): void => {
    const note = noteText.trim();
    if (note === "") {
      toast("נדרש נימוק — דחייה או בקשת תיקון ללא נימוק אינן נשמרות", "warning");
      return;
    }
    setDialog(null);
    setNoteText("");
    void run(async () => {
      await engine.decide({
        runId,
        approvalId,
        kind: "reject",
        decidedById: CEO_USER_ID,
        noteHe: kind === "fix" ? `בקשת תיקון: ${note}` : note,
      });
      toast(kind === "fix" ? "נשלחה בקשת תיקון (נרשמה כדחייה מנומקת)" : "הבקשה נדחתה", "info");
    });
  };

  const cancelAction = (): void =>
    void run(async () => {
      if (decidable) {
        await engine.cancel(runId, approvalId, CEO_USER_ID);
        toast("בקשת האישור בוטלה", "info");
      } else if (executedOnce) {
        const result = await engine.rollback(runId, approvalId, CEO_USER_ID);
        toast(`הפעולה בוטלה: ${result.detailHe}`, "success");
      }
    });

  const retry = (): void =>
    void run(async () => {
      const result = await engine.retryFailedExecution(runId, approvalId, CEO_USER_ID);
      toast(
        result.outcome === "הצלחה"
          ? `הביצוע הצליח: ${result.detailHe}`
          : `הביצוע נכשל שוב: ${result.detailHe}`,
        result.outcome === "הצלחה" ? "success" : "danger",
      );
    });

  const disabledReason = busy
    ? "פעולה נשמרת…"
    : !decidable
      ? `האישור כבר הוכרע (${WORKFLOW_STATE_LABELS_HE[state]})`
      : "";

  return (
    <div
      data-testid="approval-panel"
      data-approval-id={approvalId}
      style={{
        display: "grid",
        gap: "var(--os-space-3)",
        border: "1px solid var(--os-border-strong)",
        borderRadius: "var(--os-radius-md, 8px)",
        background: "var(--os-raised)",
        paddingBlock: "var(--os-space-4)",
        paddingInline: "var(--os-space-4)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "var(--os-space-2)",
          flexWrap: "wrap",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
          <OsIcon name="shield" size={14} />
          בקרת אישור
        </span>
        {stateChip(state)}
      </div>

      <div style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-2)" }}>
        {approval.note}
      </div>

      {!compact && payload !== null && (
        <div
          style={{
            fontSize: "var(--os-text-2xs, 11px)",
            color: "var(--os-text-2)",
            border: "1px solid var(--os-border)",
            borderRadius: "var(--os-radius-sm, 6px)",
            paddingBlock: "var(--os-space-2)",
            paddingInline: "var(--os-space-3)",
          }}
        >
          <strong style={{ color: "var(--os-text)" }}>מה יבוצע לאחר אישור: </strong>
          {payload.kind === "external"
            ? payload.descriptionHe
            : payload.kind === "task-creation"
              ? `יצירת רשומה באוסף ${payload.collection}`
              : `עדכון השדה "${payload.field}" ברשומה ${payload.recordId} (${payload.collection})`}
        </div>
      )}
      {!compact && payload === null && (
        <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
          אישור המלצה בלבד — אין פעולת ביצוע ממוכנת מאחורי הבקשה
        </div>
      )}

      {lastError !== null && (
        <div
          role="alert"
          style={{ fontSize: "var(--os-text-2xs, 12px)", color: "var(--danger-text)" }}
        >
          {lastError}
        </div>
      )}

      <div style={{ display: "flex", gap: "var(--os-space-2)", flexWrap: "wrap" }}>
        {decidable && !busy ? (
          <OsButton variant="approve" size="sm" icon="check" onClick={approve}>
            אשר
          </OsButton>
        ) : (
          <OsButton variant="approve" size="sm" disabled disabledReason={disabledReason}>
            אשר
          </OsButton>
        )}
        {editable && !busy ? (
          <OsButton variant="cyan" size="sm" onClick={openEdit}>
            ערוך ואשר
          </OsButton>
        ) : (
          <OsButton
            variant="cyan"
            size="sm"
            disabled
            disabledReason={
              disabledReason ||
              (payload === null
                ? "אישור המלצה בלבד — אין נוסח לביצוע שניתן לערוך"
                : "עריכה נתמכת כרגע רק לפעולות חיצוניות (external)")
            }
          >
            ערוך ואשר
          </OsButton>
        )}
        {decidable && !busy ? (
          <OsButton variant="ghost" size="sm" onClick={() => setDialog("fix")}>
            בקש תיקון
          </OsButton>
        ) : (
          <OsButton variant="ghost" size="sm" disabled disabledReason={disabledReason}>
            בקש תיקון
          </OsButton>
        )}
        {decidable && !busy ? (
          <OsButton variant="reject" size="sm" icon="x" onClick={() => setDialog("reject")}>
            דחה
          </OsButton>
        ) : (
          <OsButton variant="reject" size="sm" disabled disabledReason={disabledReason}>
            דחה
          </OsButton>
        )}
        <OsButton variant="ghost" size="sm" icon="evidence" onClick={() => setDialog("evidence")}>
          פתח ראיות
        </OsButton>
        {(decidable || executedOnce) && !busy ? (
          <OsButton variant="danger" size="sm" onClick={cancelAction}>
            {executedOnce ? "בטל פעולה (rollback)" : "בטל פעולה"}
          </OsButton>
        ) : (
          <OsButton
            variant="danger"
            size="sm"
            disabled
            disabledReason={
              busy ? "פעולה נשמרת…" : `אין מה לבטל במצב הנוכחי (${WORKFLOW_STATE_LABELS_HE[state]})`
            }
          >
            בטל פעולה
          </OsButton>
        )}
        {canRetry &&
          (!busy ? (
            <OsButton variant="primary" size="sm" onClick={retry}>
              נסה ביצוע שוב
            </OsButton>
          ) : (
            <OsButton variant="primary" size="sm" disabled disabledReason="פעולה נשמרת…">
              נסה ביצוע שוב
            </OsButton>
          ))}
      </div>

      <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
        מאשר: {CANONICAL_USER.name} · כל החלטה נרשמת ביומן הביקורת
      </div>

      {/* edit dialog */}
      <Modal
        open={dialog === "edit"}
        onClose={() => setDialog(null)}
        title="ערוך ואשר — הנוסח הערוך הוא שיבוצע"
        footer={
          <div style={{ display: "flex", gap: "var(--os-space-2)" }}>
            <OsButton variant="approve" size="sm" onClick={submitEdit}>
              אשר עם העריכה
            </OsButton>
            <OsButton variant="ghost" size="sm" onClick={() => setDialog(null)}>
              ביטול
            </OsButton>
          </div>
        }
      >
        <div style={{ display: "grid", gap: "var(--os-space-3)" }}>
          <label style={{ display: "grid", gap: 4, fontSize: "var(--os-text-sm, 13px)" }}>
            תיאור הפעולה
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={2}
              style={{ resize: "vertical" }}
            />
          </label>
          {Object.entries(editData).map(([key, value]) => (
            <label
              key={key}
              style={{ display: "grid", gap: 4, fontSize: "var(--os-text-sm, 13px)" }}
            >
              {key}
              <textarea
                value={value}
                onChange={(e) => setEditData((prev) => ({ ...prev, [key]: e.target.value }))}
                rows={3}
                style={{ resize: "vertical" }}
              />
            </label>
          ))}
        </div>
      </Modal>

      {/* fix / reject dialogs — a note is mandatory */}
      <Modal
        open={dialog === "fix" || dialog === "reject"}
        onClose={() => setDialog(null)}
        title={dialog === "fix" ? "בקשת תיקון — נימוק חובה" : "דחייה — נימוק חובה"}
        footer={
          <div style={{ display: "flex", gap: "var(--os-space-2)" }}>
            <OsButton
              variant={dialog === "fix" ? "primary" : "reject"}
              size="sm"
              onClick={() => submitNote(dialog === "fix" ? "fix" : "reject")}
            >
              {dialog === "fix" ? "שלח בקשת תיקון" : "דחה"}
            </OsButton>
            <OsButton variant="ghost" size="sm" onClick={() => setDialog(null)}>
              ביטול
            </OsButton>
          </div>
        }
      >
        <label style={{ display: "grid", gap: 4, fontSize: "var(--os-text-sm, 13px)" }}>
          {dialog === "fix"
            ? "מה נדרש לתקן לפני אישור? (נרשם כדחייה מנומקת — הסוכן יגיש מחדש)"
            : "נימוק הדחייה"}
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            style={{ resize: "vertical" }}
            data-testid="approval-note-input"
          />
        </label>
      </Modal>

      {/* evidence dialog */}
      <Modal
        open={dialog === "evidence"}
        onClose={() => setDialog(null)}
        title="ראיות ויומן ביקורת"
      >
        <div style={{ display: "grid", gap: "var(--os-space-3)" }}>
          <div style={{ fontWeight: 600, fontSize: "var(--os-text-sm, 13px)" }}>
            ראיות הריצה ({data.evidence.length})
          </div>
          {data.evidence.length === 0 ? (
            <EmptyState title="אין רשומות ראיה" reason="לריצה זו לא נשמרו רשומות ראיה במאגר." />
          ) : (
            <ul
              style={{
                margin: 0,
                paddingInlineStart: "1.2em",
                fontSize: "var(--os-text-2xs, 12px)",
                color: "var(--os-text-2)",
                display: "grid",
                gap: 4,
              }}
            >
              {data.evidence.map((ev) => (
                <li key={ev.id}>
                  {ev.claim}{" "}
                  <span className="os-ltr" style={{ color: "var(--os-muted)" }}>
                    ({ev.sourceRef})
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div style={{ fontWeight: 600, fontSize: "var(--os-text-sm, 13px)" }}>
            יומן ביקורת של האישור ({data.audit.length})
          </div>
          {data.audit.length === 0 ? (
            <EmptyState
              title="אין רשומות ביקורת"
              reason="טרם נרשמו אירועי ביקורת לבקשת אישור זו."
            />
          ) : (
            <ul
              style={{
                margin: 0,
                paddingInlineStart: "1.2em",
                fontSize: "var(--os-text-2xs, 12px)",
                color: "var(--os-text-2)",
                display: "grid",
                gap: 4,
              }}
            >
              {data.audit.map((a) => (
                <li key={a.id}>
                  <span className="os-ltr">{a.at.slice(0, 19).replace("T", " ")}</span> · {a.actor}{" "}
                  · {a.action} — {a.details}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </div>
  );
}
