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
  | "CONFLICT" // 409 — note changed since preview (hash mismatch); do not overwrite
  | "EXISTS" // 409 — create target already exists
  | "TOO_LARGE" // 413 — request body over the bound
  | "WRITE_UNAUTHORIZED" // 403 — missing/invalid write capability (pairing token alone is insufficient)
  | "REJECTED" // 403 — the human rejected the write inside Obsidian
  | "EXPIRED" // 403 — the human did not confirm in Obsidian in time
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
  readonly writeEnabled?: boolean;
}
export interface WriteMeta {
  readonly mutationId: string;
  readonly correlationId: string;
}
export interface WriteResult {
  readonly applied: boolean;
  readonly op: string;
  readonly path: string;
  readonly hash: string;
  readonly idempotent?: boolean;
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

/** SHA-256 hex of a string — mirrors the plugin's `sha256` for conflict/verify. */
export async function sha256Hex(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** HMAC-SHA256 hex — mirrors the plugin's `hmacSha256` (write-capability MAC). */
async function hmacSha256Hex(key: string, msg: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// MUST match the plugin's writeCapabilityMessage byte-for-byte.
function writeCapabilityMessage(op: string, path: string, mutationId: string, contentHash: string, exp: number): string {
  return [op, path, mutationId, contentHash, String(exp)].join("\n");
}
const WRITE_CAP_TTL_MS = 5 * 60 * 1000; // capability lifetime (short-lived)

/** Mint a single-use write capability bound to exactly this op/path/mutation/content. */
async function mintCapability(writeKey: string, op: string, path: string, mutationId: string, contentHash: string): Promise<{ exp: number; capability: string }> {
  const exp = Date.now() + WRITE_CAP_TTL_MS;
  const capability = await hmacSha256Hex(writeKey, writeCapabilityMessage(op, path, mutationId, contentHash, exp));
  return { exp, capability };
}

/**
 * Single bounded POST to a WRITE capability endpoint. Never throws — fail-closed,
 * sanitized, typed. 409 is refined into CONFLICT vs EXISTS from the response body.
 */
// A staged write blocks on a human confirmation inside Obsidian — allow far longer.
const WRITE_STAGE_TIMEOUT_MS = 130_000;

function map403(error: string | undefined): BridgeErrorCode {
  if (error === "write_unauthorized") return "WRITE_UNAUTHORIZED";
  if (error === "write_rejected") return "REJECTED";
  if (error === "write_expired") return "EXPIRED";
  return "ORIGIN_REJECTED";
}

async function bridgePost<T>(path: string, token: string, body: unknown, baseUrl: string, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<BridgeResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(baseUrl + path, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = undefined;
    }
    if (res.status === 200) return { ok: true, code: "OK", status: 200, data: data as T };
    let code: BridgeErrorCode;
    if (res.status === 409) code = (data as { error?: string } | undefined)?.error === "already_exists" ? "EXISTS" : "CONFLICT";
    else if (res.status === 413) code = "TOO_LARGE";
    else if (res.status === 403) code = map403((data as { error?: string } | undefined)?.error);
    else code = mapStatus(res.status);
    return { ok: false, code, status: res.status, data: data as T };
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    return { ok: false, code: name === "AbortError" ? "TIMEOUT" : "UNAVAILABLE", status: null };
  } finally {
    clearTimeout(timer);
  }
}

// Each write requires BOTH the pairing token (connection) AND a write capability minted
// from the SEPARATE writeKey. The pairing token alone can never mutate the Vault.

// Each write STAGES an intent; the request blocks until a human approves/rejects it
// inside Obsidian (or it times out). The pairing token + capability get you to the
// human prompt; only the in-Obsidian decision can cause a mutation.

/** POST /write/create — stage a NEW Markdown note (fails EXISTS if present). */
export async function createNote(path: string, content: string, token: string, writeKey: string, meta: WriteMeta, baseUrl: string = OBSIDIAN_BRIDGE_URL): Promise<BridgeResult<WriteResult>> {
  const { exp, capability } = await mintCapability(writeKey, "create", path, meta.mutationId, await sha256Hex(content));
  return bridgePost<WriteResult>("/write/create", token, { mutationId: meta.mutationId, correlationId: meta.correlationId, path, content, exp, capability }, baseUrl, WRITE_STAGE_TIMEOUT_MS);
}

/** POST /write/update — stage an overwrite, guarded by expectedHash (conflict). */
export async function updateNote(path: string, content: string, expectedHash: string, token: string, writeKey: string, meta: WriteMeta, baseUrl: string = OBSIDIAN_BRIDGE_URL): Promise<BridgeResult<WriteResult>> {
  const { exp, capability } = await mintCapability(writeKey, "update", path, meta.mutationId, await sha256Hex(content));
  return bridgePost<WriteResult>("/write/update", token, { mutationId: meta.mutationId, correlationId: meta.correlationId, path, content, expectedHash, exp, capability }, baseUrl, WRITE_STAGE_TIMEOUT_MS);
}

/** POST /write/append — stage an append, guarded by expectedHash (conflict). */
export async function appendNote(path: string, block: string, expectedHash: string, token: string, writeKey: string, meta: WriteMeta, baseUrl: string = OBSIDIAN_BRIDGE_URL): Promise<BridgeResult<WriteResult>> {
  const { exp, capability } = await mintCapability(writeKey, "append", path, meta.mutationId, await sha256Hex(block));
  return bridgePost<WriteResult>("/write/append", token, { mutationId: meta.mutationId, correlationId: meta.correlationId, path, block, expectedHash, exp, capability }, baseUrl, WRITE_STAGE_TIMEOUT_MS);
}
