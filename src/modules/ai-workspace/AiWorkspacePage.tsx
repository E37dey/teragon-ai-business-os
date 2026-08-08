// S13.3 — מרחב AI (/ai-workspace): one focused Workspace over the existing
// deterministic Agent Action Engine. Presentation/orchestration only — it reuses
// the SAME registry, runAgentAction, result schema and approval gate as /agents.
// It answers four questions: what needs attention · which agent helps · what did
// agents find · what needs approval. No remote model; synthetic demo data only.
//
// APPROVAL TRUTH: the approval queue ("ממתין לאישורך") contains ONLY real
// AgentActionResult instances whose status is truly `awaiting_approval` — produced
// when a user runs an approval-gated action WITHOUT approval. It is NEVER derived
// from findings/candidates/recommendations. An empty queue is the honest default.
import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import {
  EmptyState,
  KpiCard,
  OsButton,
  Panel,
  SectionTitle,
  StatusChip,
} from "@/design-system";
import { HideShellRail } from "@/app/rail";
import { AgentActionsPanel } from "@/modules/agents-ui/AgentActionsPanel";
import { AgentLoopPanel } from "./AgentLoopPanel";
import { AGENT_IDS, getAgentDefinition } from "@/agents/definitions";
import {
  runAgentAction,
  type AgentActionResult,
  type FindingSeverity,
} from "@/agents/actions";
import {
  availableAgentCount,
  buildAttention,
  type AttentionItem,
} from "./workspaceModel";

const SEVERITY: Record<FindingSeverity, { labelHe: string; color: string }> = {
  high: { labelHe: "גבוהה", color: "var(--danger-text, #c0392b)" },
  medium: { labelHe: "בינונית", color: "var(--warning-text, #b8860b)" },
  low: { labelHe: "נמוכה", color: "var(--os-text-2)" },
  info: { labelHe: "מידע", color: "var(--os-text-2)" },
};

interface RecentItem {
  readonly key: string;
  readonly agentHe: string;
  readonly actionId: string;
  readonly status: AgentActionResult["status"];
  readonly at: string;
  readonly correlationId: string;
}

/** A REAL awaiting_approval instance (not a candidate) queued for the user. */
interface PendingApproval {
  readonly key: string; // actionId + inputs — dedups repeat stagings
  readonly actionId: string;
  readonly agentId: string;
  readonly inputs: Readonly<Record<string, string>>;
  readonly result: AgentActionResult; // status === "awaiting_approval"
}

const STATUS_LABEL: Record<AgentActionResult["status"], string> = {
  ok: "הושלם",
  applied: "הוחל",
  empty: "אין ממצאים",
  awaiting_approval: "ממתין לאישור",
  validation_error: "קלט לא תקין",
  execution_error: "תקלה",
};

function pendingKey(actionId: string, inputs: Readonly<Record<string, string>>): string {
  return `${actionId}:${JSON.stringify(inputs)}`;
}
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

