import type { ReactElement, ReactNode } from "react";
import { OsIcon, type IconName } from "./icons";
import "../styles/components.css";

export interface EmptyStateProps {
  /** Icon from the typed set (default 'inbox'). */
  icon?: IconName;
  title?: string;
  /** Honest Hebrew reason WHY it is empty (e.g. "החיבור ל-ERP טרם הוגדר"). */
  reason?: string;
  /** Optional action slot (e.g. OsButton). */
  action?: ReactNode;
  className?: string;
}

/**
 * EmptyState — honest RTL empty/placeholder state.
 * Always state WHY it is empty (`reason`) — no fake data, no fake success.
 */
export function EmptyState({
  icon = "inbox",
  title = "אין נתונים להצגה",
  reason,
  action,
  className = "",
}: EmptyStateProps): ReactElement {
  return (
    <div className={`os-empty ${className}`.trim()} role="status">
      <span className="os-empty__icon" aria-hidden="true">
        <OsIcon name={icon} size={26} />
      </span>
      <span className="os-empty__title">{title}</span>
      {reason && <span className="os-empty__reason">{reason}</span>}
      {action && <div className="os-empty__action">{action}</div>}
    </div>
  );
}
