// Shared premium force-directed graph engine (d3-force + d3-zoom + d3-drag).
// Real physics: many-body repulsion, spring links, collision, centering; node drag
// with reheat; zoom/pan; programmatic fit + focus; selected-neighbor emphasis; semantic
// zoom labels. Positions are updated IMPERATIVELY on each tick (no React re-render per
// frame) for performance. Rendering of each node is delegated to the caller.
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type Simulation } from "d3-force";
import { select } from "d3-selection";
import "d3-transition"; // augments Selection.prototype.transition for smooth camera tweens
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { drag as d3drag } from "d3-drag";

export interface FGNodeBase {
  id: string;
}
export interface FGEdge {
  source: string;
  target: string;
}
interface SimNode extends FGNodeBase {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface NodeRenderCtx {
  selected: boolean;
  hovered: boolean;
  neighbor: boolean;
  dim: boolean;
  degree: number;
}
export interface ForceGraphApi {
  fit: () => void;
  focus: (id: string) => void;
  zoomBy: (factor: number) => void;
}

export interface ForceGraphProps<N extends FGNodeBase> {
  nodes: N[];
  edges: FGEdge[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onHover?: (id: string | null) => void;
  renderNode: (node: N, ctx: NodeRenderCtx) => ReactNode;
  nodeRadius: (node: N, degree: number) => number;
  labelFor: (node: N) => string;
  degreeOf: (id: string) => number;
  isDimmed?: (id: string) => boolean;
  reducedMotion?: boolean;
  onReady?: (api: ForceGraphApi) => void;
  ariaLabel?: string;
  testId?: string;
}

const WIDTH = 1000;
const HEIGHT = 640;

export function ForceGraph<N extends FGNodeBase>({
  nodes,
  edges,
  selectedId,
  onSelect,
  onHover,
  renderNode,
  nodeRadius,
  labelFor,
  degreeOf,
  isDimmed,
  reducedMotion = false,
  onReady,
  ariaLabel,
  testId,
}: ForceGraphProps<N>): ReactElement {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const nodeEls = useRef<Map<string, SVGGElement>>(new Map());
  const edgeEls = useRef<Map<number, SVGLineElement>>(new Map());
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const posRef = useRef<Map<string, SimNode>>(new Map());
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!m.has(e.source)) m.set(e.source, new Set());
      if (!m.has(e.target)) m.set(e.target, new Set());
      m.get(e.source)!.add(e.target);
      m.get(e.target)!.add(e.source);
    }
    return m;
  }, [edges]);

  // Build / rebuild the simulation when the graph data changes (NOT on selection).
  useEffect(() => {
    const prev = posRef.current;
    const simNodes: SimNode[] = nodes.map((n) => {
      const p = prev.get(n.id);
      return { id: n.id, x: p?.x, y: p?.y, vx: p?.vx, vy: p?.vy };
    });
    const byId = new Map(simNodes.map((n) => [n.id, n]));
    posRef.current = byId;
    const simLinks = edges.filter((e) => byId.has(e.source) && byId.has(e.target)).map((e) => ({ source: e.source, target: e.target }));

    const sim = forceSimulation<SimNode>(simNodes)
      .force("charge", forceManyBody<SimNode>().strength(-360).distanceMax(520))
      .force("link", forceLink<SimNode, { source: string; target: string }>(simLinks).id((d) => d.id).distance(120).strength(0.25))
      .force("collide", forceCollide<SimNode>().radius((d) => nodeRadius(nodes.find((x) => x.id === d.id)!, degreeOf(d.id)) + 14))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .alpha(1)
      .alphaDecay(reducedMotion ? 0.2 : 0.028);

    const paint = (): void => {
      for (const [id, el] of nodeEls.current) {
        const p = byId.get(id);
        if (p && p.x != null && p.y != null) el.setAttribute("transform", `translate(${p.x} ${p.y})`);
      }
      edges.forEach((e, i) => {
        const el = edgeEls.current.get(i);
        const a = byId.get(e.source);
        const b = byId.get(e.target);
        if (el && a?.x != null && b?.x != null) {
          el.setAttribute("x1", String(a.x));
          el.setAttribute("y1", String(a.y));
          el.setAttribute("x2", String(b.x));
          el.setAttribute("y2", String(b.y));
        }
      });
    };
    sim.on("tick", paint);
    if (reducedMotion) {
      sim.stop();
      for (let i = 0; i < 220; i++) sim.tick();
      paint();
    }
    simRef.current = sim;

    // node drag
    const dragBehavior = d3drag<SVGGElement, unknown>()
      .on("start", (event, _d) => {
        const id = (event.sourceEvent.currentTarget as SVGGElement).dataset.nodeId!;
        if (!reducedMotion) sim.alphaTarget(0.25).restart();
        const p = byId.get(id);
        if (p) {
          p.fx = p.x;
          p.fy = p.y;
        }
      })
      .on("drag", (event) => {
        const id = (event.sourceEvent.currentTarget as SVGGElement).dataset.nodeId!;
        const p = byId.get(id);
        if (p) {
          p.fx = event.x;
          p.fy = event.y;
        }
        if (reducedMotion) paint();
      })
      .on("end", (event) => {
        const id = (event.sourceEvent.currentTarget as SVGGElement).dataset.nodeId!;
        if (!reducedMotion) sim.alphaTarget(0);
        const p = byId.get(id);
        if (p) {
          p.fx = null;
          p.fy = null;
        }
      });
    for (const [, el] of nodeEls.current) select(el).call(dragBehavior as never);

    return () => {
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, reducedMotion]);

  // zoom / pan
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svgSel = select(svgRef.current);
    const gSel = select(gRef.current);
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on("zoom", (event) => {
        gSel.attr("transform", event.transform.toString());
        setZoomLevel(event.transform.k);
      });
    zoomRef.current = z;
    svgSel.call(z as never);
    const api: ForceGraphApi = {
      fit: () => {
        const pts = [...posRef.current.values()].filter((p) => p.x != null);
        if (pts.length === 0) return;
        const xs = pts.map((p) => p.x!);
        const ys = pts.map((p) => p.y!);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const w = maxX - minX || 1;
        const h = maxY - minY || 1;
        const k = Math.min(3, Math.max(0.35, 0.82 * Math.min(WIDTH / (w + 160), HEIGHT / (h + 160))));
        const tx = WIDTH / 2 - k * (minX + maxX) / 2;
        const ty = HEIGHT / 2 - k * (minY + maxY) / 2;
        svgSel.transition().duration(reducedMotion ? 0 : 450).call(z.transform as never, zoomIdentity.translate(tx, ty).scale(k));
      },
      focus: (id: string) => {
        const p = posRef.current.get(id);
        if (!p || p.x == null) return;
        const k = 1.5;
        svgSel.transition().duration(reducedMotion ? 0 : 450).call(z.transform as never, zoomIdentity.translate(WIDTH / 2 - k * p.x, HEIGHT / 2 - k * p.y!).scale(k));
      },
      zoomBy: (factor: number) => svgSel.transition().duration(180).call(z.scaleBy as never, factor),
    };
    onReady?.(api);
    return () => {
      svgSel.on(".zoom", null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  const neighbors = selectedId ? (adjacency.get(selectedId) ?? new Set<string>()) : null;

  return (
    <svg
      ref={svgRef}
      data-testid={testId}
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{ width: "100%", height: "100%", display: "block", cursor: "grab" }}
      onClick={(e) => {
        if (e.target === svgRef.current) onSelect(null);
      }}
    >
      <g ref={gRef}>
        {edges.map((e, i) => {
          const active = selectedId != null && (e.source === selectedId || e.target === selectedId);
          const filteredOut = (isDimmed?.(e.source) ?? false) || (isDimmed?.(e.target) ?? false);
          const dim = filteredOut || (selectedId != null && !active);
          return (
            <line
              key={i}
              ref={(el) => {
                if (el) edgeEls.current.set(i, el);
                else edgeEls.current.delete(i);
              }}
              stroke={active ? "var(--os-accent-cyan, #35c0c9)" : "var(--os-border)"}
              strokeOpacity={dim ? 0.08 : active ? 0.85 : 0.22}
              strokeWidth={active ? 2 : 1}
            />
          );
        })}
        {nodes.map((n) => {
          const degree = degreeOf(n.id);
          const selected = n.id === selectedId;
          const isHover = n.id === hovered;
          const neighbor = neighbors?.has(n.id) ?? false;
          const filteredOut = isDimmed?.(n.id) ?? false;
          const dim = filteredOut || (selectedId != null && !selected && !neighbor);
          const p = posRef.current.get(n.id);
          const showLabel = selected || isHover || neighbor || degree >= 4 || zoomLevel > 1.6;
          return (
            <g
              key={n.id}
              data-node-id={n.id}
              ref={(el) => {
                if (el) nodeEls.current.set(n.id, el);
                else nodeEls.current.delete(n.id);
              }}
              transform={p?.x != null ? `translate(${p.x} ${p.y})` : undefined}
              style={{ cursor: "pointer", opacity: dim ? 0.28 : 1, transition: reducedMotion ? undefined : "opacity 180ms ease" }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(n.id);
              }}
              onMouseEnter={() => {
                setHovered(n.id);
                onHover?.(n.id);
              }}
              onMouseLeave={() => {
                setHovered(null);
                onHover?.(null);
              }}
            >
              {renderNode(n, { selected, hovered: isHover, neighbor, dim, degree })}
              {showLabel && (
                <text y={nodeRadius(n, degree) + 14} textAnchor="middle" fontSize={selected ? 13 : 11} fontWeight={selected ? 600 : 400} fill="var(--os-text)" style={{ pointerEvents: "none" }}>
                  {labelFor(n)}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
