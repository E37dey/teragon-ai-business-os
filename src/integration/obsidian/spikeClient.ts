// S14.1 Phase 0 — TERAGON-side DEVELOPMENT-ONLY diagnostic client for the Obsidian
// Vault Bridge transport spike. NOT wired into any product surface, navigation, or
// Memory behaviour. Read-only. The token is passed in by the caller (from the
// plugin's "Copy pairing token" command) and sent ONLY in the Authorization header
// — never in a URL/query string, never logged. Fail-closed: any transport error
// resolves to a typed "not connected" result.
export interface BridgeHealth {
  readonly ok: boolean;
  readonly version?: string;
}
export interface BridgeConnection {
  readonly connected: boolean;
  readonly vaultName?: string;
  readonly readonly?: boolean;
  readonly version?: string;
}
export interface BridgeNoteMeta {
  readonly path: string;
  readonly basename: string;
  readonly mtime: number | null;
}

export interface SpikeClientResult<T> {
  readonly ok: boolean;
  readonly status: number | "UNREACHABLE";
  readonly data?: T;
}

async function getJson<T>(url: string, token?: string): Promise<SpikeClientResult<T>> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, status: res.status, data: (await res.json()) as T };
  } catch {
    // fail-closed — a down/unreachable bridge is a clean "not connected", never a throw
    return { ok: false, status: "UNREACHABLE" };
  }
}

/** GET /health — generic, unauthenticated. */
export function checkHealth(bridgeUrl: string): Promise<SpikeClientResult<BridgeHealth>> {
  return getJson<BridgeHealth>(`${bridgeUrl}/health`);
}
/** GET /connection — authenticated read-only connection info. */
export function getConnection(bridgeUrl: string, token: string): Promise<SpikeClientResult<BridgeConnection>> {
  return getJson<BridgeConnection>(`${bridgeUrl}/connection`, token);
}
/** GET /notes — authenticated bounded metadata list. */
export function listNotes(
  bridgeUrl: string,
  token: string,
): Promise<SpikeClientResult<{ notes: BridgeNoteMeta[]; count: number; truncated: boolean }>> {
  return getJson(`${bridgeUrl}/notes`, token);
}
