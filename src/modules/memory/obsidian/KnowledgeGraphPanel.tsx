// LIVE Obsidian Knowledge Graph — a premium, spatial "Obsidian++" experience inside
// TERAGON. The force-directed canvas (real d3 physics: drag, zoom/pan, fit, programmatic
// focus, selected-neighbor emphasis, semantic-zoom labels) is the hero; controls float
// above it and a contextual inspector opens on selection. Data is the bounded read-only
// GET /graph metadata — NOT synchronization, grants NO write authority. Read/open reuse
// the existing Phase-1 capabilities.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { EmptyState, Modal, OsButton, SearchInput, StatusChip, useToast } from "@/design-system";
import { getObsidianToken } from "@/integration/obsidian/obsidianCredential";
import { obsidianErrorMessage } from "@/integration/obsidian/useObsidianVault";
import {
  getConnectionInfo,
  getVaultGraph,
  openInObsidian,
  readNote,
  type BridgeErrorCode,
  type GraphEdge,
  type GraphNode,
  type VaultGraph,
} from "@/integration/obsidian/vaultBridgeClient";
import { ForceGraph, type ForceGraphApi } from "@/modules/ai-workspace/visual/ForceGraph";
import { usePrefersReducedMotion } from "@/modules/ai-workspace/visual/usePrefersReducedMotion";
import "@/modules/ai-workspace/visual/visual.css";

const stack = (gap = "var(--os-space-3)"): CSSProperties => ({ display: "grid", gap });
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "var(--os-space-2)", alignItems: "center" };
const muted: CSSProperties = { color: "var(--os-text-2)" };
const codeStyle: CSSProperties = { fontFamily: "var(--os-font-mono, monospace)", direction: "ltr", unicodeBidi: "isolate" };
const metaRow: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "var(--os-space-2)", fontSize: "var(--os-text-2xs, 11px)" };

function nodeRadius(linkCount: number): number {
  return Math.min(30, 9 + Math.sqrt(linkCount) * 5);
}
function folderOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "(שורש)";
}
// Glowing cluster palette (distinct hues → the multi-region "brain" look).
const CLUSTER_PALETTE = ["#35c0c9", "#8b7bff", "#37b06a", "#e6a23c", "#4a86e8", "#e06699", "#2bb8a3", "#6d7bd6", "#d98a4a"];
const ORPHAN_COLOR = "#6b7686";

/** Deterministic community detection (label propagation). Real structure only — each node
 *  adopts the most common label among its neighbors; ties + order broken lexicographically,
 *  so communities are stable across reloads (no Math.random). Disconnected notes keep their
 *  own label (their own single-node community). */
