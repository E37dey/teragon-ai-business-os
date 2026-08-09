// S14.2 Phase 1 — compact READ-ONLY Obsidian Vault connection section for /memory.
// One panel; no new dashboard. Read-only: connect, check, search, read, open, disconnect.
// All copy Hebrew/RTL; every control does real work (zero NO_OP); fail-closed states.
import { useCallback, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { EmptyState, Modal, OsButton, Panel, SearchInput, SectionTitle, StatusChip, useToast } from "@/design-system";
import { obsidianErrorMessage, useObsidianVault } from "@/integration/obsidian/useObsidianVault";
import { OBSIDIAN_BRIDGE_URL, type BridgeCode, type NoteContent, type SearchHit } from "@/integration/obsidian/vaultBridgeClient";

const stack = (gap = "var(--os-space-3)"): CSSProperties => ({ display: "grid", gap });
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "var(--os-space-2)", alignItems: "center" };
const metaRow: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "var(--os-space-2)", fontSize: "var(--os-text-2xs, 11px)" };
const muted: CSSProperties = { color: "var(--os-text-2)" };
const codeStyle: CSSProperties = { fontFamily: "var(--os-font-mono, monospace)", direction: "ltr", unicodeBidi: "isolate" };

const inputStyle: CSSProperties = {
  font: "inherit",
  fontSize: "var(--os-text-sm, 13px)",
  background: "var(--os-bg-2, transparent)",
  color: "var(--os-text)",
  border: "1px solid var(--os-border)",
  borderRadius: "var(--os-radius-sm, 6px)",
  paddingBlock: 8,
  paddingInline: 10,
  width: "100%",
};

function fmtTime(mtime: number | null): string {
  if (!mtime) return "—";
  try {
    return new Date(mtime).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return new Date(mtime).toISOString();
  }
}

function errCopy(code: BridgeCode): string {
  return obsidianErrorMessage(code === "OK" ? "ERROR" : code);
}

/** Action button that disables (with an honest reason) while a request is in flight. */
function ActionButton({
  busy,
  variant,
  onClick,
  testId,
  children,
}: {
  busy: boolean;
  variant: "primary" | "ghost" | "cyan" | "danger";
  onClick: () => void;
  testId: string;
  children: string;
}): ReactElement {
  if (busy) {
    return (
      <OsButton variant={variant} disabled disabledReason="בקשה בתהליך" data-testid={testId}>
        {children}
      </OsButton>
    );
  }
  return (
    <OsButton variant={variant} onClick={onClick} data-testid={testId}>
      {children}
    </OsButton>
  );
}

/** Pairing modal — the normal in-product interaction (paste the token, no terminal). */
function PairingModal({
  open,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (token: string) => void;
}): ReactElement {
  const [token, setToken] = useState("");
  const submit = (): void => {
    if (token.trim()) onSubmit(token.trim());
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="חיבור ל-Obsidian"
      footer={
        <div style={row}>
          <OsButton variant="ghost" onClick={onClose}>
            ביטול
          </OsButton>
          {token.trim() ? (
            <OsButton variant="primary" onClick={submit}>
              {busy ? "מתחבר…" : "התחבר"}
            </OsButton>
          ) : (
            <OsButton variant="primary" disabled disabledReason="הדביקו את קוד ההתאמה מ-Obsidian">
              התחבר
            </OsButton>
          )}
        </div>
      }
    >
      <div style={stack()}>
        <p style={{ margin: 0, fontSize: "var(--os-text-sm, 13px)" }}>
          ב-Obsidian, הפעילו את הפקודה <b>“Copy TERAGON pairing token (once)”</b> והדביקו את הקוד כאן. הקוד נשמר
          מקומית בלבד (session), לעולם לא נשלח לרשת ולא נשמר בקוד המקור.
        </p>
        <label style={stack("var(--os-space-1)")}>
          <span style={{ fontSize: "var(--os-text-2xs, 11px)", ...muted }}>קוד התאמה</span>
          <input
            data-testid="obsidian-token-input"
            type="password"
            autoComplete="off"
            style={inputStyle}
            value={token}
            aria-label="קוד התאמה של Obsidian"
            placeholder="הדביקו כאן…"
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </label>
        <div style={{ fontSize: "var(--os-text-2xs, 11px)", ...muted }}>
          חיבור מקומי בלבד אל <span style={codeStyle}>{OBSIDIAN_BRIDGE_URL}</span> · קריאה בלבד.
        </div>
      </div>
    </Modal>
  );
}

