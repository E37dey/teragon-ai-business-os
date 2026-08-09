// TERAGON Visual Intelligence Workspace — one coherent workspace with two real,
// interactive visual modes: רשת סוכנים (Agent Network, real 7-agent registry) and
// מפת ידע (live Obsidian Knowledge Graph). Desktop can split into one continuous
// workspace; narrow screens stack. No fake activity: every visual state reflects real
// product data/state. Each mode is a full-bleed spatial canvas (no card-in-card).
import { useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { OsButton, SectionTitle } from "@/design-system";
import { KnowledgeGraphPanel } from "@/modules/memory/obsidian/KnowledgeGraphPanel";
import { AgentNetworkPanel } from "./AgentNetworkPanel";
import { deriveAgentNoteUsages } from "./crossView";

const stack = (gap = "var(--os-space-4)"): CSSProperties => ({ display: "grid", gap });
const seg: CSSProperties = { display: "inline-flex", gap: 4, padding: 4, borderRadius: 999, background: "var(--os-surface-2)", boxShadow: "inset 0 0 0 1px var(--os-border)" };

type Mode = "agents" | "graph" | "split";

export function VisualIntelligenceWorkspace(): ReactElement {
  const [mode, setMode] = useState<Mode>("agents");
  const usages = useMemo(() => deriveAgentNoteUsages(), []);

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
        </div>
      </div>

      {mode === "agents" && <AgentNetworkPanel usages={usages} />}
      {mode === "graph" && <KnowledgeGraphPanel />}
      {mode === "split" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "var(--os-space-5)", alignItems: "start" }}>
          <AgentNetworkPanel usages={usages} />
          <KnowledgeGraphPanel />
        </div>
      )}
    </div>
  );
}
