// S14.x — LIVE Obsidian Knowledge Graph inside /memory. Visualizes the currently-open
// Vault's note/link metadata via the bounded read-only GET /graph bridge endpoint.
// NOT synchronization; grants NO write authority. Force-directed SVG (no new dependency),
// deterministic layout, zoom/pan, select/hover, details, search, filters, refresh, and an
// accessible relationship list. Read/open reuse the existing Phase-1 capabilities.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { EmptyState, Modal, OsButton, Panel, SearchInput, SectionTitle, StatusChip, useToast } from "@/design-system";
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

const stack = (gap = "var(--os-space-3)"): CSSProperties => ({ display: "grid", gap });
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "var(--os-space-2)", alignItems: "center" };
const muted: CSSProperties = { color: "var(--os-text-2)" };
const codeStyle: CSSProperties = { fontFamily: "var(--os-font-mono, monospace)", direction: "ltr", unicodeBidi: "isolate" };
const metaRow: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "var(--os-space-2)", fontSize: "var(--os-text-2xs, 11px)" };

const VIEW_W = 900;
const VIEW_H = 460;

interface Pt {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Deterministic force-directed layout (circle init → repulsion + springs + centering). */
function computeLayout(nodes: GraphNode[], edges: GraphEdge[]): Map<string, { x: number; y: number }> {
  const n = nodes.length;
  const pos = new Map<string, Pt>();
  nodes.forEach((node, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    pos.set(node.id, { x: VIEW_W / 2 + Math.cos(a) * VIEW_W * 0.32, y: VIEW_H / 2 + Math.sin(a) * VIEW_H * 0.32, vx: 0, vy: 0 });
  });
  if (n === 0) return new Map();
  const iterations = n > 120 ? 200 : 320;
  const REP = 5200;
  const SPRING = 0.02;
  const SPRING_LEN = 90;
  const CENTER = 0.012;
  const DAMP = 0.85;
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      const a = pos.get(nodes[i]!.id)!;
      let fx = 0;
      let fy = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const b = pos.get(nodes[j]!.id)!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy || 0.01;
        const d = Math.sqrt(d2);
        const rep = REP / d2;
        fx += (dx / d) * rep;
        fy += (dy / d) * rep;
      }
      fx += (VIEW_W / 2 - a.x) * CENTER;
      fy += (VIEW_H / 2 - a.y) * CENTER;
      a.vx = (a.vx + fx) * DAMP;
      a.vy = (a.vy + fy) * DAMP;
    }
    for (const e of edges) {
      const a = pos.get(e.source);
      const b = pos.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d - SPRING_LEN) * SPRING;
      const fxu = (dx / d) * f;
      const fyu = (dy / d) * f;
      a.vx += fxu;
      a.vy += fyu;
      b.vx -= fxu;
      b.vy -= fyu;
    }
    for (const node of nodes) {
      const p = pos.get(node.id)!;
      p.x += p.vx;
      p.y += p.vy;
    }
  }
  const out = new Map<string, { x: number; y: number }>();
  for (const [id, p] of pos) out.set(id, { x: p.x, y: p.y });
  return out;
}

function nodeRadius(linkCount: number): number {
  return Math.min(18, 5 + Math.sqrt(linkCount) * 3);
}
function folderOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "(שורש)";
}

type Phase = "idle" | "loading" | "loaded" | "disconnected" | "error";

