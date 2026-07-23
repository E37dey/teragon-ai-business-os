import type { ReactElement } from "react";
import "../styles/components.css";

export type ConfidenceTone = "cyan" | "success" | "warning" | "danger";

export interface ConfidenceBarProps {
  /** 0-100 percent, or null when not yet measured. */
  value: number | null;
  label?: string;
  /** Force a color (otherwise derived from value). */
  tone?: ConfidenceTone;
  className?: string;
}

/**
 * ConfidenceBar — AI confidence percent bar with label.
 * Honesty contract: when `value` is null it renders "טרם נמדד" with an
 * empty track — it NEVER invents a number.
 *
 * Auto tone: >=80 success · >=55 cyan · >=30 warning · <30 danger.
 */
export function ConfidenceBar({
  value,
  label = "רמת ביטחון",
  tone,
  className = "",
}: ConfidenceBarProps): ReactElement {
  const measured = typeof value === "number" && !Number.isNaN(value);
  const pct = measured ? Math.max(0, Math.min(100, value)) : 0;
  const autoTone: ConfidenceTone =
    pct >= 80 ? "success" : pct >= 55 ? "cyan" : pct >= 30 ? "warning" : "danger";
  const fillTone = tone ?? autoTone;

  return (
    // a11y (W6-F trivial fix): role="meter" REQUIRES aria-valuenow — an
    // unmeasured value must not claim the meter role (axe aria-required-attr,
    // critical). Unmeasured renders as a labeled image; measured is a meter.
    <div
      className={`os-confidence ${className}`.trim()}
      role={measured ? "meter" : "img"}
      aria-label={measured ? label : `${label} — טרם נמדד`}
      aria-valuemin={measured ? 0 : undefined}
      aria-valuemax={measured ? 100 : undefined}
      aria-valuenow={measured ? pct : undefined}
      aria-valuetext={measured ? `${pct}%` : undefined}
    >
      <div className="os-confidence__head">
        <span className="os-confidence__label">{label}</span>
        {measured ? (
          <span className="os-confidence__value os-num">{pct}%</span>
        ) : (
          <span className="os-confidence__value os-confidence__value--none">טרם נמדד</span>
        )}
      </div>
      <div className="os-confidence__track">
        {measured && (
          <div
            className={`os-confidence__fill os-confidence__fill--${fillTone}`}
            style={{ inlineSize: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}
