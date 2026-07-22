import { useCallback, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import { GlowOrb, OsIcon, type IconName } from "../design-system";
import "../styles/components.css";

export interface NavItem {
  id: string;
  /** Hebrew label. */
  label: string;
  icon: IconName;
  /** Route path — used as plain <a href> unless renderLink is provided. */
  href: string;
  /** Optional numeric badge (derived — never render a fake count). */
  badge?: number;
}

/** A collapsible nav group (Wave 2 grouped navigation). */
export interface NavGroupSpec {
  id: string;
  label: string;
  items: readonly NavItem[];
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
  /** Flat item list (legacy mode — used when `groups` is absent). */
  items?: readonly NavItem[];
  /** Grouped mode: collapsible groups with persisted open/closed state. */
  groups?: readonly NavGroupSpec[];
  /** group id → open? (missing ⇒ open). Controlled by the shell (persisted). */
  openGroups?: Record<string, boolean>;
  onToggleGroup?: (groupId: string) => void;
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
 * (right in RTL): TERAGON logo, grouped module list with icons + derived
 * badges + active glow, and the AI Copilot card at the bottom.
 *
 * Keyboard: ArrowUp/ArrowDown move between visible controls (group headers +
 * links), Home/End jump to first/last, Enter activates (native behavior).
 */
export function RightPrimaryNavigation({
  items,
  groups,
  openGroups,
  onToggleGroup,
  activeId,
  renderLink,
  onNavigate,
  onAsk,
  copilotSlot,
  className = "",
}: RightPrimaryNavigationProps): ReactElement {
  const [ask, setAsk] = useState("");
  const navRef = useRef<HTMLElement>(null);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const nav = navRef.current;
    if (!nav) return;
    const focusables = Array.from(nav.querySelectorAll<HTMLElement>('[data-nav-focusable="true"]'));
    if (focusables.length === 0) return;
    const current = document.activeElement;
    const idx = focusables.findIndex((el) => el === current);
    let next: number;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = focusables.length - 1;
    else if (e.key === "ArrowDown") next = idx < focusables.length - 1 ? idx + 1 : 0;
    else next = idx > 0 ? idx - 1 : focusables.length - 1;
    const target = focusables[next];
    if (target) {
      e.preventDefault();
      target.focus();
    }
  }, []);

  const renderItem = (item: NavItem): ReactNode => {
    const active = item.id === activeId;
    const cls = `os-nav__link${active ? " os-nav__link--active" : ""}`;
    const content = (
      <>
        <span className="os-nav__icon" aria-hidden="true">
          <OsIcon name={item.icon} size={16} />
        </span>
        <span className="os-nav__label">{item.label}</span>
        {typeof item.badge === "number" && item.badge > 0 && (
          <span className="os-nav__badge os-num">{item.badge}</span>
        )}
      </>
    );
    return renderLink ? (
      renderLink({ item, content, className: cls, active })
    ) : (
      <a
        href={item.href}
        className={cls}
        data-nav-focusable="true"
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
    );
  };

  return (
    <nav
      ref={navRef}
      className={`os-nav ${className}`.trim()}
      aria-label="ניווט ראשי"
      onKeyDown={onKeyDown}
    >
      <div className="os-nav__logo">
        <span className="os-nav__logo-name">TERAGON</span>
        <span className="os-nav__logo-sub">AI BUSINESS OS</span>
      </div>

      {groups ? (
        <div className="os-nav__groups">
          {groups.map((group) => {
            const open = openGroups?.[group.id] !== false;
            const contentId = `os-nav-group-${group.id}`;
            return (
              <section key={group.id} className="os-nav__group">
                <button
                  type="button"
                  className="os-nav__group-head"
                  data-nav-focusable="true"
                  aria-expanded={open}
                  aria-controls={contentId}
                  onClick={() => onToggleGroup?.(group.id)}
                >
                  <span className="os-nav__group-label">{group.label}</span>
                  <span
                    className={`os-nav__group-chevron${open ? " os-nav__group-chevron--open" : ""}`}
                    aria-hidden="true"
                  >
                    <OsIcon name="chevron-down" size={12} />
                  </span>
                </button>
                {open && (
                  <ul className="os-nav__items os-nav__items--grouped" id={contentId}>
                    {group.items.map((item) => (
                      <li key={item.id}>{renderItem(item)}</li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <ul className="os-nav__items">
          {(items ?? []).map((item) => (
            <li key={item.id}>{renderItem(item)}</li>
          ))}
        </ul>
      )}

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