export function KnowledgeGraphPanel(): ReactElement {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [graph, setGraph] = useState<VaultGraph | null>(null);
  const [vaultName, setVaultName] = useState<string>("");
  const [errorCode, setErrorCode] = useState<BridgeErrorCode | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [folderFilter, setFolderFilter] = useState<string>("");
  const [connectedOnly, setConnectedOnly] = useState(false);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [note, setNote] = useState<{ basename: string; path: string; content: string; truncated: boolean } | null>(null);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

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
    setView({ scale: 1, tx: 0, ty: 0 });
    setPhase("loaded");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    await load();
    toast("הגרף עודכן", "success");
  }, [load, toast]);

  const layout = useMemo(() => (graph ? computeLayout(graph.nodes, graph.edges) : new Map<string, { x: number; y: number }>()), [graph]);

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

  const searchMatches = useMemo(() => {
    if (!graph || !query.trim()) return [];
    const q = query.trim().toLowerCase();
    return graph.nodes.filter((nd) => nd.basename.toLowerCase().includes(q) || nd.path.toLowerCase().includes(q)).slice(0, 20);
  }, [graph, query]);

  const selectAndFocus = useCallback(
    (id: string) => {
      setSelected(id);
      const p = layout.get(id);
      if (p) setView((v) => ({ scale: Math.max(1.1, v.scale), tx: VIEW_W / 2 - p.x * Math.max(1.1, v.scale), ty: VIEW_H / 2 - p.y * Math.max(1.1, v.scale) }));
    },
    [layout],
  );

  const selectedNode = graph?.nodes.find((n) => n.id === selected) ?? null;
  const selectedEdges = useMemo(() => {
    if (!graph || !selected) return { out: [] as GraphEdge[], in: [] as GraphEdge[] };
    return {
      out: graph.edges.filter((e) => e.source === selected),
      in: graph.edges.filter((e) => e.target === selected),
    };
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

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setView((v) => {
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const scale = Math.min(4, Math.max(0.4, v.scale * factor));
      return { ...v, scale };
    });
  }, []);
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    },
    [view.tx, view.ty],
  );
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    setView((v) => ({ ...v, tx: d.tx + (e.clientX - d.x), ty: d.ty + (e.clientY - d.y) }));
  }, []);
  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <Panel data-testid="obsidian-graph-panel" style={stack()}>
      <SectionTitle
        title="מפת ידע"
        subtitle="Obsidian · מפת קישורים חיה"
        action={
          phase === "loaded" ? (
            <StatusChip status="פעיל" label={`${graph?.count ?? 0} מסמכים`} />
          ) : phase === "error" || phase === "disconnected" ? (
            <StatusChip status="מושבת" label="לא זמין" />
          ) : (
            <StatusChip status="ממתין" label="טוען…" />
          )
        }
      />

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
        <div style={stack()}>
          <div style={{ fontSize: "var(--os-text-2xs, 11px)", ...muted }} data-testid="obsidian-graph-source">
            מקור: <b>Obsidian</b> · {vaultName} · מפת קישורים חיה{graph.truncated ? " (מוצג תת-קבוצה — הגרף גדול מהמכסה)" : ""}
          </div>

          {graph.nodes.length === 0 ? (
            <EmptyState title="הכספת ריקה" reason="לא נמצאו מסמכי Markdown בכספת המחוברת." />
          ) : (
            <>
              <div style={row}>
                <SearchInput value={query} onChange={setQuery} placeholder="חפש במפת הידע…" ariaLabel="חיפוש במפת הידע" />
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
                <label style={{ ...row, fontSize: "var(--os-text-2xs, 11px)" }}>
                  <input type="checkbox" checked={connectedOnly} onChange={(e) => setConnectedOnly(e.target.checked)} aria-label="מחוברים בלבד" /> מחוברים בלבד
                </label>
                <OsButton variant="ghost" size="sm" onClick={resetFilters} data-testid="obsidian-graph-reset">
                  אפס סינון
                </OsButton>
                <OsButton variant="ghost" size="sm" onClick={refresh} data-testid="obsidian-graph-refresh">
                  רענן גרף
                </OsButton>
              </div>

              {searchMatches.length > 0 && (
                <div style={{ ...row, fontSize: "var(--os-text-2xs, 11px)" }} data-testid="obsidian-graph-search-results">
                  <span style={muted}>תוצאות:</span>
                  {searchMatches.map((m) => (
                    <OsButton key={m.id} variant="ghost" size="sm" onClick={() => selectAndFocus(m.id)}>
                      {m.basename}
                    </OsButton>
                  ))}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: "var(--os-space-3)" }}>
                <svg
                  data-testid="obsidian-graph-svg"
                  role="img"
                  aria-label={`מפת ידע: ${graph.count} מסמכים, ${graph.edgeCount} קשרים`}
                  viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                  style={{ width: "100%", height: "min(52vh, 460px)", background: "var(--os-bg-2, transparent)", border: "1px solid var(--os-border)", borderRadius: "var(--os-radius-sm, 6px)", touchAction: "none", cursor: dragRef.current ? "grabbing" : "grab" }}
                  onWheel={onWheel}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={endDrag}
                  onPointerLeave={endDrag}
                >
                  <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
                    {graph.edges.map((e, i) => {
                      const a = layout.get(e.source);
                      const b = layout.get(e.target);
                      if (!a || !b) return null;
                      const dim = !visibleNodeIds.has(e.source) || !visibleNodeIds.has(e.target);
                      const hot = selected != null && (e.source === selected || e.target === selected);
                      return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={hot ? "var(--os-accent-cyan, #3aa)" : "var(--os-border)"} strokeOpacity={dim ? 0.15 : hot ? 0.9 : 0.4} strokeWidth={hot ? 1.6 : 1} />;
                    })}
                    {graph.nodes.map((nd) => {
                      const p = layout.get(nd.id);
                      if (!p) return null;
                      const isSel = nd.id === selected;
                      const dim = !visibleNodeIds.has(nd.id);
                      const orphan = nd.linkCount === 0;
                      const hub = nd.linkCount >= 4;
                      const fill = isSel ? "var(--os-accent-cyan, #2aa)" : orphan ? "var(--os-muted, #888)" : hub ? "var(--os-accent-violet, #86f)" : "var(--os-accent-blue, #47c)";
                      return (
                        <g key={nd.id} transform={`translate(${p.x} ${p.y})`} style={{ cursor: "pointer", opacity: dim ? 0.2 : 1 }} onClick={() => setSelected(nd.id)}>
                          <title>{`${nd.basename}\n${nd.path}\nקשרים: ${nd.linkCount}`}</title>
                          <circle r={nodeRadius(nd.linkCount)} fill={fill} stroke={isSel ? "var(--os-text)" : "transparent"} strokeWidth={isSel ? 2 : 0} />
                          {(isSel || hub) && <text y={-nodeRadius(nd.linkCount) - 4} textAnchor="middle" fontSize="10" fill="var(--os-text)" style={{ pointerEvents: "none" }}>{nd.basename}</text>}
                        </g>
                      );
                    })}
                  </g>
                </svg>

                {selectedNode && (
                  <div data-testid="obsidian-graph-details" style={{ ...stack("var(--os-space-2)"), border: "1px solid var(--os-border)", borderRadius: "var(--os-radius-sm, 6px)", padding: "var(--os-space-3)" }}>
                    <div style={{ fontWeight: 600 }}>{selectedNode.basename}</div>
                    <div style={{ ...codeStyle, ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>{selectedNode.path}</div>
                    {selectedNode.tags.length > 0 && <div style={{ ...row, fontSize: "var(--os-text-2xs, 11px)" }}>{selectedNode.tags.map((t) => <span key={t} style={codeStyle}>{t}</span>)}</div>}
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
                  </div>
                )}
              </div>

              {/* Accessible relationship list — keyboard-operable alternative to the SVG. */}
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
        </div>
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
    </Panel>
  );
}

const selectStyle: CSSProperties = {
  font: "inherit",
  fontSize: "var(--os-text-2xs, 11px)",
  background: "var(--os-bg-2, transparent)",
  color: "var(--os-text)",
  border: "1px solid var(--os-border)",
  borderRadius: "var(--os-radius-sm, 6px)",
  padding: "4px 8px",
};
