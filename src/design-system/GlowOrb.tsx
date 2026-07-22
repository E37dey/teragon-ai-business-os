import type { ReactElement } from "react";
import "../styles/components.css";

export interface GlowOrbProps {
  /** Diameter in px (default 64). */
  size?: number;
  accent?: "violet" | "cyan" | "blue";
  /** Pulse animation (CSS also honors prefers-reduced-motion). */
  animated?: boolean;
  className?: string;
}

/**
 * GlowOrb — the AI Copilot orb. Pure CSS radial gradients + subtle pulse
 * and dashed-ring rotation. Automatically stills under reduced motion.
 */
export function GlowOrb({
  size = 64,
  accent = "violet",
  animated = true,
  className = "",
}: GlowOrbProps): ReactElement {
  const cls = ["os-orb", `os-orb--${accent}`, animated ? "os-orb--animated" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={cls} style={{ inlineSize: size, blockSize: size }} aria-hidden="true">
      <span className="os-orb__ring" />
      <span className="os-orb__core" />
    </span>
  );
}
