// W5-D shared widget — honest provider identification next to EVERY AI answer.
// Local rules engine is never presented as a model; a remote provider shows
// its verified health state and model when known.
import type { CSSProperties, ReactElement } from "react";
import { OsIcon } from "@/design-system";
import type { AIProviderHealthState } from "@/ai/contracts/AIProvider";
import { providerLabelHe } from "./providerLabels";

export interface ProviderStateBadgeProps {
  /** provider id from the envelope / registry, e.g. "local-rules" | "remote" */
  provider: string;
  /** model from the envelope — null for rule engines (never faked) */
  model?: string | null;
  /** remote health state when known (registry selection) */
  healthState?: AIProviderHealthState | null;
  size?: "sm" | "md";
}

export function ProviderStateBadge({
  provider,
  model = null,
  healthState = null,
  size = "sm",
}: ProviderStateBadgeProps): ReactElement {
  const isLocal = provider === "local-rules";
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: size === "sm" ? "var(--os-text-2xs, 11px)" : "var(--os-text-sm, 13px)",
    color: isLocal ? "var(--accent-primary-text)" : "var(--success-text)",
    border: `1px solid ${isLocal ? "var(--os-cyan-border, var(--os-border))" : "var(--os-success-border, var(--os-border))"}`,
    background: isLocal
      ? "var(--os-cyan-soft, transparent)"
      : "var(--os-success-soft, transparent)",
    borderRadius: "var(--os-radius-full, 999px)",
    paddingBlock: 2,
    paddingInline: 10,
    whiteSpace: "nowrap",
  };
  return (
    <span style={style} data-testid="provider-state-badge" data-provider={provider}>
      <OsIcon name={isLocal ? "memory" : "bot"} size={12} />
      <span>{providerLabelHe(provider)}</span>
      {model !== null && model !== "" && <span className="os-ltr">· {model}</span>}
      {healthState !== null && <span>· {healthState}</span>}
    </span>
  );
}
