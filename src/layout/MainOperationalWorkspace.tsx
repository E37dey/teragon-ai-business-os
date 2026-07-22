import type { ReactElement, ReactNode } from "react";
import "../styles/components.css";

export interface MainOperationalWorkspaceProps {
  /**
   * Left intelligence rail slot (rendered at the inline-end = physical left).
   * Pass a <LeftIntelligenceRail> — or omit for full-width screens.
   */
  rail?: ReactNode;
  /** Center canvas content. */
  children?: ReactNode;
  className?: string;
}

/**
 * MainOperationalWorkspace — the center work area: flexible canvas +
 * optional left intelligence rail. Dense 1920×1080 above-the-fold layout.
 */
export function MainOperationalWorkspace({
  rail,
  children,
  className = "",
}: MainOperationalWorkspaceProps): ReactElement {
  return (
    <div className={`os-workspace ${className}`.trim()}>
      <main className="os-workspace__canvas">{children}</main>
      {rail}
    </div>
  );
}
