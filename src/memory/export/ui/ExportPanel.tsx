// TERAGON AI BUSINESS OS — governed export panel (Wave 6, W6-B). Mounted by
// the /memory rail (wiring: docs/integration-requests-w6b.md). Real browser
// download via the injectable downloader seam; every export leaves a job +
// audit record with checksum and honest included/excluded reasons.
import { useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { OsButton, Panel, SectionTitle, StatusChip, useToast } from "@/design-system";
import { getMemoryEngine } from "@/memory/core/engine";
import {
  browserDownloader,
  runExport,
  type Downloader,
  type ExportManifest,
} from "../exporter";
import { obsidianStatus } from "../status";

const stack = (gap = "var(--os-space-3)"): CSSProperties => ({ display: "grid", gap });
const tiny: CSSProperties = { fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" };

export interface ExportPanelProps {
  /** injectable download seam (tests); defaults to a real browser download */
  downloader?: Downloader;
  /** invoked after an export job was recorded */
  onExported?: () => void;
}

export function ExportPanel({ downloader, onExported }: ExportPanelProps): ReactElement {
  const { toast } = useToast();
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manifest, setManifest] = useState<ExportManifest | null>(null);
  const [line1, line2] = obsidianStatus();

  const doExport = async (): Promise<void> => {
    setBusy(true);
    try {
      const { stores, agentStores, workflow } = getMemoryEngine();
      const records = await workflow.listBridgedRecords();
      const result = await runExport(
        {
          scope: { kind: "vault" },
          requestedById: "u-tzachi",
          requestedByName: "צחי זוסטייהם",
          options: { includeSensitive },
        },
        { stores, agentStores, records, downloader: downloader ?? browserDownloader },
      );
      setManifest(result.manifest);
      toast(`יוצאו ${result.manifest.includedIds.length} פריטים — ${result.manifest.fileName}`, "info");
      onExported?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "הייצוא נכשל", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel variant="panel" style={{ padding: "var(--os-space-4)" }} data-testid="obsidian-export-panel">
      <SectionTitle
        title="ייצוא ל-Markdown / ZIP"
        subtitle="כספת מלאה בפורמט Obsidian · frontmatter בטוח · checksum וביקורת לכל ייצוא"
        icon="book"
      />
      <div style={{ ...stack(), marginBlockStart: "var(--os-space-3)" }}>
        <div style={{ ...tiny, display: "grid", gap: 2 }} data-testid="obsidian-status-lines">
          <div>{line1}</div>
          <div>{line2}</div>
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-2)" }}>
          <input
            type="checkbox"
            checked={includeSensitive}
            onChange={(e) => setIncludeSensitive(e.target.checked)}
            aria-label="כלול פריטים רגישים"
            data-testid="export-include-sensitive"
          />
          כלול פריטים ברגישות רגיש/מוגבל (הרשאה מפורשת — נרשם בביקורת)
        </label>

        {busy ? (
          <OsButton variant="primary" size="sm" icon="book" disabled disabledReason="מייצא…" data-testid="export-run">
            ייצוא כספת מלאה (ZIP)
          </OsButton>
        ) : (
          <OsButton variant="primary" size="sm" icon="book" onClick={() => void doExport()} data-testid="export-run">
            ייצוא כספת מלאה (ZIP)
          </OsButton>
        )}

        {manifest && (
          <div style={stack("var(--os-space-1, 4px)")} data-testid="export-manifest">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <StatusChip status="הושלם" label={`${manifest.includedIds.length} פריטים יוצאו`} />
              {manifest.excluded.length > 0 && (
                <StatusChip status="אזהרה" label={`${manifest.excluded.length} הוחרגו`} />
              )}
              {manifest.redactionCount > 0 && (
                <StatusChip status="אזהרה" label={`${manifest.redactionCount} השמטות סוד`} />
              )}
            </div>
            {manifest.excluded.map((e) => (
              <div key={e.recordId} style={tiny}>
                {e.title} — {e.reasonHe}
              </div>
            ))}
            <div style={{ ...tiny }} className="os-ltr">
              sha-256: {manifest.checksumSha256}
            </div>
            <div style={tiny}>
              מצב הורדה: {manifest.downloadState} · נוצר: {manifest.generatedAt.slice(0, 16).replace("T", " ")}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
