// W6-A — selected note: minimal-SAFE markdown view + full governance
// metadata (verification / approval / sensitivity / versions / AI usage /
// audit). All strings render as React text nodes — nothing is injected as
// HTML. W6-B's sanitizer replaces the markdown seam (markdown.ts) later.
import type { ReactElement, ReactNode } from "react";
import { ConfidenceBar, SectionTitle, StatusChip, type OsStatus } from "@/design-system";
import type { AuditEvent } from "@/domain/types";
import type { MemoryRecordV2, MemoryUsage, MemoryVersion } from "@/domain/memory";
import { MEMORY_LAYER_LABELS_HE } from "@/domain/memory";
import { confidenceDisplayHe } from "@/domain/ai/envelope";
import { compareVersions, usageJoinForRecord, versionsOf } from "@/memory/core/versioning";
import { parseMarkdownBlocks, type InlineSegment } from "../markdown";

const VERIFICATION_STATUS: Record<string, OsStatus> = {
  "לא נבדק": "ממתין",
  בבדיקה: "מושהה",
  מאומת: "הושלם",
  "שנוי במחלוקת": "אזהרה",
  נדחה: "חסום",
  "פג תוקף": "מושבת",
};

const APPROVAL_STATUS: Record<string, OsStatus> = {
  טיוטה: "מושהה",
  "ממתין לאישור": "ממתין",
  מאושר: "הושלם",
  נדחה: "חסום",
};

const SENSITIVITY_STATUS: Record<string, OsStatus> = {
  ציבורי: "פעיל",
  פנימי: "ממתין",
  רגיש: "אזהרה",
  מוגבל: "חסום",
};

function Inline({ segments }: { segments: InlineSegment[] }): ReactElement {
  return (
    <>
      {segments.map((s, i) =>
        s.kind === "wikilink" ? (
          <span
            key={i}
            style={{
              color: "var(--os-cyan, #20C4E8)",
              borderBlockEnd: "1px dashed var(--os-cyan, #20C4E8)",
            }}
          >
            {s.value}
          </span>
        ) : (
          <span key={i}>{s.value}</span>
        ),
      )}
    </>
  );
}

