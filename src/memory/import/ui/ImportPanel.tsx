// TERAGON AI BUSINESS OS — Obsidian import panel (Wave 6, W6-B). Mounted by
// the /memory rail (wiring: docs/integration-requests-w6b.md — the lead wires
// MemoryPage.tsx). RTL, Hebrew errors, VISUAL_DNA primitives only.
// The panel drives the staged pipeline; nothing is ever auto-approved.
import { useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { EmptyState, OsButton, Panel, SectionTitle, StatusChip, useToast } from "@/design-system";
import { MEMORY_LAYER_LABELS_HE } from "@/domain/memory";
import { getMemoryEngine } from "@/memory/core/engine";
import { ObsidianBlocksView } from "@/memory/markdown/render";
import {
  IMPORT_STAGES_HE,
  commitImport,
  prepareImport,
  type ImportFileInput,
  type ImportPreview,
} from "../pipeline";

const stack = (gap = "var(--os-space-3)"): CSSProperties => ({ display: "grid", gap });
const tiny: CSSProperties = { fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" };

export interface ImportPanelProps {
  /** invoked after proposals were created (parent invalidates collections) */
  onImported?: () => void;
}

export function ImportPanel({ onImported }: ImportPanelProps): ReactElement {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [doneHe, setDoneHe] = useState<string | null>(null);

  const onFiles = async (fileList: FileList | null): Promise<void> => {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setDoneHe(null);
    try {
      const inputs: ImportFileInput[] = [];
      for (const file of Array.from(fileList)) {
        inputs.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
      }
      const records = await getMemoryEngine().workflow.listBridgedRecords();
      const next = await prepareImport(inputs, records);
      setPreview(next);
      setSelected(new Set(next.files.map((f) => f.path)));
      setPreviewPath(next.files[0]?.path ?? null);
      if (next.rejections.length > 0) {
        toast(`${next.rejections.length} קבצים נדחו בסריקת האבטחה — ראו פירוט`, "danger");
      }
    } catch (err) {
      setPreview(null);
      toast(err instanceof Error ? err.message : "סריקת הקבצים נכשלה", "danger");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (path: string): void => {
    const next = new Set(selected);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setSelected(next);
  };

  const commit = async (): Promise<void> => {
    if (!preview) return;
    setBusy(true);
    try {
      const { stores, agentStores, workflow } = getMemoryEngine();
      const result = await commitImport(
        {
          preview,
          selectedPaths: [...selected],
          requestedById: "u-tzachi",
          requestedByName: "צחי זוסטייהם",
        },
        { stores, agentStores, workflow },
      );
      const msg = `נוצרו ${result.proposals.length} הצעות זיכרון — ממתינות לאישור אנושי (0 אושרו אוטומטית)`;
      setDoneHe(msg);
      toast(msg, "info");
      if (result.failures.length > 0) {
        toast(`${result.failures.length} קבצים נכשלו ביצירת הצעה`, "danger");
      }
      setPreview(null);
      setSelected(new Set());
      onImported?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "הייבוא נכשל", "danger");
    } finally {
      setBusy(false);
    }
  };

  const shown = preview?.files.find((f) => f.path === previewPath) ?? null;

  return (
    <Panel variant="panel" style={{ padding: "var(--os-space-4)" }} data-testid="obsidian-import-panel">
      <SectionTitle
        title="ייבוא כספת Obsidian"
        subtitle="md / markdown / zip · כל קובץ הופך להצעה בתור האישורים — שום דבר לא נכתב ישירות"
        icon="inbox"
      />
      <div style={{ ...stack(), marginBlockStart: "var(--os-space-3)" }}>
        <div style={tiny}>{IMPORT_STAGES_HE.join(" ← ")}</div>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".md,.markdown,.zip"
          style={{ display: "none" }}
          data-testid="import-file-input"
          onChange={(e) => void onFiles(e.target.files)}
        />
        {busy ? (
          <OsButton variant="primary" size="sm" icon="inbox" disabled disabledReason="מעבד…">
            בחירת קבצים לייבוא
          </OsButton>
        ) : (
          <OsButton variant="primary" size="sm" icon="inbox" onClick={() => fileRef.current?.click()}>
            בחירת קבצים לייבוא
          </OsButton>
        )}

        {preview && preview.rejections.length > 0 && (
          <div style={stack("var(--os-space-1, 4px)")} data-testid="import-rejections">
            <StatusChip status="חסום" label={`${preview.rejections.length} דחיות אבטחה`} />
            {preview.rejections.map((r, i) => (
              <div key={i} style={{ ...tiny, color: "var(--os-danger, #EC5D68)" }}>
                {r.messageHe}
              </div>
            ))}
          </div>
        )}

        {preview && preview.imageRefs.length > 0 && (
          <div style={tiny}>
            {preview.imageRefs.length} תמונות נרשמו כהפניה בלבד (ללא טעינה): {preview.imageRefs.join(", ")}
          </div>
        )}

        {preview && preview.files.length === 0 && preview.rejections.length > 0 && (
          <EmptyState icon="alert" title="אין קבצים תקינים" reason="כל הקבצים נדחו בסריקת האבטחה." />
        )}

        {preview && preview.files.length > 0 && (
          <div style={stack("var(--os-space-2)")} data-testid="import-review">
            <div style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text)" }}>
              סקירה לפני יצירת הצעות ({selected.size}/{preview.files.length} נבחרו)
            </div>
            {preview.files.map((f) => (
              <div
                key={f.path}
                style={{
                  border: "1px solid var(--os-border)",
                  borderRadius: "var(--os-radius-sm, 6px)",
                  paddingBlock: 6,
                  paddingInline: 10,
                  display: "grid",
                  gap: 3,
                }}
              >
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selected.has(f.path)}
                    onChange={() => toggle(f.path)}
                    aria-label={`בחירת ${f.fileName}`}
                  />
                  <span style={{ fontWeight: 600, fontSize: "var(--os-text-sm, 13px)" }}>{f.title}</span>
                  <span style={tiny}>
                    {MEMORY_LAYER_LABELS_HE[f.memoryLayer]} · {f.folder}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewPath(f.path)}
                    style={{ ...tiny, background: "none", border: "none", cursor: "pointer", color: "var(--os-cyan, #20C4E8)" }}
                  >
                    תצוגה
                  </button>
                </label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {f.sanitized && <StatusChip status="אזהרה" label="עבר סניטציה (HTML/קישורים נוטרלו)" />}
                  {f.malformedName && <StatusChip status="אזהרה" label="קידוד שם/תוכן תוקן (UTF-8)" />}
                  {(f.duplicates.slugMatchIds.length > 0 || f.duplicates.similarTitleIds.length > 0) && (
                    <StatusChip
                      status="אזהרה"
                      label={`חשד לכפילות: ${[...f.duplicates.slugMatchIds, ...f.duplicates.similarTitleIds].join(", ")}`}
                    />
                  )}
                </div>
                {f.links.length > 0 && (
                  <div style={tiny}>
                    {f.links.map((l, i) => (
                      <span key={i} style={{ marginInlineEnd: 8 }}>
                        [[{l.target}]] —{" "}
                        {l.resolution === "ambiguous"
                          ? `${l.messageHe ?? ""} (${l.candidateIds.join(", ")})`
                          : l.resolution === "resolved"
                            ? "מקושר"
                            : l.resolvesInBatch
                              ? "יקושר בתוך הייבוא"
                              : l.resolution === "broken"
                                ? "שבור (היעד בארכיון)"
                                : "לא מקושר"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {shown && (
              <div style={stack("var(--os-space-1, 4px)")}>
                <div style={tiny}>תצוגה מקדימה בטוחה: {shown.fileName}</div>
                <ObsidianBlocksView blocks={shown.parsed.blocks} />
              </div>
            )}

            {busy || selected.size === 0 ? (
              <OsButton
                variant="primary"
                size="sm"
                icon="shield"
                disabled
                disabledReason={busy ? "מעבד…" : "לא נבחרו קבצים"}
                data-testid="import-commit"
              >
                צור הצעות לתור האישורים ({selected.size})
              </OsButton>
            ) : (
              <OsButton
                variant="primary"
                size="sm"
                icon="shield"
                onClick={() => void commit()}
                data-testid="import-commit"
              >
                צור הצעות לתור האישורים ({selected.size})
              </OsButton>
            )}
            <div style={tiny}>הייבוא יוצר הצעות בלבד — כל פריט מחייב אישור אנושי בשם לפני כתיבה לזיכרון.</div>
          </div>
        )}

        {doneHe && <div style={{ ...tiny, color: "var(--os-success, #21C981)" }}>{doneHe}</div>}
      </div>
    </Panel>
  );
}
