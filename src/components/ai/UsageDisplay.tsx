// W5-D shared widget — honest usage/cost rendering (see ./usage.ts for the
// pure formatter and the absent-is-not-zero contract).
import type { ReactElement } from "react";
import type { UsageInfo } from "@/domain/ai/envelope";
import { usageDisplayHe } from "./usage";

export interface UsageDisplayProps {
  usage: UsageInfo;
  labelHe?: string;
}

export function UsageDisplay({ usage, labelHe = "שימוש ועלות" }: UsageDisplayProps): ReactElement {
  return (
    <div
      data-testid="usage-display"
      style={{
        fontSize: "var(--os-text-2xs, 11px)",
        color: "var(--os-text-2)",
        display: "flex",
        gap: 6,
      }}
    >
      <span style={{ color: "var(--os-muted)" }}>{labelHe}:</span>
      <span className="os-num">{usageDisplayHe(usage)}</span>
    </div>
  );
}
