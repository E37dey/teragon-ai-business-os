// W5-D — deterministic layered layout for the collaboration graph (pure,
// unit tested — no external graph library). Columns by node kind:
// run → agents → tasks → conflicts → approvals. Labels never overlap:
// fixed row height per column, nodes vertically centered per column.
import type { RunGraph, RunGraphEdge, RunGraphNode } from "@/agents";

export const NODE_W = 168;
export const NODE_H = 52;
// Wider column gap gives the left→right orchestration flow (run → agents → tasks →
// conflicts → approvals) clear directional breathing room and uses more of the canvas;
// larger row gap + padding lift the layout from "cramped cluster" to an operations console.
// Tuned constants only — the tested structural invariants (column order, no overlap,
// in-bounds) are unchanged.
const COL_GAP = 120;
const ROW_GAP = 30;
const PADDING = 24;

const KIND_COLUMN: Record<RunGraphNode["kind"], number> = {
  run: 0,
  agent: 1,
  task: 2,
  conflict: 3,
  approval: 4,
};

export interface PositionedNode extends RunGraphNode {
  x: number;
  y: number;
}

export interface PositionedEdge extends RunGraphEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface GraphLayout {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
}

/** Pure layered layout — same graph in, same coordinates out. */
export function layoutRunGraph(graph: RunGraph): GraphLayout {
  const columns = new Map<number, RunGraphNode[]>();
  for (const node of graph.nodes) {
    const col = KIND_COLUMN[node.kind];
    const list = columns.get(col) ?? [];
    list.push(node);
    columns.set(col, list);
  }
  const usedCols = [...columns.keys()].sort((a, b) => a - b);
  const colIndex = new Map<number, number>();
  usedCols.forEach((col, i) => colIndex.set(col, i));

  const maxRows = Math.max(1, ...[...columns.values()].map((list) => list.length));
  const height = PADDING * 2 + maxRows * NODE_H + (maxRows - 1) * ROW_GAP;
  const width = PADDING * 2 + usedCols.length * NODE_W + (usedCols.length - 1) * COL_GAP;

  const positioned = new Map<string, PositionedNode>();
  const nodes: PositionedNode[] = [];
  for (const [col, list] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
    const i = colIndex.get(col) ?? 0;
    const x = PADDING + i * (NODE_W + COL_GAP);
    const columnHeight = list.length * NODE_H + (list.length - 1) * ROW_GAP;
    const yStart = PADDING + (height - PADDING * 2 - columnHeight) / 2;
    list.forEach((node, row) => {
      const p: PositionedNode = { ...node, x, y: yStart + row * (NODE_H + ROW_GAP) };
      positioned.set(node.id, p);
      nodes.push(p);
    });
  }

  const edges: PositionedEdge[] = [];
  for (const edge of graph.edges) {
    const from = positioned.get(edge.from);
    const to = positioned.get(edge.to);
    if (!from || !to) continue; // edge to a node outside the graph — skip honestly
    const leftToRight = from.x <= to.x;
    edges.push({
      ...edge,
      x1: from.x + (leftToRight ? NODE_W : 0),
      y1: from.y + NODE_H / 2,
      x2: to.x + (leftToRight ? 0 : NODE_W),
      y2: to.y + NODE_H / 2,
    });
  }

  return { nodes, edges, width, height };
}
