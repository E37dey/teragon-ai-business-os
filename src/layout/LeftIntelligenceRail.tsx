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
  defaultCollapsed?: boolean;
  className?: string;
}

/**
 * LeftIntelligenceRail — the contextual intelligence rail at the inline-end
 * (physical left in RTL), ~300px. A pure slot container: each screen fills
 * it with its own contextual content. Collapsible.
 */
export function LeftIntelligenceRail({
  title,
  children,
  collapsible = true,
  defaultCollapsed = false,
  className = "",
}: LeftIntelligenceRailProps): ReactElement {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

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
            onClick={() => setCollapsed((c) => !c)}
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
