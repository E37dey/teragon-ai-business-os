// TERAGON AI BUSINESS OS — Gate S10.0-D: safe Supabase + RLS health probes.
// =============================================================================
// Two READ-ONLY checks that extend the existing health engine:
//   * supabase-reachability — is the remote configured and answering at all?
//   * supabase-rls-read     — can the CURRENT authenticated session actually
//                             read a connected domain through RLS?
//
// HARD rules:
//   * Browser-safe publishable/anon key + the current session ONLY. The
//     service-role key is server-only and is never imported, read or exposed
//     here (this module lives in src/ and IS bundled).
//   * ZERO mutation: no insert/update/delete, no fixture, no schema change.
//     The RLS probe is a bounded `select ... limit 1`.
//   * An EMPTY result is HEALTHY. "No rows visible" means the request
//     succeeded and RLS returned nothing — that is a working read path, not a
//     failure, and treating it as one would make an empty tenant look broken.
//   * The result exposes ONLY: id, state, timestamp, optional safe code, and a
//     correlationId. Never a URL, query, row, id, message, session or header.
//   * A probe NEVER throws: a thrown dependency is contained and reported as a
//     state. Health checking must not be able to break the app it observes.
import { reportError } from "@/observability/errorSink";
import { newCorrelationId } from "@/observability/domainEvents";

/** Provider-neutral probe states. */
export type SupabaseProbeState =
  | "healthy"
  | "degraded"
  | "unavailable"
  | "unauthorized"
  | "misconfigured";

export type SupabaseProbeId = "supabase-reachability" | "supabase-rls-read";

/** The ONLY shape a probe returns. */
export interface SupabaseProbeResult {
  readonly id: SupabaseProbeId;
  readonly state: SupabaseProbeState;
  readonly timestamp: string;
  /** A short, non-free-text safe code (e.g. "not_configured", "http_503"). */
  readonly code?: string;
  readonly correlationId: string;
}

/** Injectable IO seam — tests mock this entirely; no network in unit tests. */
export interface SupabaseProbeEnv {
  /** true when the PUBLIC url + anon key are both present in the build. */
  isConfigured: () => boolean;
  /**
   * A minimal reachability call using the anon key. Resolves to an HTTP status;
   * rejects on a transport failure.
   */
  reach: () => Promise<number>;
  /**
   * A bounded, RLS-governed read on a connected domain using the CURRENT
   * session. `rowCount` may be 0 — that is healthy. `errorCode` carries a safe
   * PostgREST/Postgres code when the request itself failed.
   */
  rlsRead: () => Promise<{ rowCount: number; errorCode?: string }>;
  now: () => string;
}

/** Postgres/PostgREST codes that mean "refused", not "broken". */
const DENIAL_CODES = new Set(["42501", "PGRST301", "PGRST302", "unauthorized"]);

function result(
  id: SupabaseProbeId,
  state: SupabaseProbeState,
  now: string,
  correlationId: string,
  code?: string,
): SupabaseProbeResult {
  // Report only NON-healthy outcomes: a per-probe success event would be noise
  // and, at interval, a traffic signal.
  if (state !== "healthy") {
    reportError({
      kind: state === "unauthorized" ? "domain_read_denied" : "domain_read_failed",
      code: code ?? state,
      domain: id,
      correlationId,
    });
  }
  return code ? { id, state, timestamp: now, code, correlationId } : { id, state, timestamp: now, correlationId };
}

/** Is the remote configured and answering? Read-only, unauthenticated-safe. */
export async function probeSupabaseReachability(env: SupabaseProbeEnv): Promise<SupabaseProbeResult> {
  const correlationId = newCorrelationId();
  const id: SupabaseProbeId = "supabase-reachability";
  try {
    if (!env.isConfigured()) return result(id, "misconfigured", env.now(), correlationId, "not_configured");
    const status = await env.reach();
    if (status >= 200 && status < 300) return result(id, "healthy", env.now(), correlationId);
    if (status === 401 || status === 403) return result(id, "unauthorized", env.now(), correlationId, `http_${status}`);
    if (status >= 500) return result(id, "unavailable", env.now(), correlationId, `http_${status}`);
    return result(id, "degraded", env.now(), correlationId, `http_${status}`);
  } catch {
    // Contained: a transport failure or a throwing dependency is a state.
    return result(id, "unavailable", env.now(), correlationId, "transport_failed");
  }
}

/** Can the CURRENT session read a connected domain through RLS? */
export async function probeSupabaseRlsRead(env: SupabaseProbeEnv): Promise<SupabaseProbeResult> {
  const correlationId = newCorrelationId();
  const id: SupabaseProbeId = "supabase-rls-read";
  try {
    if (!env.isConfigured()) return result(id, "misconfigured", env.now(), correlationId, "not_configured");
    const res = await env.rlsRead();
    if (res.errorCode) {
      const code = String(res.errorCode);
      if (DENIAL_CODES.has(code)) return result(id, "unauthorized", env.now(), correlationId, code);
      return result(id, "degraded", env.now(), correlationId, code);
    }
    // rowCount 0 is HEALTHY — the request succeeded and RLS returned nothing.
    return result(id, "healthy", env.now(), correlationId);
  } catch {
    return result(id, "unavailable", env.now(), correlationId, "transport_failed");
  }
}

/** Run both probes. Never throws. */
export async function runSupabaseProbes(env: SupabaseProbeEnv): Promise<SupabaseProbeResult[]> {
  return [await probeSupabaseReachability(env), await probeSupabaseRlsRead(env)];
}
