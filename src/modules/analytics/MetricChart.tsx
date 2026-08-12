// W8-A — pure-SVG metric line chart (Sparkline pattern; recharts is NOT
// installed). HONESTY: a null point BREAKS the line (splitSegments) — gaps are
// never interpolated/bridged; every rendered point is clickable → drilldown.
import type { ReactElement } from "react";
import type { MetricPoint } from "@/domain/analytics";
import { splitSegments } from "@/analytics/engine";
import { OS_ACCENT_HEX, type OsAccent } from "@/design-system";

export interface MetricChartProps {
  points: readonly MetricPoint[];
  accent: OsAccent;
  unit: string;
  onPointClick: (pointIndex: number) => void;
}

const W = 280;
const H = 72;
const PAD = 10;

export function MetricChart({ points, accent, unit, onPointClick }: MetricChartProps): ReactElement {
  const measured = points.filter((p) => p.value !== null).map((p) => p.value as number);
  const stroke = OS_ACCENT_HEX[accent];
  if (measured.length === 0) {
    return (
      <div className="os-num" style={{ color: "var(--os-muted)", fontSize: "0.8rem" }} dir="rtl">
        אין נקודות מדודות בטווח — אין קו לצייר
      </div>
    );
  }
  let min = Math.min(...measured);
  let max = Math.max(...measured);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const stepX = points.length > 1 ? (W - PAD * 2) / (points.length - 1) : 0;
  const x = (i: number): number => PAD + i * stepX;
  const y = (v: number): number => PAD + (H - PAD * 2) * (1 - (v - min) / (max - min));
  const segments = splitSegments(points);

  return (
    <svg
      className="an-mchart"
      viewBox={`0 0 ${W} ${H}`}
      style={{ inlineSize: "100%", blockSize: "auto", display: "block" }}
      // role="group" (not "img"): the chart CONTAINS focusable point controls
      // (role="button" circles). An atomic role="img" nesting interactive
      // children is an axe nested-interactive violation — a group legitimately
      // groups the interactive points under one accessible name. [W8-F a11y fix]
      role="group"
      aria-label={`גרף מגמה — ${measured.length} נקודות מדודות מתוך ${points.length}`}
    >
      {segments.map((seg) => {
        const pts = seg.indexes
          .map((i) => `${x(i).toFixed(1)},${y(points[i]?.value ?? 0).toFixed(1)}`)
          .join(" ");
        return (
          <polyline
            key={seg.indexes.join("-")}
            points={pts}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
      {points.map((p, i) =>
        p.value === null ? null : (
          <circle
            key={p.periodStart}
            className="an-mchart__pt"
            cx={x(i)}
            cy={y(p.value)}
            r={3}
            fill="var(--os-raised)"
            stroke={stroke}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: "pointer" }}
            tabIndex={0}
            role="button"
            aria-label={`נקודה ${i + 1}: ${p.value} ${unit} — פתיחת הרשומות`}
            onClick={() => onPointClick(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onPointClick(i);
            }}
          >
            <title>{`${p.value} ${unit}`}</title>
          </circle>
        ),
      )}
    </svg>
  );
}