/** Note viewer — bounded read-only Markdown content of one note. */
function NoteViewer({ note, onClose, onOpen }: { note: NoteContent; onClose: () => void; onOpen: () => void }): ReactElement {
  return (
    <Modal
      open
      onClose={onClose}
      title={note.basename}
      footer={
        <div style={row}>
          <OsButton variant="ghost" onClick={onClose}>
            סגירה
          </OsButton>
          <OsButton variant="cyan" onClick={onOpen}>
            פתח ב-Obsidian
          </OsButton>
        </div>
      }
    >
      <div style={stack()} data-testid="obsidian-note-viewer">
        <div style={{ ...metaRow, ...muted }}>
          <span style={codeStyle}>{note.path}</span>
          <span>{fmtTime(note.mtime)}</span>
        </div>
        {note.truncated && (
          <div role="status" style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-warning, #b8860b)" }}>
            התוכן קוצר לתצוגה (מוגבל בגודל).
          </div>
        )}
        <pre
          data-testid="obsidian-note-content"
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: "50vh",
            overflow: "auto",
            background: "var(--os-bg-2, transparent)",
            border: "1px solid var(--os-border)",
            borderRadius: "var(--os-radius-sm, 6px)",
            padding: "var(--os-space-3)",
            fontSize: "var(--os-text-sm, 13px)",
          }}
        >
          {note.content}
        </pre>
      </div>
    </Modal>
  );
}

