// W8-A / VC-F visual polish — the executive primary trend chart.
// Pure-SVG (recharts is NOT installed). Pixel-sized via ResizeObserver so the
// 2px line and small markers never balloon when the panel is wide. HONESTY is
// unchanged: a null point BREAKS the line (splitSegments) — gaps are never
// bridged; every measured point stays clickable → drilldown and keeps its
// role="button" a11y name. Markers are hidden until hover/focus; a professional
// RTL tooltip shows the period + metric + value on hover/focus.
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import type { MetricPoint } from "@/domain/analytics";
import { splitSegments } from "@/analytics/engine";
import { OS_ACCENT_HEX, type OsAccent } from "@/design-system";
import { fmtPointValue, shortDateHe } from "./lib";

export interface TrendChartProps {
  points: readonly MetricPoint[];
  accent: OsAccent;
  unit: string;
  titleHe: string;
  onPointClick: (pointIndex: number) => void;
}

const H = 232; // executive height — present without dominating the screen
const PAD_T = 16;
const PAD_B = 32; // room for a populated date axis
const PAD_L = 48; // a REAL left y-axis gutter so scale labels are readable, not floating
const PAD_R = 16;
const GRID = 4; // horizontal gridlines / y-axis ticks
const N_XLABELS = 6; // distributed date labels along the bottom (not just first/mid/last)

// compact axis number (no unit clutter on the scale itself)
function axisLabel(v: number): string {
  const r = Math.round(v);
  if (Math.abs(r) >= 1000) return r.toLocaleString("en-US");
  return String(r);
}

