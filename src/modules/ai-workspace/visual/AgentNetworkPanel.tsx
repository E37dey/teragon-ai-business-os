// TERAGON Agent Network — a premium spatial view of the EXACTLY 7 canonical agents as
// recognizable AI entities (identity icon, name, role, live status) orbiting the
// orchestrator coordination core. Real registry, real capabilities, real supported
// handoffs (orchestrator dispatch) + real active handoff traces, and per-agent status
// driven by REAL action results. Reuses the existing action engine. No fake activity.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { OsButton, StatusChip } from "@/design-system";
import { AGENT_IDS, getAgentDefinition } from "@/agents/definitions";
import { AgentActionsPanel } from "@/modules/agents-ui/AgentActionsPanel";
import { getActionDefinition, type AgentActionResult } from "@/agents/actions";
import { getRepository } from "@/repositories";
import { LOOP_OBJECTIVE_HE } from "@/modules/ai-workspace/agentLoop";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import type { AgentNoteUsage } from "./crossView";
import "./visual.css";

const stack = (gap = "var(--os-space-3)"): CSSProperties => ({ display: "grid", gap });
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "var(--os-space-2)", alignItems: "center" };
const muted: CSSProperties = { color: "var(--os-text-2)" };

const VIEW_W = 1000;
const VIEW_H = 640;

// Distinctive identity glyph per agent (function-evocative, not decorative).
const AGENT_ICON: Record<string, string> = {
  "ag-orchestrator": "🧭",
  "ag-hunter": "🎯",
  "ag-fixer": "🛠️",
  "ag-mentor": "🎓",
  "ag-nexa": "📣",
  "ag-wiki": "📚",
  "ag-flow": "⚙️",
};
// One-word role, distinct from the longer purposeHe sentence.
const AGENT_ROLE: Record<string, string> = {
  "ag-orchestrator": "תזמור",
  "ag-hunter": "מכירות",
  "ag-fixer": "שירות",
  "ag-mentor": "הדרכה",
  "ag-nexa": "צמיחה",
  "ag-wiki": "ידע",
  "ag-flow": "אוטומציה",
};

type AgentStatus = "IDLE" | "RUNNING" | "SUCCESS" | "WAITING" | "ERROR";
const STATUS_META: Record<AgentStatus, { label: string; color: string }> = {
  IDLE: { label: "רגוע", color: "var(--os-muted, #8a94a6)" },
  RUNNING: { label: "פעיל", color: "var(--os-accent-blue, #4a86e8)" },
  SUCCESS: { label: "הצליח", color: "var(--os-accent-green, #2a9d5a)" },
  WAITING: { label: "ממתין לאישור", color: "var(--os-accent-violet, #8b7bff)" },
  ERROR: { label: "שגיאה", color: "var(--os-danger, #c0392b)" },
};
function statusFromResult(r: AgentActionResult): AgentStatus {
  if (r.status === "ok" || r.status === "applied") return "SUCCESS";
  if (r.status === "awaiting_approval") return "WAITING";
  if (r.status === "execution_error") return "ERROR";
  return "IDLE";
}

