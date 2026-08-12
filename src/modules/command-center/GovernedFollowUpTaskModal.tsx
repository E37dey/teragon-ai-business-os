// Phase 9 — Governed Follow-up Task modal (משימת מעקב מבוקרת).
//
// Recommendation → explicit proposal → human approve/reject → verified. Reuses the
// canonical ApprovalEngine via governedTaskProposal.ts. A signal alone creates nothing:
// only the explicit "צור הצעה למשימת מעקב" click creates the ApprovalEngine proposal, and
// only an explicit Approve executes + verifies. The originating record is never mutated.
import { useCallback, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { Modal, OsButton, StatusChip, useToast } from "@/design-system";
import { getAgentEngine } from "@/components/ai/engine";
import { CEO_USER_ID } from "@/repositories/seed/seedData";
import type { BusinessSignal } from "@/integration/command-center/businessSignals";
import {
  approveAndExecuteFollowUpTask,
  createFollowUpTaskProposal,
  deriveFollowUpRecommendation,
  rejectFollowUpTaskProposal,
  type FollowUpOutcome,
  type FollowUpProposalRef,
} from "@/agents/governedTaskProposal";

const stack = (gap = "var(--os-space-3)"): CSSProperties => ({ display: "grid", gap });
const row: CSSProperties = { display: "flex", gap: "var(--os-space-2)", alignItems: "center", flexWrap: "wrap" };
const muted: CSSProperties = { color: "var(--os-text-2)" };
const metaRow: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "var(--os-space-2)", fontSize: "var(--os-text-2xs, 11px)" };

type Phase = "preview" | "proposed" | "verified" | "already-exists" | "rejected" | "failed" | "busy";

/** The trusted session actor for the pilot — a trusted app constant, NEVER from the signal. */
const TRUSTED_ACTOR = CEO_USER_ID;

export function GovernedFollowUpTaskModal({ signal, onClose, onChanged }: { signal: BusinessSignal; onClose: () => void; onChanged?: () => void }): ReactElement {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("preview");
  const [ref, setRef] = useState<FollowUpProposalRef | null>(null);
  const [detail, setDetail] = useState<string>("");

  // Deterministic recommendation for THIS signal (pure — no side effects).
  const rec = useMemo(() => deriveFollowUpRecommendation(signal, TRUSTED_ACTOR), [signal]);
  const deps = useMemo(() => {
    const { stores, approvalEngine } = getAgentEngine();
    return { stores, approvalEngine };
  }, []);

  const createProposal = useCallback(async () => {
    setPhase("busy");
    try {
      const created = await createFollowUpTaskProposal(deps, rec, TRUSTED_ACTOR);
      setRef(created);
      setPhase("proposed");
    } catch {
      setPhase("preview");
      toast("יצירת ההצעה נכשלה", "danger");
    }
  }, [deps, rec, toast]);

  const approve = useCallback(async () => {
    if (!ref) return;
    setPhase("busy");
    const result = await approveAndExecuteFollowUpTask(deps, ref, TRUSTED_ACTOR);
    setDetail(result.detailHe);
    const map: Record<FollowUpOutcome, Phase> = { "created-verified": "verified", "already-exists": "already-exists", rejected: "rejected", failed: "failed" };
    setPhase(map[result.outcome]);
    if (result.outcome === "created-verified" || result.outcome === "already-exists") {
      onChanged?.();
      toast(result.outcome === "created-verified" ? "נוצרה משימת מעקב ואומתה" : "משימת מעקב כבר קיימת", "success");
    } else {
      toast("הביצוע נכשל", "danger");
    }
  }, [deps, ref, onChanged, toast]);

  const reject = useCallback(async () => {
    if (!ref) return;
    setPhase("busy");
    await rejectFollowUpTaskProposal(deps, ref, TRUSTED_ACTOR, "נדחה ידנית — אין צורך במעקב כרגע");
    setPhase("rejected");
    toast("ההצעה נדחתה — לא נוצרה משימה", "info");
  }, [deps, ref, toast]);

  const openTask = useCallback(() => {
    onClose();
    navigate("/tasks");
  }, [navigate, onClose]);

  return (
    <Modal open onClose={onClose} title="משימת מעקב מבוקרת" footer={<Footer phase={phase} onClose={onClose} onCreate={createProposal} onApprove={approve} onReject={reject} onOpenTask={openTask} />}>
      <div style={stack()} data-testid="gft-modal">
        {/* Exact proposal preview — what will be created, before any approval. */}
        <div data-testid="gft-preview" style={{ ...stack("var(--os-space-2)"), border: "1px solid var(--os-border)", borderRadius: "var(--os-radius-sm, 8px)", padding: "var(--os-space-3)" }}>
          <div style={{ ...row, justifyContent: "space-between" }}>
            <b>{rec.title}</b>
            <StatusChip status="ממתין" label="CREATE ONE TASK" />
          </div>
          <div style={{ ...muted, fontSize: "var(--os-text-2xs, 12px)", whiteSpace: "pre-wrap" }}>{rec.description}</div>
          <Meta k="עדיפות" v={rec.priority} />
          <Meta k="יעד (due)" v={new Date(rec.due).toLocaleDateString("he-IL")} />
          <Meta k="בעלים" v={rec.ownerId} />
          <Meta k="רשומת מקור" v={rec.relatedRef ?? "—"} />
          <Meta k="אות עסקי" v={`${signal.type} · ${signal.id}`} />
          {ref ? <Meta k="מזהה הצעה" v={ref.approvalId} /> : null}
          <div role="note" style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-warning, #b8860b)" }}>
            נוצרת משימת מעקב חדשה בלבד — רשומת המקור אינה מתעדכנת. הביצוע דורש אישור אנושי מפורש.
          </div>
        </div>

        {phase === "verified" && <div role="status" data-testid="gft-verified" style={{ color: "var(--os-success, #2e7d32)", fontSize: "var(--os-text-sm, 13px)" }}>נוצרה משימת מעקב ואומתה בקריאה חוזרת. {detail}</div>}
        {phase === "already-exists" && <div role="status" data-testid="gft-already-exists" style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm, 13px)" }}>{detail}</div>}
        {phase === "rejected" && <div role="status" data-testid="gft-rejected" style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm, 13px)" }}>ההצעה נדחתה — לא נוצרה משימה.</div>}
        {phase === "failed" && <div role="alert" data-testid="gft-failed" style={{ color: "var(--os-danger, #c0392b)", fontSize: "var(--os-text-sm, 13px)" }}>{detail || "הביצוע נכשל."}</div>}
      </div>
    </Modal>
  );
}

