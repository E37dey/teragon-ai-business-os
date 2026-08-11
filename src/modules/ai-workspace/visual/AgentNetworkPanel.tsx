// TERAGON Agent Intelligence Graph — the EXACTLY 7 canonical agents as a living force
// network (real d3 engine): the orchestrator coordination core with the six business
// agents settling organically into functional regions (coordination / growth / service /
// knowledge). Real registry, real capabilities, real supported handoffs (orchestrator
// dispatch) + real active handoff traces (animated signal), and per-agent status driven
// by REAL action results. Reuses the existing action engine. No fake activity, no fake nodes.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { OsButton, StatusChip } from "@/design-system";
import { AGENT_IDS, getAgentDefinition } from "@/agents/definitions";
import { AgentActionsPanel } from "@/modules/agents-ui/AgentActionsPanel";
import { getActionDefinition, type AgentActionResult } from "@/agents/actions";
import { getRepository } from "@/repositories";
import { LOOP_OBJECTIVE_HE } from "@/modules/ai-workspace/agentLoop";
import { ForceGraph, type FGEdge, type ForceGraphApi } from "./ForceGraph";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { deriveAgentNoteUsages, type AgentNoteUsage } from "./crossView";
import { AgentObsidianPanel } from "./AgentObsidianPanel";
import { subscribeRetrievals } from "@/agents/obsidian/retrievalTrace";
import "./visual.css";

const stack = (gap = "var(--os-space-3)"): CSSProperties => ({ display: "grid", gap });
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "var(--os-space-2)", alignItems: "center" };
const muted: CSSProperties = { color: "var(--os-text-2)" };

// Distinctive identity glyph per agent (function-evocative, consistent across graph +
// inspector + list + traces).
const AGENT_ICON: Record<string, string> = {
  "ag-orchestrator": "🧭",
  "ag-hunter": "🎯",
  "ag-fixer": "🛠️",
  "ag-mentor": "🎓",
  "ag-nexa": "📣",
  "ag-wiki": "📚",
  "ag-flow": "⚙️",
};
const AGENT_ROLE: Record<string, string> = {
  "ag-orchestrator": "תזמור",
  "ag-hunter": "מכירות",
  "ag-fixer": "שירות",
  "ag-mentor": "הדרכה",
  "ag-nexa": "צמיחה",
  "ag-wiki": "ידע",
  "ag-flow": "אוטומציה",
};
// Real functional regions (derived from the agents' actual roles) → organic spatial layout
// (NOT equal-radius spokes). Edges still come only from real supported/active relationships.
const AGENT_REGION: Record<string, string> = {
  "ag-orchestrator": "coordination",
  "ag-hunter": "growth",
  "ag-nexa": "growth",
  "ag-fixer": "service",
  "ag-flow": "service",
  "ag-wiki": "knowledge",
  "ag-mentor": "knowledge",
};
const REGION_ANCHOR: Record<string, { x: number; y: number }> = {
  coordination: { x: 0.5, y: 0.5 },
  growth: { x: 0.16, y: 0.26 },
  service: { x: 0.84, y: 0.28 },
  knowledge: { x: 0.5, y: 0.85 },
};

