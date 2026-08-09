// TERAGON Visual Intelligence Workspace — one coherent workspace with two real,
// interactive visual modes: רשת סוכנים (Agent Network, real 7-agent registry) and
// מפת ידע (live Obsidian Knowledge Graph). Desktop can split; narrow screens stack.
// No fake activity: every visual state reflects real product data/state.
import { useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { OsButton, SectionTitle } from "@/design-system";
import { KnowledgeGraphPanel } from "@/modules/memory/obsidian/KnowledgeGraphPanel";
import { AgentNetworkPanel } from "./AgentNetworkPanel";
import { deriveAgentNoteUsages } from "./crossView";

const stack = (gap = "var(--os-space-4)"): CSSProperties => ({ display: "grid", gap });
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "var(--os-space-2)", alignItems: "center" };

type Mode = "agents" | "graph" | "split";

export function VisualIntelligenceWorkspace(): ReactElement {
  const [mode, setMode] = useState<Mode>("agents");
  const usages = useMemo(() => deriveAgentNoteUsages(), []);

  return (
    <div style={stack()} data-testid="visual-intelligence-workspace">
      <SectionTitle title="סביבת אינטליגנציה חזותית" subtitle="מצב אמיתי · ללא פעילות מדומה" />
      <div style={row} role="group" aria-label="מצב תצוגה חזותית">
        <OsButton variant={mode === "agents" ? "primary" : "ghost"} size="sm" onClick={() => setMode("agents")} data-testid="viz-mode-agents" aria-pressed={mode === "agents"}>
          רשת סוכנים
        </OsButton>
        <OsButton variant={mode === "graph" ? "primary" : "ghost"} size="sm" onClick={() => setMode("graph")} data-testid="viz-mode-graph" aria-pressed={mode === "graph"}>
          מפת ידע
        </OsButton>
        <OsButton variant={mode === "split" ? "primary" : "ghost"} size="sm" onClick={() => setMode("split")} data-testid="viz-mode-split" aria-pressed={mode === "split"}>
          מסך מפוצל
        </OsButton>
      </div>

      {mode === "agents" && <AgentNetworkPanel usages={usages} />}
      {mode === "graph" && <KnowledgeGraphPanel />}
      {mode === "split" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "var(--os-space-4)", alignItems: "start" }}>
          <AgentNetworkPanel usages={usages} />
          <KnowledgeGraphPanel />
        </div>
      )}
    </div>
  );
}
