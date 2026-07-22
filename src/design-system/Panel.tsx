import type { CSSProperties, HTMLAttributes, ReactElement, ReactNode } from "react";
import type { OsAccent } from "./types";
import "../styles/components.css";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Surface level (default 'panel'). */
  variant?: "panel" | "raised" | "highlight";
  /** Optional accent border glow — restrained, active elements only. */
  accent?: OsAccent;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** Panel — base surface primitive of the OS. */
export function Panel({
  variant = "panel",
  accent,
  className = "",
  style,
  children,
  ...rest
}: PanelProps): ReactElement {
  const cls = [
    "os-panel",
    variant !== "panel" ? `os-panel--${variant}` : "",
    accent ? `os-panel--accent-${accent}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls} style={style} {...rest}>
      {children}
    </div>
  );
}
