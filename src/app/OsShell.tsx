// OsShell — Wave 2 application shell: grouped RTL nav (+ live derived badges),
// global search, Ctrl+K command palette, notification center, quick-create and
// the responsive drawer variants. Owned by Architecture & Integration.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AppShell,
  LeftIntelligenceRail,
  RightPrimaryNavigation,
  type NavGroupSpec,
  type RenderNavLink,
} from "@/layout";
import { Drawer, OsIcon, ToastProvider } from "@/design-system";
import type { RankedSearchHit } from "@/domain/selectors";
import { CANONICAL_USER } from "./identity";
import { DomainNotConnectedGate } from "@/persistence/composition/DomainNotConnectedGate";
import { useAuth } from "@/auth/useAuth";
import { resolveShellUser } from "./shellAccount";
import { ShellLogoutButton } from "./ShellLogoutButton";
import { NAV_GROUPS, activeItemForPath, groupOfPath } from "./nav/navGroups";
import { useCurrentRole } from "@/authorization/roleStore";
import { canAccessRoute } from "@/authorization/portalRoutes";
import { useNavBadges } from "./nav/useNavBadges";
import { loadShellState, saveShellState, type ShellState } from "./shellState";
import { CommandPalette, type PaletteMode } from "./commands/CommandPalette";
import type { CommandContext } from "./commands/registry";
import { ShortcutsDialog } from "./commands/ShortcutsDialog";
import { NotificationsDrawer } from "./notifications/NotificationsDrawer";
import { useNotifications } from "./notifications/useNotifications";
import {
  QuickCreateHost,
  type QuickCreateKind,
  type QuickCreateState,
} from "./quick-create/QuickCreateHost";
import { RailProvider } from "./rail";
import { useRailContent, useRailHidden } from "./railContext";
import { ThemeSelect } from "@/theme/ThemeSelect";
import CopilotWorkspace from "@/modules/ai-copilot/CopilotWorkspace";
import { CopilotProvider } from "@/modules/ai-copilot/copilotContext";
import { useCopilot } from "@/modules/ai-copilot/copilotApi";
import { GlowOrb } from "@/design-system";

interface PaletteState {
  mode: PaletteMode;
  initialQuery: string;
}

// Product V2 rail policy (S13.1): NO permanent left rail by default. A rail is
// shown only for routes where it materially contributes an action/value — kept to
// Memory (import/export controls) and Agents (fleet + approvals cross-link). Every
// other page owns the full-width workspace. Pages may still opt out via
// HideShellRail; a published PageRail on a non-allowlisted route is simply not shown.
const RAIL_ALLOWLIST: ReadonlySet<string> = new Set([
  "/memory",
  "/agents",
  // The Coordination Room publishes the rail that carries the ONLY human controls
  // for a run: the conflict resolution actions, the canonical ApprovalPanel and the
  // run evidence. activeItemForPath returns the exact "/agents/collaboration" nav
  // path (not "/agents"), so without this entry the shell silently dropped that rail
  // and a visible conflict could not be resolved or approved from the UI.
  "/agents/collaboration",
  // /learning publishes ProposalReviewPanel — the ONLY approve / reject / rollback
  // controls for a learning rule (named-reviewer governed). Without this entry a
  // proposal could be seen but never approved or rolled back.
  "/learning",
]);

export default function OsShell(): ReactElement {
  return (
    <RailProvider>
      <CopilotProvider>
        <OsShellInner />
      </CopilotProvider>
    </RailProvider>
  );
}

/** Nav Copilot card — opens the real Copilot workspace (W5-D integration). */
function NavCopilotCard(): ReactElement {
  const { openCopilot } = useCopilot();
  return (
    <button
      type="button"
      onClick={openCopilot}
      className="os-copilot os-copilot--compact"
      aria-label="פתיחת AI Copilot"
      data-testid="shell-open-copilot"
    >
      {/* VC-B: compact, static AI marker — no permanently glowing/animated orb */}
      <GlowOrb size={24} accent="violet" animated={false} />
      <div className="os-copilot__labels">
        <span className="os-copilot__title">AI Copilot</span>
        <span className="os-copilot__sub">שאל כל דבר…</span>
      </div>
      <OsIcon name="chevron-forward" size={14} aria-hidden="true" />
    </button>
  );
}

