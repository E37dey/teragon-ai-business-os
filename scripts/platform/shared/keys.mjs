// TERAGON AI BUSINESS OS — Supabase project API-key classifier (Gate S7.0.2).
// =============================================================================
// PURE. Takes the list of a project's API keys (as returned by the CLI /
// Management API) and normalizes them into exactly two internal keys:
//   • SUPABASE_BROWSER_KEY — browser-safe (PUBLISHABLE modern | ANON_LEGACY)
//   • SUPABASE_SERVER_KEY  — server-only  (SECRET modern      | SERVICE_ROLE_LEGACY)
//
// ROOT-CAUSE (S7.0.2): the live CLI returned two entries whose `type` field is
// the NON-SEMANTIC value "default" — the previous name/type-only classifier
// rejected them. `default` (and `primary`/`generated`/empty) must never
// classify a key. Classification uses several INDEPENDENT signals in a
// deterministic precedence and fails CLOSED on any conflict/ambiguity:
//   A. recognized explicit semantic name/type (publishable/anon | secret/service_role)
//   B. modern key format — value/prefix `sb_publishable_` → browser, `sb_secret_` → server
//   C. legacy names (anon | service_role)  [subsumed by A over name+type fields]
//   D. legacy JWT role — decode payload LOCALLY (classification only, not auth):
//      role "anon" → browser, "service_role" → server; any other role rejected.
//
// SECURITY: this module NEVER logs, and NEVER puts a key value, JWT, token, raw
// CLI JSON, or any sensitive prefix into an error. Errors carry only: record
// index, a short SAFE format identifier (e.g. "sb_publishable", "jwt", "opaque"),
// the detected source kind, and the ambiguity category.

const IGNORED_NAMES = new Set(["default", "primary", "generated", "current", ""]);

function keyValue(entry) {
  return entry?.api_key ?? entry?.apiKey ?? entry?.value ?? entry?.key ?? entry?.secret ?? null;
}
function names(entry) {
  return [entry?.name, entry?.type].map((n) => String(n ?? "").trim().toLowerCase());
}

/**
 * Back-compat helper: map a single explicit name/type token to a semantic kind.
 * Non-semantic tokens ("default", etc.) return "UNKNOWN".
 */
export function classifyKind(rawName) {
  const n = String(rawName ?? "").trim().toLowerCase();
  if (n === "publishable") return "PUBLISHABLE";
  if (n === "anon" || n === "anon_key" || n === "anonymous") return "ANON_LEGACY";
  if (n === "secret") return "SECRET";
  if (n === "service_role" || n === "service-role" || n === "servicerole") return "SERVICE_ROLE_LEGACY";
  return "UNKNOWN";
}

// --- signal A/C: recognized explicit semantic name/type ---------------------
function semanticSignal(entry) {
  for (const n of names(entry)) {
    if (IGNORED_NAMES.has(n)) continue;
    if (n === "publishable") return { slot: "browser", source: "PUBLISHABLE", formatId: "semantic:publishable" };
    if (n === "anon" || n === "anon_key" || n === "anonymous") return { slot: "browser", source: "ANON_LEGACY", formatId: "semantic:anon" };
    if (n === "secret") return { slot: "server", source: "SECRET", formatId: "semantic:secret" };
    if (n === "service_role" || n === "service-role" || n === "servicerole") return { slot: "server", source: "SERVICE_ROLE_LEGACY", formatId: "semantic:service_role" };
    // any other non-ignored token is NOT a semantic signal (e.g. a project name)
  }
  return null;
}

// --- signal B: modern key format (value prefix or safe prefix field) --------
function modernSignal(entry, index) {
  const safePrefix = entry?.prefix ?? entry?.api_key_prefix ?? null;
  const probe = typeof safePrefix === "string" && safePrefix.length > 0 ? safePrefix : keyValue(entry);
  if (typeof probe !== "string" || probe.length === 0) return null;
  if (/^sb_publishable/.test(probe)) return { slot: "browser", source: "PUBLISHABLE", formatId: "sb_publishable" };
  if (/^sb_secret/.test(probe)) return { slot: "server", source: "SECRET", formatId: "sb_secret" };
  if (/^sb_/.test(probe)) throw fail(`record ${index}: unsupported modern key prefix`, "sb_(unsupported)");
  return null;
}

