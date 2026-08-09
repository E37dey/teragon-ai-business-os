// S14.2 Phase 1 — TERAGON → Obsidian Vault Bridge READ-ONLY adapter (production).
//
// Bounded capability adapter over the loopback bridge running INSIDE Obsidian
// Desktop. Read-only. Fixed endpoints only (no arbitrary URLs / endpoints).
//
// Guarantees:
//  - fixed loopback base URL (127.0.0.1:5200) — never user-supplied
//  - GET only; there is NO write method on this adapter
//  - Bearer token in the Authorization header only (never a URL/query)
//  - per-request timeout via AbortController; NO retry loops, NO polling
//  - bounded result counts; sanitized, typed errors; fail closed on any fault
//
// Origin enforcement stays PLUGIN-SIDE (the bridge rejects unexpected Origins).

export const OBSIDIAN_BRIDGE_URL = "http://127.0.0.1:5200";
const REQUEST_TIMEOUT_MS = 4000;
const MAX_NOTES = 200;
const MAX_SEARCH_RESULTS = 50;
const MAX_QUERY_LEN = 200;

export type BridgeErrorCode =
  | "UNAVAILABLE" // connection refused / network fault (Obsidian closed OR bridge plugin disabled)
  | "TIMEOUT" // request exceeded the timeout budget
  | "UNAUTHORIZED" // 401 — missing/expired token → reconnect required
  | "ORIGIN_REJECTED" // 403 — origin/security rejection
  | "NOT_FOUND" // 404 — note/route not present
  | "BAD_REQUEST" // 400 — rejected path/query
  | "ERROR"; // any other unexpected condition

export type BridgeCode = "OK" | BridgeErrorCode;

export interface BridgeResult<T> {
  readonly ok: boolean;
  readonly code: BridgeCode;
  readonly status: number | null; // HTTP status, or null when there was no response
  readonly data?: T;
}

export interface ConnectionInfo {
  readonly connected: boolean;
  readonly vaultName: string;
  readonly version: string;
  readonly readonly: boolean;
}
export interface NoteMeta {
  readonly path: string;
  readonly basename: string;
  readonly mtime: number | null;
}
export interface NoteListResult {
  readonly notes: NoteMeta[];
  readonly count: number;
  readonly truncated: boolean;
}
export interface SearchHit {
  readonly path: string;
  readonly basename: string;
  readonly snippet: string;
  readonly mtime: number | null;
}
export interface SearchResult {
  readonly results: SearchHit[];
  readonly count: number;
  readonly truncated: boolean;
}
export interface NoteContent {
  readonly path: string;
  readonly basename: string;
  readonly frontmatter: Record<string, unknown> | null;
  readonly mtime: number | null;
  readonly content: string;
  readonly truncated: boolean;
}

function mapStatus(status: number): BridgeErrorCode {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "ORIGIN_REJECTED";
  if (status === 404) return "NOT_FOUND";
  if (status === 400) return "BAD_REQUEST";
  return "ERROR";
}

/**
 * Single bounded GET. Never throws — always resolves to a typed, sanitized
 * result. A down/blocked bridge is a clean fail-closed result, not an exception.
 */
async function bridgeGet<T>(path: string, token: string | null, baseUrl: string): Promise<BridgeResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(baseUrl + path, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
    if (res.status === 200) {
      try {
        const data = (await res.json()) as T;
        return { ok: true, code: "OK", status: 200, data };
      } catch {
        return { ok: false, code: "ERROR", status: 200 };
      }
    }
    return { ok: false, code: mapStatus(res.status), status: res.status };
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    return { ok: false, code: name === "AbortError" ? "TIMEOUT" : "UNAVAILABLE", status: null };
  } finally {
    clearTimeout(timer);
  }
}

/** GET /health — unauthenticated reachability probe (no vault content). */
export function probeHealth(baseUrl: string = OBSIDIAN_BRIDGE_URL): Promise<BridgeResult<{ ok: boolean; version?: string }>> {
  return bridgeGet<{ ok: boolean; version?: string }>("/health", null, baseUrl);
}

/** GET /connection — authenticated read-only connection info. */
export function getConnectionInfo(token: string, baseUrl: string = OBSIDIAN_BRIDGE_URL): Promise<BridgeResult<ConnectionInfo>> {
  return bridgeGet<ConnectionInfo>("/connection", token, baseUrl);
}

/** GET /notes — authenticated bounded note-metadata list. */
export async function listNotes(token: string, baseUrl: string = OBSIDIAN_BRIDGE_URL): Promise<BridgeResult<NoteListResult>> {
  const r = await bridgeGet<NoteListResult>("/notes", token, baseUrl);
  if (r.ok && r.data && r.data.notes.length > MAX_NOTES) {
    return { ...r, data: { ...r.data, notes: r.data.notes.slice(0, MAX_NOTES), truncated: true } };
  }
  return r;
}

/** GET /search/<query> — authenticated bounded local search. Empty query → empty result. */
export async function searchNotes(query: string, token: string, baseUrl: string = OBSIDIAN_BRIDGE_URL): Promise<BridgeResult<SearchResult>> {
  const q = query.trim();
  if (!q) return { ok: true, code: "OK", status: 200, data: { results: [], count: 0, truncated: false } };
  const enc = encodeURIComponent(q.slice(0, MAX_QUERY_LEN));
  const r = await bridgeGet<SearchResult>(`/search/${enc}`, token, baseUrl);
  if (r.ok && r.data && r.data.results.length > MAX_SEARCH_RESULTS) {
    return { ...r, data: { ...r.data, results: r.data.results.slice(0, MAX_SEARCH_RESULTS), truncated: true } };
  }
  return r;
}

/** GET /note/<vault-relative-path> — authenticated bounded single-note read. */
export function readNote(path: string, token: string, baseUrl: string = OBSIDIAN_BRIDGE_URL): Promise<BridgeResult<NoteContent>> {
  const enc = encodeURIComponent(path);
  return bridgeGet<NoteContent>(`/note/${enc}`, token, baseUrl);
}

/**
 * Open a note in the Obsidian desktop app via the OFFICIAL obsidian:// URI.
 * Navigation only — carries no token or sensitive data. Not a bridge request.
 */
export function openInObsidian(vaultName: string, path?: string): void {
  let uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}`;
  if (path) uri += `&file=${encodeURIComponent(path)}`;
  if (typeof window !== "undefined") window.open(uri, "_self");
}
