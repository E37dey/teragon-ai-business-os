// Shared premium force-directed graph engine (d3-force + d3-zoom + d3-drag).
// Real physics: many-body repulsion, spring links, collision, centering, optional
// functional-region cluster forces; node drag with reheat; zoom/pan; programmatic fit +
// focus; selected-neighbor emphasis; semantic-zoom labels. The viewBox adapts to the
// container's aspect ratio (fills tall/narrow mobile canvases). Positions are updated
// IMPERATIVELY per tick (no React re-render per frame). Node + edge rendering is delegated.
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from "d3-force";
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
  /** Caller-defined edge kind (e.g. "supported" | "active") — drives edgeAppearance. */
  kind?: string;
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
export interface EdgeStyle {
  stroke?: string;
  opacity?: number;
  width?: number;
  dashed?: boolean;
  /** animate a one-directional signal along the edge (real active handoff only). */
  signal?: boolean;
  testId?: string;
}
export interface ForceGraphApi {
  fit: () => void;
  focus: (id: string) => void;
  zoomBy: (factor: number) => void;
  reset: () => void;
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
  /** Optional community/cluster key per node — drives spatial separation (cluster forces).
   *  Real, deterministic (folder / connected component / functional role) — never fabricated. */
  clusterOf?: (id: string) => string;
  /** Optional custom anchor per cluster key (relative 0..1 of the viewBox). Falls back to an
   *  evenly-spaced ring. Lets a caller place e.g. a coordination cluster at the centre. */
  clusterAnchor?: (key: string) => { x: number; y: number } | undefined;
  clusterStrength?: number;
  linkDistance?: number;
  linkStrength?: number;
  chargeStrength?: number;
  /** Per-edge visual style (dashed supported edges, animated active signals, testids). */
  edgeAppearance?: (edge: FGEdge, ctx: { active: boolean; dim: boolean; hovered: boolean }) => EdgeStyle | undefined;
  /** When true the engine does not render its own labels — the caller draws them in renderNode. */
  hideEngineLabels?: boolean;
  /** Fit the settled graph to the viewport once on mount (fills the canvas → no dead space). */
  autoFit?: boolean;
  reducedMotion?: boolean;
  onReady?: (api: ForceGraphApi) => void;
  ariaLabel?: string;
  testId?: string;
}

