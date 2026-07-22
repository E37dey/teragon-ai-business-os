import type { ReactElement } from "react";
import { Panel } from "./Panel";
import { Sparkline } from "./Sparkline";
import { OsIcon, type IconName } from "./icons";
import { OS_ACCENT_HEX, type OsAccent } from "./types";
import "../styles/components.css";

export interface KpiCardProps {
  /** Small label above the value. */
  title: string;
  /** Big bold value — already formatted (e.g. "148,200 ₪"). */
  value: string | number;
  /** Percent change; positive=green, negative=red, 0=muted; null/undefined hides the chip (never fake a trend). */
  delta?: number | null;
  /** Suffix after the % (e.g. "מהחודש שעבר"). */
  deltaLabel?: string;
  /** Sparkline values (chronological, LTR). Omit or <2 points ⇒ no sparkline. */
  spark?: readonly number[];
  /** Sparkline + optional frame color (default 'blue'). */
  accent?: OsAccent;
  /** Restrained accent frame glow — use only for the single emphasized KPI. */
  glow?: boolean;
  /** Optional icon from the typed set. */
  icon?: IconName;
  className?: string;
}

/**
 * KpiCard — dense KPI card: small title, big value, colored ±% delta chip,
 * optional pure-SVG sparkline. Per docs/VISUAL_DNA.md pattern 1.
 */
export function KpiCard({
  title,
  value,
  delta = null,
  deltaLabel,
  spark,
  accent = "blue",
  glow = false,
  icon,
  className = "",
}: KpiCardProps): ReactElement {
  const dir = delta == null ? null : delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  return (
    <Panel
      variant="raised"
      accent={glow ? accent : undefined}
      className={`os-kpi ${className}`.trim()}
    >
      <div className="os-kpi__head">
        <span className="os-kpi__title">{title}</span>
        {icon && (
          <span
            className="os-kpi__icon"
            style={{ color: OS_ACCENT_HEX[accent] }}
            aria-hidden="true"
          >
            <OsIcon name={icon} size={14} />
          </span>
        )}
      </div>
      <div className="os-kpi__row">
        <span className="os-kpi__value os-num">{value}</span>
        {dir !== null && delta != null && (
          <span className={`os-kpi__delta os-kpi__delta--${dir}`}>
            <span className="os-num">
              {delta > 0 ? "+" : ""}
              {delta}%
            </span>
            {deltaLabel && <span>{deltaLabel}</span>}
          </span>
        )}
      </div>
      {spark && spark.length > 1 && (
        <div className="os-kpi__spark" aria-hidden="true">
          <Sparkline values={spark} accent={accent} />
        </div>
      )}
    </Panel>
  );
}
