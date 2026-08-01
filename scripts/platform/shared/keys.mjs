// TERAGON AI BUSINESS OS — Supabase project API-key classifier (Gate S7.0.1).
// =============================================================================
// PURE. Takes the list of a project's API keys (as returned by the CLI /
// Management API) and normalizes them into exactly two internal keys:
//   • SUPABASE_BROWSER_KEY — browser-safe (PUBLISHABLE modern | ANON_LEGACY)
//   • SUPABASE_SERVER_KEY  — server-only  (SECRET modern      | SERVICE_ROLE_LEGACY)
//
// Fails CLOSED: throws when a browser-safe OR server-only key cannot be uniquely
// identified, when a needed slot is ambiguous (two differing candidates of the
// same kind), or when an unknown key type appears. NEVER echoes a key value —
// error messages carry the key NAME/kind only.
//
// This module never logs; the caller must never log the raw key list either.

/** Map a raw key entry's name to a normalized kind (NAMES only). */
export function classifyKind(rawName) {
  const n = String(rawName ?? "").trim().toLowerCase();
  if (n === "publishable" || n === "sb_publishable" || n.includes("publishable")) return "PUBLISHABLE";
  if (n === "anon" || n === "anon_key" || n === "anonymous") return "ANON_LEGACY";
  if (n === "secret" || n === "sb_secret" || n.includes("secret")) return "SECRET";
  if (n === "service_role" || n === "service-role" || n === "servicerole") return "SERVICE_ROLE_LEGACY";
  return "UNKNOWN";
}

function keyValue(entry) {
  return entry?.api_key ?? entry?.apiKey ?? entry?.value ?? entry?.key ?? null;
}
function keyName(entry) {
  return entry?.name ?? entry?.type ?? entry?.id ?? "";
}

/**
 * Normalize + classify a raw key list.
 * @param {Array<object>} apiKeys
 * @returns {{ browser:{value:string, source:'PUBLISHABLE'|'ANON_LEGACY'}, server:{value:string, source:'SECRET'|'SERVICE_ROLE_LEGACY'} }}
 */
export function classifyProjectKeys(apiKeys) {
  const list = Array.isArray(apiKeys) ? apiKeys : [];
  if (list.length === 0) throw new Error("key classification failed: no project API keys returned");

  /** @type {Map<string,Set<string>>} kind → set of distinct values */
  const byKind = new Map();
  const unknown = [];
  for (const entry of list) {
    const kind = classifyKind(keyName(entry));
    const value = keyValue(entry);
    if (kind === "UNKNOWN") {
      unknown.push(String(keyName(entry)));
      continue;
    }
    if (!value) throw new Error(`key classification failed: ${kind} entry has no value`);
    if (!byKind.has(kind)) byKind.set(kind, new Set());
    byKind.get(kind).add(value);
  }
  if (unknown.length) {
    throw new Error(`key classification failed: unknown/unsupported key type(s): ${unknown.join(", ")}`);
  }

  const browser = pickSlot(byKind, "browser", ["PUBLISHABLE", "ANON_LEGACY"]);
  const server = pickSlot(byKind, "server", ["SECRET", "SERVICE_ROLE_LEGACY"]);
  return { browser, server };
}

function pickSlot(byKind, slotName, preference) {
  for (const kind of preference) {
    const set = byKind.get(kind);
    if (!set) continue;
    if (set.size > 1) throw new Error(`key classification failed: ambiguous ${slotName} key — multiple differing ${kind} values`);
    return { value: [...set][0], source: kind };
  }
  throw new Error(`key classification failed: no ${slotName}-safe key could be uniquely identified`);
}
