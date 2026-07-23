// W5-D shared widget — the MANDATORY per-response disclosure when the
// registry served the local engine INSTEAD of an expected remote provider.
// Never rendered silently smaller than body text; never invented.
import type { ReactElement } from "react";
import { OsIcon } from "@/design-system";
import type { FallbackDisclosure } from "@/ai/providers/registry";

export interface FallbackNoticeProps {
  fallback: FallbackDisclosure;
}

export function FallbackNotice({ fallback }: FallbackNoticeProps): ReactElement {
  return (
    <div
      role="status"
      data-testid="fallback-notice"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: "var(--os-text-sm, 13px)",
        color: "var(--os-warning)",
        border: "1px solid var(--os-warning-border, var(--os-border))",
        background: "var(--os-warning-soft, transparent)",
        borderRadius: "var(--os-radius-sm, 6px)",
        paddingBlock: "var(--os-space-2)",
        paddingInline: "var(--os-space-3)",
      }}
    >
      <OsIcon name="alert" size={14} />
      <span>
        {fallback.messageHe}
        <span style={{ color: "var(--os-text-2)" }}> (סיבה: {fallback.reason})</span>
      </span>
    </div>
  );
}
