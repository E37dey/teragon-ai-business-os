// TERAGON vNext — portal route scope + the authoritative route-access decision.
//
// Effective route access = canonical RBAC AND portal scope:
//   canAccessRoute(role, path) = (routePermission(path)===null || can(role,perm))
//                                && portalAllowsRoute(portalForRole(role), path)
//
// • The canonical layer (routePermission + can) is the FLOOR — a role can never
//   reach a route it lacks the domain grant for.
// • The portal layer only ever FURTHER RESTRICTS to role-appropriate routes
//   (e.g. a broad read `viewer` can technically read /analytics, but the Student
//   portal does not include it). Because the portal is DERIVED from the trusted
//   canonical role (portalForRole), it can never grant access or escalate — it
//   only narrows the already-authorized set. This is enforced at the route guard
//   (RouteAccessGuard), so a typed URL / deep link is denied, not merely hidden.
import type { CanonicalRoleId } from "@/domain/administration";
import { can } from "./matrix";
import { routePermission } from "./routeGuard";
import { PORTALS, portalForRole, type Portal } from "./portals";

/** Routes each portal OFFERS. `manager` = all (the canonical floor does the
 *  trimming for a business manager: no administration/settings/health domain).
 *  Student/Technician are explicit least-privilege sets. */
const STUDENT_ROUTES: ReadonlySet<string> = new Set([
  "/",
  "/home",
  "/learning",
  "/knowledge",
  "/courses",
  "/tasks",
  "/training-materials",
  "/quick-start",
  "/faq",
  "/support",
  "/personas",
  "/implementation",
  "/stage-gates",
  "/submission",
]);

const TECHNICIAN_ROUTES: ReadonlySet<string> = new Set([
  "/",
  "/home",
  "/tasks",
  "/service",
  "/printers",
  "/customers",
  "/customers/:id",
  "/contacts",
  "/knowledge",
  "/ai-workspace",
  "/support",
  "/faq",
]);

/** Does this portal OFFER this route? manager → always; others → their set. */
export function portalAllowsRoute(portal: Portal, path: string): boolean {
  if (portal === "manager") return true;
  if (portal === "student") return STUDENT_ROUTES.has(path);
  return TECHNICIAN_ROUTES.has(path);
}

/** The single authoritative route-access decision (canonical AND portal). */
export function canAccessRoute(role: CanonicalRoleId, path: string): boolean {
  const req = routePermission(path);
  const canonicalOk = req === null || can(role, req);
  return canonicalOk && portalAllowsRoute(portalForRole(role), path);
}

/** All portals (for tests / UI). */
export const ALL_PORTALS = PORTALS;