type AgentStatus = "IDLE" | "RUNNING" | "SUCCESS" | "WAITING" | "ERROR";
const STATUS_META: Record<AgentStatus, { label: string; color: string }> = {
  IDLE: { label: "רגוע", color: "var(--os-muted, #8a94a6)" },
  RUNNING: { label: "פעיל", color: "var(--os-accent-blue, #4a86e8)" },
  SUCCESS: { label: "הצליח", color: "var(--os-accent-green, #37b06a)" },
  WAITING: { label: "ממתין לאישור", color: "var(--os-accent-violet, #8b7bff)" },
  ERROR: { label: "שגיאה", color: "var(--os-danger, #c0392b)" },
};
function statusFromResult(r: AgentActionResult): AgentStatus {
  if (r.status === "ok" || r.status === "applied") return "SUCCESS";
  if (r.status === "awaiting_approval") return "WAITING";
  if (r.status === "execution_error") return "ERROR";
  return "IDLE";
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
interface AgentNode {
  id: string;
}

export function AgentNetworkPanel({ usages = [], onSelectAgent, highlightAgentId, highlightAgentIds, highlightEdge }: { usages?: AgentNoteUsage[]; onSelectAgent?: (id: string | null) => void; highlightAgentId?: string | null; highlightAgentIds?: readonly string[]; highlightEdge?: { source: string; target: string } | null }): ReactElement {
  const reduced = usePrefersReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  const [fullscreen, setFullscreen] = useState(false);
  const apiRef = useRef<ForceGraphApi | null>(null);
  // Cross-selection: the workspace (split mode = a note's real reader; live workflow = the real
  // event's actor(s)) passes the agent(s) to emphasize. A handoff event emphasizes BOTH real
  // endpoints; a note/agent event emphasizes the one real actor. Nothing is highlighted for an
  // event that carries no agent — no fabricated emphasis.
  const highlightSet = useMemo(() => {
    const ids = highlightAgentIds && highlightAgentIds.length ? [...highlightAgentIds] : highlightAgentId ? [highlightAgentId] : [];
    return ids.length ? new Set(ids) : null;
  }, [highlightAgentIds, highlightAgentId]);
  const highlightPrimary = (highlightAgentIds && highlightAgentIds[0]) ?? highlightAgentId ?? null;
  useEffect(() => {
    if (highlightPrimary) apiRef.current?.focus(highlightPrimary);
  }, [highlightPrimary]);

  const nodes = useMemo<AgentNode[]>(() => AGENT_IDS.map((id) => ({ id })), []);
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
        .filter((h): h is { from: string; to: string } => !!h.from && !!h.to && AGENT_REGION[h.from] != null && AGENT_REGION[h.to] != null),
    [handoffRows],
  );
  const activeSet = useMemo(() => {
    const s = new Set<string>();
    activeHandoffs.forEach((h) => {
      s.add(h.from);
      s.add(h.to);
    });
    return s;
  }, [activeHandoffs]);

  // Edges = real supported handoffs (orchestrator → each business agent) + real active traces.
  const edges = useMemo<FGEdge[]>(() => {
    const supported: FGEdge[] = AGENT_IDS.filter((id) => id !== "ag-orchestrator").map((to) => ({ source: "ag-orchestrator", target: to, kind: "supported" }));
    const active: FGEdge[] = activeHandoffs.map((h) => ({ source: h.from, target: h.to, kind: "active" }));
    return [...supported, ...active];
  }, [activeHandoffs]);
  const degreeMap = useMemo(() => {
    const m = new Map<string, number>();
    edges.forEach((e) => {
      m.set(e.source, (m.get(e.source) ?? 0) + 1);
      m.set(e.target, (m.get(e.target) ?? 0) + 1);
    });
    return m;
  }, [edges]);

  const onResult = useCallback((r: AgentActionResult, actionId: string) => {
    const agentId = getActionDefinition(actionId)?.agentId ?? null;
    if (agentId) setStatuses((s) => ({ ...s, [agentId]: statusFromResult(r) }));
  }, []);

  const selectAndFocus = useCallback(
    (id: string | null) => {
      setSelected(id);
      onSelectAgent?.(id);
      if (id) apiRef.current?.focus(id);
    },
    [onSelectAgent],
  );

  const selectedDef = selected ? getAgentDefinition(selected) : null;
  // Agent→Note usages are LIVE: seed from the prop, then re-derive on every real retrieval
  // trace (a note read by an allowed agent) so the relationship appears the moment it occurs.
  const [liveUsages, setLiveUsages] = useState<AgentNoteUsage[]>(usages);
  useEffect(() => {
    setLiveUsages(deriveAgentNoteUsages());
    return subscribeRetrievals(() => setLiveUsages(deriveAgentNoteUsages()));
  }, []);
  const selectedUsages = selected ? liveUsages.filter((u) => u.agentId === selected) : [];

  const agentRadius = useCallback((id: string) => (id === "ag-orchestrator" ? 60 : 42), []);

  return (
    <div data-testid="agent-network-panel" style={stack()}>
      <div style={{ ...row, justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: "var(--os-text-md, 15px)" }}>רשת סוכנים</div>
          <div style={{ ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>7 סוכנים · מצב אמיתי</div>
        </div>
        <StatusChip status="פעיל" label={`${AGENT_IDS.length} סוכנים`} />
      </div>

      <div className={`tvg-canvas${fullscreen ? " tvg-fullscreen" : ""}`} style={{ height: fullscreen ? "100vh" : "min(70vh, 620px)" }}>
        <div className="tvg-toolbar" role="toolbar" aria-label="בקרת רשת סוכנים">
          <OsButton variant="ghost" size="sm" onClick={() => apiRef.current?.fit()} aria-label="התאם לתצוגה">
            התאמה
          </OsButton>
          <OsButton variant="ghost" size="sm" onClick={() => apiRef.current?.zoomBy(1.3)} aria-label="הגדל">
            +
          </OsButton>
          <OsButton variant="ghost" size="sm" onClick={() => apiRef.current?.zoomBy(1 / 1.3)} aria-label="הקטן">
            −
          </OsButton>
          <OsButton variant="ghost" size="sm" onClick={() => apiRef.current?.reset()} aria-label="איפוס תצוגה">
            איפוס
          </OsButton>
          <OsButton variant={fullscreen ? "primary" : "ghost"} size="sm" onClick={() => setFullscreen((v) => !v)} aria-label="מסך מלא" aria-pressed={fullscreen}>
            מסך מלא
          </OsButton>
        </div>

        <ForceGraph<AgentNode>
          testId="agent-network-svg"
          ariaLabel="רשת הסוכנים של TERAGON — ליבת תזמור ו-6 סוכנים"
          nodes={nodes}
          edges={edges}
          selectedId={selected}
          onSelect={selectAndFocus}
          degreeOf={(id) => degreeMap.get(id) ?? 0}
          isDimmed={highlightSet ? (id) => !highlightSet.has(id) && id !== "ag-orchestrator" : undefined}
          nodeRadius={(n) => agentRadius(n.id)}
          labelFor={(n) => getAgentDefinition(n.id)?.nameHe ?? n.id}
          clusterOf={(id) => AGENT_REGION[id] ?? "coordination"}
          clusterAnchor={(key) => REGION_ANCHOR[key]}
          clusterStrength={0.32}
          linkDistance={90}
          linkStrength={0.04}
          chargeStrength={-140}
          autoFit
          hideEngineLabels
          reducedMotion={reduced}
          onReady={(api) => {
            apiRef.current = api;
          }}
          edgeAppearance={(e, ctx) => {
            if (e.kind === "active") {
              return { stroke: "var(--os-accent-cyan, #35c0c9)", opacity: 0.95, width: 3, signal: true, testId: "agent-handoff-active" };
            }
            // Emphasize the exact real handoff edge when a handoff event is cross-selected.
            const edgeHi = !!highlightEdge && ((e.source === highlightEdge.source && e.target === highlightEdge.target) || (e.source === highlightEdge.target && e.target === highlightEdge.source));
            const emphasised = edgeHi || ctx.active || ctx.hovered;
            return { dashed: !edgeHi, stroke: emphasised ? "var(--os-accent-cyan, #35c0c9)" : "var(--os-border)", opacity: edgeHi ? 0.95 : ctx.dim ? 0.1 : emphasised ? 0.75 : 0.4, width: edgeHi ? 3 : emphasised ? 2 : 1 };
          }}
          renderNode={(n, ctx) => {
            const def = getAgentDefinition(n.id)!;
            const isOrch = n.id === "ag-orchestrator";
            const r = agentRadius(n.id);
            const st = statuses[n.id] ?? "IDLE";
            const ring = STATUS_META[st].color;
            const pulsing = st === "RUNNING" || st === "WAITING";
            const coordinating = isOrch && activeSet.has(n.id);
            const crossHi = highlightAgentId === n.id; // cross-selected from a note (real read)
            return (
              <>
                <title>{`${def.nameHe} (${def.codeName})\n${AGENT_ROLE[n.id] ?? ""} · ${STATUS_META[st].label}\n${def.purposeHe}`}</title>
                {crossHi && <circle r={r + 13} fill="none" stroke="var(--os-accent-cyan, #35c0c9)" strokeWidth={3} strokeOpacity={0.95} className={reduced ? undefined : "agent-status-pulse"} />}
                {/* orchestrator coordination core — layered nucleus + energy ring */}
                {isOrch && <circle r={r + 22} fill="var(--os-accent-cyan, #35c0c9)" opacity={0.06} />}
                {isOrch && <circle r={r + 14} fill="var(--os-accent-cyan, #35c0c9)" opacity={0.09} />}
                {isOrch && <circle r={r + 11} fill="none" stroke="var(--os-accent-cyan, #35c0c9)" strokeOpacity={0.22} strokeWidth={1.2} />}
                {(ctx.selected || ctx.hovered) && <circle r={r + 10} fill={ring} opacity={0.16} />}
                {/* live status ring — pulses ONLY on real running/waiting/coordinating */}
                <circle r={r + 6} fill="none" stroke={ring} strokeWidth={st === "IDLE" ? 1.5 : 3} strokeOpacity={st === "IDLE" ? 0.5 : 0.95} className={pulsing || coordinating ? "agent-status-pulse" : undefined} />
                {/* body */}
                <circle r={r} fill={ctx.selected ? "color-mix(in srgb, var(--os-accent-cyan, #35c0c9) 26%, var(--os-surface-2))" : "var(--os-surface-2)"} stroke={ctx.selected || ctx.hovered ? "var(--os-accent-cyan, #35c0c9)" : "var(--os-border)"} strokeWidth={ctx.selected ? 2.5 : 1.5} style={{ transition: reduced ? undefined : "r 140ms ease" }} />
                <text textAnchor="middle" dy={isOrch ? "-0.02em" : "0.04em"} fontSize={isOrch ? 34 : 26} style={{ pointerEvents: "none" }}>
                  {AGENT_ICON[n.id] ?? "◆"}
                </text>
                <text textAnchor="middle" dy={isOrch ? "1.7em" : "1.9em"} fontSize={isOrch ? 13 : 11} fill="var(--os-text-2)" style={{ pointerEvents: "none", fontWeight: 600 }}>
                  {AGENT_ROLE[n.id] ?? ""}
                </text>
                {/* identity name below the node — always readable (no zoom needed) */}
                <text y={r + 22} textAnchor="middle" fontSize={isOrch ? 16 : 14} fill="var(--os-text)" style={{ pointerEvents: "none", fontWeight: 600 }}>
                  {def.nameHe}
                </text>
                {/* status dot */}
                <circle cx={r * 0.72} cy={-r * 0.72} r={7} fill={ring} stroke="var(--os-surface-2)" strokeWidth={2} />
              </>
            );
          }}
        />

        <div className="tvg-source">ליבת תזמור + 6 סוכנים · {activeHandoffs.length > 0 ? `${activeHandoffs.length} העברות פעילות` : "אין העברות פעילות"}</div>

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
              <span style={{ ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>
                {selectedDef.codeName} · {AGENT_ROLE[selectedDef.id]}
              </span>
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
            {/* Real handoffs involving this agent (only if a real trace exists). */}
            <div style={{ fontSize: "var(--os-text-2xs, 11px)" }}>
              <b>העברות פעילות:</b>{" "}
              {activeHandoffs.filter((h) => h.from === selectedDef.id || h.to === selectedDef.id).length === 0 ? (
                <span style={muted}>אין העברה פעילה</span>
              ) : (
                activeHandoffs
                  .filter((h) => h.from === selectedDef.id || h.to === selectedDef.id)
                  .map((h) => `${getAgentDefinition(h.from)?.nameHe ?? h.from} → ${getAgentDefinition(h.to)?.nameHe ?? h.to}`)
                  .join(", ")
              )}
            </div>
            {/* Cross-view: Agent→Note usage only when a REAL retrieval trace exists.
                Accessible text equivalent of the relationship (never canvas-only). */}
            <div style={{ fontSize: "var(--os-text-2xs, 11px)" }} data-testid="agent-note-usage">
              <b>שימוש במסמכי Obsidian:</b>{" "}
              {selectedUsages.length === 0 ? (
                <span style={muted}>אין שימוש מתועד במסמך זה</span>
              ) : (
                <ul style={{ margin: "2px 0 0", paddingInlineStart: "1rem" }}>
                  {selectedUsages.map((u) => (
                    <li key={u.correlationId ?? u.path}>
                      {selectedDef.nameHe} קרא את <b>{u.basename}</b> מ-Obsidian · <span style={{ ...muted, fontFamily: "var(--os-font-mono, monospace)", direction: "ltr", unicodeBidi: "isolate" }}>{u.vaultName}·{u.path}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* Phase-4 bounded live Obsidian read — allowed agents only; denied agents get a notice. */}
            <div style={{ fontSize: "var(--os-text-2xs, 11px)" }}>
              <b>קריאה חיה מ-Obsidian (מבוקרת):</b>
              <AgentObsidianPanel agentId={selectedDef.id} />
            </div>
            {/* Real action engine — reused, not reimplemented. */}
            <AgentActionsPanel agentId={selectedDef.id} onResult={onResult} />
          </aside>
        )}
      </div>

      {/* Bounded loop as a visual flow (4 steps) — real structure; agent steps tinted by REAL status. */}
      <div data-testid="agent-loop-strip" style={{ ...row, fontSize: "var(--os-text-2xs, 11px)", gap: 0, alignItems: "stretch" }}>
        <span style={{ ...muted, alignSelf: "center", paddingInlineEnd: 8 }}>לולאה חסומה ({LOOP_OBJECTIVE_HE}):</span>
        {[
          { label: "1 · Hunter קורא", agent: "ag-hunter" },
          { label: "2 · המשך משתמש", agent: null },
          { label: "3 · Fixer מציע", agent: "ag-fixer" },
          { label: "4 · אישור אנושי", agent: null },
        ].map((s, i, arr) => {
          const st = s.agent ? statuses[s.agent] ?? "IDLE" : "IDLE";
          const dot = s.agent && st !== "IDLE" ? STATUS_META[st].color : null;
          return (
            <span key={i} style={{ display: "inline-flex", alignItems: "center" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", border: "1px solid var(--os-border)", borderRadius: 999, background: "var(--os-surface-2)" }}>
                {dot && <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: dot }} />}
                {s.label}
              </span>
              {i < arr.length - 1 && <span aria-hidden style={{ color: "var(--os-text-2)", padding: "0 4px" }}>→</span>}
            </span>
          );
        })}
      </div>

      {/* Accessible agent list — keyboard alternative to the canvas. */}
      <details data-testid="agent-network-list">
        <summary style={{ cursor: "pointer", fontSize: "var(--os-text-sm, 13px)" }}>רשימת סוכנים (נגישה)</summary>
        <ul style={{ margin: 0, paddingInlineStart: "1.2rem", display: "grid", gap: 4 }}>
          {AGENT_IDS.map((id) => {
            const def = getAgentDefinition(id)!;
            return (
              <li key={id}>
                <button type="button" onClick={() => selectAndFocus(id)} style={{ background: "none", border: "none", color: "var(--os-text)", cursor: "pointer", padding: 0, font: "inherit", textAlign: "start" }}>
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
