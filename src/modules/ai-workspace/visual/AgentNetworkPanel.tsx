// TERAGON Agent Network — an interactive visual of the EXACTLY 7 canonical agents
// (real registry), their real capabilities, real supported handoffs (orchestrator
// dispatch) + real active handoff traces, and per-agent status driven by REAL action
// results. Reuses the existing action engine (AgentActionsPanel). No fake activity.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { Panel, SectionTitle, StatusChip } from "@/design-system";
import { AGENT_IDS, getAgentDefinition } from "@/agents/definitions";
import { AgentActionsPanel } from "@/modules/agents-ui/AgentActionsPanel";
import { getActionDefinition, type AgentActionResult } from "@/agents/actions";
import { getRepository } from "@/repositories";
import { LOOP_OBJECTIVE_HE } from "@/modules/ai-workspace/agentLoop";
import type { AgentNoteUsage } from "./crossView";
import "./visual.css";

const stack = (gap = "var(--os-space-3)"): CSSProperties => ({ display: "grid", gap });
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "var(--os-space-2)", alignItems: "center" };
const muted: CSSProperties = { color: "var(--os-text-2)" };

const VIEW_W = 640;
const VIEW_H = 460;

type AgentStatus = "IDLE" | "RUNNING" | "SUCCESS" | "WAITING" | "ERROR";
const STATUS_META: Record<AgentStatus, { label: string; color: string }> = {
  IDLE: { label: "רגוע", color: "var(--os-muted, #8a94a6)" },
  RUNNING: { label: "פעיל", color: "var(--os-accent-blue, #47c)" },
  SUCCESS: { label: "הצליח", color: "var(--os-accent-green, #2a9d5a)" },
  WAITING: { label: "ממתין לאישור", color: "var(--os-accent-violet, #86f)" },
  ERROR: { label: "שגיאה", color: "var(--os-danger, #c0392b)" },
};
function statusFromResult(r: AgentActionResult): AgentStatus {
  if (r.status === "ok" || r.status === "applied") return "SUCCESS";
  if (r.status === "awaiting_approval") return "WAITING";
  if (r.status === "execution_error") return "ERROR";
  return "IDLE";
}

// Radial layout: orchestrator at center, the six business agents evenly around it.
function agentPositions(): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const others = AGENT_IDS.filter((id) => id !== "ag-orchestrator");
  pos.set("ag-orchestrator", { x: VIEW_W / 2, y: VIEW_H / 2 });
  others.forEach((id, i) => {
    const a = (i / others.length) * Math.PI * 2 - Math.PI / 2;
    pos.set(id, { x: VIEW_W / 2 + Math.cos(a) * 190, y: VIEW_H / 2 + Math.sin(a) * 170 });
  });
  return pos;
}

interface HandoffRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  fromAgentId?: string;
  toAgentId?: string;
  sourceAgentId?: string;
  targetAgentId?: string;
}

