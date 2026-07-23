// TERAGON AI BUSINESS OS — LAYER (a): route access (Wave 9, W9-B).
//
// routeGuard(route, role) is AUTHORITATIVE: URL navigation cannot bypass it,
// because the <RequirePermission> wrapper (react.tsx) consults exactly this
// table on every render regardless of how the route was reached (nav click,
// typed URL, back/forward, deep link). A route with `null` requirement is open
// to every role (dashboards, adoption/help content) — the actions INSIDE such
// screens are still gated at layer (b)/(c).
import { APP_ROUTES } from "@/app/routes";
import type { CanonicalRoleId } from "@/domain/administration";
import { can } from "./matrix";
import type { Permission } from "./permissions";

/**
 * Route path → permission required to VIEW the screen (null = open to all
 * roles). Keyed by the canonical `path` in src/app/routes.ts (all 31 routes
 * are represented — verified by a test that asserts full coverage).
 */
export const ROUTE_PERMISSIONS: Readonly<Record<string, Permission | null>> = Object.freeze({
  "/": null,
  "/crm": "customer.read",
  "/customers": "customer.read",
  "/customers/:id": "customer.read",
  "/sales": "sales.read",
  "/courses": null,
  "/service": "service.read",
  "/printers": "service.read",
  "/organizations": "customer.read",
  "/tasks": null,
  "/documents": "sales.read",
  "/automations": null,
  "/agents": null,
  "/agents/collaboration": null,
  "/memory": null,
  "/knowledge": null,
  "/learning": null,
  "/analytics": null,
  "/governance": "governance.review",
  "/implementation": null,
  "/personas": null,
  "/stage-gates": null,
  "/training-materials": null,
  "/quick-start": null,
  "/faq": null,
  "/support": null,
  "/administration": "user.manage",
  "/system-health": "health.diagnostics",
  "/settings": "settings.update",
  "/submission": null,
  "/submission/presentation": null,
});

/** The permission that gates a route path, or null when it is open to all. */
export function routePermission(routePath: string): Permission | null {
  return ROUTE_PERMISSIONS[routePath] ?? null;
}

export interface RouteVerdict {
  allowed: boolean;
  /** the gating permission, or null when the route is open */
  permission: Permission | null;
}

/**
 * AUTHORITATIVE route decision. Unknown routes default to DENIED (fail-closed):
 * a route that is not in the table cannot be reached by guessing its URL.
 */
export function routeGuard(routePath: string, role: CanonicalRoleId): RouteVerdict {
  const known = Object.prototype.hasOwnProperty.call(ROUTE_PERMISSIONS, routePath);
  if (!known) return { allowed: false, permission: null };
  const permission = ROUTE_PERMISSIONS[routePath] ?? null;
  if (permission === null) return { allowed: true, permission: null };
  return { allowed: can(role, permission), permission };
}

/** All canonical route paths — used by the coverage test. */
export const GUARDED_ROUTE_PATHS: readonly string[] = APP_ROUTES.map((r) => r.path);