function Meta({ k, v }: { k: string; v: string }): ReactElement {
  return (
    <div style={metaRow}>
      <span style={muted}>{k}</span>
      <span style={{ fontFamily: k.includes("מזהה") || k.includes("מקור") || k.includes("אות") ? "var(--os-font-mono, monospace)" : undefined, direction: k.includes("מזהה") ? "ltr" : undefined, unicodeBidi: "isolate" }}>{v}</span>
    </div>
  );
}

function Footer({ phase, onClose, onCreate, onApprove, onReject, onOpenTask }: { phase: Phase; onClose: () => void; onCreate: () => void; onApprove: () => void; onReject: () => void; onOpenTask: () => void }): ReactElement {
  if (phase === "verified" || phase === "already-exists") {
    return (
      <div style={row}>
        <OsButton variant="ghost" onClick={onClose}>סגירה</OsButton>
        <OsButton variant="primary" onClick={onOpenTask} data-testid="gft-open-task">פתח משימה</OsButton>
      </div>
    );
  }
  if (phase === "rejected" || phase === "failed") {
    return <OsButton variant="ghost" onClick={onClose}>סגירה</OsButton>;
  }
  if (phase === "proposed") {
    return (
      <div style={row}>
        <OsButton variant="ghost" onClick={onClose}>ביטול</OsButton>
        <OsButton variant="danger" onClick={onReject} data-testid="gft-reject">דחה</OsButton>
        <OsButton variant="primary" onClick={onApprove} data-testid="gft-approve">אשר וצור משימה</OsButton>
      </div>
    );
  }
  if (phase === "busy") {
    return <OsButton variant="primary" disabled disabledReason="בתהליך">בתהליך…</OsButton>;
  }
  // preview
  return (
    <div style={row}>
      <OsButton variant="ghost" onClick={onClose}>ביטול</OsButton>
      <OsButton variant="primary" onClick={onCreate} data-testid="gft-create-proposal">צור הצעה למשימת מעקב</OsButton>
    </div>
  );
}
