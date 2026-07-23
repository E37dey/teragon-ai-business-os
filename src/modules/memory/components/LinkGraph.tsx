// W6-A — simple deterministic link graph (no library): nodes on a circle,
// resolved wikilink edges as lines. Nodes are selectable buttons (a11y: each
// node is a real <button> in an SVG foreignObject-free overlay list).
import type { ReactElement } from "react";
import type { LinkGraph as LinkGraphData } from "../selectors";
import { MEMORY_LAYER_LABELS_HE } from "@/domain/memory";
import { OS_ACCENT_HEX, type OsAccent } from "@/design-system";
import type { MemoryLayer } from "@/domain/memory";

const LAYER_ACCENT: Record<MemoryLayer, OsAccent> = {
  customer: "cyan",
  business: "blue",
  technical: "violet",
  agent_learning: "success",
};

export interface LinkGraphProps {
  graph: LinkGraphData;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const SIZE = 320;
const R = 120;

export function LinkGraphView({ graph, selectedId, onSelect }: LinkGraphProps): ReactElement {
  const { nodes, edges } = graph;
  const center = SIZE / 2;
  // deterministic circular layout (order = node order = record order)
  const pos = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1) - Math.PI / 2;
    pos.set(n.id, { x: center + R * Math.cos(angle), y: center + R * Math.sin(angle) });
  });

  if (nodes.length === 0) {
    return (
      <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-sm, 13px)" }}>
        אין פריטי זיכרון להצגה בגרף.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--os-space-2)" }} data-testid="memory-link-graph">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`גרף קישורים: ${nodes.length} פריטים, ${edges.length} קישורים פתורים`}
        style={{ inlineSize: "100%", maxBlockSize: 340 }}
      >
        {edges.map((e, i) => {
          const a = pos.get(e.fromId);
          const b = pos.get(e.toId);
          if (!a || !b) return null;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--os-border-strong, #2A3A52)"
              strokeWidth={1.2}
            />
          );
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const selected = n.id === selectedId;
          return (
            <g key={n.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r={selected ? 9 : 6}
                fill={OS_ACCENT_HEX[LAYER_ACCENT[n.layer]]}
                opacity={selected ? 1 : 0.75}
                stroke={selected ? "#F5F8FD" : "none"}
                strokeWidth={selected ? 1.5 : 0}
              />
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {nodes.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onSelect(n.id)}
            aria-pressed={n.id === selectedId}
            title={`${n.title} — ${MEMORY_LAYER_LABELS_HE[n.layer]}`}
            style={{
              font: "inherit",
              fontSize: "var(--os-text-2xs, 11px)",
              color: n.id === selectedId ? "var(--os-text)" : "var(--os-text-2)",
              background: n.id === selectedId ? "var(--os-highlight)" : "transparent",
              border: `1px solid ${n.id === selectedId ? "var(--os-border-strong)" : "var(--os-border)"}`,
              borderRadius: 999,
              paddingBlock: 2,
              paddingInline: 8,
              cursor: "pointer",
            }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-block",
                inlineSize: 7,
                blockSize: 7,
                borderRadius: "50%",
                background: OS_ACCENT_HEX[LAYER_ACCENT[n.layer]],
                marginInlineEnd: 5,
              }}
            />
            {n.title}
          </button>
        ))}
      </div>
    </div>
  );
}