function OsShellInner(): ReactElement {
  const location = useLocation();
  const navigate = useNavigate();

  // ── canonical identity (S9.1-B2) ── SUPABASE shows the real server-resolved
  // user (never the static CANONICAL_USER); LOCAL keeps the approved local user.
  const { mode, status, identity } = useAuth();
  const shellUser = resolveShellUser(mode, status, identity, CANONICAL_USER);

  // ── persisted shell state (nav groups + rail) ──
  const [shellState, setShellState] = useState<ShellState>(() => loadShellState());
  const updateShellState = useCallback((patch: Partial<ShellState>) => {
    setShellState((prev) => {
      const next = { ...prev, ...patch };
      saveShellState(next);
      return next;
    });
  }, []);

  const activeId = activeItemForPath(location.pathname);
  const activeGroupId = groupOfPath(location.pathname)?.id;

  // VC-B: only the active group is expanded by default; unrelated groups stay
  // collapsed. An explicit user toggle is persisted and overrides the default.
  const effectiveOpenGroups = useMemo(() => {
    const eff: Record<string, boolean> = {};
    for (const g of NAV_GROUPS) {
      const stored = shellState.openGroups[g.id];
      eff[g.id] = typeof stored === "boolean" ? stored : g.id === activeGroupId;
    }
    return eff;
  }, [shellState.openGroups, activeGroupId]);

  const toggleGroup = useCallback(
    (groupId: string) => {
      const open = effectiveOpenGroups[groupId] ?? false;
      updateShellState({ openGroups: { ...shellState.openGroups, [groupId]: !open } });
    },
    [effectiveOpenGroups, shellState.openGroups, updateShellState],
  );

  const toggleRail = useCallback(() => {
    updateShellState({ railCollapsed: !shellState.railCollapsed });
  }, [shellState.railCollapsed, updateShellState]);

  // ── derived badges ──
  const badges = useNavBadges();
  // vNext — capability/portal-aware nav: only the items the live role+portal may
  // access are OFFERED (same decision the route guard enforces, so nav and access
  // never disagree). Default operator = sysadmin/manager portal ⇒ full nav (RC2
  // behaviour unchanged); Student/Technician portals show their curated set.
  const role = useCurrentRole();
  const navGroups: readonly NavGroupSpec[] = useMemo(
    () =>
      NAV_GROUPS.map((g) => ({
        id: g.id,
        label: g.label,
        items: g.items
          .filter((item) => canAccessRoute(role, item.path))
          .map((item) => {
            const badge = badges[item.path];
            return {
              id: item.path,
              label: item.label,
              icon: item.icon,
              href: item.path,
              ...(typeof badge === "number" && badge > 0 ? { badge } : {}), // VC-B: hide zero badges
            };
          }),
      })).filter((g) => g.items.length > 0),
    [badges, role],
  );

  // ── overlays ──
  const [palette, setPalette] = useState<PaletteState | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null);
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const { unreadCount } = useNotifications();
  // A dense page may opt out of the shell rail (HideShellRail) for a full-width canvas.
  const railHidden = useRailHidden();
  // Product V2: render a permanent rail only for allowlisted routes that publish one.
  const pageRail = useRailContent();
  const showRail = !railHidden && RAIL_ALLOWLIST.has(activeId ?? "") && pageRail != null;

  // Ctrl+K / ⌘K — open (or close) the command palette
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => (p ? null : { mode: "commands", initialQuery: "" }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openQuickCreate = useCallback((kind: QuickCreateKind) => {
    setQuickCreate({ view: kind });
  }, []);

  const commandCtx: CommandContext = useMemo(
    () => ({
      navigate: (path) => void navigate(path),
      openQuickCreate,
      openSearch: () => setPalette({ mode: "search", initialQuery: "" }),
      toggleRail,
      openShortcuts: () => setShortcutsOpen(true),
      close: () => setPalette(null),
    }),
    [navigate, openQuickCreate, toggleRail],
  );

  const onOpenHit = useCallback(
    (hit: RankedSearchHit) => {
      setPalette(null);
      void navigate(hit.route);
    },
    [navigate],
  );

  const renderLink: RenderNavLink = useCallback(
    ({ item, content, className, active }) => (
      <Link
        key={item.id}
        to={item.href}
        className={className}
        data-nav-focusable="true"
        aria-current={active ? "page" : undefined}
        onClick={() => setNavDrawerOpen(false)}
      >
        {content}
      </Link>
    ),
    [],
  );

  return (
    <ToastProvider>
      <AppShell
        navGroups={navGroups}
        openGroups={effectiveOpenGroups}
        onToggleGroup={toggleGroup}
        activeNavId={activeId}
        activeRoute={location.pathname}
        user={shellUser}
        renderLink={renderLink}
        headerProps={{
          onQuickAdd: () => setQuickCreate({ view: "menu" }),
          onNotifications: () => setNotificationsOpen(true),
          ...(unreadCount > 0 ? { notificationsCount: unreadCount } : {}),
          onSearch: (query) => setPalette({ mode: "search", initialQuery: query }),
          onSearchOpen: () => setPalette({ mode: "search", initialQuery: "" }),
          actions: (
            <>
              <ThemeSelect />
              <ShellLogoutButton />
              <button
                type="button"
                className="os-header__iconbtn os-header__hamburger"
                aria-label="פתיחת תפריט הניווט"
                title="תפריט ניווט"
                onClick={() => setNavDrawerOpen(true)}
              >
                <OsIcon name="menu" size={15} />
              </button>
            </>
          ),
        }}
        copilotSlot={<NavCopilotCard />}
        railContent={
          showRail ? (
            <LeftIntelligenceRail
              title="לוח הקשר"
              collapsible
              collapsed={shellState.railCollapsed}
              onToggleCollapsed={toggleRail}
            >
              {pageRail}
            </LeftIntelligenceRail>
          ) : undefined
        }
      >
        {/* S9.1-B: in SUPABASE mode legacy IndexedDB-backed pages never mount —
            the central gate shows the Hebrew internal-preview notice instead. The
            shell chrome (nav/header) is preserved. LOCAL renders the page as before. */}
        <DomainNotConnectedGate>
          <Outlet />
        </DomainNotConnectedGate>
      </AppShell>

      {/* tablet: primary nav as an RTL drawer */}
      {navDrawerOpen && (
        <Drawer
          open
          onClose={() => setNavDrawerOpen(false)}
          title="ניווט"
          className="os-nav-drawer"
        >
          <RightPrimaryNavigation
            groups={navGroups}
            openGroups={effectiveOpenGroups}
            onToggleGroup={toggleGroup}
            activeId={activeId}
            renderLink={renderLink}
            className="os-nav--in-drawer"
          />
        </Drawer>
      )}

      {palette && (
        <CommandPalette
          mode={palette.mode}
          initialQuery={palette.initialQuery}
          ctx={commandCtx}
          onOpenHit={onOpenHit}
          onClose={() => setPalette(null)}
        />
      )}
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <NotificationsDrawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
      <QuickCreateHost
        state={quickCreate}
        onClose={() => setQuickCreate(null)}
        onSelectKind={(kind) => setQuickCreate({ view: kind })}
      />
      <CopilotWorkspace />
    </ToastProvider>
  );
}
