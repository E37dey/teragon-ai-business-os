// TERAGON Visual Intelligence Workspace — one coherent workspace with two real,
// interactive visual modes: רשת סוכנים (Agent Network, real 7-agent registry) and
// מפת ידע (live Obsidian Knowledge Graph). Desktop can split into one continuous
// workspace; narrow screens stack. No fake activity: every visual state reflects real
// product data/state. Each mode is a full-bleed spatial canvas (no card-in-card).
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { useSearchParams } from "react-router-dom";
import { OsButton, SectionTitle } from "@/design-system";
import { KnowledgeGraphPanel } from "@/modules/memory/obsidian/KnowledgeGraphPanel";
import { AgentNetworkPanel } from "./AgentNetworkPanel";
import { CrossViewRelations } from "./CrossViewRelations";
import { WorkflowMode } from "./WorkflowMode";
import { deriveAgentNoteUsages } from "./crossView";
import { subscribeRetrievals } from "@/agents/obsidian/retrievalTrace";

const stack = (gap = "var(--os-space-4)"): CSSProperties => ({ display: "grid", gap });
const seg: CSSProperties = { display: "inline-flex", gap: 4, padding: 4, borderRadius: 999, background: "var(--os-surface-2)", boxShadow: "inset 0 0 0 1px var(--os-border)" };

type Mode = "agents" | "graph" | "split" | "workflow";

export function VisualIntelligenceWorkspace(): ReactElement {
  // A Command Center deep link opens straight into the live workflow mode: ?run=<id> (Phase-7,
  // show a recorded run) or ?pack=<id> (Phase-8, select a business workflow pack).
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(searchParams.get("run") || searchParams.get("pack") ? "workflow" : "agents");
  // Live Agent↔Note usages (real retrieval traces) drive cross-selection in split mode.
  const [usages, setUsages] = useState(() => deriveAgentNoteUsages());
  useEffect(() => {
    setUsages(deriveAgentNoteUsages());
    return subscribeRetrievals(() => setUsages(deriveAgentNoteUsages()));
  }, []);

  // Bidirectional cross-selection — mutually exclusive; both derive ONLY from real traces.
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedNotePath, setSelectedNotePath] = useState<string | null>(null);
  const crossHighlightPaths = useMemo(
    () => (selectedAgentId ? [...new Set(usages.filter((u) => u.agentId === selectedAgentId).map((u) => u.path))] : []),
    [usages, selectedAgentId],
  );
  const crossHighlightAgentId = useMemo(() => {
    if (!selectedNotePath) return null;
    const rows = usages.filter((u) => u.path === selectedNotePath).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
    return rows[0]?.agentId ?? null;
  }, [usages, selectedNotePath]);

  return (
    <div style={stack()} data-testid="visual-intelligence-workspace">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--os-space-3)", alignItems: "center", justifyContent: "space-between" }}>
        <SectionTitle title="סביבת אינטליגנציה חזותית" subtitle="מצב אמיתי · ללא פעילות מדומה" />
        <div style={seg} role="group" aria-label="מצב תצוגה חזותית">
          <OsButton variant={mode === "agents" ? "primary" : "ghost"} size="sm" onClick={() => setMode("agents")} data-testid="viz-mode-agents" aria-pressed={mode === "agents"}>
            רשת סוכנים
          </OsButton>
          <OsButton variant={mode === "graph" ? "primary" : "ghost"} size="sm" onClick={() => setMode("graph")} data-testid="viz-mode-graph" aria-pressed={mode === "graph"}>
            מפת ידע
          </OsButton>
          <OsButton variant={mode === "split" ? "primary" : "ghost"} size="sm" onClick={() => setMode("split")} data-testid="viz-mode-split" aria-pressed={mode === "split"}>
            מסך מפוצל
          </OsButton>
          <OsButton variant={mode === "workflow" ? "primary" : "ghost"} size="sm" onClick={() => setMode("workflow")} data-testid="viz-mode-workflow" aria-pressed={mode === "workflow"}>
            תהליך חי
          </OsButton>
        </div>
      </div>

      {mode === "agents" && <AgentNetworkPanel usages={usages} />}
      {mode === "graph" && <KnowledgeGraphPanel />}
      {mode === "workflow" && <WorkflowMode />}
      {mode === "split" && (
        <div style={stack("var(--os-space-4)")}>
          {/* The real, live Agent→Note relationship spanning both graphs (real traces only). */}
          <CrossViewRelations selectedAgentId={selectedAgentId} selectedNotePath={selectedNotePath} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap: "var(--os-space-5)", alignItems: "start" }}>
            <AgentNetworkPanel
              usages={usages}
              highlightAgentId={crossHighlightAgentId}
              onSelectAgent={(id) => {
                setSelectedAgentId(id);
                setSelectedNotePath(null);
              }}
            />
            <KnowledgeGraphPanel
              highlightPaths={crossHighlightPaths}
              onSelectNote={(p) => {
                setSelectedNotePath(p);
                setSelectedAgentId(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
