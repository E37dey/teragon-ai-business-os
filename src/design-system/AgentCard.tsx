import type { ReactElement } from "react";
import { StatusChip } from "./StatusChip";
import { OsIcon, type IconName } from "./icons";
import type { OsAccent, OsStatus } from "./types";
import "../styles/components.css";

export interface AgentCardProps {
  /** Agent name (e.g. "Orchestrator"). */
  name: string;
  /** Hebrew role line (e.g. "מאמת את התוצאה"). */
  role?: string;
  /**
   * Frame color by agent role (docs/VISUAL_DNA.md pattern 3):
   * success=Human Approval, blue=Orchestrator, violet=Mentor,
   * warning=Fixer, cyan=Wiki/Hunter.
   */
  accent?: OsAccent;
  /** Icon from the typed set (default 'bot'). */
  icon?: IconName;
  /** Hebrew owner line (בעלים). */
  owner?: string;
  /** קלט row value. */
  input?: string;
  /** פלט row value. */
  output?: string;
  /** Canonical status chip. */
  status?: OsStatus;
  /** ראיות count; null renders "—" (never invent evidence). */
  evidenceCount?: number | null;
  className?: string;
}

/** AgentCard — agent node card per reference 7.png (חדר התיאום של הסוכנים). */
export function AgentCard({
  name,
  role,
  accent = "blue",
  icon = "bot",
  owner,
  input,
  output,
  status,
  evidenceCount = null,
  className = "",
}: AgentCardProps): ReactElement {
  return (
    <div className={`os-agent os-agent--${accent} ${className}`.trim()}>
      <div className="os-agent__head">
        <span className="os-agent__icon" aria-hidden="true">
          <OsIcon name={icon} size={15} />
        </span>
        <div>
          <div className="os-agent__name">{name}</div>
          {role && <div className="os-agent__role">{role}</div>}
        </div>
      </div>

      <div className="os-agent__rows">
        {owner && (
          <div className="os-agent__row">
            <span className="os-agent__row-label">בעלים:</span>
            <span className="os-agent__row-value">{owner}</span>
          </div>
        )}
        {input && (
          <div className="os-agent__row">
            <span className="os-agent__row-label">קלט:</span>
            <span className="os-agent__row-value">{input}</span>
          </div>
        )}
        {output && (
          <div className="os-agent__row">
            <span className="os-agent__row-label">פלט:</span>
            <span className="os-agent__row-value">{output}</span>
          </div>
        )}
      </div>

      <div className="os-agent__foot">
        {status ? <StatusChip status={status} /> : <span />}
        <span className="os-agent__evidence">
          <OsIcon name="evidence" size={11} />
          ראיות: <span className="os-num">{evidenceCount == null ? "—" : evidenceCount}</span>
        </span>
      </div>
    </div>
  );
}
