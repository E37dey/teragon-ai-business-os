import type { ReactElement, ReactNode } from "react";
import { OsIcon, type IconName } from "./icons";
import "../styles/components.css";

export interface SectionTitleProps {
  /** Optional icon from the typed set (renders cyan). */
  icon?: IconName;
  title: string;
  /** Muted inline subtitle. */
  subtitle?: string;
  /** Inline-end action slot (buttons, filters). */
  action?: ReactNode;
  className?: string;
}

/** SectionTitle — RTL section header with optional icon + action slot. */
export function SectionTitle({
  icon,
  title,
  subtitle,
  action,
  className = "",
}: SectionTitleProps): ReactElement {
  return (
    <div className={`os-section-title ${className}`.trim()}>
      <div className="os-section-title__main">
        {icon && (
          <span className="os-section-title__icon" aria-hidden="true">
            <OsIcon name={icon} size={16} />
          </span>
        )}
        <h3 className="os-section-title__text">
          {title}
          {subtitle && <span className="os-section-title__subtitle">{subtitle}</span>}
        </h3>
      </div>
      {action && <div className="os-section-title__action">{action}</div>}
    </div>
  );
}
