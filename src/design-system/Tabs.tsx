import type { ReactElement } from "react";
import "../styles/components.css";

export interface TabItem {
  id: string;
  label: string;
  /** Optional numeric badge. */
  badge?: number;
}

export interface TabsProps {
  items: readonly TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  /** Accessible name for the tab list. */
  ariaLabel?: string;
  className?: string;
}

/** Tabs — controlled RTL tab strip with cyan active underline + badges. */
export function Tabs({
  items,
  activeId,
  onChange,
  ariaLabel,
  className = "",
}: TabsProps): ReactElement {
  return (
    <div className={`os-tabs ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`os-tabs__tab${active ? " os-tabs__tab--active" : ""}`}
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {typeof item.badge === "number" && (
              <span className="os-tabs__badge os-num">{item.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