const DEFAULT_DIMS = { w: 900, h: 640 };

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
  clusterOf,
  clusterAnchor,
  clusterStrength,
  linkDistance,
  linkStrength,
  chargeStrength,
  edgeAppearance,
  hideEngineLabels,
  autoFit,
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
  // The viewBox tracks the container's PIXEL size so 1 unit ≈ 1 CSS px: node radii become
  // real px targets and the layout fills the actual canvas shape (tall/narrow mobile too).
  const [dims, setDims] = useState(DEFAULT_DIMS);

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr || cr.width === 0 || cr.height === 0) return;
      const w = Math.round(cr.width);
      const h = Math.round(cr.height);
      setDims((prev) => (Math.abs(prev.w - w) > 24 || Math.abs(prev.h - h) > 24 ? { w, h } : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  // Build / rebuild the simulation when the graph data (or viewBox shape) changes.
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
      .force("charge", forceManyBody<SimNode>().strength(chargeStrength ?? -360).distanceMax(640))
      .force("link", forceLink<SimNode, { source: string; target: string }>(simLinks).id((d) => d.id).distance(linkDistance ?? 120).strength(linkStrength ?? 0.22))
      .force("collide", forceCollide<SimNode>().radius((d) => nodeRadius(nodes.find((x) => x.id === d.id)!, degreeOf(d.id)) + 16))
      .force("center", forceCenter(dims.w / 2, dims.h / 2))
      .alpha(1)
      .alphaDecay(reducedMotion ? 0.2 : 0.028);

    // Cluster forces: pull each community toward its anchor so clusters separate spatially
    // (the multi-region "intelligence" look). Anchors are deterministic → stable layout.
    if (clusterOf) {
      const clusterKeys = [...new Set(nodes.map((n) => clusterOf(n.id)))];
      if (clusterKeys.length > 1) {
        const anchor = new Map<string, { x: number; y: number }>();
        clusterKeys.forEach((k, i) => {
          const custom = clusterAnchor?.(k);
          if (custom) {
            anchor.set(k, { x: custom.x * dims.w, y: custom.y * dims.h });
          } else {
            const a = (i / clusterKeys.length) * Math.PI * 2 - Math.PI / 2;
            anchor.set(k, { x: dims.w / 2 + Math.cos(a) * dims.w * 0.26, y: dims.h / 2 + Math.sin(a) * dims.h * 0.3 });
          }
        });
        const st = clusterStrength ?? 0.08;
        sim
          .force("clusterX", forceX<SimNode>((d) => anchor.get(clusterOf(d.id))?.x ?? dims.w / 2).strength(st))
          .force("clusterY", forceY<SimNode>((d) => anchor.get(clusterOf(d.id))?.y ?? dims.h / 2).strength(st));
      }
    }

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

    // node drag (mouse + touch — d3-drag handles both pointer types)
    const dragBehavior = d3drag<SVGGElement, unknown>()
      .on("start", (event) => {
        const id = (event.sourceEvent.currentTarget as SVGGElement).dataset.nodeId!;
        if (!reducedMotion) sim.alphaTarget(0.28).restart();
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
  }, [nodes, edges, reducedMotion, dims.w, dims.h]);

  // zoom / pan + camera API
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
        const k = Math.min(2.4, Math.max(0.35, 0.94 * Math.min(dims.w / (w + 130), dims.h / (h + 130))));
        const tx = dims.w / 2 - (k * (minX + maxX)) / 2;
        const ty = dims.h / 2 - (k * (minY + maxY)) / 2;
        svgSel.transition().duration(reducedMotion ? 0 : 450).call(z.transform as never, zoomIdentity.translate(tx, ty).scale(k));
      },
      focus: (id: string) => {
        const p = posRef.current.get(id);
        if (!p || p.x == null) return;
        const k = 1.5;
        svgSel.transition().duration(reducedMotion ? 0 : 450).call(z.transform as never, zoomIdentity.translate(dims.w / 2 - k * p.x, dims.h / 2 - k * p.y!).scale(k));
      },
      zoomBy: (factor: number) => svgSel.transition().duration(180).call(z.scaleBy as never, factor),
      reset: () => svgSel.transition().duration(reducedMotion ? 0 : 400).call(z.transform as never, zoomIdentity),
    };
    onReady?.(api);
    // Fit once after the simulation has had time to settle → the graph fills the canvas.
    const fitTimer = autoFit ? setTimeout(() => api.fit(), reducedMotion ? 80 : 1100) : null;
    return () => {
      if (fitTimer) clearTimeout(fitTimer);
      svgSel.on(".zoom", null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, dims.w, dims.h]);

  const neighbors = selectedId ? (adjacency.get(selectedId) ?? new Set<string>()) : null;
  const svgStyle: CSSProperties = { width: "100%", height: "100%", display: "block", cursor: "grab", touchAction: "none" };

  return (
    <svg ref={svgRef} data-testid={testId} role="img" aria-label={ariaLabel} viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid meet" style={svgStyle} onClick={(e) => {
      if (e.target === svgRef.current) onSelect(null);
    }}>
      <g ref={gRef}>
        {edges.map((e, i) => {
          const active = selectedId != null && (e.source === selectedId || e.target === selectedId);
          const edgeHovered = hovered != null && (e.source === hovered || e.target === hovered);
          const filteredOut = (isDimmed?.(e.source) ?? false) || (isDimmed?.(e.target) ?? false);
          const dim = filteredOut || (selectedId != null && !active);
          const ap = edgeAppearance?.(e, { active, dim, hovered: edgeHovered });
          return (
            <line
              key={i}
              ref={(el) => {
                if (el) edgeEls.current.set(i, el);
                else edgeEls.current.delete(i);
              }}
              stroke={ap?.stroke ?? (active ? "var(--os-accent-cyan, #35c0c9)" : "var(--os-border)")}
              strokeOpacity={ap?.opacity ?? (dim ? 0.08 : active ? 0.85 : 0.22)}
              strokeWidth={ap?.width ?? (active ? 2 : 1)}
              strokeDasharray={ap?.dashed ? "4 4" : undefined}
              className={ap?.signal && !reducedMotion ? "tvg-signal" : undefined}
              data-testid={ap?.testId}
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
          const showLabel = !hideEngineLabels && (selected || isHover || neighbor || degree >= 4 || zoomLevel > 1.6);
          return (
            <g
              key={n.id}
              data-node-id={n.id}
              ref={(el) => {
                if (el) nodeEls.current.set(n.id, el);
                else nodeEls.current.delete(n.id);
              }}
              transform={p?.x != null ? `translate(${p.x} ${p.y})` : undefined}
              style={{ cursor: "pointer", opacity: dim ? 0.3 : 1, transition: reducedMotion ? undefined : "opacity 180ms ease" }}
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
