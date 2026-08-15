// Router — all canonical routes. Module routes lazy-load their page from
// src/modules/** (stubs until the owning wave agent replaces them — agents
// never edit this file; see docs/INTEGRATION_QUEUE.md). Route objects are
// exported separately so tests can mount them with createMemoryRouter.
import { Suspense, lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";
import { createBrowserRouter, type RouteObject } from "react-router-dom";
import OsShell from "./OsShell";
import {
  AppTopLayout,
  LoginRoute,
  NotFoundPage,
  RoutedPlaceholder,
  TopLevelPresentation,
} from "./routerPages";
import { APP_ROUTES } from "./routes";
import { RouteAccessGuard } from "@/authorization/react";
import { RequireAuth } from "@/auth/RequireAuth";
const PortalWelcome = lazy(() => import("@/auth/PortalWelcome"));
import DesignShowcase from "@/design-system/showcase/DesignShowcase";

// Module page registry — path → lazy page (single place the shell learns about modules).
const MODULE_PAGES: Record<string, LazyExoticComponent<ComponentType>> = {
  "/": lazy(() => import("@/modules/command-center/CommandCenterPage")),
  "/crm": lazy(() => import("@/modules/crm/CrmPage")),
  "/customers": lazy(() => import("@/modules/customers/CustomersPage")),
  "/customers/:id": lazy(() => import("@/modules/customers/CustomerDetailPage")),
  "/contacts": lazy(() => import("@/modules/contacts/ContactsPage")),
  "/sales": lazy(() => import("@/modules/sales/SalesPage")),
  "/documents": lazy(() => import("@/modules/documents/DocumentsPage")),
  "/ai-workspace": lazy(() => import("@/modules/ai-workspace/AiWorkspacePage")),
  "/agents": lazy(() => import("@/modules/agents-ui/AgentsPage")),
  "/agents/collaboration": lazy(() => import("@/modules/agents-ui/AgentCollaborationPage")),
  "/automations": lazy(() => import("@/modules/automations/AutomationsPage")),
  "/memory": lazy(() => import("@/modules/memory/MemoryPage")),
  "/knowledge": lazy(() => import("@/modules/knowledge/KnowledgePage")),
  "/learning": lazy(() => import("@/modules/learning/LearningPage")),
  "/implementation": lazy(() => import("@/modules/implementation/ImplementationPage")),
  "/personas": lazy(() => import("@/modules/personas/PersonasPage")),
  "/stage-gates": lazy(() => import("@/modules/stage-gates/StageGatesPage")),
  "/training-materials": lazy(() => import("@/modules/training-materials/TrainingMaterialsPage")),
  "/quick-start": lazy(() => import("@/modules/quick-start/QuickStartPage")),
  "/faq": lazy(() => import("@/modules/faq/FaqPage")),
  "/submission": lazy(() => import("@/modules/submission/SubmissionPage")),
  "/analytics": lazy(() => import("@/modules/analytics/AnalyticsPage")),
  "/governance": lazy(() => import("@/modules/governance/GovernancePage")),
  "/administration": lazy(() => import("@/modules/administration/AdministrationPage")),
  "/system-health": lazy(() => import("@/modules/system-health/SystemHealthPage")),
  "/settings": lazy(() => import("@/modules/settings/SettingsPage")),
  "/courses": lazy(() => import("@/modules/courses/CoursesPage")),
  "/service": lazy(() => import("@/modules/service/ServicePage")),
  "/printers": lazy(() => import("@/modules/printers/PrintersPage")),
  "/organizations": lazy(() => import("@/modules/organizations/OrganizationsPage")),
  "/tasks": lazy(() => import("@/modules/tasks/TasksPage")),
  "/support": lazy(() => import("@/modules/support/SupportPage")),
};

function routeElement(path: string, title: string, wave: number) {
  const Page = MODULE_PAGES[path];
  const inner = Page ? (
    <Suspense fallback={<div className="os-route-loading" aria-busy="true" />}>
      <Page />
    </Suspense>
  ) : (
    <RoutedPlaceholder title={title} wave={wave} />
  );
  // vNext — LAYER (a) route access is now ENFORCED here: the effective decision
  // (canonical RBAC AND derived portal scope) gates every module route, so a
  // typed URL / deep link is denied for a role/portal that lacks it, not merely
  // hidden from the nav. Default role is sysadmin (full access) so existing
  // behaviour is unchanged.
  return <RouteAccessGuard path={path}>{inner}</RouteAccessGuard>;
}

export const appRouteObjects: RouteObject[] = [
  {
    // shared top layout: floating "חזרה למצגת" control renders app-wide (W7-F request #2)
    element: <AppTopLayout />,
    children: [
      // Presentation — TOP-LEVEL route outside OsShell for true full-screen (W7-F request #1)
      { path: "/submission/presentation", element: <TopLevelPresentation /> },
      // Public login route — standalone, never gated (prevents redirect loops).
      { path: "/login", element: <LoginRoute /> },
      // vNext — demo portal welcome / login entry (standalone, full-screen, open).
      {
        path: "/welcome",
        element: (
          <Suspense fallback={<div className="os-route-loading" aria-busy="true" />}>
            <PortalWelcome />
          </Suspense>
        ),
      },
      {
        path: "/",
        // Route protection: everything inside OsShell requires an authenticated
        // session in SUPABASE mode. In LOCAL mode RequireAuth is a pass-through.
        element: (
          <RequireAuth>
            <OsShell />
          </RequireAuth>
        ),
        children: [
          ...APP_ROUTES.filter((r) => r.path !== "/submission/presentation").map(
            (r): RouteObject => {
              const element = routeElement(r.path, r.title, r.wave);
              return r.path === "/" ? { index: true, element } : { path: r.path.slice(1), element };
            },
          ),
          { path: "*", element: <NotFoundPage /> },
        ],
      },
      // Design-system showcase — renders its own full AppShell, so it lives outside OsShell.
      { path: "/design", element: <DesignShowcase /> },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(appRouteObjects);
}
