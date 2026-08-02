// TERAGON AI BUSINESS OS — Gate S9.1: unconnected-domain UX + provider diagnostic.
//
// A CENTRAL route wrapper (mounted once, around the routed page) so that in
// SUPABASE mode the legacy IndexedDB-backed module pages NEVER mount — they can
// never call getRepository. Instead a clear Hebrew internal-preview notice is
// shown; mutation controls are absent; no local demo data is displayed; and an
// unconnected domain is never presented as an empty remote result. Route
// navigation (the shell chrome) is preserved. LOCAL mode renders children
// unchanged.
import type { ReactElement, ReactNode } from "react";
import { readSafeProvenance } from "@/runtime/provenance";
import { PERSISTENCE_PROVIDER } from "@/persistence/provider";
import { useDomainComposition } from "./DomainRepositoryProvider";

export function DomainNotConnectedNotice(): ReactElement {
  return (
    <div
      className="domain-not-connected"
      dir="rtl"
      lang="he"
      role="status"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--os-space-5)",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        minBlockSize: "60vh",
        padding: "var(--os-space-9)",
        color: "var(--os-text-secondary)",
        fontFamily: "var(--os-font)",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "var(--os-text-lg)", color: "var(--os-text-primary)" }}>
        תצוגה מקדימה פנימית
      </h1>
      <p style={{ margin: 0, maxInlineSize: "42ch", lineHeight: 1.6 }}>
        דומיין זה עדיין אינו מחובר לשרת (Supabase) במצב התצוגה המקדימה. הנתונים אינם
        נטענים מאחסון מקומי, ולא ניתן לבצע פעולות עריכה כאן עד שהחיבור יושלם.
      </p>
      <p style={{ margin: 0, fontSize: "var(--os-text-sm)", color: "var(--os-text-muted)" }}>
        DOMAIN_NOT_CONNECTED
      </p>
    </div>
  );
}

/**
 * Central gate. In SUPABASE mode every domain is not connected this checkpoint,
 * so the notice replaces the routed page content; otherwise children render.
 */
export function DomainNotConnectedGate({ children }: { children: ReactNode }): ReactElement {
  if (PERSISTENCE_PROVIDER === "SUPABASE") return <DomainNotConnectedNotice />;
  return <>{children}</>;
}

/** Dev-only SAFE provider diagnostic — no keys/tokens/sessions, masked ref only. */
export function ProviderDiagnostic(): ReactElement | null {
  const state = useDomainComposition();
  if (state.provider !== "SUPABASE") return null;
  const prov = readSafeProvenance();
  const repoImpl = "not-connected (Checkpoint A)";
  return (
    <div
      className="provider-diagnostic"
      dir="ltr"
      aria-hidden="true"
      style={{
        fontFamily: "var(--os-font-mono)",
        fontSize: "var(--os-text-2xs)",
        color: "var(--os-text-muted)",
        whiteSpace: "nowrap",
      }}
      title="provider diagnostic (safe metadata only)"
    >
      {`provider=${state.provider} · ${state.sessionActive ? "authed" : "no-session"} · ref ${prov.supabaseRefMasked || "-"} · org ${state.identity?.organizationId ?? "-"} · repo=${repoImpl}`}
    </div>
  );
}
