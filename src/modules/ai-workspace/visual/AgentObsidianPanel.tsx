// S14.6 Phase 4 — the agent's bounded, user-triggered Obsidian read surface, shown inside
// the Agent inspector. Allowed agents get a search → read flow with honest source
// attribution; every note body is labeled UNTRUSTED. Denied agents get an explicit
// capability-denied notice and no control. Real retrievals feed the Agent→Note trace.
import { useCallback, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { OsButton, SearchInput } from "@/design-system";
import { canAgentReadObsidian, agentReadVaultNote, agentSearchVault, type AgentObsidianCode, type AgentVaultNote, type AgentVaultSearchHit } from "@/agents/obsidian/agentObsidianAccess";

const stack = (gap = "var(--os-space-2)"): CSSProperties => ({ display: "grid", gap });
const muted: CSSProperties = { color: "var(--os-text-2)" };
const code2xs: CSSProperties = { fontFamily: "var(--os-font-mono, monospace)", direction: "ltr", unicodeBidi: "isolate", fontSize: "var(--os-text-2xs, 11px)" };

const MSG: Record<AgentObsidianCode, string> = {
  ok: "",
  empty: "לא נמצאו תוצאות במסמכי Obsidian.",
  denied: "אין הרשאת קריאה ל-Obsidian לסוכן זה (הרשאה נדחתה).",
  unavailable: "Obsidian אינו זמין — ודאו שהאפליקציה והתוסף פועלים.",
  unauthorized: "נדרש חיבור מחדש ל-Obsidian.",
  not_found: "המסמך לא נמצא.",
  timeout: "הבקשה חרגה מהזמן — נסו שוב.",
  error: "שגיאה בקריאה מ-Obsidian.",
};

export function AgentObsidianPanel({ agentId, onRetrieval }: { agentId: string; onRetrieval?: () => void }): ReactElement {
  const allowed = canAgentReadObsidian(agentId);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AgentObsidianCode | null>(null);
  const [hits, setHits] = useState<readonly AgentVaultSearchHit[]>([]);
  const [note, setNote] = useState<AgentVaultNote | null>(null);

  const runSearch = useCallback(async () => {
    setBusy(true);
    setNote(null);
    const r = await agentSearchVault(agentId, { query });
    setStatus(r.code);
    setHits(r.hits);
    setBusy(false);
    onRetrieval?.();
  }, [agentId, query, onRetrieval]);

  const runRead = useCallback(
    async (path: string) => {
      setBusy(true);
      const r = await agentReadVaultNote(agentId, { path });
      setNote(r);
      setStatus(r.code);
      setBusy(false);
      onRetrieval?.();
    },
    [agentId, onRetrieval],
  );

  if (!allowed) {
    return (
      <div data-testid="agent-obsidian-denied" style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-danger, #c0392b)" }}>
        {MSG.denied}
      </div>
    );
  }

  return (
    <div data-testid="agent-obsidian-panel" style={stack()}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <SearchInput value={query} onChange={setQuery} placeholder="חפש ב-Obsidian…" ariaLabel="חיפוש חי במסמכי Obsidian" />
        </div>
        {busy ? (
          <OsButton variant="primary" size="sm" disabled disabledReason="מתבצעת קריאה" data-testid="agent-obsidian-search">
            קורא…
          </OsButton>
        ) : (
          <OsButton variant="primary" size="sm" onClick={runSearch} data-testid="agent-obsidian-search">
            חפש ב-Obsidian
          </OsButton>
        )}
      </div>

      {status && status !== "ok" && (
        <div role="status" data-testid="agent-obsidian-status" style={{ fontSize: "var(--os-text-2xs, 11px)", ...muted }}>
          {MSG[status]}
        </div>
      )}

      {hits.length > 0 && !note && (
        <ul data-testid="agent-obsidian-results" style={{ margin: 0, paddingInlineStart: "1rem", ...stack(), maxHeight: "24vh", overflow: "auto" }}>
          {hits.map((h) => (
            <li key={h.path} style={stack("2px")}>
              <div style={{ display: "flex", gap: 6, justifyContent: "space-between", alignItems: "baseline" }}>
                <b style={{ fontSize: "var(--os-text-2xs, 12px)" }}>{h.basename}</b>
                <OsButton variant="ghost" size="sm" onClick={() => runRead(h.path)} data-testid="agent-obsidian-read">
                  קרא
                </OsButton>
              </div>
              <div style={{ ...code2xs, ...muted }}>{h.path}</div>
              {h.snippet && <div style={{ fontSize: "var(--os-text-2xs, 11px)", ...muted }}>{h.snippet}</div>}
            </li>
          ))}
        </ul>
      )}

      {note && note.code === "ok" && note.source && (
        <div style={stack("4px")}>
          <div data-testid="agent-obsidian-source" style={{ fontSize: "var(--os-text-2xs, 11px)", ...muted }}>
            מקור: <b>Obsidian</b> · {note.source.vaultName} · <span style={code2xs}>{note.source.path}</span>
          </div>
          <div style={{ fontSize: "var(--os-text-2xs, 10px)", color: "var(--os-warning, #b8860b)" }}>תוכן חי מ-Obsidian — נתון לא מהימן, לא ידע ארגוני מאושר.</div>
          <pre data-testid="agent-obsidian-content" style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "26vh", overflow: "auto", background: "var(--os-surface-2)", border: "1px solid var(--os-border)", borderRadius: 6, padding: 8, fontSize: "var(--os-text-2xs, 11px)" }}>
            {note.content}
          </pre>
          <div style={{ ...muted, fontSize: "var(--os-text-2xs, 10px)" }}>
            כדי להפוך את המסמך לידע ארגוני מאושר — השתמשו ב״ייבא לידע״ (ייבוא מבוקר, אישור אנושי). קריאה חיה אינה יוצרת רשומת זיכרון.
          </div>
        </div>
      )}
    </div>
  );
}