// --- signal D: legacy JWT role (decoded LOCALLY, never logged) --------------
function looksJwt(v) {
  if (typeof v !== "string") return false;
  const parts = v.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p));
}
function jwtRoleSignal(entry, index) {
  const v = keyValue(entry);
  if (!looksJwt(v)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(v.split(".")[1], "base64url").toString("utf8"));
  } catch {
    throw fail(`record ${index}: malformed JWT payload`, "jwt");
  }
  const role = typeof payload?.role === "string" ? payload.role : "";
  if (role === "anon") return { slot: "browser", source: "ANON_LEGACY", formatId: "jwt" };
  if (role === "service_role") return { slot: "server", source: "SERVICE_ROLE_LEGACY", formatId: "jwt" };
  throw fail(`record ${index}: unexpected JWT role`, "jwt");
}

/** SAFE, value-free error (never carries key/JWT/raw JSON). */
function fail(message, formatId) {
  return new Error(`key classification failed: ${message}${formatId ? ` (format: ${formatId})` : ""}`);
}

/** Resolve ONE record to a slot+source using the A→B→C→D precedence. */
function classifyRecord(entry, index) {
  const sem = semanticSignal(entry); // A + C (over name AND type)
  const fmt = modernSignal(entry, index); // B (may throw on unsupported sb_)
  if (sem && fmt && sem.slot !== fmt.slot) {
    throw fail(`record ${index}: semantic (${sem.source}) conflicts with key format (${fmt.formatId})`, "conflict");
  }
  const resolved = sem ?? fmt ?? jwtRoleSignal(entry, index); // D only when A/B/C silent
  if (!resolved) throw fail(`record ${index}: unknown/unclassifiable key`, "opaque");
  const value = keyValue(entry);
  if (typeof value !== "string" || value.length === 0) throw fail(`record ${index}: missing key value`, resolved.formatId);
  return { slot: resolved.slot, source: resolved.source, value };
}

/**
 * Normalize + classify a raw key list. A real modern project exposes BOTH the
 * new keys (publishable/secret) AND the legacy keys (anon/service_role) at the
 * same time, so each slot is filled by PREFERRING the modern kind and falling
 * back to the legacy kind — that coexistence is NOT ambiguous. It fails CLOSED
 * only when a slot has NO candidate, or the chosen kind has >1 DISTINCT value
 * (two publishable, two secret, …). Fails per-record earlier on conflict/unknown.
 * @param {Array<object>} apiKeys
 * @returns {{ browser:{value:string, source:'PUBLISHABLE'|'ANON_LEGACY'}, server:{value:string, source:'SECRET'|'SERVICE_ROLE_LEGACY'} }}
 */
export function classifyProjectKeys(apiKeys) {
  if (!Array.isArray(apiKeys)) throw fail("unknown response shape (not an array)", "none");
  if (apiKeys.length === 0) throw fail("no project API keys returned", "none");

  /** @type {Map<string,Set<string>>} source kind → set of DISTINCT values */
  const byKind = new Map();
  apiKeys.forEach((entry, index) => {
    const r = classifyRecord(entry, index);
    if (!byKind.has(r.source)) byKind.set(r.source, new Set());
    byKind.get(r.source).add(r.value);
  });

  const browser = pickSlot(byKind, "browser-safe", ["PUBLISHABLE", "ANON_LEGACY"]);
  const server = pickSlot(byKind, "server-safe", ["SECRET", "SERVICE_ROLE_LEGACY"]);
  return { browser, server };
}

/** Prefer the modern kind, fall back to legacy; fail on same-kind ambiguity. */
function pickSlot(byKind, slotName, preference) {
  for (const kind of preference) {
    const set = byKind.get(kind);
    if (!set) continue;
    if (set.size > 1) throw fail(`ambiguous ${slotName} key — ${set.size} distinct ${kind} values`, "ambiguous");
    return { value: [...set][0], source: kind };
  }
  throw fail(`no ${slotName} key could be uniquely identified`, "none");
}
