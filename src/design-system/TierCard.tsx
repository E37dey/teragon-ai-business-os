import type { ReactElement } from "react";
import { OsIcon, type IconName } from "./icons";
import type { OsTierAccent } from "./types";
import "../styles/components.css";

export interface TierCardProps {
  /** Big colored title (e.g. "Tier 1"). */
  title: string;
  /** Hebrew subtitle under the title (e.g. "שירות עצמי"). */
  subtitle?: string;
  accent?: OsTierAccent;
  /** Optional icon from the typed set. */
  icon?: IconName;
  /** Bullet lines. */
  items?: readonly string[];
  /** Response-time badge text (e.g. "מיידי", "שעתיים"). */
  footerTime?: string;
  className?: string;
}

/**
 * TierCard — per reference 19.png (מודל תמיכה תלת-שלבי).
 * Large card: colored title (cyan/blue/violet), bullet list, footer time badge.
 */
export function TierCard({
  title,
  subtitle,
  accent = "cyan",
  icon,
  items = [],
  footerTime,
  className = "",
}: TierCardProps): ReactElement {
  return (
    <div className={`os-tier os-tier--${accent} ${className}`.trim()}>
      <div className="os-tier__head">
        <div>
          <div className="os-tier__title">{title}</div>
          {subtitle && <div className="os-tier__subtitle">{subtitle}</div>}
        </div>
        {icon && (
          <span className="os-tier__icon" aria-hidden="true">
            <OsIcon name={icon} size={22} />
          </span>
        )}
      </div>

      {items.length > 0 && (
        <ul className="os-tier__list">
          {items.map((item, i) => (
            <li key={i} className="os-tier__item">
              <span className="os-tier__bullet" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      )}

      {footerTime && (
        <div className="os-tier__foot">
          <OsIcon name="clock" size={13} />
          {footerTime}
        </div>
      )}
    </div>
  );
}
