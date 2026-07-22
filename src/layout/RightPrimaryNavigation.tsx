import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { GlowOrb, OsIcon, type IconName } from "../design-system";
import "../styles/components.css";

export interface NavItem {
  id: string;
  /** Hebrew label. */
  label: string;
  icon: IconName;
  /** Route path — used as plain <a href> unless renderLink is provided. */
  href: string;
  /** Optional numeric badge. */
  badge?: number;
}

/**
 * Router bridge: the Architect passes a renderLink that wraps `content`
 * in a react-router <Link>. This module never imports the router.
 */
export type RenderNavLink = (args: {
  item: NavItem;
  content: ReactNode;
  className: string;
  active: boolean;
}) => ReactNode;

export interface RightPrimaryNavigationProps {
  items: readonly NavItem[];
  /** Id of the active item (active glow state). */
  activeId?: string;
  renderLink?: RenderNavLink;
  /** Fallback click handler when renderLink is not provided. */
  onNavigate?: (item: NavItem) => void;
  /**
   * Copilot ask handler — wired in a later wave. When absent the input is
   * disabled with an honest "יחובר בהמשך" note (no fake chat).
   */
  onAsk?: (text: string) => void;
  /** Replace the whole bottom copilot card. */
  copilotSlot?: ReactNode;
  className?: string;
}

/**
 * RightPrimaryNavigation — the fixed ~220px primary nav at the inline-start
 * (right in RTL): TERAGON logo, module list with icons + numeric badges +
 * active glow, and the AI Copilot card with GlowOrb at the bottom.
 */
export function RightPrimaryNavigation({
  items,
  activeId,
  renderLink,
  onNavigate,
  onAsk,
  copilotSlot,
  className = "",
}: RightPrimaryNavigationProps): ReactElement {
  const [ask, setAsk] = useState("");

  return (
    <nav className={`os-nav ${className}`.trim()} aria-label="ניווט ראשי">
      <div className="os-nav__logo">
        <span className="os-nav__logo-name">TERAGON</span>
        <span className="os-nav__logo-sub">AI BUSINESS OS</span>
      </div>

      <ul className="os-nav__items">
        {items.map((item) => {
          const active = item.id === activeId;
          const cls = `os-nav__link${active ? " os-nav__link--active" : ""}`;
          const content = (
            <>
              <span className="os-nav__icon" aria-hidden="true">
                <OsIcon name={item.icon} size={16} />
              </span>
              <span className="os-nav__label">{item.label}</span>
              {typeof item.badge === "number" && (
                <span className="os-nav__badge os-num">{item.badge}</span>
              )}
            </>
          );
          return (
            <li key={item.id}>
              {renderLink ? (
                renderLink({ item, content, className: cls, active })
              ) : (
                <a
                  href={item.href}
                  className={cls}
                  aria-current={active ? "page" : undefined}
                  onClick={
                    onNavigate
                      ? (e) => {
                          e.preventDefault();
                          onNavigate(item);
                        }
                      : undefined
                  }
                >
                  {content}
                </a>
              )}
            </li>
          );
        })}
      </ul>

      {copilotSlot ?? (
        <div className="os-copilot">
          <GlowOrb size={56} accent="violet" />
          <div>
            <div className="os-copilot__title">AI Copilot</div>
            <div className="os-copilot__sub">העוזר החכם שלך</div>
          </div>
          <form
            className="os-copilot__form"
            onSubmit={(e) => {
              e.preventDefault();
              if (onAsk && ask.trim()) {
                onAsk(ask.trim());
                setAsk("");
              }
            }}
          >
            <input
              className="os-copilot__input"
              type="text"
              placeholder="שאל כל דבר…"
              aria-label="שאל את ה-AI Copilot"
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              disabled={!onAsk}
              title={onAsk ? undefined : "ה-Copilot יחובר בשלב הבא"}
            />
          </form>
          {!onAsk && <span className="os-copilot__note">יחובר בהמשך — טרם מחובר למנוע AI</span>}
        </div>
      )}
    </nav>
  );
}
