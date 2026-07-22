import type { ReactElement } from "react";
import { OS_ACCENT_HEX, type OsAccent } from "./types";
import "../styles/components.css";

export interface SparklineProps {
  /** Chronological values (rendered LTR, like all charts). */
  values: readonly number[];
  /** Line color accent (default 'blue'). */
  accent?: OsAccent;
  /** Explicit stroke color — overrides accent. */
  stroke?: string;
  strokeWidth?: number;
  className?: string;
}

/**
 * Sparkline — pure SVG polyline (no chart library; recharts is NOT installed).
 * Renders nothing when fewer than 2 points exist — it never fakes a trend.
 */
export function Sparkline({
  values,
  accent = "blue",
  stroke,
  strokeWidth = 1.5,
  className,
}: SparklineProps): ReactElement | null {
  if (values.length < 2) return null;

  const w = 100;
  const h = 34;
  const pad = 2;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (values.length - 1);

  const points = values
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (h - pad * 2) * (1 - (v - min) / range);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      className={className}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke ?? OS_ACCENT_HEX[accent]}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
