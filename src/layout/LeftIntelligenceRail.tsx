import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { OsIcon } from "../design-system";
import "../styles/components.css";

export interface LeftIntelligenceRailProps {
  /** Rail title (e.g. "מרכז ראיות ואישור"). */
  title?: string;
  /** Slot content — agent card, trace, evidence, approvals… per screen. */
  children?: ReactNode;
  collapsible?: boolean;
  /** Uncontrolled initial state. */
  defaultCollapsed?: boolean;
  /** Controlled mode: pass both `collapsed` and `onToggleCollapsed` (persisted by the shell). */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  className?: string;
}

/**
 * LeftIntelligenceRail — the contextual intelligence rail at the inline-end
 * (physical left in RTL), ~300px. A pure slot container: each screen fills
 * it with its own contextual content. Collapsible; when collapsed an explicit
 * restore button (chevron) stays visible.
 */
export function LeftIntelligenceRail({
  title,
  children,
  collapsible = true,
  defaultCollapsed = false,
  collapsed: collapsedProp,
  onToggleCollapsed,
  className = "",
}: LeftIntelligenceRailProps): ReactElement {
  const [collapsedState, setCollapsedState] = useState(defaultCollapsed);
  const controlled = collapsedProp !== undefined;
  const collapsed = controlled ? collapsedProp : collapsedState;

  const toggle = (): void => {
    if (onToggleCollapsed) onToggleCollapsed();
    if (!controlled) setCollapsedState((c) => !c);
  };

  return (
    <aside
      className={`os-rail${collapsed ? " os-rail--collapsed" : ""} ${className}`.trim()}
      aria-label={title ?? "סרגל אינטליגנציה"}
    >
      <div className="os-rail__head">
        {!collapsed && title && <span className="os-rail__title">{title}</span>}
        {collapsible && (
          <button
            type="button"
            className="os-close-btn"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "פתיחת הסרגל" : "כיווץ הסרגל"}
            title={collapsed ? "פתיחת הסרגל" : "כיווץ הסרגל"}
          >
            <OsIcon name={collapsed ? "chevron-back" : "chevron-forward"} size={13} />
          </button>
        )}
      </div>
      <div className="os-rail__body">{children}</div>
    </aside>
  );
}
