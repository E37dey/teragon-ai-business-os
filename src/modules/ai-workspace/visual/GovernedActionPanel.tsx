// S16 Phase 6 — governed action panel inside the live workflow. Turns a REAL Phase-5
// recommendation into an explicit, human-reviewed, two-gate governed Obsidian APPEND:
//   [הפוך להצעה] → proposal preview (provenance + diff) → [אשר]/[דחה] → (on approve) native
//   Obsidian confirmation → one bounded write → read-back verification.
// No autonomous creation, no autonomous approval; every button is an explicit human action.
// Reuses the Phase-3 write system + Phase-6 orchestration only — no second proposal/write path.
import { useCallback, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { OsButton, StatusChip } from "@/design-system";
import { getAgentDefinition } from "@/agents/definitions";
import {
  approveProposal,
  createProposalFromRecommendation,
  executeApprovedProposal,
  rejectProposal,
  type GovernedActionState,
  type GovernedActionStatus,
} from "@/agents/workflow/governedAction";
import type { WorkflowState } from "@/agents/workflow/knowledgeWorkflow";
import { readNote } from "@/integration/obsidian/vaultBridgeClient";
import { getObsidianToken } from "@/integration/obsidian/obsidianCredential";

const stack = (gap = "var(--os-space-2)"): CSSProperties => ({ display: "grid", gap });
const muted: CSSProperties = { color: "var(--os-text-2)" };
const code2xs: CSSProperties = { fontFamily: "var(--os-font-mono, monospace)", direction: "ltr", unicodeBidi: "isolate", fontSize: "var(--os-text-2xs, 11px)" };

/** Synthetic, controlled write target (never the knowledge base; never real data). */
export const PHASE6_TARGET = "Phase6 Governed Action Proof.md";

const STATUS_CHIP: Record<GovernedActionStatus, { label: string; status: "פעיל" | "ממתין" | "דורש אישור" | "הושלם" | "חסום" | "מושבת" }> = {
  PROPOSAL_PENDING: { label: "ממתין לסקירה", status: "ממתין" },
  APPROVED_STAGING: { label: "אושר · נדרש אישור מקומי", status: "דורש אישור" },
  EXECUTED_VERIFIED: { label: "בוצע ואומת", status: "הושלם" },
  REJECTED: { label: "נדחה", status: "מושבת" },
  CONFLICT: { label: "התנגשות", status: "חסום" },
  FAILED: { label: "נכשל", status: "חסום" },
};

export function GovernedActionPanel({ wf, targetPath = PHASE6_TARGET }: { wf: WorkflowState; targetPath?: string }): ReactElement | null {
  const [ga, setGa] = useState<GovernedActionState | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const createProposal = useCallback(async () => {
    if (busyRef.current || !wf.result) return;
    busyRef.current = true;
    setBusy(true);
    // Read the CURRENT target content (Phase-1 read) so the append carries a real expectedHash
    // conflict guard. Missing target → empty base (execute will fail closed with NOT_FOUND). The
    // target comes from TRUSTED pack config, never from Vault content.
    let baseContent = "";
    const token = getObsidianToken();
    if (token) {
      const rb = await readNote(targetPath, token);
      if (rb.ok && rb.data) baseContent = rb.data.content;
    }
    const state = await createProposalFromRecommendation(wf, { targetPath, baseContent });
    setGa(state);
    setBusy(false);
    busyRef.current = false;
  }, [wf, targetPath]);

  const approve = useCallback(async () => {
    if (!ga || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    // Gate 1 (TERAGON approval) — emitted ONCE here (value, not a StrictMode-doubled updater); NO
    // Vault write. Then gate 2 (native Obsidian confirmation) happens inside execute.
    const approved = approveProposal(ga);
    setGa(approved);
    const executed = await executeApprovedProposal(approved);
    setGa(executed);
    setBusy(false);
    busyRef.current = false;
  }, [ga]);

  const reject = useCallback(() => {
    if (!ga) return;
    setGa(rejectProposal(ga)); // value, computed once — no StrictMode double-emit
  }, [ga]);

  if (!wf.result) return null;

  const p = ga?.proposal ?? null;
  const chip = ga ? STATUS_CHIP[ga.status] : null;

  return (
    <div data-testid="governed-action" style={{ ...stack("var(--os-space-2)"), padding: "var(--os-space-3)", borderRadius: "var(--os-radius-md, 12px)", background: "var(--os-surface-1)", boxShadow: "inset 0 0 0 1px var(--os-border)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
        <b style={{ fontSize: "var(--os-text-sm, 13px)" }}>פעולה מבוקרת (המלצה → הצעה → אישור → פעולה מאומתת)</b>
        {chip && <StatusChip status={chip.status} label={chip.label} />}
      </div>

      {!ga ? (
        <>
          <div style={{ ...muted, fontSize: "var(--os-text-2xs, 12px)" }}>ההמלצה אינה יוצרת הצעה אוטומטית. יצירת הצעה דורשת פעולה מפורשת של המשתמש.</div>
          <div>
            {busy ? (
              <OsButton variant="cyan" size="sm" disabled disabledReason="פועל" data-testid="governed-create">
                יוצר…
              </OsButton>
            ) : (
              <OsButton variant="cyan" size="sm" onClick={createProposal} data-testid="governed-create">
                הפוך להצעה
              </OsButton>
            )}
          </div>
        </>
      ) : (
        <div data-testid="governed-proposal" style={stack("6px")}>
          <div style={{ fontSize: "var(--os-text-2xs, 12px)" }}>
            <b>פעולה:</b> הוספה (append) לקובץ סינתטי · <span style={code2xs}>{p?.path}</span>
          </div>
          {/* WHY + which workflow + agents + real sources (provenance) */}
          <div style={{ ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>
            מקור ההצעה: תהליך <span style={code2xs}>{ga.workflowRunId}</span> · סוכן יוזם: {getAgentDefinition(p?.originatingAgentId ?? "")?.nameHe ?? p?.originatingAgentId}
          </div>
          <div style={{ ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>
            סוכנים תורמים: {wf.result.contributingAgents.map((a) => getAgentDefinition(a)?.nameHe ?? a).join(" · ")}
          </div>
          <div style={{ ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>
            מקורות ידע: <span style={code2xs}>{(p?.sourceNotePaths ?? []).join(" · ")}</span>
          </div>
          {/* The exact change (append block = diff) */}
          <div>
            <div style={{ ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>השינוי המוצע (בלוק שיתווסף):</div>
            <pre data-testid="governed-diff" style={{ ...code2xs, margin: 0, padding: "var(--os-space-2)", borderRadius: 8, background: "var(--os-surface-2)", boxShadow: "inset 0 0 0 1px var(--os-border)", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "22vh", overflow: "auto" }}>
              {p?.appendBlock}
            </pre>
          </div>
          {/* Real lineage ids */}
          <div data-testid="governed-provenance" style={{ ...muted, ...code2xs }}>
            proposal={p?.proposalId} · mutation={p?.mutationId} · run={ga.workflowRunId}
          </div>

          {ga.status === "PROPOSAL_PENDING" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {busy ? (
                <OsButton variant="cyan" size="sm" disabled disabledReason="מאשר" data-testid="governed-approve">
                  מאשר…
                </OsButton>
              ) : (
                <OsButton variant="cyan" size="sm" onClick={approve} data-testid="governed-approve">
                  אשר
                </OsButton>
              )}
              {busy ? (
                <OsButton variant="ghost" size="sm" disabled disabledReason="פועל" data-testid="governed-reject">
                  דחה
                </OsButton>
              ) : (
                <OsButton variant="ghost" size="sm" onClick={reject} data-testid="governed-reject">
                  דחה
                </OsButton>
              )}
            </div>
          )}
          {ga.status === "APPROVED_STAGING" && (
            <div role="status" style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-warning, #b8860b)" }}>
              אושר ב-TERAGON (שער 1). ממתין לאישור אנושי מקומי בתוך Obsidian (שער 2) — TERAGON לבדו אינו כותב.
            </div>
          )}
          {ga.detailHe && ga.status !== "APPROVED_STAGING" && (
            <div
              role={ga.status === "EXECUTED_VERIFIED" ? "status" : "alert"}
              data-testid="governed-result"
              style={{ fontSize: "var(--os-text-2xs, 12px)", color: ga.status === "EXECUTED_VERIFIED" ? "var(--os-success, #1a7f4b)" : ga.status === "PROPOSAL_PENDING" ? "var(--os-text)" : "var(--os-danger, #c0392b)" }}
            >
              {ga.detailHe}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
