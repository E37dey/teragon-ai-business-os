// S14.6 Phase 4 — the VISUAL Agent→Note relationship for split mode. Renders a directional
// connector [agent] ──read──▶ [note] for every REAL recorded retrieval (successful read
// traces only), with honest source metadata. Live via the trace subscription; empty when no
// agent has actually read a note. Never fabricated. This is the visual equivalent of the
// inspector's accessible relationship text — both come from the same real trace store.
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { getAgentDefinition } from "@/agents/definitions";
import { subscribeRetrievals } from "@/agents/obsidian/retrievalTrace";
import { deriveAgentNoteUsages, type AgentNoteUsage } from "./crossView";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import "./visual.css";

const chip = (accent: string): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px",
  borderRadius: 999,
  background: "var(--os-surface-2)",
  boxShadow: `inset 0 0 0 1px ${accent}`,
  fontSize: "var(--os-text-2xs, 12px)",
  fontWeight: 600,
  whiteSpace: "nowrap",
});
const muted: CSSProperties = { color: "var(--os-text-2)" };
const codeStyle: CSSProperties = { fontFamily: "var(--os-font-mono, monospace)", direction: "ltr", unicodeBidi: "isolate" };

/** dedupe by agent+note, keep the most recent read. */
function latestByPair(usages: AgentNoteUsage[]): AgentNoteUsage[] {
  const m = new Map<string, AgentNoteUsage>();
  for (const u of usages) {
    const k = `${u.agentId}::${u.path}`;
    const prev = m.get(k);
    if (!prev || (u.at ?? 0) >= (prev.at ?? 0)) m.set(k, u);
  }
  return [...m.values()].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

export function CrossViewRelations({ selectedAgentId, selectedNotePath }: { selectedAgentId?: string | null; selectedNotePath?: string | null }): ReactElement {
  const reduced = usePrefersReducedMotion();
  const [usages, setUsages] = useState<AgentNoteUsage[]>(() => deriveAgentNoteUsages());
  useEffect(() => {
    setUsages(deriveAgentNoteUsages());
    return subscribeRetrievals(() => setUsages(deriveAgentNoteUsages()));
  }, []);

  const relations = useMemo(() => {
    let rows = latestByPair(usages);
    if (selectedAgentId) rows = rows.filter((u) => u.agentId === selectedAgentId);
    if (selectedNotePath) rows = rows.filter((u) => u.path === selectedNotePath);
    return rows;
  }, [usages, selectedAgentId, selectedNotePath]);

  return (
    <section data-testid="cross-view-relations" aria-label="קשרי סוכן↔מסמך חיים" style={{ display: "grid", gap: 8, padding: "10px 12px", borderRadius: "var(--os-radius-md, 12px)", background: "var(--os-surface-1)", boxShadow: "inset 0 0 0 1px var(--os-border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <b style={{ fontSize: "var(--os-text-sm, 13px)" }}>קשרי סוכן ↔ מסמך Obsidian (חי)</b>
        <span style={{ ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>קשרים אמיתיים בלבד · נגזר משליפות מתועדות</span>
      </div>
      {relations.length === 0 ? (
        <div data-testid="cross-view-empty" style={{ ...muted, fontSize: "var(--os-text-2xs, 12px)" }}>
          אין שימוש מתועד — סוכן מורשה שיקרא מסמך Obsidian בפועל יופיע כאן כקשר חי.
        </div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
          {relations.map((u) => {
            const def = getAgentDefinition(u.agentId);
            return (
              <li key={u.correlationId ?? `${u.agentId}-${u.path}`} data-testid="cross-view-relation" data-agent={u.agentId} data-note={u.path} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={chip("var(--os-accent-cyan, #35c0c9)")}>🧭 {def?.nameHe ?? u.agentId}</span>
                {/* directional connector — animated signal on the live relationship (reduced-motion aware) */}
                <span aria-hidden style={{ position: "relative", flex: "0 0 44px", height: 2, background: "var(--os-border)", borderRadius: 2 }}>
                  <svg viewBox="0 0 44 8" width="44" height="8" style={{ position: "absolute", top: -3, insetInlineStart: 0, overflow: "visible" }}>
                    <line x1="0" y1="4" x2="40" y2="4" stroke="var(--os-accent-cyan, #35c0c9)" strokeWidth="2" strokeOpacity="0.9" className={reduced ? undefined : "tvg-signal"} />
                    <path d="M40 1 L44 4 L40 7 Z" fill="var(--os-accent-cyan, #35c0c9)" />
                  </svg>
                </span>
                <span style={chip("var(--os-accent-violet, #8b7bff)")}>📄 {u.basename}</span>
                <span style={{ ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>
                  קרא · מקור: <b>Obsidian</b> · {u.vaultName} · <span style={codeStyle}>{u.path}</span>
                </span>
                {/* accessible sentence (screen-reader + keyboard) */}
                <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                  {def?.nameHe ?? u.agentId} קרא את {u.basename} מ-Obsidian ({u.vaultName})
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
