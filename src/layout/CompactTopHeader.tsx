import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { OsIcon, SearchInput } from "../design-system";
import "../styles/components.css";

export interface ShellUser {
  /** Display name — the canonical user is provided by the app, not hardcoded here. */
  name: string;
  /** Hebrew role line (e.g. מנכ"ל). */
  role: string;
  avatarUrl?: string;
}

export interface CompactTopHeaderProps {
  user: ShellUser;
  /** Quick-add (+). Absent ⇒ button disabled with honest title. */
  onQuickAdd?: () => void;
  /** Bell click. Absent ⇒ disabled. */
  onNotifications?: () => void;
  /** Real unread count — omit to hide the badge (never fake a count). */
  notificationsCount?: number;
  /** Mail click. Absent ⇒ disabled. */
  onMail?: () => void;
  mailCount?: number;
  /** Global search submit. */
  onSearch?: (query: string) => void;
  /** Called when the search box gains focus (opens the global search overlay). */
  onSearchOpen?: () => void;
  searchPlaceholder?: string;
  /** Extra inline-end actions slot. */
  actions?: ReactNode;
  className?: string;
}

function formatGregorian(d: Date): string {
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatHebrewDate(d: Date): string {
  try {
    return new Intl.DateTimeFormat("he-IL-u-ca-hebrew", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    // Hebrew calendar not supported in this runtime — show nothing rather than a wrong date
    return "";
  }
}

/**
 * CompactTopHeader — avatar + name/role, quick actions (+, bell w/ badge,
 * mail), global smart search with ⌘K hint, and a single Hebrew + Gregorian date.
 * S13.1: the decorative live clock was removed to calm the header. Dates are REAL.
 */
export function CompactTopHeader({
  user,
  onQuickAdd,
  onNotifications,
  notificationsCount,
  onMail,
  mailCount,
  onSearch,
  onSearchOpen,
  searchPlaceholder = "חיפוש חכם בכל המערכת…",
  actions,
  className = "",
}: CompactTopHeaderProps): ReactElement {
  const [now] = useState<Date>(() => new Date());
  const [query, setQuery] = useState("");

  const hebrewDate = formatHebrewDate(now);
  const initial = user.name.trim().charAt(0) || "?";

  return (
    <header className={`os-header ${className}`.trim()}>
      <div className="os-header__user">
        <span className="os-header__avatar" aria-hidden="true">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initial}
        </span>
        <span className="os-header__identity">
          <span className="os-header__name">{user.name}</span>
          <span className="os-header__role">{user.role}</span>
        </span>
      </div>

      <div className="os-header__actions">
        {/* Explicit mobile search control. The full-width inline search below is
            hidden at ≤640px (it cannot shrink under its own min-content); this
            button opens the SAME global search overlay, keyboard-accessible. */}
        <button
          type="button"
          className="os-header__iconbtn os-header__search-btn"
          onClick={onSearchOpen}
          disabled={!onSearchOpen}
          aria-label="חיפוש גלובלי"
          title="חיפוש גלובלי"
        >
          <OsIcon name="search" size={15} />
        </button>
        <button
          type="button"
          className="os-header__iconbtn"
          onClick={onQuickAdd}
          disabled={!onQuickAdd}
          aria-label="הוספה מהירה"
          title={onQuickAdd ? "הוספה מהירה" : "הוספה מהירה — יחובר בהמשך"}
        >
          <OsIcon name="plus" size={15} />
        </button>
        <button
          type="button"
          className="os-header__iconbtn"
          onClick={onNotifications}
          disabled={!onNotifications}
          aria-label={
            typeof notificationsCount === "number" ? `התראות (${notificationsCount})` : "התראות"
          }
          title={onNotifications ? "התראות" : "התראות — יחובר בהמשך"}
        >
          <OsIcon name="bell" size={15} />
          {typeof notificationsCount === "number" && notificationsCount > 0 && (
            <span className="os-header__count">{notificationsCount}</span>
          )}
        </button>
        {/* Mail is shown ONLY when actually wired — a perpetually-disabled control is
            clutter and notifications already covers inbound messages (S11.2-B). */}
        {onMail && (
          <button
            type="button"
            className="os-header__iconbtn"
            onClick={onMail}
            aria-label={typeof mailCount === "number" ? `הודעות (${mailCount})` : "הודעות"}
            title="הודעות"
          >
            <OsIcon name="mail" size={15} />
            {typeof mailCount === "number" && mailCount > 0 && (
              <span className="os-header__count">{mailCount}</span>
            )}
          </button>
        )}
        {actions}
      </div>

      <div className="os-header__search" onFocusCapture={onSearchOpen}>
        <SearchInput
          value={query}
          onChange={setQuery}
          onSubmit={onSearch}
          placeholder={searchPlaceholder}
          kbdHint="⌘K"
          ariaLabel="חיפוש גלובלי"
        />
      </div>

      <div className="os-header__meta">
        {hebrewDate && (
          <>
            <span>{hebrewDate}</span>
            <span className="os-header__sep" aria-hidden="true" />
          </>
        )}
        <span className="os-num">{formatGregorian(now)}</span>
      </div>
    </header>
  );
}
