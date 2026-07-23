// W5-D shared widget — evidence items of an AI envelope. Every item cites a
// REAL record id; unverified citations are visibly flagged, never hidden.
import type { ReactElement } from "react";
import { OsIcon } from "@/design-system";
import type { EvidenceItem } from "@/domain/ai/envelope";

export interface EvidenceListProps {
  evidence: readonly EvidenceItem[];
  /** optional click-through (e.g. open the cited record) */
  onOpen?: (item: EvidenceItem) => void;
}

export function EvidenceList({ evidence, onOpen }: EvidenceListProps): ReactElement {
  if (evidence.length === 0) {
    return (
      <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
        לא צורפו ראיות לתשובה זו
      </div>
    );
  }
  return (
    <ul
      data-testid="evidence-list"
      style={{
        margin: 0,
        padding: 0,
        listStyle: "none",
        display: "grid",
        gap: "var(--os-space-2)",
      }}
    >
      {evidence.map((item, i) => (
        <li
          key={`${item.sourceId}-${i}`}
          style={{
            display: "grid",
            gap: 2,
            fontSize: "var(--os-text-2xs, 11px)",
            border: "1px solid var(--os-border)",
            borderRadius: "var(--os-radius-sm, 6px)",
            paddingBlock: "var(--os-space-2)",
            paddingInline: "var(--os-space-3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <OsIcon name="evidence" size={12} />
            {onOpen ? (
              <button
                type="button"
                onClick={() => onOpen(item)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "var(--os-cyan)",
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                {item.title}
              </button>
            ) : (
              <span style={{ color: "var(--os-text)" }}>{item.title}</span>
            )}
            <span className="os-ltr" style={{ color: "var(--os-muted)" }}>
              {item.sourceId}
            </span>
            {item.verified ? (
              <span style={{ color: "var(--os-success)" }}>מאומת</span>
            ) : (
              <span style={{ color: "var(--os-warning)" }}>⚠ לא אומת</span>
            )}
          </div>
          <div style={{ color: "var(--os-text-2)" }}>{item.relevantExcerpt}</div>
          <div style={{ color: "var(--os-muted)" }}>שיטת רלוונטיות: {item.relevanceMethod}</div>
        </li>
      ))}
    </ul>
  );
}