export default function AiWorkspacePage(): ReactElement {
  // Attention (A) = findings/candidates from real deterministic read-only scans.
  const attention = useMemo(() => buildAttention(), []);

  // Approvals (B) = ONLY real awaiting_approval instances, produced at runtime.
  const [pending, setPending] = useState<readonly PendingApproval[]>([]);
  const [recent, setRecent] = useState<readonly RecentItem[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("ag-orchestrator");
  const [prefill, setPrefill] = useState<{ actionId?: string; inputs: Record<string, string>; nonce: number }>({
    inputs: {},
    nonce: 0,
  });

  const topAttention = attention.slice(0, 5);
  const recentTop = recent.slice(0, 5);

  function pushRecent(agentId: string, r: AgentActionResult, actionId: string): void {
    setRecent((prev) =>
      [
        {
          key: `${r.correlationId}:${actionId}`,
          agentHe: getAgentDefinition(agentId)?.nameHe ?? agentId,
          actionId,
          status: r.status,
          at: r.createdAt,
          correlationId: r.correlationId,
        },
        ...prev,
      ].slice(0, 5),
    );
  }

  // Every engine result flows through here. A genuine awaiting_approval result
  // (and only that) enters the approval queue; an applied result clears it.
  function handleResult(agentId: string, r: AgentActionResult, actionId: string, inputs: Readonly<Record<string, string>>): void {
    pushRecent(agentId, r, actionId);
    const key = pendingKey(actionId, inputs);
    if (r.status === "awaiting_approval") {
      setPending((prev) => (prev.some((p) => p.key === key) ? prev : [{ key, actionId, agentId, inputs, result: r }, ...prev]));
    } else if (r.status === "applied") {
      setPending((prev) => prev.filter((p) => p.key !== key));
    }
  }

  // User-triggered handoff — pre-selects Fixer's apply-correction and pre-fills the
  // recordId. It NEVER auto-runs: the user must click "הרצה" in the panel, which
  // returns awaiting_approval (no mutation) and surfaces here for explicit approval.
  function handoff(item: AttentionItem): void {
    if (!item.handoffAgentId) return;
    setSelectedAgentId(item.handoffAgentId);
    setPrefill((p) => ({ actionId: "fixer.apply-correction", inputs: { ...(item.handoffInputs ?? {}) }, nonce: p.nonce + 1 }));
  }

  // Approve reuses the SAME gate with explicit approval → applies once, blocks dupes.
  function approve(p: PendingApproval): void {
    const r = runAgentAction(p.actionId, p.inputs, { approved: true });
    setPending((prev) => prev.filter((x) => x.key !== p.key));
    pushRecent(p.agentId, r, p.actionId);
  }
  // Reject NEVER calls the engine → no mutation; the pending instance is dropped.
  function reject(p: PendingApproval): void {
    setPending((prev) => prev.filter((x) => x.key !== p.key));
  }

  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)" }} data-testid="ai-workspace">
      <HideShellRail />

      {/* one page title + one honest engine line (not repeated per card) */}
      <div>
        <h1 style={{ margin: 0, fontSize: "var(--os-text-xl, 20px)" }}>מרחב AI</h1>
        <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm, 13px)" }}>
          מנוע AI מקומי ודטרמיניסטי · נתוני דמו סינתטיים · ללא מודל מרוחק · ההמלצות ניתנות להסבר · כתיבה מחייבת אישור.
        </div>
      </div>

      {/* A. TOP SUMMARY — 4 indicators, all derived from real local demo state */}
      <div
        style={{
          display: "grid",
          gap: "var(--os-space-4)",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
        }}
        data-testid="workspace-kpis"
      >
        <KpiCard title="דורש טיפול" value={attention.length} accent="warning" icon="alert" muted={attention.length === 0} />
        <KpiCard title="ממתין לאישורך" value={pending.length} accent="warning" icon="shield" muted={pending.length === 0} glow={pending.length > 0} />
        <KpiCard title="תוצאות סוכנים אחרונות" value={recent.length} accent="blue" icon="sparkle" muted={recent.length === 0} />
        <KpiCard title="סוכנים זמינים" value={availableAgentCount()} accent="cyan" icon="bot" muted />
      </div>

      {/* B. PRIMARY WORK AREA — one dominant panel, max 5 items */}
      <Panel variant="raised" style={{ padding: "var(--os-space-6)" }} data-testid="workspace-attention">
        <SectionTitle
          icon="alert"
          title="מה דורש טיפול עכשיו?"
          subtitle="רשימה מדורגת שנגזרה מסריקות Hunter ו-Orchestrator על נתוני הדמו — ממצאים, לא אישורים"
        />
        <div style={{ display: "grid", gap: "var(--os-space-2)", marginBlockStart: "var(--os-space-3)" }}>
          {topAttention.length === 0 ? (
            <EmptyState icon="check" title="אין משימות סוכן פעילות כרגע" reason="הסוכנים לא זיהו פריטים שדורשים טיפול בנתוני הדמו." />
          ) : (
            topAttention.map((item) => (
              <div
                key={item.id}
                data-testid="attention-item"
                style={{
                  display: "flex",
                  gap: "var(--os-space-3)",
                  justifyContent: "space-between",
                  alignItems: "start",
                  flexWrap: "wrap",
                  borderBlockEnd: "1px solid var(--os-border)",
                  paddingBlockEnd: "var(--os-space-2)",
                }}
              >
                <div style={{ display: "grid", gap: 2, minWidth: "12rem", flex: "1 1 16rem" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ color: SEVERITY[item.severity].color, fontSize: "var(--os-text-2xs, 11px)", fontWeight: "var(--os-weight-semibold)" }}>
                      חומרה: {SEVERITY[item.severity].labelHe}
                    </span>
                    <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-2xs, 11px)" }}>
                      · {item.sourceAgentHe} · {item.evidenceCount} ראיות
                    </span>
                  </div>
                  <span style={{ fontSize: "var(--os-text-sm, 13px)" }}>{item.titleHe}</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {item.handoffAgentId ? (
                    <OsButton size="sm" variant="cyan" icon="chevron-forward" onClick={() => handoff(item)}>
                      {item.recommendedActionHe}
                    </OsButton>
                  ) : (
                    <Link to={item.navigationTarget} style={{ color: "var(--os-cyan-text)", fontSize: "var(--os-text-2xs)", textDecoration: "underline" }}>
                      {item.recommendedActionHe} ←
                    </Link>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>

      {/* B2. GUIDED, HUMAN-CONTROLLED bounded loop — secondary to the attention area. */}
      <AgentLoopPanel />

      {/* C. AGENT QUICK ACTIONS — 7 agents compact; selecting reuses the engine */}
      <Panel variant="panel" style={{ padding: "var(--os-space-5)" }} data-testid="workspace-agents">
        <SectionTitle icon="bot" title="איזה סוכן יכול לעזור?" subtitle="שבעה סוכנים דטרמיניסטיים · עד שתי פעולות לכל אחד" />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBlock: "var(--os-space-3)" }} role="group" aria-label="בחירת סוכן">
          {AGENT_IDS.map((id) => {
            const def = getAgentDefinition(id);
            const activeSel = id === selectedAgentId;
            return (
              <OsButton
                key={id}
                size="sm"
                variant={activeSel ? "primary" : "ghost"}
                onClick={() => setSelectedAgentId(id)}
                aria-pressed={activeSel}
                title={def?.purposeHe}
              >
                {def?.nameHe ?? id} <span className="os-ltr">· {def?.codeName}</span>
              </OsButton>
            );
          })}
        </div>
        <p style={{ margin: "0 0 var(--os-space-3)", fontSize: "var(--os-text-sm)", color: "var(--os-text-2)" }}>
          {getAgentDefinition(selectedAgentId)?.purposeHe}
        </p>
        {/* remount per (agent, handoff) so pre-filled inputs/action apply; never auto-runs */}
        <AgentActionsPanel
          key={`${selectedAgentId}:${prefill.nonce}`}
          agentId={selectedAgentId}
          initialActionId={prefill.nonce > 0 ? prefill.actionId : undefined}
          initialInputs={prefill.nonce > 0 ? prefill.inputs : undefined}
          onResult={(r, actionId, inputs) => handleResult(selectedAgentId, r, actionId, inputs)}
        />
      </Panel>

      {/* D. APPROVAL QUEUE — ONLY real awaiting_approval instances; reuse the gate */}
      <Panel variant="panel" style={{ padding: "var(--os-space-5)" }} data-testid="workspace-approvals">
        <SectionTitle icon="shield" title="מה דורש את אישורך?" subtitle="רק פעולות שהורצו והוחזרו כ״ממתין לאישור״ — נכתבות רק לאחר אישור אנושי מפורש" />
        <div style={{ display: "grid", gap: "var(--os-space-3)", marginBlockStart: "var(--os-space-3)" }}>
          {pending.length === 0 ? (
            <EmptyState icon="check" title="אין פריטים שממתינים לאישורך" reason="פריט יופיע כאן רק לאחר הרצת פעולה המחייבת אישור (למשל החלת תיקון) שהוחזרה כ״ממתין לאישור״." />
          ) : (
            pending.map((p) => (
              <div key={p.key} data-testid="approval-item" style={{ display: "grid", gap: 6, border: "1px solid var(--os-border)", borderRadius: "var(--os-radius-sm, 6px)", padding: "var(--os-space-3)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <StatusChip status="ממתין" label="ממתין לאישור" />
                  <span style={{ fontWeight: "var(--os-weight-semibold)", fontSize: "var(--os-text-sm)" }}>{p.result.summary}</span>
                </div>
                {p.result.findings.length > 0 && (
                  <ul style={{ margin: 0, paddingInlineStart: "1.1rem", display: "grid", gap: 2 }}>
                    {p.result.findings.map((f) => (
                      <li key={f.id} style={{ fontSize: "var(--os-text-sm)" }}>{f.textHe}</li>
                    ))}
                  </ul>
                )}
                <details>
                  <summary style={{ cursor: "pointer", fontSize: "var(--os-text-sm)" }}>למה זה מוצע? · ראיות ({p.result.evidence.length})</summary>
                  <div style={{ marginBlockStart: 6, fontSize: "var(--os-text-sm)", color: "var(--os-text-2)", display: "grid", gap: 2 }}>
                    <span>{p.result.why.foundHe}</span>
                    <span>{p.result.why.importanceHe}</span>
                    <span>על סמך: {p.result.why.basedOnHe}</span>
                    {p.result.evidence.map((e) => (
                      <span key={`${e.kind}-${e.refId}`} className="os-ltr" style={{ color: "var(--os-muted)" }}>{e.labelHe} ({e.kind})</span>
                    ))}
                  </div>
                </details>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <OsButton size="sm" variant="approve" icon="check" onClick={() => approve(p)}>
                    אישור והחלה (דמו מקומי)
                  </OsButton>
                  <OsButton size="sm" variant="ghost" onClick={() => reject(p)}>
                    דחייה
                  </OsButton>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>

      {/* E. RECENT ACTIVITY — max 5 deterministic results; details are elsewhere */}
      <Panel variant="panel" style={{ padding: "var(--os-space-5)" }} data-testid="workspace-recent">
        <SectionTitle icon="clock" title="פעילות אחרונה" subtitle="תוצאות דטרמיניסטיות מהמושב הנוכחי" />
        <div style={{ display: "grid", gap: "var(--os-space-2)", marginBlockStart: "var(--os-space-3)" }}>
          {recentTop.length === 0 ? (
            <EmptyState icon="clock" title="אין פעילות עדיין" reason="הרצת פעולה או אישור יופיעו כאן." />
          ) : (
            recentTop.map((r) => (
              <div key={r.key} data-testid="recent-item" style={{ display: "flex", gap: "var(--os-space-3)", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", fontSize: "var(--os-text-sm)", borderBlockEnd: "1px solid var(--os-border)", paddingBlockEnd: 4 }}>
                <span>
                  {r.agentHe} <span className="os-ltr" style={{ color: "var(--os-muted)" }}>· {r.actionId}</span>
                </span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <StatusChip status={r.status === "applied" || r.status === "ok" ? "פעיל" : "ממתין"} label={STATUS_LABEL[r.status]} />
                  <span className="os-num" style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>{timeHe(r.at)}</span>
                  <span className="os-ltr" style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }} title={r.correlationId}>{shortId(r.correlationId)}</span>
                </span>
              </div>
            ))
          )}
        </div>
      </Panel>

      <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
        לניהול סוכנים מפורט ותצוגת התזמור:{" "}
        <Link to="/agents" style={{ color: "var(--os-cyan-text)", textDecoration: "underline" }}>מסך הסוכנים ←</Link>
      </div>
    </div>
  );
}
