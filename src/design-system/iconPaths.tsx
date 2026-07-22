// Icon path registry — separated from icons.tsx so that file only exports components (fast-refresh).
import type { ReactNode } from "react";

export type IconName =
  | "home"
  | "users"
  | "briefcase"
  | "graduation"
  | "wrench"
  | "printer"
  | "building"
  | "check"
  | "x"
  | "clock"
  | "search"
  | "bell"
  | "mail"
  | "plus"
  | "chevron-down"
  | "chevron-forward"
  | "chevron-back"
  | "dot"
  | "brain"
  | "sparkle"
  | "shield"
  | "book"
  | "target"
  | "gauge"
  | "doc"
  | "gear"
  | "mic"
  | "network"
  | "memory"
  | "alert"
  | "inbox"
  | "send"
  | "bot"
  | "evidence";

export const PATHS: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.4 2.9-5.5 6.5-5.5s6.5 2.1 6.5 5.5" />
      <path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4" />
      <path d="M17.8 14.9c2.2.7 3.7 2.4 3.7 5.1" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7.5" width="18" height="13" rx="2" />
      <path d="M8.5 7.5V5.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2" />
      <path d="M3 12.5h18" />
    </>
  ),
  graduation: (
    <>
      <path d="M12 4 2 9l10 5 10-5-10-5z" />
      <path d="M6 11.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5" />
      <path d="M22 9v5" />
    </>
  ),
  wrench: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  ),
  printer: (
    <>
      <path d="M7 8V3h10v5" />
      <rect x="4" y="8" width="16" height="9" rx="2" />
      <path d="M7 14h10v7H7z" />
    </>
  ),
  building: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1" />
      <path d="M9 7h1.2M13.8 7H15M9 11h1.2M13.8 11H15M9 15h1.2M13.8 15H15" />
      <path d="M10.5 21v-3h3v3" />
    </>
  ),
  check: <path d="M4.5 12.5 10 18 19.5 7" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5 21 21" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9" />
      <path d="M10.3 20a2 2 0 0 0 3.4 0" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m3 8 9 6 9-6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  "chevron-down": <path d="m6 9.5 6 6 6-6" />,
  "chevron-forward": <path d="m14.5 6-6 6 6 6" />,
  "chevron-back": <path d="m9.5 6 6 6-6 6" />,
  dot: <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />,
  brain: (
    <>
      <path d="M9.5 3A2.5 2.5 0 0 0 7 5.5v.55A3.5 3.5 0 0 0 4 9.5c0 .74.23 1.43.62 2A3.5 3.5 0 0 0 4 13.5 3.5 3.5 0 0 0 7 17v.5a2.5 2.5 0 0 0 5 0v-12A2.5 2.5 0 0 0 9.5 3z" />
      <path d="M14.5 3A2.5 2.5 0 0 1 17 5.5v.55A3.5 3.5 0 0 1 20 9.5c0 .74-.23 1.43-.62 2 .39.57.62 1.26.62 2A3.5 3.5 0 0 1 17 17v.5a2.5 2.5 0 0 1-5 0v-12A2.5 2.5 0 0 1 14.5 3z" />
    </>
  ),
  sparkle: (
    <>
      <path d="M11 3l1.7 4.6L17.3 9.3 12.7 11 11 15.6 9.3 11 4.7 9.3 9.3 7.6 11 3z" />
      <path d="m18.5 14.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
    </>
  ),
  shield: <path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6l7-3z" />,
  book: (
    <>
      <path d="M2.5 5H9a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H2.5V5z" />
      <path d="M21.5 5H15a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h6.5V5z" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </>
  ),
  gauge: (
    <>
      <path d="M4 14.5a8 8 0 1 1 16 0" />
      <path d="M12 14.5 15.5 11" />
      <circle cx="12" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  doc: (
    <>
      <path d="M6 2.5h8l4 4V21.5H6V2.5z" />
      <path d="M14 2.5V7h4" />
      <path d="M9 12.5h6M9 16.5h6" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
    </>
  ),
  mic: (
    <>
      <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v4" />
    </>
  ),
  network: (
    <>
      <circle cx="12" cy="5.5" r="2.5" />
      <circle cx="5.5" cy="18" r="2.5" />
      <circle cx="18.5" cy="18" r="2.5" />
      <path d="M12 8v4M12 12l-5 4M12 12l5 4" />
    </>
  ),
  memory: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <rect x="9.5" y="9.5" width="5" height="5" />
      <path d="M9 6V3M15 6V3M9 21v-3M15 21v-3M6 9H3M6 15H3M21 9h-3M21 15h-3" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 22 20H2L12 3.5z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.2h.01" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12.5h-5.5l-2 3h-5l-2-3H2" />
      <path d="M5 4.5h14L22 12.5V18a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 18v-5.5L5 4.5z" />
    </>
  ),
  send: (
    <>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </>
  ),
  bot: (
    <>
      <rect x="4" y="8" width="16" height="11" rx="2" />
      <path d="M12 8V4.5" />
      <circle cx="12" cy="3.5" r="1" fill="currentColor" stroke="none" />
      <path d="M9 12.5v2M15 12.5v2" />
    </>
  ),
  evidence: (
    <>
      <path d="M6 2.5h8l4 4V21.5H6V2.5z" />
      <path d="M14 2.5V7h4" />
      <path d="m9 14 2 2 4-4" />
    </>
  ),
};

/** All available icon names (for showcase / tooling). */
export const ICON_NAMES: readonly IconName[] = Object.keys(PATHS) as IconName[];