function SafeMarkdown({ markdown }: { markdown: string }): ReactElement {
  const blocks = parseMarkdownBlocks(markdown);
  return (
    <div style={{ display: "grid", gap: "var(--os-space-2)" }} data-testid="note-markdown">
      {blocks.map((b, i) => {
        if (b.kind === "divider") {
          return <hr key={i} style={{ borderColor: "var(--os-border)", inlineSize: "100%" }} />;
        }
        if (b.kind === "heading") {
          const size = b.level <= 1 ? "var(--os-text-lg, 17px)" : "var(--os-text-md, 15px)";
          return (
            <div key={i} style={{ fontWeight: 700, fontSize: size, color: "var(--os-text)" }}>
              <Inline segments={b.segments} />
            </div>
          );
        }
        if (b.kind === "list") {
          return (
            <ul key={i} style={{ margin: 0, paddingInlineStart: "1.2em", display: "grid", gap: 3 }}>
              {b.items.map((item, j) => (
                <li key={j} style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-2)" }}>
                  <Inline segments={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} style={{ margin: 0, fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-2)" }}>
            <Inline segments={b.segments} />
          </p>
        );
      })}
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
      <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>{label}</span>
      <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)" }}>{children}</span>
    </div>
  );
}

export interface NoteViewProps {
  record: MemoryRecordV2;
  versions: readonly MemoryVersion[];
  usage: readonly MemoryUsage[];
  audit: readonly AuditEvent[];
}

export function NoteView({ record, versions, usage, audit }: NoteViewProps): ReactElement {
  const recVersions = versionsOf(versions, record.id);
  const usageRows = usageJoinForRecord(usage, versions, record.id);
  const recAudit = audit
    .filter((a) => a.entityRef?.includes(record.id) || a.details.includes(record.title))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  return (
    <div style={{ display: "grid", gap: "var(--os-space-4)" }} data-testid="memory-note-view">
      <div>
        <div style={{ fontWeight: 700, fontSize: "var(--os-text-lg, 17px)", color: "var(--os-text)" }}>
          {record.title}
        </div>
        <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
          {MEMORY_LAYER_LABELS_HE[record.memoryLayer]} · תיקייה: {record.folder || "—"} ·{" "}
          <span className="os-ltr">{record.slug}</span>
        </div>
      </div>

      <SafeMarkdown markdown={record.bodyMarkdown} />

      {record.tags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {record.tags.map((t) => (
            <span
              key={t}
              style={{
                fontSize: "var(--os-text-2xs, 11px)",
                color: "var(--os-text-2)",
                border: "1px solid var(--os-border)",
                borderRadius: 999,
                paddingBlock: 1,
                paddingInline: 8,
              }}
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* governance metadata */}
      <div style={{ display: "grid", gap: "var(--os-space-2)" }} data-testid="note-governance">
        <SectionTitle title="ממשל ואמינות" icon="shield" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StatusChip
            status={VERIFICATION_STATUS[record.verificationState] ?? "ממתין"}
            label={`אימות: ${record.verificationState}`}
          />
          <StatusChip
            status={APPROVAL_STATUS[record.approvalState] ?? "ממתין"}
            label={`אישור: ${record.approvalState}`}
          />
          <StatusChip
            status={SENSITIVITY_STATUS[record.sensitivity] ?? "ממתין"}
            label={`רגישות: ${record.sensitivity}`}
          />
        </div>
        <MetaRow label="אושר על ידי">
          {record.approvedBy ?? (record.origin === "legacy-import" ? "יובא מדור 1 — ללא אישור מתועד" : "—")}
        </MetaRow>
        <MetaRow label="בעלים">{record.ownerName}</MetaRow>
        <MetaRow label="מדיניות שמירה">{record.retentionPolicy}</MetaRow>
        <MetaRow label="תאריך סקירה">
          {record.reviewDate ? <span className="os-num">{record.reviewDate.slice(0, 10)}</span> : "לא נקבע"}
        </MetaRow>
        <MetaRow label="מקורות">
          {record.sourceIds.length > 0 ? record.sourceIds.join(", ") : "ללא מקורות מתועדים (רשומת דור 1)"}
        </MetaRow>
        <ConfidenceBar
          value={record.confidence.status === "unavailable" ? null : (record.confidence.value ?? null)}
          label={`רמת ביטחון (${confidenceDisplayHe(record.confidence)})`}
        />
      </div>

      {/* versions */}
      <div style={{ display: "grid", gap: "var(--os-space-2)" }} data-testid="note-versions">
        <SectionTitle title={`גרסאות (${recVersions.length})`} icon="clock" />
        {recVersions.length === 0 ? (
          <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
            אין גרסאות מנוהלות עדיין — רשומת דור 1 מקבלת גרסה ראשונה בשינוי המנוהל הראשון.
          </div>
        ) : (
          [...recVersions].reverse().map((v, i, arr) => {
            const prev = arr[i + 1] ?? null;
            const diff = prev ? compareVersions(prev, v) : [];
            return (
              <div
                key={v.id}
                style={{
                  border: "1px solid var(--os-border)",
                  borderRadius: "var(--os-radius-sm, 6px)",
                  paddingBlock: "var(--os-space-2)",
                  paddingInline: "var(--os-space-3)",
                  display: "grid",
                  gap: 3,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ fontSize: "var(--os-text-sm, 13px)" }}>
                    גרסה <span className="os-num">{v.versionNumber}</span>
                  </strong>
                  <span className="os-num" style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
                    {v.timestamp.slice(0, 16).replace("T", " ")}
                  </span>
                </div>
                <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)" }}>
                  {v.reasonHe} · מאשר: {v.approverName ?? "—"}
                </div>
                {diff.length > 0 && (
                  <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
                    שדות ששונו: {diff.map((d) => d.field).join(", ")}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* AI usage */}
      <div style={{ display: "grid", gap: "var(--os-space-2)" }} data-testid="note-usage">
        <SectionTitle title={`שימושי AI (${usageRows.length})`} icon="brain" />
        {usageRows.length === 0 ? (
          <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
            אף תשובת AI לא ציטטה פריט זה עדיין — 0 שימושים (נמדד, לא מומצא).
          </div>
        ) : (
          usageRows.map((row) => (
            <div key={row.usage.id} style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)" }}>
              מעטפת <span className="os-ltr">{row.usage.envelopeId}</span> ({row.usage.operation}) השתמשה בגרסה{" "}
              <span className="os-num">{row.usage.versionNumber}</span>
            </div>
          ))
        )}
      </div>

      {/* audit */}
      <div style={{ display: "grid", gap: "var(--os-space-2)" }} data-testid="note-audit">
        <SectionTitle title="יומן ביקורת" icon="evidence" />
        {recAudit.length === 0 ? (
          <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
            אין רשומות ביקורת לפריט זה (רשומות דור 1 קדמו למנגנון הביקורת).
          </div>
        ) : (
          recAudit.map((a) => (
            <div key={a.id} style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)" }}>
              <span className="os-num">{a.at.slice(0, 16).replace("T", " ")}</span> · {a.action} · {a.details}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
