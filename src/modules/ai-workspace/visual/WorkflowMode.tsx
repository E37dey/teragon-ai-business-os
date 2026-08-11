// S15 Phase 5 — the "תהליך חי" (live workflow) mode inside the Visual Intelligence
// Workspace. Runs ONE bounded knowledge workflow, renders a real ordered Timeline of the
// recorded runtime events, and drives the two graphs from those real events (current agent
// + selected timeline event → cross-highlight the agent and note it actually touched).
// Everything shown corresponds to a real recorded event — no fake reasoning, no fake activity.
import { useCallback, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { OsButton, SearchInput, StatusChip } from "@/design-system";
import { getAgentDefinition } from "@/agents/definitions";
import {
  acceptRecommendation,
  cancelWorkflow,
  isWorkflowTerminal,
  runKnowledgeWorkflowToGate,
  startKnowledgeWorkflow,
  type WorkflowState,
  type WorkflowStatus,
} from "@/agents/workflow/knowledgeWorkflow";
import { getWorkflowEvents, type WorkflowEvent } from "@/agents/workflow/workflowEvents";
import { AgentNetworkPanel } from "./AgentNetworkPanel";
import { KnowledgeGraphPanel } from "@/modules/memory/obsidian/KnowledgeGraphPanel";
import "./visual.css";

const stack = (gap = "var(--os-space-3)"): CSSProperties => ({ display: "grid", gap });
const muted: CSSProperties = { color: "var(--os-text-2)" };
const code2xs: CSSProperties = { fontFamily: "var(--os-font-mono, monospace)", direction: "ltr", unicodeBidi: "isolate" };

const STATUS_CHIP: Record<WorkflowStatus, { label: string; status: "פעיל" | "ממתין" | "דורש אישור" | "הושלם" | "חסום" | "מושבת" }> = {
  IDLE: { label: "מוכן", status: "מושבת" },
  RUNNING: { label: "רץ", status: "פעיל" },
  WAITING_FOR_USER: { label: "ממתין להחלטה", status: "ממתין" },
  WAITING_FOR_APPROVAL: { label: "ממתין לאישור", status: "דורש אישור" },
  COMPLETED: { label: "הושלם", status: "הושלם" },
  FAILED: { label: "נכשל", status: "חסום" },
  CANCELLED: { label: "בוטל", status: "מושבת" },
};

// Only actions/provenance are ever shown — never hidden reasoning.
function eventIcon(t: WorkflowEvent["type"]): string {
  if (t.startsWith("HANDOFF")) return "→";
  if (t.startsWith("VAULT")) return "📄";
  if (t.startsWith("AGENT")) return "◆";
  if (t.startsWith("WORKFLOW")) return "●";
  if (t.startsWith("USER")) return "◻";
  if (t === "RESULT_CREATED") return "✦";
  if (t === "CAPABILITY_DENIED") return "⛔";
  return "·";
}

const DEFAULT_INTENT = "בנה לי תקציר והמלצות על AI Operations לפי הידע ב-Obsidian";

export function WorkflowMode(): ReactElement {
  const [intent, setIntent] = useState(DEFAULT_INTENT);
  const [wf, setWf] = useState<WorkflowState | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<WorkflowEvent | null>(null);
  const runningRef = useRef(false);

  const events = wf ? getWorkflowEvents(wf.workflowRunId) : [];

  const start = useCallback(async () => {
    if (runningRef.current || !intent.trim()) return;
    runningRef.current = true;
    setBusy(true);
    setSelectedEvent(null);
    const s0 = startKnowledgeWorkflow(intent);
    setWf(s0);
    const s1 = await runKnowledgeWorkflowToGate(s0); // one bounded pass to the human gate
    setWf(s1);
    setBusy(false);
    runningRef.current = false;
  }, [intent]);

  const accept = useCallback(() => {
    setWf((s) => (s ? acceptRecommendation(s) : s));
  }, []);
  const cancel = useCallback(() => {
    setWf((s) => (s ? cancelWorkflow(s) : s));
  }, []);

  // Cross-highlight the graphs from the workflow: a selected timeline event wins; otherwise
  // the live current agent / the read source. Reuses the Phase-4 cross-highlight props.
  const highlightAgentId = selectedEvent?.actorAgentId ?? selectedEvent?.source ?? wf?.currentAgentId ?? null;
  const highlightPaths = useMemo(() => {
    if (selectedEvent?.notePath) return [selectedEvent.notePath];
    return (wf?.sources ?? []).map((s) => s.path);
  }, [selectedEvent, wf]);

  const chip = wf ? STATUS_CHIP[wf.status] : STATUS_CHIP.IDLE;

  return (
    <div style={stack("var(--os-space-4)")}>
      {/* Controls */}
      <div data-testid="workflow-controls" style={{ ...stack(), padding: "var(--os-space-3)", borderRadius: "var(--os-radius-md, 12px)", background: "var(--os-surface-1)", boxShadow: "inset 0 0 0 1px var(--os-border)" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: "var(--os-text-sm, 13px)" }}>תהליך ידע רב-סוכני (חסום · בשליטת אנוש)</b>
          <StatusChip status={chip.status} label={chip.label} />
          {wf?.currentAgentId && <span style={{ ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>סוכן נוכחי: {getAgentDefinition(wf.currentAgentId)?.nameHe}</span>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <SearchInput value={intent} onChange={setIntent} placeholder="בקשת ידע…" ariaLabel="בקשת תהליך הידע" />
          </div>
          {busy ? (
            <OsButton variant="primary" size="sm" disabled disabledReason="התהליך רץ" data-testid="workflow-start">
              רץ…
            </OsButton>
          ) : (
            <OsButton variant="primary" size="sm" onClick={start} data-testid="workflow-start">
              התחל תהליך
            </OsButton>
          )}
          {wf?.status === "WAITING_FOR_USER" && (
            <OsButton variant="cyan" size="sm" onClick={accept} data-testid="workflow-accept">
              אשר קבלה
            </OsButton>
          )}
          {wf && !isWorkflowTerminal(wf.status) && (
            <OsButton variant="ghost" size="sm" onClick={cancel} data-testid="workflow-cancel">
              בטל
            </OsButton>
          )}
        </div>
        {wf?.status === "FAILED" && wf.stopReason && (
          <div role="alert" data-testid="workflow-failure" style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-danger, #c0392b)" }}>
            {wf.stopReason}
          </div>
        )}
        {wf?.result && (
          <div data-testid="workflow-result" style={{ ...stack("4px"), padding: "var(--os-space-2)", borderRadius: 8, background: "var(--os-surface-2)", boxShadow: "inset 0 0 0 1px var(--os-border)" }}>
            <b style={{ fontSize: "var(--os-text-2xs, 12px)" }}>המלצה (ידע בלבד — אינה אישור/כתיבה)</b>
            <div style={{ fontSize: "var(--os-text-2xs, 12px)" }}>{wf.result.answer}</div>
            <div style={{ ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>
              סוכנים תורמים: {wf.result.contributingAgents.map((a) => getAgentDefinition(a)?.nameHe ?? a).join(" · ")}
            </div>
            {wf.result.sources.map((s) => (
              <div key={s.path} data-testid="workflow-source" style={{ ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>
                מקור: <b>Obsidian</b> · {s.vaultName} · <span style={code2xs}>{s.path}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Real, ordered Timeline — accessible log; select an event to cross-highlight the graphs. */}
      <div data-testid="workflow-timeline" role="log" aria-label="ציר זמן חי של התהליך" style={{ ...stack("2px"), padding: "var(--os-space-3)", borderRadius: "var(--os-radius-md, 12px)", background: "var(--os-surface-1)", boxShadow: "inset 0 0 0 1px var(--os-border)", maxHeight: "34vh", overflow: "auto" }}>
        <b style={{ fontSize: "var(--os-text-sm, 13px)" }}>ציר זמן (אירועים אמיתיים בלבד)</b>
        {events.length === 0 ? (
          <div style={{ ...muted, fontSize: "var(--os-text-2xs, 12px)" }}>אין עדיין תהליך פעיל — התחילו תהליך כדי לראות אירועים אמיתיים.</div>
        ) : (
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 2 }}>
            {events.map((e) => {
              const active = selectedEvent?.id === e.id;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    data-testid="workflow-event"
                    data-type={e.type}
                    onClick={() => setSelectedEvent(active ? null : e)}
                    style={{ width: "100%", display: "flex", gap: 8, alignItems: "baseline", textAlign: "start", background: active ? "var(--os-surface-selected, var(--os-surface-2))" : "none", border: "none", borderRadius: 6, padding: "3px 6px", cursor: "pointer", color: e.success ? "var(--os-text)" : "var(--os-danger, #c0392b)", font: "inherit" }}
                  >
                    <span aria-hidden style={{ ...code2xs, color: "var(--os-text-2)", flex: "0 0 auto" }}>{new Date(e.at).toLocaleTimeString("he-IL")}</span>
                    <span aria-hidden>{eventIcon(e.type)}</span>
                    <span style={{ fontSize: "var(--os-text-2xs, 12px)" }}>{e.detailHe}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* The two graphs react to the real workflow (current agent / read note highlighted). */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: "var(--os-space-5)", alignItems: "start" }}>
        <AgentNetworkPanel highlightAgentId={highlightAgentId} />
        <KnowledgeGraphPanel highlightPaths={highlightPaths} />
      </div>
    </div>
  );
}
