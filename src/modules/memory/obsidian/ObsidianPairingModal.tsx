// Shared Obsidian pairing modal — the ONE legitimate in-product pairing UI.
//
// Used both for the first connection (ObsidianVaultPanel) and for reconnecting
// after a stale-token expiry (KnowledgeGraphPanel). There is no second pairing
// system: the user pastes the fresh pairing token copied from the TERAGON Vault
// Bridge plugin, and the caller verifies it against the live /connection probe
// before treating the app as connected. The token is session-scoped only.
import { useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { Modal, OsButton } from "@/design-system";
import { OBSIDIAN_BRIDGE_URL } from "@/integration/obsidian/vaultBridgeClient";

const stack = (gap = "var(--os-space-3)"): CSSProperties => ({ display: "grid", gap });
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "var(--os-space-2)", alignItems: "center" };
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

/** Pairing modal — the normal in-product interaction (paste the token, no terminal). */
export function ObsidianPairingModal({
  open,
  busy,
  onClose,
  onSubmit,
  title = "חיבור ל-Obsidian",
  submitLabel = "התחבר",
  intro,
  error,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (token: string) => void;
  /** Modal title (defaults to first-connection copy). */
  title?: string;
  /** Primary button label (defaults to "התחבר"). */
  submitLabel?: string;
  /** Optional replacement intro line (e.g. "the connection expired after a restart"). */
  intro?: string;
  /** Optional inline error (e.g. invalid/expired token) shown above the input. */
  error?: string | null;
}): ReactElement {
  const [token, setToken] = useState("");
  const submit = (): void => {
    if (token.trim()) onSubmit(token.trim());
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div style={row}>
          <OsButton variant="ghost" onClick={onClose}>
            ביטול
          </OsButton>
          {token.trim() ? (
            <OsButton variant="primary" onClick={submit} data-testid="obsidian-pairing-submit">
              {busy ? "מתחבר…" : submitLabel}
            </OsButton>
          ) : (
            <OsButton variant="primary" disabled disabledReason="הדביקו את קוד ההתאמה מ-Obsidian" data-testid="obsidian-pairing-submit">
              {submitLabel}
            </OsButton>
          )}
        </div>
      }
    >
      <div style={stack()}>
        <p style={{ margin: 0, fontSize: "var(--os-text-sm, 13px)" }}>
          {intro ?? (
            <>
              ב-Obsidian, הפעילו את הפקודה <b>“Copy TERAGON pairing token (once)”</b> והדביקו את הקוד כאן. הקוד נשמר
              מקומית בלבד (session), לעולם לא נשלח לרשת ולא נשמר בקוד המקור.
            </>
          )}
        </p>
        {error && (
          <div role="alert" data-testid="obsidian-pairing-error" style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-danger, #c0392b)" }}>
            {error}
          </div>
        )}
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
