// W5-D shared widget — THE canonical renderer of AIResponseEnvelopeV2.
// Honesty contract enforced here for every screen:
// - confidence via confidenceDisplayHe (unavailable ⇒ "טרם נמדד", never 0)
// - usage via UsageDisplay (absent ≠ zero)
// - limitations always visible
// - provider identity always visible (ProviderStateBadge)
// - approval requirement disclosed
import type { ReactElement, ReactNode } from "react";
import { ConfidenceBar, OsIcon } from "@/design-system";
import type { AIResponseEnvelopeV2 } from "@/domain/ai/envelope";
import { confidenceDisplayHe } from "@/domain/ai/envelope";
import type { FallbackDisclosure } from "@/ai/providers/registry";
import { ProviderStateBadge } from "./ProviderStateBadge";
import { FallbackNotice } from "./FallbackNotice";
import { UsageDisplay } from "./UsageDisplay";
import { EvidenceList } from "./EvidenceList";

export interface EnvelopeCardProps {
  envelope: AIResponseEnvelopeV2;
  /** non-null ⇒ the registry disclosed a remote→local fallback for this response */
  fallback?: FallbackDisclosure | null;
  /** slot for proposed actions (e.g. request-approval button / ApprovalPanel) */
  actions?: ReactNode;
  compact?: boolean;
}

const STATUS_COLOR: Record<AIResponseEnvelopeV2["status"], string> = {
  הצלחה: "var(--os-success)",
  נכשל: "var(--os-danger)",
  חלקי: "var(--os-warning)",
  בוטל: "var(--os-muted)",
};

export function EnvelopeCard({
  envelope,
  fallback = null,
  actions,
  compact = false,
}: EnvelopeCardProps): ReactElement {
  const confidenceValue =
    envelope.confidence.status !== "unavailable" && envelope.confidence.value !== undefined
      ? envelope.confidence.value
      : null;
  return (
    <div
      data-testid="envelope-card"
      data-envelope-id={envelope.id}
      style={{
        display: "grid",
        gap: "var(--os-space-3)",
        border: "1px solid var(--os-border)",
        borderRadius: "var(--os-radius-md, 8px)",
        background: "var(--os-raised)",
        paddingBlock: "var(--os-space-4)",
        paddingInline: "var(--os-space-4)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--os-space-2)",
          flexWrap: "wrap",
        }}
      >
        <ProviderStateBadge provider={envelope.provider} model={envelope.model} />
        <span
          style={{
            fontSize: "var(--os-text-2xs, 11px)",
            color: STATUS_COLOR[envelope.status],
          }}
        >
          {envelope.status}
          <span className="os-ltr" style={{ color: "var(--os-muted)" }}>
            {" "}
            · {envelope.operation}
          </span>
        </span>
      </div>

      {fallback !== null && <FallbackNotice fallback={fallback} />}

      <div style={{ fontSize: "var(--os-text-sm, 13px)", whiteSpace: "pre-wrap" }}>
        {envelope.recommendation}
      </div>

      <div style={{ fontSize: "var(--os-text-2xs, 12px)", color: "var(--os-text-2)" }}>
        <strong style={{ color: "var(--os-text)" }}>למה: </strong>
        {envelope.reason}
      </div>

      {!compact && (
        <div style={{ display: "grid", gap: 4 }}>
          <div
            style={{
              fontSize: "var(--os-text-2xs, 11px)",
              fontWeight: 600,
              color: "var(--os-text-2)",
            }}
          >
            ראיות ({envelope.evidence.length})
          </div>
          <EvidenceList evidence={envelope.evidence} />
        </div>
      )}

      <div style={{ display: "grid", gap: 4 }}>
        <ConfidenceBar
          value={confidenceValue}
          label={`רמת ביטחון: ${confidenceDisplayHe(envelope.confidence)}`}
        />
        <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
          שיטת הערכה: {envelope.confidence.method}
        </div>
      </div>

      <div style={{ fontSize: "var(--os-text-2xs, 12px)" }}>
        <strong>הפעולה הבאה: </strong>
        {envelope.nextStep}
      </div>

      {envelope.limitations.length > 0 && (
        <div
          style={{
            fontSize: "var(--os-text-2xs, 11px)",
            color: "var(--os-text-2)",
            display: "grid",
            gap: 2,
          }}
        >
          <span style={{ fontWeight: 600 }}>מגבלות:</span>
          <ul style={{ margin: 0, paddingInlineStart: "1.2em" }}>
            {envelope.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "var(--os-space-2)",
          flexWrap: "wrap",
        }}
      >
        <UsageDisplay usage={envelope.usage} />
        {envelope.approval.required && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: "var(--os-text-2xs, 11px)",
              color: "var(--os-violet-text, var(--os-violet))",
            }}
          >
            <OsIcon name="shield" size={12} />
            מחייב אישור אנושי לפני ביצוע
          </span>
        )}
      </div>

      {actions}
    </div>
  );
}
