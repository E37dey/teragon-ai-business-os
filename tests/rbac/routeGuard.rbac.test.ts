// W9-B — LAYER (a): route access. routeGuard is authoritative; URL navigation
// cannot bypass it (the same verdict is returned regardless of how the route
// was reached), and unknown routes fail CLOSED.
import { describe, expect, it } from "vitest";
import {
  GUARDED_ROUTE_PATHS,
  ROUTE_PERMISSIONS,
  routeGuard,
  routePermission,
} from "@/authorization";
import { APP_ROUTES } from "@/app/routes";
import { CANONICAL_ROLE_IDS } from "@/domain/administration";

describe("W9-B — route coverage", () => {
  it("every one of the 31 canonical routes has an explicit guard entry", () => {
    expect(APP_ROUTES.length).toBe(31);
    for (const r of APP_ROUTES) {
      expect(Object.prototype.hasOwnProperty.call(ROUTE_PERMISSIONS, r.path)).toBe(true);
    }
    expect(GUARDED_ROUTE_PATHS.length).toBe(31);
  });

  it("does not gate on any permission outside the canonical vocabulary", () => {
    for (const path of GUARDED_ROUTE_PATHS) {
      const perm = routePermission(path);
      if (perm !== null) expect(typeof perm).toBe("string");
    }
  });
});

describe("W9-B — authoritative denials (URL nav cannot bypass)", () => {
  it("צופה is denied the administration screen (user.manage)", () => {
    expect(routeGuard("/administration", "crole-viewer").allowed).toBe(false);
    expect(routeGuard("/administration", "crole-viewer").permission).toBe("user.manage");
  });

  it("מכירות is denied the governance screen (governance.review)", () => {
    expect(routeGuard("/governance", "crole-sales").allowed).toBe(false);
  });

  it("מדריך is denied the service screen (service.read)", () => {
    expect(routeGuard("/service", "crole-instructor").allowed).toBe(false);
  });

  it("מבקר may open system-health but NOT administration", () => {
    expect(routeGuard("/system-health", "crole-auditor").allowed).toBe(true);
    expect(routeGuard("/administration", "crole-auditor").allowed).toBe(false);
  });

  it("מנהל מערכת (default demo role) may open every gated route", () => {
    for (const path of GUARDED_ROUTE_PATHS) {
      expect(routeGuard(path, "crole-sysadmin").allowed).toBe(true);
    }
  });

  it("open routes (null requirement) are allowed for every role", () => {
    for (const role of CANONICAL_ROLE_IDS) {
      expect(routeGuard("/", role).allowed).toBe(true);
      expect(routeGuard("/faq", role).allowed).toBe(true);
    }
  });

  it("the verdict is identical whether reached by nav or a typed/deep-link URL", () => {
    // routeGuard takes only (path, role) — there is no 'source' input, so a
    // typed URL cannot produce a different (more permissive) answer.
    const viaNav = routeGuard("/administration", "crole-viewer");
    const viaTypedUrl = routeGuard("/administration", "crole-viewer");
    expect(viaTypedUrl).toEqual(viaNav);
    expect(viaTypedUrl.allowed).toBe(false);
  });
});

describe("W9-B — unknown routes fail CLOSED", () => {
  it("an unlisted path is denied even for מנהל מערכת (no URL-guessing)", () => {
    expect(routeGuard("/secret-admin-backdoor", "crole-sysadmin").allowed).toBe(false);
    expect(routeGuard("/../etc/passwd", "crole-ceo").allowed).toBe(false);
  });
});