// Curated orbital layout: orchestrator core centred, the six business agents evenly
// distributed around it (appropriate + legible for a fixed 7-entity system).
function agentPositions(): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const others = AGENT_IDS.filter((id) => id !== "ag-orchestrator");
  pos.set("ag-orchestrator", { x: VIEW_W / 2, y: VIEW_H / 2 });
  others.forEach((id, i) => {
    const a = (i / others.length) * Math.PI * 2 - Math.PI / 2;
    pos.set(id, { x: VIEW_W / 2 + Math.cos(a) * 300, y: VIEW_H / 2 + Math.sin(a) * 210 });
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
  const reduced = usePrefersReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  const [fullscreen, setFullscreen] = useState(false);
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
  const activeSet = useMemo(() => {
    const s = new Set<string>();
    activeHandoffs.forEach((h) => {
      s.add(h.from);
      s.add(h.to);
    });
    return s;
  }, [activeHandoffs]);

  return (
    <div data-testid="agent-network-panel" style={stack()}>
      <div style={{ ...row, justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: "var(--os-text-md, 15px)" }}>רשת סוכנים</div>
          <div style={{ ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>7 סוכנים · מצב אמיתי</div>
        </div>
        <StatusChip status="פעיל" label={`${AGENT_IDS.length} סוכנים`} />
      </div>

      <div className={`tvg-canvas${fullscreen ? " tvg-fullscreen" : ""}`} style={{ height: fullscreen ? "100vh" : "min(60vh, 540px)" }}>
        <div className="tvg-toolbar" role="toolbar" aria-label="בקרת רשת סוכנים">
          <span style={{ fontSize: "var(--os-text-2xs, 11px)", ...muted, padding: "0 6px" }}>ליבת תזמור + 6 סוכנים</span>
          <OsButton variant={fullscreen ? "primary" : "ghost"} size="sm" onClick={() => setFullscreen((v) => !v)} aria-label="מסך מלא" aria-pressed={fullscreen}>
            מסך מלא
          </OsButton>
        </div>

        <svg data-testid="agent-network-svg" role="img" aria-label="רשת הסוכנים של TERAGON" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={{ width: "100%", height: "100%", display: "block" }} onClick={() => setSelected(null)}>
          <defs>
            <radialGradient id="tvg-core" cx="50%" cy="42%" r="65%">
              <stop offset="0%" stopColor="var(--os-accent-cyan)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--os-accent-cyan)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* supported handoff edges (dashed, subtle) — MUST stay <line> for the contract */}
          {supportedHandoffs.map((e, i) => {
            const a = pos.get(e.from)!;
            const b = pos.get(e.to)!;
            const emphasised = selected === e.from || selected === e.to || hovered === e.to;
            return <line key={`s${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={emphasised ? "var(--os-accent-cyan)" : "var(--os-border)"} strokeOpacity={emphasised ? 0.7 : selected ? 0.12 : 0.4} strokeDasharray="4 4" strokeWidth={emphasised ? 2 : 1} />;
          })}
          {/* active handoff traces (solid, accent, animated signal on REAL trace only) */}
          {activeHandoffs.map((e, i) => {
            const a = pos.get(e.from)!;
            const b = pos.get(e.to)!;
            return <line key={`a${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--os-accent-cyan)" strokeOpacity={0.95} strokeWidth={3} className={reduced ? undefined : "tvg-signal"} data-testid="agent-handoff-active" />;
          })}

          {AGENT_IDS.map((id) => {
            const def = getAgentDefinition(id)!;
            const p = pos.get(id)!;
            const st = statuses[id] ?? "IDLE";
            const isSel = id === selected;
            const isHover = id === hovered;
            const isOrch = id === "ag-orchestrator";
            const dim = selected != null && !isSel && !(isOrch || selected === "ag-orchestrator");
            const r = isOrch ? 56 : 42;
            const ringColor = STATUS_META[st].color;
            const pulsing = st === "RUNNING" || st === "WAITING";
            const coordinating = isOrch && activeSet.has(id);
            return (
              <g
                key={id}
                transform={`translate(${p.x} ${p.y})`}
                style={{ cursor: "pointer", opacity: dim ? 0.32 : 1, transition: reduced ? undefined : "opacity 180ms ease" }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setSelected(id);
                }}
                onMouseEnter={() => setHovered(id)}
                onMouseLeave={() => setHovered(null)}
              >
                <title>{`${def.nameHe} (${def.codeName})\n${def.purposeHe}`}</title>
                {isOrch && <circle r={r + 40} fill="url(#tvg-core)" style={{ pointerEvents: "none" }} />}
                {/* orchestrator coordination core: double ring */}
                {isOrch && <circle r={r + 16} fill="none" stroke="var(--os-accent-cyan)" strokeOpacity={0.25} strokeWidth={1.5} />}
                {/* live status ring (pulse only on REAL running/waiting, or orchestrator coordinating a real trace) */}
                <circle r={r + 7} fill="none" stroke={ringColor} strokeWidth={st === "IDLE" ? 1.5 : 3} strokeOpacity={st === "IDLE" ? 0.5 : 0.95} className={pulsing || coordinating ? "agent-status-pulse" : undefined} />
                {/* body */}
                <circle r={r} fill={isSel ? "color-mix(in srgb, var(--os-accent-cyan) 30%, var(--os-surface-2))" : "var(--os-surface-2)"} stroke={isSel || isHover ? "var(--os-accent-cyan)" : "var(--os-border)"} strokeWidth={isSel ? 2.5 : 1.5} style={{ transition: reduced ? undefined : "r 140ms ease" }} />
                <text textAnchor="middle" dy={isOrch ? "-0.15em" : "-0.05em"} fontSize={isOrch ? 30 : 24} style={{ pointerEvents: "none" }}>
                  {AGENT_ICON[id] ?? "◆"}
                </text>
                <text textAnchor="middle" dy={isOrch ? "1.5em" : "1.7em"} fontSize={isOrch ? 12 : 10} fill="var(--os-text-2)" style={{ pointerEvents: "none", fontWeight: 600 }}>
                  {AGENT_ROLE[id] ?? ""}
                </text>
                {/* identity name below the node */}
                <text y={r + 20} textAnchor="middle" fontSize={isOrch ? 15 : 13} fill="var(--os-text)" style={{ pointerEvents: "none", fontWeight: 600 }}>
                  {def.nameHe}
                </text>
                {/* status dot */}
                <circle cx={r * 0.72} cy={-r * 0.72} r={7} fill={ringColor} stroke="var(--os-surface-2)" strokeWidth={2} />
              </g>
            );
          })}
        </svg>

        {selectedDef && (
          <aside className="tvg-inspector" data-testid="agent-network-details" style={stack("var(--os-space-2)")}>
            <div style={{ ...row, justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, fontSize: "var(--os-text-md, 15px)" }}>
                {AGENT_ICON[selectedDef.id]} {selectedDef.nameHe}
              </span>
              <OsButton variant="ghost" size="sm" onClick={() => setSelected(null)} aria-label="סגור">
                ✕
              </OsButton>
            </div>
            <div style={{ ...row, gap: 6 }}>
              <span style={{ ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>{selectedDef.codeName}</span>
              <StatusChip
                status={(statuses[selectedDef.id] ?? "IDLE") === "ERROR" ? "חסום" : (statuses[selectedDef.id] ?? "IDLE") === "WAITING" ? "דורש אישור" : (statuses[selectedDef.id] ?? "IDLE") === "SUCCESS" ? "הושלם" : "מושבת"}
                label={STATUS_META[statuses[selectedDef.id] ?? "IDLE"].label}
              />
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
          </aside>
        )}
      </div>

      {/* Bounded loop as a visual flow (4 steps) — the real canonical loop structure. */}
      <div data-testid="agent-loop-strip" style={{ ...row, fontSize: "var(--os-text-2xs, 11px)", gap: 0, alignItems: "stretch" }}>
        <span style={{ ...muted, alignSelf: "center", paddingInlineEnd: 8 }}>לולאה חסומה ({LOOP_OBJECTIVE_HE}):</span>
        {["1 · Hunter קורא", "2 · המשך משתמש", "3 · Fixer מציע", "4 · אישור אנושי"].map((s, i, arr) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center" }}>
            <span style={{ padding: "4px 10px", border: "1px solid var(--os-border)", borderRadius: 999, background: "var(--os-surface-2)" }}>{s}</span>
            {i < arr.length - 1 && <span aria-hidden style={{ color: "var(--os-text-2)", padding: "0 4px" }}>→</span>}
          </span>
        ))}
      </div>

      {/* Accessible agent list — keyboard alternative to the canvas. */}
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
    </div>
  );
}
