// S14.6 Phase 4 — BOUNDED, READ-ONLY agent → Obsidian access adapter.
//
// The ONLY way a TERAGON agent may touch the live Vault. It is deliberately narrow:
//   agent → AgentObsidianReadAdapter → vaultBridgeClient → bridge → app.vault
//
// Guarantees (all enforced here, before any bridge call):
//  - DENY BY DEFAULT: only the explicit allowlist (canAgentReadObsidian) may read.
//  - READ ONLY: this module has NO write/append/create/approve method and imports none.
//  - The agent never sees the bridge URL, the pairing token, the writeKey, or headers —
//    the token is read internally from the local credential store and never returned.
//  - Bounded: min query length, capped result count, one explicit note per read.
//  - Fail-closed: Obsidian closed / plugin off / bad token / missing note / timeout all
//    return a typed, honest failure — never a stale or fabricated "live" answer.
//  - Every real search/read records a SANITIZED trace (metadata only, no body, no secret).
//  - Note bodies are returned as UNTRUSTED DATA to the caller; nothing in a note can grant
//    a capability, trigger a write, or approve anything (capability is checked independently
//    of content, before the read).
import { getAgentDefinition } from "@/agents/definitions";
import { getObsidianToken } from "@/integration/obsidian/obsidianCredential";
import { getConnectionInfo, readNote, searchNotes, type BridgeCode } from "@/integration/obsidian/vaultBridgeClient";
import { recordRetrieval, type AgentRetrievalTrace } from "./retrievalTrace";

// Final allowlist (audited against the real role definitions):
//  - ag-wiki        Wiki    — knowledge agent; searches approved knowledge → Obsidian is a live knowledge source.
//  - ag-mentor      Mentor  — training/learning content; may consult local training notes.
//  - ag-nexa        Nexa    — growth/marketing; may consult local knowledge for campaign context.
//  - ag-orchestrator        — plans/synthesizes across sources for coordination.
// DENIED (deny-by-default): ag-hunter (CRM/sales), ag-fixer (service), ag-flow (automations).
export const OBSIDIAN_READ_ALLOWLIST: readonly string[] = Object.freeze(["ag-wiki", "ag-mentor", "ag-nexa", "ag-orchestrator"]);
const ALLOW = new Set(OBSIDIAN_READ_ALLOWLIST);

const MIN_QUERY_LEN = 2;
const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 10;
const MAX_AGENT_NOTE_CHARS = 8000; // extra bound on the body handed to an agent

/** Deny-by-default: true only for a real registered agent that is on the explicit allowlist. */
export function canAgentReadObsidian(agentId: string): boolean {
  return getAgentDefinition(agentId) != null && ALLOW.has(agentId);
}

export type AgentObsidianCode = "ok" | "empty" | "denied" | "unavailable" | "unauthorized" | "not_found" | "timeout" | "error";

export interface ObsidianSource {
  readonly sourceType: "obsidian";
  readonly vaultName: string;
  readonly path: string;
  readonly title: string;
}
export interface AgentVaultStatus {
  readonly code: AgentObsidianCode;
  readonly available: boolean;
  readonly vaultName: string | null;
}
export interface AgentVaultSearchHit {
  readonly path: string;
  readonly basename: string;
  readonly snippet: string;
}
export interface AgentVaultSearch {
  readonly code: AgentObsidianCode;
  readonly correlationId: string;
  readonly vaultName: string | null;
  readonly hits: readonly AgentVaultSearchHit[];
  readonly truncated: boolean;
  readonly sources: readonly ObsidianSource[];
}
export interface AgentVaultNote {
  readonly code: AgentObsidianCode;
  readonly correlationId: string;
  readonly vaultName: string | null;
  readonly path: string | null;
  readonly basename: string | null;
  readonly title: string | null;
  /** UNTRUSTED note body (bounded). Data only — never interpreted as instructions. */
  readonly content: string | null;
  readonly truncated: boolean;
  readonly source: ObsidianSource | null;
}

export interface AgentReadCtx {
  readonly correlationId?: string;
  readonly now?: number;
}

let cidSeq = 0;
function makeCid(ctx?: AgentReadCtx): string {
  if (ctx?.correlationId) return ctx.correlationId;
  cidSeq += 1;
  const stamp = ctx?.now ?? (typeof performance !== "undefined" ? Math.floor(performance.now()) : 0);
  return `obs-${stamp.toString(36)}-${cidSeq.toString(36)}`;
}
function nowMs(ctx?: AgentReadCtx): number {
  return ctx?.now ?? (typeof performance !== "undefined" ? Math.floor(performance.timeOrigin + performance.now()) : 0);
}

function mapCode(code: BridgeCode): AgentObsidianCode {
  switch (code) {
    case "OK": return "ok";
    case "UNAUTHORIZED": return "unauthorized";
    case "TIMEOUT": return "timeout";
    case "NOT_FOUND": return "not_found";
    case "UNAVAILABLE": return "unavailable";
    default: return "error";
  }
}