export function AgentNetworkPanel({ usages = [] }: { usages?: AgentNoteUsage[] }): ReactElement {
  const [selected, setSelected] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  const pos = useMemo(agentPositions, []);
  const [handoffRows, setHandoffRows] = useState<HandoffRecord[]>([]);
  useEffect(() => {
    let alive = true;
    // Read REAL handoff traces directly (resilient — no data source yet ⇒ empty, never fabricated).
    Promise.resolve()
      .then(() => getRepository<HandoffRecord>("agentHandoffs").list())
      .then((rows) => {
        if (alive) setHandoffRows(rows);
      })
      .catch(() => {
        /* no handoff store / not connected → no active edges */
      });
    return () => {
      alive = false;
    };
  }, []);
  const activeHandoffs = useMemo(
    () =>
      handoffRows
        .map((h) => ({ from: h.fromAgentId ?? h.sourceAgentId, to: h.toAgentId ?? h.targetAgentId }))
        .filter((h): h is { from: string; to: string } => !!h.from && !!h.to && pos.has(h.from) && pos.has(h.to)),
    [handoffRows, pos],
  );

  // Supported handoffs = the orchestrator may dispatch to each business agent (real: it
  // holds the "dispatch" operation + agentHandoffs domain). Shown distinctly from traces.
  const supportedHandoffs = useMemo(() => AGENT_IDS.filter((id) => id !== "ag-orchestrator").map((to) => ({ from: "ag-orchestrator", to })), []);

  const onResult = useCallback((r: AgentActionResult, actionId: string) => {
    const agentId = getActionDefinition(actionId)?.agentId ?? null;
    if (agentId) setStatuses((s) => ({ ...s, [agentId]: statusFromResult(r) }));
  }, []);

  const selectedDef = selected ? getAgentDefinition(selected) : null;
  const selectedUsages = selected ? usages.filter((u) => u.agentId === selected) : [];

  return (
    <Panel data-testid="agent-network-panel" style={stack()}>
      <SectionTitle title="רשת סוכנים" subtitle="7 סוכנים · מצב אמיתי" action={<StatusChip status="פעיל" label={`${AGENT_IDS.length} סוכנים`} />} />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: "var(--os-space-3)" }}>
        <svg data-testid="agent-network-svg" role="img" aria-label="רשת הסוכנים של TERAGON" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={{ width: "100%", height: "min(48vh, 460px)", background: "var(--os-bg-2, transparent)", border: "1px solid var(--os-border)", borderRadius: "var(--os-radius-sm, 6px)" }}>
          {/* supported handoff edges (dashed, subtle) */}
          {supportedHandoffs.map((e, i) => {
            const a = pos.get(e.from)!;
            const b = pos.get(e.to)!;
            return <line key={`s${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--os-border)" strokeOpacity={0.5} strokeDasharray="4 4" strokeWidth={1} />;
          })}
          {/* active handoff traces (solid, accent) */}
          {activeHandoffs.map((e, i) => {
            const a = pos.get(e.from)!;
            const b = pos.get(e.to)!;
            return <line key={`a${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--os-accent-cyan, #2aa)" strokeOpacity={0.9} strokeWidth={2} data-testid="agent-handoff-active" />;
          })}
          {AGENT_IDS.map((id) => {
            const def = getAgentDefinition(id)!;
            const p = pos.get(id)!;
            const st = statuses[id] ?? "IDLE";
            const isSel = id === selected;
            const r = id === "ag-orchestrator" ? 26 : 20;
            return (
              <g key={id} transform={`translate(${p.x} ${p.y})`} style={{ cursor: "pointer" }} onClick={() => setSelected(id)}>
                <title>{`${def.nameHe} (${def.codeName})\n${def.purposeHe}`}</title>
                <circle r={r + 4} fill="none" stroke={STATUS_META[st].color} strokeWidth={st === "IDLE" ? 1 : 2.5} strokeOpacity={st === "IDLE" ? 0.4 : 0.95} className={st === "RUNNING" || st === "WAITING" ? "agent-status-pulse" : undefined} />
                <circle r={r} fill={isSel ? "var(--os-accent-cyan, #2aa)" : "var(--os-bg-1, #223)"} stroke="var(--os-border)" strokeWidth={isSel ? 2 : 1} />
                <text textAnchor="middle" dy="0.35em" fontSize={id === "ag-orchestrator" ? 15 : 13} fill="var(--os-text)" style={{ pointerEvents: "none", fontWeight: 600 }}>
                  {def.codeName.slice(0, 2)}
                </text>
                <text y={r + 15} textAnchor="middle" fontSize="10" fill="var(--os-text-2)" style={{ pointerEvents: "none" }}>
                  {def.nameHe}
                </text>
              </g>
            );
          })}
        </svg>

        {selectedDef && (
          <div data-testid="agent-network-details" style={{ ...stack("var(--os-space-2)"), border: "1px solid var(--os-border)", borderRadius: "var(--os-radius-sm, 6px)", padding: "var(--os-space-3)" }}>
            <div style={row}>
              <span style={{ fontWeight: 600 }}>{selectedDef.nameHe}</span>
              <span style={{ ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>{selectedDef.codeName}</span>
              <StatusChip status={(statuses[selectedDef.id] ?? "IDLE") === "ERROR" ? "חסום" : (statuses[selectedDef.id] ?? "IDLE") === "WAITING" ? "דורש אישור" : (statuses[selectedDef.id] ?? "IDLE") === "SUCCESS" ? "הושלם" : "מושבת"} label={STATUS_META[statuses[selectedDef.id] ?? "IDLE"].label} />
            </div>
            <div style={{ fontSize: "var(--os-text-2xs, 11px)", ...muted }}>{selectedDef.purposeHe}</div>
            <div style={{ fontSize: "var(--os-text-2xs, 11px)" }}>
              <b>יכולות:</b> {selectedDef.allowedOperations.join(", ")}
            </div>
            <div style={{ fontSize: "var(--os-text-2xs, 11px)" }}>
              <b>תחומי מידע מותרים:</b> {selectedDef.allowedDomains.join(", ")}
            </div>
            <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-danger, #c0392b)" }}>
              <b>חסום:</b> {selectedDef.prohibitedDomains.join(", ")}
            </div>
            {/* Cross-view: Agent→Note usage only when a REAL trace exists. */}
            <div style={{ fontSize: "var(--os-text-2xs, 11px)" }} data-testid="agent-note-usage">
              <b>שימוש במסמכי Obsidian:</b>{" "}
              {selectedUsages.length === 0 ? <span style={muted}>אין שימוש מתועד במסמך זה</span> : selectedUsages.map((u) => `${u.vaultName}·${u.path}`).join(", ")}
            </div>
            {/* Real action engine — reused, not reimplemented. */}
            <AgentActionsPanel agentId={selectedDef.id} onResult={onResult} />
          </div>
        )}
      </div>

      {/* Bounded loop (4 steps) — the real canonical loop structure. Live state runs in the workspace loop panel. */}
      <div data-testid="agent-loop-strip" style={{ ...row, fontSize: "var(--os-text-2xs, 11px)" }}>
        <span style={muted}>לולאה חסומה ({LOOP_OBJECTIVE_HE}):</span>
        {["1 Hunter — קריאה", "2 המשך משתמש", "3 Fixer — הצעה", "4 אישור אנושי"].map((s, i) => (
          <span key={i} style={{ padding: "2px 8px", border: "1px solid var(--os-border)", borderRadius: 999 }}>
            {s}
          </span>
        ))}
      </div>

      {/* Accessible agent list — keyboard alternative to the SVG. */}
      <details data-testid="agent-network-list">
        <summary style={{ cursor: "pointer", fontSize: "var(--os-text-sm, 13px)" }}>רשימת סוכנים (נגישה)</summary>
        <ul style={{ margin: 0, paddingInlineStart: "1.2rem", display: "grid", gap: 4 }}>
          {AGENT_IDS.map((id) => {
            const def = getAgentDefinition(id)!;
            return (
              <li key={id}>
                <button type="button" onClick={() => setSelected(id)} style={{ background: "none", border: "none", color: "var(--os-text)", cursor: "pointer", padding: 0, font: "inherit", textAlign: "start" }}>
                  <b>{def.nameHe}</b> <span style={muted}>({def.codeName})</span> — {STATUS_META[statuses[id] ?? "IDLE"].label}
                </button>
              </li>
            );
          })}
        </ul>
      </details>
    </Panel>
  );
}