/** Search modal — bounded local search + open a result as a read-only note. */
function SearchModal({
  open,
  onClose,
  onSearch,
  onRead,
  onOpenNote,
}: {
  open: boolean;
  onClose: () => void;
  onSearch: (q: string) => Promise<{ hits: SearchHit[]; error: string | null }>;
  onRead: (path: string) => Promise<NoteContent | null>;
  onOpenNote: (path: string) => void;
}): ReactElement {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<NoteContent | null>(null);

  const run = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      setPhase("loading");
      setError(null);
      const { hits: h, error: e } = await onSearch(q);
      setHits(h);
      setError(e);
      setPhase("done");
    },
    [onSearch],
  );

  return (
    <Modal open={open} onClose={onClose} title="חיפוש בכספת Obsidian">
      <div style={stack()}>
        <SearchInput value={query} onChange={setQuery} onSubmit={run} placeholder="חיפוש בכותרת, נתיב ותוכן…" ariaLabel="חיפוש בכספת Obsidian" />
        <div data-testid="obsidian-search-results" style={stack("var(--os-space-2)")}>
          {phase === "loading" && (
            <div role="status" style={muted}>
              מחפש…
            </div>
          )}
          {phase === "done" && error && <EmptyState title="החיפוש נכשל" reason={error} />}
          {phase === "done" && !error && hits.length === 0 && <EmptyState title="אין תוצאות" reason={`לא נמצאו פריטים עבור “${query}”.`} />}
          {phase === "done" &&
            !error &&
            hits.map((h) => (
              <button
                key={h.path}
                type="button"
                className="os-panel"
                onClick={() => {
                  void onRead(h.path).then((n) => n && setNote(n));
                }}
                style={{
                  textAlign: "start",
                  cursor: "pointer",
                  display: "grid",
                  gap: 4,
                  padding: "var(--os-space-3)",
                  border: "1px solid var(--os-border)",
                  borderRadius: "var(--os-radius-sm, 6px)",
                  background: "var(--os-bg-2, transparent)",
                }}
              >
                <div style={{ ...metaRow }}>
                  <span style={{ fontWeight: 600 }}>{h.basename}</span>
                  <span style={muted}>{fmtTime(h.mtime)}</span>
                </div>
                <div style={{ ...codeStyle, ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>{h.path}</div>
                {h.snippet && <div style={{ fontSize: "var(--os-text-2xs, 11px)", ...muted }}>{h.snippet}</div>}
              </button>
            ))}
        </div>
      </div>
      {note && <NoteViewer note={note} onClose={() => setNote(null)} onOpen={() => onOpenNote(note.path)} />}
    </Modal>
  );
}

/** ObsidianVaultPanel — the compact /memory section. */
export function ObsidianVaultPanel(): ReactElement {
  const vault = useObsidianVault();
  const { toast } = useToast();
  const [pairingOpen, setPairingOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const connected = vault.phase === "connected" && vault.info !== null;

  const handleConnect = useCallback(
    async (token: string) => {
      const r = await vault.connect(token);
      if (r.ok) {
        setPairingOpen(false);
        toast("מחובר ל-Obsidian", "success");
      } else {
        toast(errCopy(r.code), "danger");
      }
    },
    [vault, toast],
  );

  const handleCheck = useCallback(async () => {
    const { reachable, paired } = await vault.check();
    if (paired) toast("החיבור פעיל", "success");
    else if (reachable) toast("הגשר זמין — התחברו כדי לגשת לכספת", "info");
    else toast(obsidianErrorMessage("UNAVAILABLE"), "danger");
  }, [vault, toast]);

  const handleRefresh = useCallback(async () => {
    const r = await vault.refresh();
    toast(r.ok ? "המצב עודכן" : errCopy(r.code), r.ok ? "success" : "danger");
  }, [vault, toast]);

  const handleDisconnect = useCallback(() => {
    vault.disconnect();
    toast("נותקתם מ-Obsidian", "info");
  }, [vault, toast]);

  const onSearch = useCallback(
    async (q: string): Promise<{ hits: SearchHit[]; error: string | null }> => {
      const r = await vault.search(q);
      if (r.ok && r.data) return { hits: r.data.results, error: null };
      return { hits: [], error: errCopy(r.code) };
    },
    [vault],
  );

  const onRead = useCallback(
    async (path: string): Promise<NoteContent | null> => {
      const r = await vault.read(path);
      if (r.ok && r.data) return r.data;
      toast(errCopy(r.code), "danger");
      return null;
    },
    [vault, toast],
  );

  return (
    <Panel data-testid="obsidian-panel" style={stack()}>
      <SectionTitle
        title="Obsidian"
        subtitle="כספת מקומית · קריאה בלבד"
        action={
          connected ? (
            <StatusChip status="פעיל" label="מחובר" />
          ) : vault.phase === "error" ? (
            <StatusChip status="חסום" label="שגיאת חיבור" />
          ) : (
            <StatusChip status="מושבת" label="לא מחובר" />
          )
        }
      />

      {connected && vault.info ? (
        <div style={stack()} data-testid="obsidian-connected">
          <div style={{ fontSize: "var(--os-text-sm, 13px)" }}>מחובר ל-Obsidian</div>
          <div style={metaRow}>
            <span style={muted}>Vault</span>
            <span data-testid="obsidian-vault-name" style={{ fontWeight: 600 }}>
              {vault.info.vaultName}
            </span>
          </div>
          <div style={metaRow}>
            <span style={muted}>מצב</span>
            <span>חיבור מקומי · קריאה בלבד</span>
          </div>
          <div style={metaRow}>
            <span style={muted}>גשר</span>
            <span style={codeStyle}>{OBSIDIAN_BRIDGE_URL}</span>
          </div>
          <div style={metaRow}>
            <span style={muted}>גרסת גשר</span>
            <span style={codeStyle}>{vault.info.version}</span>
          </div>
          <div style={metaRow}>
            <span style={muted}>קריאה בלבד</span>
            <span data-testid="obsidian-readonly">{vault.info.readonly ? "כן" : "לא"}</span>
          </div>
          <div style={metaRow}>
            <span style={muted}>בדיקת חיבור אחרונה</span>
            <span>{fmtTime(vault.lastCheckAt)}</span>
          </div>
          <div style={row}>
            <OsButton variant="primary" onClick={() => setSearchOpen(true)} data-testid="obsidian-search-btn">
              חפש ב-Vault
            </OsButton>
            <ActionButton busy={vault.busy} variant="ghost" onClick={handleRefresh} testId="obsidian-refresh-btn">
              רענן
            </ActionButton>
            <OsButton variant="cyan" onClick={vault.openVault} data-testid="obsidian-open-btn">
              פתח ב-Obsidian
            </OsButton>
            <OsButton variant="danger" onClick={handleDisconnect} data-testid="obsidian-disconnect-btn">
              נתק
            </OsButton>
          </div>
        </div>
      ) : (
        <div style={stack()} data-testid="obsidian-disconnected">
          <div style={{ fontSize: "var(--os-text-sm, 13px)" }}>לא מחובר</div>
          {vault.phase === "error" && vault.errorCode && (
            <div role="alert" data-testid="obsidian-error" style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-danger, #c0392b)" }}>
              {obsidianErrorMessage(vault.errorCode)}
            </div>
          )}
          <div style={{ fontSize: "var(--os-text-2xs, 11px)", ...muted }}>
            חיבור מקומי בלבד אל <span style={codeStyle}>{OBSIDIAN_BRIDGE_URL}</span> · קריאה בלבד. מקור ידע חיצוני —
            אינו מיובא אוטומטית לזיכרון.
          </div>
          <div style={row}>
            <OsButton variant="primary" onClick={() => setPairingOpen(true)} data-testid="obsidian-connect-btn">
              חבר Obsidian
            </OsButton>
            <ActionButton busy={vault.busy} variant="ghost" onClick={handleCheck} testId="obsidian-check-btn">
              בדוק חיבור
            </ActionButton>
          </div>
        </div>
      )}

      <PairingModal open={pairingOpen} busy={vault.busy} onClose={() => setPairingOpen(false)} onSubmit={handleConnect} />
      {connected && (
        <SearchModal
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          onSearch={onSearch}
          onRead={onRead}
          onOpenNote={vault.openNote}
        />
      )}
    </Panel>
  );
}