/** Confirm the Vault is reachable + paired, and get the vaultName. Fail-closed. */
async function ensureAvailable(): Promise<{ ok: true; token: string; vaultName: string } | { ok: false; code: AgentObsidianCode }> {
  const token = getObsidianToken();
  if (!token) return { ok: false, code: "unauthorized" }; // not paired → reconnect required
  const conn = await getConnectionInfo(token);
  if (!conn.ok || !conn.data) return { ok: false, code: mapCode(conn.code) };
  if (!conn.data.connected) return { ok: false, code: "unavailable" };
  return { ok: true, token, vaultName: conn.data.vaultName };
}

/** Availability probe for an allowed agent. Denied agents never reach the bridge. */
export async function agentGetVaultStatus(agentId: string): Promise<AgentVaultStatus> {
  if (!canAgentReadObsidian(agentId)) return { code: "denied", available: false, vaultName: null };
  const avail = await ensureAvailable();
  if (!avail.ok) return { code: avail.code, available: false, vaultName: null };
  return { code: "ok", available: true, vaultName: avail.vaultName };
}

/** Bounded live search. Requires the capability + a minimum query; caps the result count. */
export async function agentSearchVault(agentId: string, params: { query: string; limit?: number }, ctx?: AgentReadCtx): Promise<AgentVaultSearch> {
  const correlationId = makeCid(ctx);
  const empty = (code: AgentObsidianCode, vaultName: string | null = null): AgentVaultSearch => ({ code, correlationId, vaultName, hits: [], truncated: false, sources: [] });
  if (!canAgentReadObsidian(agentId)) return empty("denied");
  const query = (params.query ?? "").trim();
  if (query.length < MIN_QUERY_LEN) return empty("empty");
  const limit = Math.max(1, Math.min(MAX_SEARCH_LIMIT, params.limit ?? DEFAULT_SEARCH_LIMIT));

  const avail = await ensureAvailable();
  if (!avail.ok) return empty(avail.code);

  const r = await searchNotes(query, avail.token);
  if (!r.ok || !r.data) {
    recordRetrieval(traceOf(agentId, "search", avail.vaultName, correlationId, ctx, { query, resultCount: 0, success: false }));
    return empty(mapCode(r.code), avail.vaultName);
  }
  const hits: AgentVaultSearchHit[] = r.data.results.slice(0, limit).map((h) => ({ path: h.path, basename: h.basename, snippet: h.snippet }));
  const sources: ObsidianSource[] = hits.map((h) => ({ sourceType: "obsidian", vaultName: avail.vaultName, path: h.path, title: h.basename }));
  recordRetrieval(traceOf(agentId, "search", avail.vaultName, correlationId, ctx, { query, resultCount: hits.length, success: true }));
  return { code: hits.length === 0 ? "empty" : "ok", correlationId, vaultName: avail.vaultName, hits, truncated: r.data.truncated || r.data.results.length > limit, sources };
}

/** Bounded live read of ONE explicit note. Path validation + size bounds stay bridge-side. */
export async function agentReadVaultNote(agentId: string, params: { path: string }, ctx?: AgentReadCtx): Promise<AgentVaultNote> {
  const correlationId = makeCid(ctx);
  const fail = (code: AgentObsidianCode, vaultName: string | null = null): AgentVaultNote => ({ code, correlationId, vaultName, path: null, basename: null, title: null, content: null, truncated: false, source: null });
  if (!canAgentReadObsidian(agentId)) return fail("denied");
  const path = (params.path ?? "").trim();
  if (!path) return fail("error");

  const avail = await ensureAvailable();
  if (!avail.ok) return fail(avail.code);

  const r = await readNote(path, avail.token);
  if (!r.ok || !r.data) {
    recordRetrieval(traceOf(agentId, "read", avail.vaultName, correlationId, ctx, { notePath: path, resultCount: 0, success: false }));
    return fail(mapCode(r.code), avail.vaultName);
  }
  const body = (r.data.content ?? "").slice(0, MAX_AGENT_NOTE_CHARS);
  const source: ObsidianSource = { sourceType: "obsidian", vaultName: avail.vaultName, path: r.data.path, title: r.data.basename };
  recordRetrieval(traceOf(agentId, "read", avail.vaultName, correlationId, ctx, { notePath: r.data.path, basename: r.data.basename, resultCount: 1, success: true }));
  return {
    code: "ok",
    correlationId,
    vaultName: avail.vaultName,
    path: r.data.path,
    basename: r.data.basename,
    title: r.data.basename,
    content: body,
    truncated: r.data.truncated || (r.data.content ?? "").length > MAX_AGENT_NOTE_CHARS,
    source,
  };
}

function traceOf(
  agentId: string,
  action: AgentRetrievalTrace["action"],
  vaultName: string,
  correlationId: string,
  ctx: AgentReadCtx | undefined,
  extra: { query?: string; notePath?: string; basename?: string; resultCount: number; success: boolean },
): AgentRetrievalTrace {
  return {
    id: correlationId,
    agentId,
    action,
    vaultName,
    query: extra.query,
    notePath: extra.notePath,
    basename: extra.basename,
    resultCount: extra.resultCount,
    at: nowMs(ctx),
    correlationId,
    success: extra.success,
  };
}
