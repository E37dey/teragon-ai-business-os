// S18 Phase 8 — the "תהליכים עסקיים" (business workflow packs) entry surface inside the EXISTING
// WorkflowMode. Selecting a pack only CONFIGURES the workflow (prefills intent, sets the governed
// target) — it never auto-starts. Shows each pack's real dependency (live Obsidian) and human-
// control model honestly; no marketplace, no fake metrics.
import { useEffect, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { StatusChip } from "@/design-system";
import { WORKFLOW_PACKS } from "@/agents/workflow/workflowPacks";
import { getConnectionInfo } from "@/integration/obsidian/vaultBridgeClient";
import { getObsidianToken } from "@/integration/obsidian/obsidianCredential";

const muted: CSSProperties = { color: "var(--os-text-2)" };

export function WorkflowPackPicker({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }): ReactElement {
  // One live Obsidian check on mount (no polling) — a knowledge pack must not pretend to be usable.
  const [obsidianConnected, setObsidianConnected] = useState<boolean | null>(null);
  useEffect(() => {
    const token = getObsidianToken();
    if (!token) {
      setObsidianConnected(null);
      return;
    }
    let alive = true;
    getConnectionInfo(token)
      .then((r) => alive && setObsidianConnected(r.ok && !!r.data?.connected))
      .catch(() => alive && setObsidianConnected(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div data-testid="workflow-packs" role="group" aria-label="תהליכים עסקיים" style={{ display: "grid", gap: "var(--os-space-2)", padding: "var(--os-space-3)", borderRadius: "var(--os-radius-md, 12px)", background: "var(--os-surface-1)", boxShadow: "inset 0 0 0 1px var(--os-border)" }}>
      <b style={{ fontSize: "var(--os-text-sm, 13px)" }}>תהליכים עסקיים</b>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: "var(--os-space-2)" }}>
        {WORKFLOW_PACKS.map((pack) => {
          const unavailable = pack.knowledgeRequired && obsidianConnected === false;
          const selected = selectedId === pack.id;
          return (
            <button
              key={pack.id}
              type="button"
              data-testid="pack-card"
              data-pack={pack.id}
              data-selected={selected}
              aria-pressed={selected}
              onClick={() => onSelect(pack.id)}
              style={{
                display: "grid",
                gap: 4,
                textAlign: "start",
                padding: "var(--os-space-3)",
                borderRadius: "var(--os-radius-sm, 8px)",
                border: `1px solid ${selected ? "var(--os-highlight, var(--os-cyan-text))" : "var(--os-border)"}`,
                background: selected ? "var(--os-bg-2)" : "transparent",
                cursor: "pointer",
                font: "inherit",
                color: "var(--os-text)",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: "var(--os-text-sm, 13px)" }}>{pack.nameHe}</span>
                <StatusChip status={pack.governedActionSupported ? "פעיל" : "מושהה"} label={pack.governedActionSupported ? "פעולה מבוקרת" : "הפעלה מחדש"} />
              </div>
              <div style={{ ...muted, fontSize: "var(--os-text-2xs, 12px)" }}>{pack.descriptionHe}</div>
              <div style={{ ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>
                {pack.knowledgeRequired ? (unavailable ? "תלות: Obsidian אינו מחובר — נדרש חיבור מחדש" : "תלות: ידע Obsidian חי · בשליטת אנוש, ללא כתיבה אוטומטית") : "ללא תלות · בשליטת אנוש"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
