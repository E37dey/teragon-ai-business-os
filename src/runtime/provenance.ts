// TERAGON AI BUSINESS OS — Gate S7.3B-PREP: SAFE Preview runtime provenance.
//
// Exposes ONLY non-sensitive public runtime metadata so an acceptance harness
// can verify what build it is driving BEFORE it logs in or writes anything:
//   * the resolved persistence provider (LOCAL_INDEXEDDB | SUPABASE)
//   * a MASKED Supabase project ref (never the full URL/host, key, or token)
//   * the git commit the build was made from
//   * the Business-Graph + AI feature-flag states (must be OFF)
//   * the auth implementation id
//
// It NEVER exposes a key, token, session, service_role, db credential, admin
// credential, or the publishable-key value. Published on `window.__TERAGON_
// RUNTIME__` and as `data-teragon-*` attributes on <html>.
import { BUSINESS_GRAPH_APPLICATION_FACADE_ENABLED } from "@/graph/application/flag";
import { BUSINESS_GRAPH_OPERATOR_AUTH_ENABLED } from "@/graph/auth/flag";
import { PERSISTENCE_PROVIDER } from "@/persistence/provider";

export interface SafeRuntimeProvenance {
  readonly provider: "LOCAL_INDEXEDDB" | "SUPABASE";
  /** Masked project ref (e.g. "bjvi…azjj") — never the full host, url, or key. */
  readonly supabaseRefMasked: string;
  readonly commit: string;
  readonly graphFacadeEnabled: boolean;
  readonly graphOperatorAuthEnabled: boolean;
  readonly aiRemoteEnabled: boolean;
  readonly authImpl: "supabase-auth-boundary" | "local-operator";
}

/** Extract + mask the project ref from a Supabase URL. Empty when not applicable. */
export function maskSupabaseRef(url: string): string {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url);
  if (!m || !m[1]) return "";
  const ref = m[1];
  return ref.length <= 8 ? ref : `${ref.slice(0, 4)}…${ref.slice(-4)}`;
}

export function readSafeProvenance(): SafeRuntimeProvenance {
  const url = import.meta.env.VITE_SUPABASE_URL ?? "";
  const supabase = PERSISTENCE_PROVIDER === "SUPABASE";
  // AI is server-gated (AI_REMOTE_ENABLED). Only a truthy browser mirror could
  // ever turn it on in the client; default OFF.
  const aiRemoteEnabled =
    (import.meta.env.VITE_AI_REMOTE_ENABLED ?? "").toString().toLowerCase() === "true";
  return {
    provider: PERSISTENCE_PROVIDER,
    supabaseRefMasked: supabase ? maskSupabaseRef(url) : "",
    commit: import.meta.env.VITE_BUILD_COMMIT ?? "",
    graphFacadeEnabled: BUSINESS_GRAPH_APPLICATION_FACADE_ENABLED,
    graphOperatorAuthEnabled: BUSINESS_GRAPH_OPERATOR_AUTH_ENABLED,
    aiRemoteEnabled,
    authImpl: supabase ? "supabase-auth-boundary" : "local-operator",
  };
}

/** Publish the safe provenance to `window` + <html> data attributes. Never throws. */
export function installProvenance(): void {
  try {
    const p = readSafeProvenance();
    (globalThis as { __TERAGON_RUNTIME__?: SafeRuntimeProvenance }).__TERAGON_RUNTIME__ = p;
    const el = document.documentElement;
    el.setAttribute("data-teragon-provider", p.provider);
    el.setAttribute("data-teragon-commit", p.commit);
    el.setAttribute("data-teragon-ref", p.supabaseRefMasked);
    el.setAttribute("data-teragon-auth", p.authImpl);
  } catch {
    /* provenance is diagnostic only — never block the app */
  }
}
