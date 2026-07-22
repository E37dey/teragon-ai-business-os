/**
 * TERAGON AI BUSINESS OS — inline SVG icon set.
 * No icon package is installed (lucide is NOT a dependency) — this is the
 * canonical, typed, RTL-safe icon source. stroke: currentColor throughout.
 *
 * RTL note: 'chevron-forward' points to the inline-end in RTL (physical left)
 * — use it for "drill deeper / next" affordances. 'chevron-back' is its mirror.
 */
import type { ReactElement } from "react";
import { PATHS, type IconName } from "./iconPaths";

export type { IconName };

export interface OsIconProps {
  /** Icon name from the typed set. */
  name: IconName;
  /** Square size in px (default 16). */
  size?: number;
  /** Stroke width (default 1.8). */
  strokeWidth?: number;
  className?: string;
  /**
   * Accessible label. When omitted the icon is decorative (aria-hidden) —
   * pass a title only when the icon carries meaning on its own.
   */
  title?: string;
}

/** Inline SVG icon — stroke: currentColor, RTL-safe, zero dependencies. */
export function OsIcon({
  name,
  size = 16,
  strokeWidth = 1.8,
  className,
  title,
}: OsIconProps): ReactElement {
  return (
    <svg
      className={className ? `os-icon ${className}` : "os-icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {PATHS[name]}
    </svg>
  );
}