export function TrendChart({ points, accent, unit, titleHe, onPointClick }: TrendChartProps): ReactElement {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(760);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw !== undefined && cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const measured = points.filter((p) => p.value !== null).map((p) => p.value as number);
  const stroke = OS_ACCENT_HEX[accent];
  const gradId = `an-trend-grad-${accent}`;

  if (measured.length === 0) {
    return (
      <div ref={wrapRef} className="an-trend an-trend--empty" dir="rtl">
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
  const span = max - min;
  const plotW = Math.max(10, w - PAD_L - PAD_R);
  const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;
  const x = (i: number): number => PAD_L + i * stepX;
  const y = (v: number): number => PAD_T + (H - PAD_T - PAD_B) * (1 - (v - min) / (max - min));
  const baseY = H - PAD_B;
  const segments = splitSegments(points);

  const gridVals = Array.from({ length: GRID + 1 }, (_, k) => min + (span * k) / GRID);
  const measuredIdx = points.map((p, i) => (p.value === null ? -1 : i)).filter((i) => i >= 0);
  const firstIdx = measuredIdx[0] ?? 0;
  const lastIdx = measuredIdx[measuredIdx.length - 1] ?? points.length - 1;
  // Distribute date labels evenly across the measured points (always incl. first
  // and last) so the axis is populated — not three lonely labels on a wide chart.
  // Fewer labels on narrow (mobile) widths so they never crowd/overlap.
  const nx = w < 520 ? 3 : N_XLABELS;
  const xLabelIdx =
    measuredIdx.length <= nx
      ? measuredIdx
      : Array.from(
          new Set(
            Array.from({ length: nx }, (_, k) =>
              measuredIdx[Math.round((k * (measuredIdx.length - 1)) / (nx - 1))] ?? firstIdx,
            ),
          ),
        );
  const lastVal = points[lastIdx]?.value ?? null;

  const hoverPoint = hover === null ? null : points[hover];

  return (
    <div ref={wrapRef} className="an-trend" dir="ltr">
      <svg
        width={w}
        height={H}
        viewBox={`0 0 ${w} ${H}`}
        // role="group" (not "img"): contains focusable point controls; an atomic
        // img nesting interactive children is an axe nested-interactive violation.
        role="group"
        aria-label={`גרף מגמה — ${measured.length} נקודות מדודות מתוך ${points.length}`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.30" />
            <stop offset="55%" stopColor={stroke} stopOpacity="0.10" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* horizontal gridlines + a readable left y-axis scale in its own gutter */}
        {gridVals.map((gv, k) => {
          const gy = y(gv);
          return (
            <g key={`g-${k}`}>
              <line
                x1={PAD_L}
                x2={w - PAD_R}
                y1={gy}
                y2={gy}
                className="an-trend__grid"
              />
              <text
                x={PAD_L - 8}
                y={gy}
                className="an-trend__ylabel"
                textAnchor="end"
                dominantBaseline="middle"
              >
                {axisLabel(gv)}
              </text>
            </g>
          );
        })}

        {/* framed L-axis (baseline + left) — gives the plot real edges so the line
            reads as data ON a chart, not a thread floating in a dark panel */}
        <line x1={PAD_L} x2={w - PAD_R} y1={baseY} y2={baseY} className="an-trend__axis" />
        <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={baseY} className="an-trend__axis" />

        {/* soft area fill under each measured segment */}
        {segments.map((seg) => {
          if (seg.indexes.length < 2) return null;
          const line = seg.indexes.map((i) => `${x(i).toFixed(1)},${y(points[i]?.value ?? 0).toFixed(1)}`);
          const first = seg.indexes[0] ?? 0;
          const last = seg.indexes[seg.indexes.length - 1] ?? 0;
          const d = `M ${x(first).toFixed(1)},${baseY.toFixed(1)} L ${line.join(" L ")} L ${x(last).toFixed(1)},${baseY.toFixed(1)} Z`;
          return <path key={`area-${seg.indexes.join("-")}`} d={d} fill={`url(#${gradId})`} stroke="none" />;
        })}

        {/* the line — real 2px, crisp (pixel-sized svg, no scaling blow-up) */}
        {segments.map((seg) => {
          const pts = seg.indexes.map((i) => `${x(i).toFixed(1)},${y(points[i]?.value ?? 0).toFixed(1)}`).join(" ");
          return (
            <polyline
              key={seg.indexes.join("-")}
              points={pts}
              fill="none"
              stroke={stroke}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {/* always-visible "current value" anchor at the last measured point — the
            single strongest signal that the chart is live, not a placeholder. */}
        {lastVal !== null && (
          <circle
            className="an-trend__last"
            cx={x(lastIdx)}
            cy={y(lastVal)}
            r={3.5}
            fill={stroke}
            stroke="var(--os-raised)"
            strokeWidth={2}
            aria-hidden="true"
          />
        )}

        {/* x-axis period labels — distributed across the measured range */}
        {xLabelIdx.map((i) => (
          <text
            key={`x-${i}`}
            x={x(i)}
            y={H - 10}
            className="an-trend__xlabel"
            textAnchor={i === firstIdx ? "start" : i === lastIdx ? "end" : "middle"}
          >
            {shortDateHe(points[i]?.periodStart ?? "")}
          </text>
        ))}

        {/* hover guide */}
        {hover !== null && points[hover]?.value != null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD_T}
            y2={baseY}
            className="an-trend__guide"
          />
        )}

        {/* measured markers — hidden until hover/focus, still clickable + focusable */}
        {points.map((p, i) =>
          p.value === null ? null : (
            <circle
              key={p.periodStart}
              className={`an-trend__pt${hover === i ? " is-active" : ""}`}
              cx={x(i)}
              cy={y(p.value)}
              r={hover === i ? 4.5 : 3.5}
              fill="var(--os-raised)"
              stroke={stroke}
              strokeWidth={2}
              tabIndex={0}
              role="button"
              aria-label={`נקודה ${i + 1}: ${p.value} ${unit} — פתיחת הרשומות`}
              onClick={() => onPointClick(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onPointClick(i);
              }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((h) => (h === i ? null : h))}
            >
              <title>{`${p.value} ${unit}`}</title>
            </circle>
          ),
        )}
      </svg>

      {/* professional RTL tooltip — period · metric · value */}
      {hover !== null && hoverPoint != null && hoverPoint.value !== null && (
        <div
          className="an-trend__tip"
          dir="rtl"
          style={{
            left: `${(x(hover) / w) * 100}%`,
            top: `${(y(hoverPoint.value) / H) * 100}%`,
          }}
        >
          <div className="an-trend__tip-period os-num" dir="ltr">
            {shortDateHe(hoverPoint.periodStart)}
          </div>
          <div className="an-trend__tip-metric">{titleHe}</div>
          <div className="an-trend__tip-value os-num">{fmtPointValue(hoverPoint.value, unit)}</div>
        </div>
      )}
    </div>
  );
}
