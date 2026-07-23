import type { ReactElement, ReactNode } from "react";
import {
  RightPrimaryNavigation,
  type NavGroupSpec,
  type NavItem,
  type RenderNavLink,
} from "./RightPrimaryNavigation";
import { CompactTopHeader, type CompactTopHeaderProps, type ShellUser } from "./CompactTopHeader";
import { MainOperationalWorkspace } from "./MainOperationalWorkspace";
import "../styles/components.css";

export interface AppShellProps {
  /** Primary navigation items (flat mode — used when navGroups is absent). */
  navItems?: readonly NavItem[];
  /** Grouped navigation (Wave 2) — overrides navItems when provided. */
  navGroups?: readonly NavGroupSpec[];
  /** group id → open? (controlled + persisted by the app shell). */
  openGroups?: Record<string, boolean>;
  onToggleGroup?: (groupId: string) => void;
  /**
   * Active route path — matched against NavItem.href (exact, then longest
   * prefix) to light the active item. Alternatively pass activeNavId.
   */
  activeRoute?: string;
  /** Explicit active nav id — overrides activeRoute matching. */
  activeNavId?: string;
  /** Canonical user — provided by the app (single source of identity). */
  user: ShellUser;
  /** Router bridge for nav links (react-router <Link>) — no router import here. */
  renderLink?: RenderNavLink;
  /** Fallback nav handler when renderLink is absent. */
  onNavigate?: (item: NavItem) => void;
  /** Left intelligence rail slot (screen-contextual). */
  railContent?: ReactNode;
  /** Header wiring (search, bell, mail, quick add, counts…). */
  headerProps?: Omit<CompactTopHeaderProps, "user">;
  /** Copilot ask handler (wired in a later wave). */
  onAsk?: (text: string) => void;
  /** Full replacement for the nav Copilot card (wired by the app). */
  copilotSlot?: ReactNode;
  /** Center canvas content (the routed page). */
  children?: ReactNode;
  className?: string;
}

function resolveActiveId(
  items: readonly NavItem[],
  activeNavId: string | undefined,
  activeRoute: string | undefined,
): string | undefined {
  if (activeNavId) return activeNavId;
  if (!activeRoute) return undefined;
  const exact = items.find((i) => i.href === activeRoute);
  if (exact) return exact.id;
  let best: NavItem | undefined;
  for (const item of items) {
    if (
      activeRoute.startsWith(item.href) &&
      (best === undefined || item.href.length > best.href.length)
    ) {
      best = item;
    }
  }
  return best?.id;
}

/**
 * AppShell — the canonical TERAGON OS frame (docs/VISUAL_DNA.md):
 * fixed right primary nav (~220px) · compact top header · center canvas ·
 * left intelligence rail. RTL, logical properties, dense 1920×1080.
 *
 * Router-free by contract: the Architect wires react-router via renderLink
 * and passes the routed page as children (replacing MinimalShell in Wave 2).
 */
export function AppShell({
  navItems,
  navGroups,
  openGroups,
  onToggleGroup,
  activeRoute,
  activeNavId,
  user,
  renderLink,
  onNavigate,
  railContent,
  headerProps,
  onAsk,
  copilotSlot,
  children,
  className = "",
}: AppShellProps): ReactElement {
  const flatItems: readonly NavItem[] = navGroups
    ? navGroups.flatMap((g) => g.items)
    : (navItems ?? []);
  const activeId = resolveActiveId(flatItems, activeNavId, activeRoute);

  return (
    <div className={`os-shell ${className}`.trim()}>
      <RightPrimaryNavigation
        items={navItems}
        groups={navGroups}
        openGroups={openGroups}
        onToggleGroup={onToggleGroup}
        activeId={activeId}
        renderLink={renderLink}
        onNavigate={onNavigate}
        onAsk={onAsk}
        copilotSlot={copilotSlot}
      />
      <div className="os-shell__main">
        <CompactTopHeader user={user} {...headerProps} />
        <MainOperationalWorkspace rail={railContent}>{children}</MainOperationalWorkspace>
      </div>
    </div>
  );
}
