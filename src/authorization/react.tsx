// TERAGON AI BUSINESS OS — React authorization components (Wave 9, W9-B).
//
// LAYER (a) — <RequirePermission>: a wrapper that gates any subtree on a
//   permission, reading the LIVE demo role. Denied ⇒ honest Hebrew access
//   state (never a blank screen, never a silent redirect that hides the block).
//
// Re-reads the demo role on every render (useCurrentRole), so a role switch
// re-evaluates immediately — no cached grant survives a switch. The action-hook
// usePermission() (LAYER b) lives in ./usePermission (no JSX) so this file stays
// components-only.
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { can } from "./matrix";
import {
  ACCESS_DENIED_SCREEN_HE,
  AUTHZ_DEMO_LABEL_HE,
  permissionRequirement,
  type Permission,
} from "./permissions";
import { useCurrentRole } from "./roleStore";

const deniedPanel: CSSProperties = {
  display: "grid",
  gap: "var(--os-space-2)",
  padding: "var(--os-space-6)",
  border: "1px solid var(--os-border)",
  borderRadius: "var(--os-radius-md, 10px)",
  background: "var(--os-raised, #0A1627)",
  color: "var(--os-text-2)",
  textAlign: "center",
};

/** The honest access-denied state — used as the default RequirePermission fallback. */
export function AccessDenied({ reasonHe }: { reasonHe?: string }): ReactElement {
  return (
    <div role="alert" data-testid="authz-access-denied" style={deniedPanel}>
      <div style={{ fontSize: "var(--os-text-lg, 17px)", fontWeight: 700, color: "var(--os-text)" }}>
        גישה חסומה
      </div>
      <div style={{ fontSize: "var(--os-text-sm, 13px)" }}>{reasonHe ?? ACCESS_DENIED_SCREEN_HE}</div>
      <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
        {AUTHZ_DEMO_LABEL_HE} — אין כאן מנגנון אימות אמיתי
      </div>
    </div>
  );
}

export interface RequirePermissionProps {
  permission: Permission;
  children: ReactNode;
  /** override the default AccessDenied state */
  fallback?: ReactNode;
}

/**
 * LAYER (a) wrapper. Renders `children` only when the LIVE demo role holds
 * `permission`; otherwise the honest access-denied state. URL navigation cannot
 * bypass this — the check runs on every render, not just on nav.
 */
export function RequirePermission({
  permission,
  children,
  fallback,
}: RequirePermissionProps): ReactElement {
  const role = useCurrentRole();
  if (can(role, permission)) return <>{children}</>;
  const req = permissionRequirement(permission);
  return (
    <>
      {fallback ?? (
        <AccessDenied
          reasonHe={`אין לך הרשאה «${req.labelHe}» לצפות במסך זה (${AUTHZ_DEMO_LABEL_HE})`}
        />
      )}
    </>
  );
}