function computeClusters(nodes: GraphNode[], edges: GraphEdge[]): Map<string, string> {
  const ids = nodes.map((n) => n.id).sort();
  const nbr = new Map<string, string[]>();
  ids.forEach((id) => nbr.set(id, []));
  for (const e of edges) {
    if (nbr.has(e.source) && nbr.has(e.target)) {
      nbr.get(e.source)!.push(e.target);
      nbr.get(e.target)!.push(e.source);
    }
  }
  const label = new Map<string, string>(ids.map((id) => [id, id]));
  for (let iter = 0; iter < 8; iter++) {
    let changed = false;
    for (const id of ids) {
      const neighbors = nbr.get(id)!;
      if (neighbors.length === 0) continue;
      const counts = new Map<string, number>();
      for (const n of neighbors) {
        const l = label.get(n)!;
        counts.set(l, (counts.get(l) ?? 0) + 1);
      }
      let best = label.get(id)!;
      let bestCount = -1;
      for (const [l, c] of [...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        if (c > bestCount) {
          bestCount = c;
          best = l;
        }
      }
      if (best !== label.get(id)) {
        label.set(id, best);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return label;
}

type Phase = "idle" | "loading" | "loaded" | "disconnected" | "error";

export function KnowledgeGraphPanel(): ReactElement {
  const { toast } = useToast();
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [graph, setGraph] = useState<VaultGraph | null>(null);
  const [vaultName, setVaultName] = useState<string>("");
  const [errorCode, setErrorCode] = useState<BridgeErrorCode | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [folderFilter, setFolderFilter] = useState<string>("");
  const [connectedOnly, setConnectedOnly] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [note, setNote] = useState<{ basename: string; path: string; content: string; truncated: boolean } | null>(null);
  const apiRef = useRef<ForceGraphApi | null>(null);

  const load = useCallback(async () => {
    const token = getObsidianToken();
    if (!token) {
      setPhase("disconnected");
      return;
    }
    setPhase("loading");
    const conn = await getConnectionInfo(token);
    if (!conn.ok || !conn.data) {
      setErrorCode(conn.code === "OK" ? "ERROR" : conn.code);
      setPhase("error");
      return;
    }
    setVaultName(conn.data.vaultName);
    const g = await getVaultGraph(token);
    if (!g.ok || !g.data) {
      setErrorCode(g.code === "OK" ? "ERROR" : g.code);
      setPhase("error");
      return;
    }
    setGraph(g.data);
    setSelected(null);
    setPhase("loaded");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    await load();
    toast("הגרף עודכן", "success");
  }, [load, toast]);

  const degreeMap = useMemo(() => {
    const m = new Map<string, number>();
    graph?.edges.forEach((e) => {
      m.set(e.source, (m.get(e.source) ?? 0) + 1);
      m.set(e.target, (m.get(e.target) ?? 0) + 1);
    });
    return m;
  }, [graph]);
  const degreeOf = useCallback((id: string) => degreeMap.get(id) ?? 0, [degreeMap]);

  // Real, deterministic communities → per-cluster color + a named legend (hub of each
  // community). Clusters drive spatial separation (cluster forces) and node color.
  const clusters = useMemo(() => (graph ? computeClusters(graph.nodes, graph.edges) : new Map<string, string>()), [graph]);
  const clusterColor = useMemo(() => {
    const keys = [...new Set([...clusters.values()])].sort();
    const m = new Map<string, string>();
    keys.forEach((k, i) => m.set(k, CLUSTER_PALETTE[i % CLUSTER_PALETTE.length]!));
    return m;
  }, [clusters]);
  const colorOf = useCallback(
    (id: string, linkCount: number, selected: boolean): string => {
      if (selected) return "#35c0c9";
      if (linkCount === 0) return ORPHAN_COLOR;
      return clusterColor.get(clusters.get(id) ?? "") ?? "#4a86e8";
    },
    [clusters, clusterColor],
  );
  const clusterOf = useCallback((id: string) => clusters.get(id) ?? "", [clusters]);
  // Legend: each multi-note community named by its highest-degree hub note.
  const legend = useMemo(() => {
    if (!graph) return [] as Array<{ key: string; hubId: string; color: string; name: string; count: number }>;
    const members = new Map<string, GraphNode[]>();
    for (const nd of graph.nodes) {
      const k = clusters.get(nd.id) ?? "";
      if (!members.has(k)) members.set(k, []);
      members.get(k)!.push(nd);
    }
    return [...members.entries()]
      .map(([key, ms]) => {
        const hub = [...ms].sort((a, b) => b.linkCount - a.linkCount)[0]!;
        return { key, hubId: hub.id, color: clusterColor.get(key) ?? "#4a86e8", name: hub.basename, count: ms.length };
      })
      .filter((c) => c.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [graph, clusters, clusterColor]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    graph?.nodes.forEach((nd) => nd.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [graph]);
  const allFolders = useMemo(() => {
    const s = new Set<string>();
    graph?.nodes.forEach((nd) => s.add(folderOf(nd.path)));
    return Array.from(s).sort();
  }, [graph]);

  const visibleNodeIds = useMemo(() => {
    if (!graph) return new Set<string>();
    const ids = new Set<string>();
    for (const nd of graph.nodes) {
      if (tagFilter && !nd.tags.includes(tagFilter)) continue;
      if (folderFilter && folderOf(nd.path) !== folderFilter) continue;
      if (connectedOnly && nd.linkCount === 0) continue;
      ids.add(nd.id);
    }
    return ids;
  }, [graph, tagFilter, folderFilter, connectedOnly]);
  const isDimmed = useCallback((id: string) => !visibleNodeIds.has(id), [visibleNodeIds]);

  const searchMatches = useMemo(() => {
    if (!graph || !query.trim()) return [];
    const q = query.trim().toLowerCase();
    return graph.nodes.filter((nd) => nd.basename.toLowerCase().includes(q) || nd.path.toLowerCase().includes(q)).slice(0, 20);
  }, [graph, query]);

  const selectAndFocus = useCallback((id: string) => {
    setSelected(id);
    apiRef.current?.focus(id);
  }, []);

  const selectedNode = graph?.nodes.find((n) => n.id === selected) ?? null;
  const selectedEdges = useMemo(() => {
    if (!graph || !selected) return { out: [] as GraphEdge[], in: [] as GraphEdge[] };
    return { out: graph.edges.filter((e) => e.source === selected), in: graph.edges.filter((e) => e.target === selected) };
  }, [graph, selected]);

  const onRead = useCallback(
    async (path: string) => {
      const token = getObsidianToken();
      if (!token) return;
      const r = await readNote(path, token);
      if (r.ok && r.data) setNote({ basename: r.data.basename, path: r.data.path, content: r.data.content, truncated: r.data.truncated });
      else toast(obsidianErrorMessage(r.code === "OK" ? "ERROR" : r.code), "danger");
    },
    [toast],
  );

  const resetFilters = useCallback(() => {
    setTagFilter("");
    setFolderFilter("");
    setConnectedOnly(false);
  }, []);

  const header = (
    <div style={{ ...row, justifyContent: "space-between" }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: "var(--os-text-md, 15px)" }}>מפת ידע</div>
        <div style={{ ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>Obsidian · מפת קישורים חיה</div>
      </div>
      {phase === "loaded" ? (
        <StatusChip status="פעיל" label={`${graph?.count ?? 0} מסמכים`} />
      ) : phase === "error" || phase === "disconnected" ? (
        <StatusChip status="מושבת" label="לא זמין" />
      ) : (
        <StatusChip status="ממתין" label="טוען…" />
      )}
    </div>
  );

  return (
    <div data-testid="obsidian-graph-panel" style={stack()}>
      {header}

      {phase === "disconnected" && (
        <EmptyState
          title="לא מחובר"
          reason="התחברו ל-Obsidian בפאנל למעלה, ואז טענו את מפת הידע החיה."
          action={
            <OsButton variant="primary" size="sm" onClick={() => void load()} data-testid="obsidian-graph-load">
              טען מפה
            </OsButton>
          }
        />
      )}
      {phase === "loading" && (
        <div role="status" style={muted}>
          טוען את מפת הידע…
        </div>
      )}
      {phase === "error" && (
        <div style={stack()}>
          <div role="alert" data-testid="obsidian-graph-error" style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-danger, #c0392b)" }}>
            {obsidianErrorMessage(errorCode)}
          </div>
          <div style={row}>
            <OsButton variant="ghost" onClick={refresh} data-testid="obsidian-graph-refresh">
              נסה שוב
            </OsButton>
          </div>
        </div>
      )}

      {phase === "loaded" && graph && (
        <>
          {graph.nodes.length === 0 ? (
            <EmptyState title="הכספת ריקה" reason="לא נמצאו מסמכי Markdown בכספת המחוברת." />
          ) : (
            <>
              <div className={`tvg-canvas${fullscreen ? " tvg-fullscreen" : ""}`} style={{ height: fullscreen ? "100vh" : "min(64vh, 560px)" }}>
                {/* Floating toolbar */}
                <div className="tvg-toolbar" role="toolbar" aria-label="בקרת מפת ידע">
                  <div style={{ minWidth: 150 }}>
                    <SearchInput value={query} onChange={setQuery} placeholder="חפש…" ariaLabel="חיפוש במפת הידע" />
                  </div>
                  {allFolders.length > 1 && (
                    <select aria-label="סינון לפי תיקייה" data-testid="obsidian-graph-folder" value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)} style={selectStyle}>
                      <option value="">כל התיקיות</option>
                      {allFolders.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  )}
                  {allTags.length > 0 && (
                    <select aria-label="סינון לפי תגית" data-testid="obsidian-graph-tag" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={selectStyle}>
                      <option value="">כל התגיות</option>
                      {allTags.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  )}
                  <label style={{ ...row, fontSize: "var(--os-text-2xs, 11px)", gap: 4 }}>
                    <input type="checkbox" checked={connectedOnly} onChange={(e) => setConnectedOnly(e.target.checked)} aria-label="מחוברים בלבד" /> מחוברים
                  </label>
                  <OsButton variant="ghost" size="sm" onClick={resetFilters} data-testid="obsidian-graph-reset" aria-label="אפס סינון">
                    איפוס
                  </OsButton>
                  <OsButton variant="ghost" size="sm" onClick={() => apiRef.current?.fit()} aria-label="התאם לתצוגה">
                    התאמה
                  </OsButton>
                  <OsButton variant="ghost" size="sm" onClick={() => apiRef.current?.zoomBy(1.3)} aria-label="הגדל">
                    +
                  </OsButton>
                  <OsButton variant="ghost" size="sm" onClick={() => apiRef.current?.zoomBy(1 / 1.3)} aria-label="הקטן">
                    −
                  </OsButton>
                  <OsButton variant="ghost" size="sm" onClick={refresh} data-testid="obsidian-graph-refresh" aria-label="רענן גרף">
                    רענן
                  </OsButton>
                  <OsButton variant={fullscreen ? "primary" : "ghost"} size="sm" onClick={() => setFullscreen((v) => !v)} aria-label="מסך מלא" aria-pressed={fullscreen}>
                    מסך מלא
                  </OsButton>
                </div>

                {searchMatches.length > 0 && (
                  <div className="tvg-fadein" style={{ position: "absolute", top: 62, insetInlineStart: 12, zIndex: 3, ...row, maxWidth: "60%", fontSize: "var(--os-text-2xs, 11px)", background: "color-mix(in srgb, var(--os-surface-2) 82%, transparent)", padding: "6px 10px", borderRadius: 10, boxShadow: "inset 0 0 0 1px var(--os-border)" }} data-testid="obsidian-graph-search-results">
                    <span style={muted}>תוצאות:</span>
                    {searchMatches.map((m) => (
                      <OsButton key={m.id} variant="ghost" size="sm" onClick={() => selectAndFocus(m.id)}>
                        {m.basename}
                      </OsButton>
                    ))}
                  </div>
                )}

                <ForceGraph<GraphNode>
                  testId="obsidian-graph-svg"
                  ariaLabel={`מפת ידע: ${graph.count} מסמכים, ${graph.edgeCount} קשרים`}
                  nodes={graph.nodes}
                  edges={graph.edges}
                  selectedId={selected}
                  onSelect={setSelected}
                  degreeOf={degreeOf}
                  isDimmed={isDimmed}
                  clusterOf={clusterOf}
                  autoFit
                  reducedMotion={reduced}
                  onReady={(api) => {
                    apiRef.current = api;
                  }}
                  nodeRadius={(n) => nodeRadius(n.linkCount)}
                  labelFor={(n) => n.basename}
                  renderNode={(n, ctx) => {
                    const r = nodeRadius(n.linkCount);
                    const fill = colorOf(n.id, n.linkCount, ctx.selected);
                    const hub = n.linkCount >= 4;
                    return (
                      <>
                        {/* per-node glow — stronger for hubs / selected / hovered (soft cluster luminance) */}
                        {(ctx.selected || ctx.hovered || hub) && <circle r={r + (ctx.selected || ctx.hovered ? 9 : 6)} fill={fill} opacity={ctx.selected || ctx.hovered ? 0.22 : 0.13} />}
                        <circle r={r} fill={fill} stroke={ctx.selected ? "var(--os-text)" : "var(--os-surface-1)"} strokeWidth={ctx.selected ? 2.5 : 1.5} style={{ transition: reduced ? undefined : "r 140ms ease" }} />
                      </>
                    );
                  }}
                />

                <div className="tvg-source" data-testid="obsidian-graph-source">
                  מקור: <b>Obsidian</b> · {vaultName} · מפת קישורים חיה{graph.truncated ? " · תת-קבוצה (גרף גדול מהמכסה)" : ""}
                </div>

                {/* Cluster legend — real communities, each named by its hub note. */}
                {legend.length > 1 && !selectedNode && (
                  <div className="tvg-fadein" data-testid="obsidian-graph-legend" style={{ position: "absolute", bottom: 12, insetInlineEnd: 12, zIndex: 3, display: "grid", gap: 4, maxWidth: "46%", padding: "8px 10px", borderRadius: 10, background: "color-mix(in srgb, var(--os-surface-2) 82%, transparent)", backdropFilter: "blur(6px)", boxShadow: "inset 0 0 0 1px var(--os-border)", fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)" }}>
                    <span style={{ fontWeight: 600, color: "var(--os-text)" }}>אשכולות ({legend.length})</span>
                    {legend.map((c) => (
                      <button key={c.key} type="button" onClick={() => selectAndFocus(c.hubId)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit", textAlign: "start" }}>
                        <span aria-hidden style={{ width: 9, height: 9, borderRadius: 999, background: c.color, boxShadow: `0 0 6px ${c.color}`, flex: "0 0 auto" }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.name} <span style={muted}>· {c.count}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {selectedNode && (
                  <aside className="tvg-inspector" data-testid="obsidian-graph-details" style={stack("var(--os-space-2)")}>
                    <div style={{ ...row, justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 700 }}>{selectedNode.basename}</div>
                      <OsButton variant="ghost" size="sm" onClick={() => setSelected(null)} aria-label="סגור">
                        ✕
                      </OsButton>
                    </div>
                    <div style={{ ...codeStyle, ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>{selectedNode.path}</div>
                    {selectedNode.tags.length > 0 && (
                      <div style={{ ...row, fontSize: "var(--os-text-2xs, 11px)" }}>
                        {selectedNode.tags.map((t) => (
                          <span key={t} style={{ ...codeStyle, padding: "1px 6px", borderRadius: 999, background: "var(--os-surface-1)", boxShadow: "inset 0 0 0 1px var(--os-border)" }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={metaRow}>
                      <span style={muted}>קשרים יוצאים</span>
                      <span>{selectedEdges.out.length}</span>
                    </div>
                    <div style={metaRow}>
                      <span style={muted}>קשרים נכנסים</span>
                      <span>{selectedEdges.in.length}</span>
                    </div>
                    <div style={row}>
                      <OsButton variant="primary" size="sm" onClick={() => onRead(selectedNode.path)} data-testid="obsidian-graph-read">
                        קרא מסמך
                      </OsButton>
                      <OsButton variant="cyan" size="sm" onClick={() => openInObsidian(vaultName, selectedNode.path)} data-testid="obsidian-graph-open">
                        פתח ב-Obsidian
                      </OsButton>
                    </div>
                  </aside>
                )}
              </div>

              {/* Accessible relationship list — keyboard-operable alternative to the canvas. */}
              <details data-testid="obsidian-graph-relationships">
                <summary style={{ cursor: "pointer", fontSize: "var(--os-text-sm, 13px)" }}>רשימת קשרים (נגישה)</summary>
                <ul style={{ margin: 0, paddingInlineStart: "1.2rem", display: "grid", gap: 4, maxHeight: "30vh", overflow: "auto" }}>
                  {graph.nodes.filter((nd) => visibleNodeIds.has(nd.id)).map((nd) => {
                    const outs = graph.edges.filter((e) => e.source === nd.id).map((e) => graph.nodes.find((x) => x.id === e.target)?.basename ?? e.target);
                    return (
                      <li key={nd.id}>
                        <button type="button" onClick={() => selectAndFocus(nd.id)} style={{ background: "none", border: "none", color: "var(--os-text)", cursor: "pointer", padding: 0, font: "inherit", textAlign: "start" }}>
                          <b>{nd.basename}</b> <span style={muted}>({nd.linkCount})</span>
                        </button>
                        {outs.length > 0 && <span style={{ ...muted, fontSize: "var(--os-text-2xs, 11px)" }}> → {outs.join(", ")}</span>}
                      </li>
                    );
                  })}
                </ul>
              </details>
            </>
          )}
        </>
      )}

      {note && (
        <Modal open onClose={() => setNote(null)} title={note.basename} footer={<OsButton variant="ghost" onClick={() => setNote(null)}>סגירה</OsButton>}>
          <div style={stack()}>
            <div style={{ ...codeStyle, ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>{note.path}</div>
            {note.truncated && <div role="status" style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-warning, #b8860b)" }}>התוכן קוצר לתצוגה.</div>}
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "50vh", overflow: "auto", background: "var(--os-bg-2, transparent)", border: "1px solid var(--os-border)", borderRadius: "var(--os-radius-sm, 6px)", padding: "var(--os-space-3)", fontSize: "var(--os-text-sm, 13px)" }}>{note.content}</pre>
          </div>
        </Modal>
      )}
    </div>
  );
}

const selectStyle: CSSProperties = {
  font: "inherit",
  fontSize: "var(--os-text-2xs, 11px)",
  background: "var(--os-surface-1)",
  color: "var(--os-text)",
  border: "1px solid var(--os-border)",
  borderRadius: "var(--os-radius-sm, 6px)",
  padding: "4px 8px",
};
