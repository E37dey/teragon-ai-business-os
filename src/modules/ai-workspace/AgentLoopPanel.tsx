// S13.5 (PR E) — "תהליך סוכנים מודרך": a compact, human-controlled bounded loop
// over the existing engine. Secondary to "מה דורש טיפול עכשיו?". Every transition
// is an explicit button click — the panel NEVER advances a step on its own.
import { useState } from "react";
import type { ReactElement } from "react";
import { EmptyState, OsButton, Panel, SectionTitle, StatusChip } from "@/design-system";
import { useAuth } from "@/auth/useAuth";
import { getAgentDefinition } from "@/agents/definitions";
import {
  LOOP_MAX_STEPS,
  approveMutation,
  initialLoop,
  isTerminal,
  rejectMutation,
  runFixerProposal,
  runHunter,
  runOrchestrator,
  stageApproval,
  startLoop,
  stopLoop,
  type LoopState,
  type LoopStatus,
} from "./agentLoop";

const STATUS_LABEL: Record<LoopStatus, { label: string; chip: "פעיל" | "ממתין" | "מושבת" }> = {
  IDLE: { label: "מוכן להתחלה", chip: "ממתין" },
  PLANNED: { label: "מתוכנן", chip: "ממתין" },
  WAITING_FOR_USER: { label: "ממתין להמשך שלך", chip: "ממתין" },
  AWAITING_APPROVAL: { label: "ממתין לאישורך", chip: "ממתין" },
  COMPLETED: { label: "הושלם", chip: "פעיל" },
  REJECTED: { label: "נדחה", chip: "מושבת" },
  STOPPED: { label: "נעצר", chip: "מושבת" },
  BLOCKED: { label: "נחסם", chip: "מושבת" },
  FAILED: { label: "נכשל", chip: "מושבת" },
};

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}
function timeHe(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function AgentLoopPanel(): ReactElement {
  const { identity } = useAuth();
  const orgId = identity?.organizationId?.trim() || "org-1";
  const [loop, setLoop] = useState<LoopState>(() => initialLoop());

  const active = loop.status !== "IDLE" && !isTerminal(loop.status);

  // The primary next-action dispatches by state — one explicit user click per step.
  function onNext(): void {
    setLoop((prev) => {
      switch (prev.status) {
        case "IDLE":
          return startLoop(prev, { orgId });
        case "PLANNED":
          return runHunter(prev);
        case "WAITING_FOR_USER":
          return prev.currentStep === 1
            ? runFixerProposal(prev)
            : prev.currentStep === 2
              ? stageApproval(prev)
              : prev.currentStep === 3
                ? runOrchestrator(prev)
                : prev;
        default:
          return prev;
      }
    });
  }

  return (
    <Panel variant="panel" style={{ padding: "var(--os-space-5)" }} data-testid="agent-loop">
      <SectionTitle
        icon="network"
        title="תהליך סוכנים מודרך"
        subtitle="בדיקת והשלמת נתוני לקוח — ארבעה שלבים, בשליטתך המלאה"
      />

      {/* honest, bounded framing (once) */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBlock: "var(--os-space-3)" }}>
        <StatusChip status="ממתין" label="תהליך דמו מקומי ומוגבל" />
        <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
          מנוע דטרמיניסטי מקומי · נתוני דמו · {LOOP_MAX_STEPS} שלבים לכל היותר · ללא מודל מרוחק · ללא שרשור אוטומטי
        </span>
      </div>
      <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)", marginBlockEnd: "var(--os-space-3)" }}>
        המערכת ממתינה לאישור שלך בין שלבים — אף שלב אינו רץ אוטומטית.
      </div>

      {/* status + step counter */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <StatusChip status={STATUS_LABEL[loop.status].chip} label={STATUS_LABEL[loop.status].label} />
        <span className="os-num" style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }} data-testid="loop-step-counter">
          שלב {loop.currentStep} / {loop.maximumSteps}
        </span>
      </div>

      {/* trace timeline — one entry per completed step (evidence collapsed) */}
      {loop.stepResults.length > 0 && (
        <div style={{ display: "grid", gap: "var(--os-space-2)", marginBlockStart: "var(--os-space-3)" }} data-testid="loop-timeline">
          {loop.stepResults.map((r) => (
            <div key={`${r.step}:${r.correlationId}`} data-testid="loop-step" style={{ display: "flex", gap: "var(--os-space-3)", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", fontSize: "var(--os-text-sm)", borderBlockEnd: "1px solid var(--os-border)", paddingBlockEnd: 4 }}>
              <span>
                <span className="os-num">{r.step}.</span> {getAgentDefinition(r.agentId)?.nameHe ?? r.agentId}{" "}
                <span className="os-ltr" style={{ color: "var(--os-muted)" }}>· {r.actionId}</span>
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <StatusChip status={r.status === "applied" || r.status === "ok" ? "פעיל" : "ממתין"} label={r.status === "applied" ? "הוחל" : r.status === "ok" ? "בוצע" : r.status} />
                <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-2xs)" }}>{r.evidenceCount} ראיות</span>
                <span className="os-num" style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>{timeHe(r.at)}</span>
                <span className="os-ltr" style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }} title={r.correlationId}>{shortId(r.correlationId)}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* latest summary / stop reason */}
      {loop.stepResults.length > 0 && loop.status === "COMPLETED" && (
        <p style={{ margin: "var(--os-space-3) 0 0", fontSize: "var(--os-text-sm)" }}>{loop.stepResults[loop.stepResults.length - 1]?.summary}</p>
      )}
      {loop.stopReason && (
        <p role="status" style={{ margin: "var(--os-space-3) 0 0", fontSize: "var(--os-text-sm)", color: "var(--os-text-2)" }} data-testid="loop-stop-reason">
          {loop.stopReason}
        </p>
      )}

      {loop.status === "IDLE" && loop.stepResults.length === 0 && (
        <div style={{ marginBlockStart: "var(--os-space-3)" }}>
          <EmptyState icon="network" title="תהליך מודרך זמין" reason="הפעילו תהליך של 4 שלבים לבדיקה והשלמה של נתוני לקוח — בשליטתכם המלאה." />
        </div>
      )}

      {/* controls — one explicit action per transition */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBlockStart: "var(--os-space-4)" }}>
        {loop.status === "AWAITING_APPROVAL" ? (
          <>
            <OsButton size="sm" variant="approve" icon="check" onClick={() => setLoop((p) => approveMutation(p))} data-testid="loop-approve">
              אשר והחל (דמו מקומי)
            </OsButton>
            <OsButton size="sm" variant="ghost" onClick={() => setLoop((p) => rejectMutation(p))} data-testid="loop-reject">
              דחה
            </OsButton>
          </>
        ) : loop.nextActionHe ? (
          <OsButton size="sm" variant="primary" icon="chevron-forward" onClick={onNext} data-testid="loop-next">
            {loop.nextActionHe}
          </OsButton>
        ) : null}

        {active && (
          <OsButton size="sm" variant="ghost" icon="alert" onClick={() => setLoop((p) => stopLoop(p))} data-testid="loop-stop">
            עצור תהליך
          </OsButton>
        )}
        {isTerminal(loop.status) && (
          <OsButton size="sm" variant="ghost" onClick={() => setLoop(initialLoop())} data-testid="loop-reset">
            תהליך חדש
          </OsButton>
        )}
      </div>
    </Panel>
  );
}
