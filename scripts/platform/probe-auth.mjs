#!/usr/bin/env node
// TERAGON AI BUSINESS OS — read-only Auth Admin key-compatibility probe (S7.2.1).
// =============================================================================
// Decides the Auth Admin key strategy WITHOUT creating any user or mutating
// anything. It retrieves + classifies the project API keys in memory, then runs:
//   • Probe A (direct gateway): GET auth/v1/admin/users with the modern SECRET
//     key ONLY in the `apikey` header (never Bearer), perPage 1.
//   • Probe B (upgraded SDK): modern server client auth.admin.listUsers.
//   • Probe C (legacy, only if A or B fails): direct gateway with the legacy
//     service_role key in `apikey`.
//
// It prints ONLY: probe name, HTTP status, content-type kind (json|non-json),
// success/failure, key kind (SECRET|SERVICE_ROLE_LEGACY), and the selected
// strategy. NEVER a key/JWT/token/body/HTML/headers/user data.
import process from "node:process";
import { createSupabaseAdapter } from "./shared/adapters/supabase.mjs";
import { createCredentialProvider } from "./shared/credentials.mjs";
import { classifyKind } from "./shared/keys.mjs";

const EXPECTED_REF = "bjvirkmagwpqroakazjj";

function jwtRole(v) {
  if (typeof v !== "string" || v.split(".").length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(v.split(".")[1], "base64url").toString("utf8"))?.role ?? null;
  } catch {
    return null;
  }
}

/** Classify the raw key list into the four kinds (values kept private). */
function extractKeys(apiKeys) {
  const out = { publishable: null, anon: null, secret: null, service_role: null };
  for (const entry of Array.isArray(apiKeys) ? apiKeys : []) {
    const value = entry?.api_key ?? entry?.apiKey ?? entry?.value ?? entry?.key ?? null;
    if (typeof value !== "string") continue;
    if (value.startsWith("sb_publishable")) out.publishable = value;
    else if (value.startsWith("sb_secret")) out.secret = value;
    else if (jwtRole(value) === "service_role") out.service_role = value;
    else if (jwtRole(value) === "anon") out.anon = value;
    else if (classifyKind(entry?.name ?? entry?.type) === "SERVICE_ROLE_LEGACY") out.service_role = value;
    else if (classifyKind(entry?.name ?? entry?.type) === "ANON_LEGACY") out.anon = value;
  }
  return out;
}

function contentKind(text) {
  const t = (text ?? "").trimStart();
  return t.startsWith("{") || t.startsWith("[") ? "json" : "non-json";
}

/** Direct gateway probe: apikey header ONLY (never Bearer). */
async function directProbe(url, apikey) {
  try {
    const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, {
      method: "GET",
      headers: { apikey },
    });
    const text = await res.text();
    return { status: res.status, contentType: contentKind(text), ok: res.status >= 200 && res.status < 300 && contentKind(text) === "json" };
  } catch {
    return { status: 0, contentType: "error", ok: false };
  }
}

/** Upgraded-SDK probe via the modern server client. */
async function sdkProbe(url, secret) {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { error } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) return { ok: false, category: sdkCategory(error), status: safeStatus(error), name: safeName(error) };
    return { ok: true, category: "ok" };
  } catch (err) {
    return { ok: false, category: sdkCategory(err), status: safeStatus(err), name: safeName(err) };
  }
}

function safeStatus(e) {
  const s = e?.status ?? e?.statusCode ?? e?.code;
  return typeof s === "number" || (typeof s === "string" && /^\d+$/.test(s)) ? String(s) : "n/a";
}
function safeName(e) {
  const n = e?.name ?? e?.constructor?.name ?? "Error";
  return String(n).slice(0, 40);
}

function sdkCategory(err) {
  const msg = String(err?.message ?? "").toLowerCase();
  if (msg.includes("<") || msg.includes("doctype") || msg.includes("not valid json") || msg.includes("unexpected token")) return "non-json-response";
  if (msg.includes("401") || msg.includes("unauthor") || msg.includes("invalid")) return "unauthorized";
  if (msg.includes("fetch") || msg.includes("network")) return "network";
  return "error";
}

async function main() {
  const credentials = createCredentialProvider();
  const ref = credentials.get("SUPABASE_PROJECT_REF") ?? EXPECTED_REF;
  const url = `https://${ref}.supabase.co`;
  const supabase = createSupabaseAdapter({ credentials: credentials.get });

  let keys;
  try {
    keys = extractKeys(await supabase.getProjectApiKeys(ref));
  } catch {
    print("keys: retrieval FAILED");
    print("strategy: BLOCKED");
    process.exit(1);
  }

  print(`url-host-ok: ${new URL(url).host === `${EXPECTED_REF}.supabase.co`}`);
  print(`keys-present: publishable=${Boolean(keys.publishable)} secret=${Boolean(keys.secret)} anon=${Boolean(keys.anon)} service_role=${Boolean(keys.service_role)}`);

  // Probe A + B (modern SECRET).
  const a = keys.secret ? await directProbe(url, keys.secret) : { status: 0, contentType: "n/a", ok: false };
  print(`probeA-direct-modern-SECRET: status=${a.status} content=${a.contentType} success=${a.ok}`);
  const b = keys.secret ? await sdkProbe(url, keys.secret) : { ok: false, category: "no-key" };
  print(`probeB-sdk-modern-SECRET: success=${b.ok} category=${b.category} status=${b.status ?? "n/a"} name=${b.name ?? "n/a"}`);

  let strategy;
  if (a.ok && b.ok) {
    strategy = "MODERN_SECRET";
  } else if (a.ok && !b.ok) {
    strategy = "MODERN_SECRET_CUSTOM_CLIENT";
  } else {
    // Modern FAILED. Diagnose the gateway (direct, apikey-only) then run the
    // DECISIVE legacy test via the SDK (which sends apikey + Authorization Bearer).
    const cDirect = keys.service_role ? await directProbe(url, keys.service_role) : { status: 0, contentType: "n/a", ok: false };
    print(`probeC-direct-legacy-SERVICE_ROLE (apikey-only, diagnostic): status=${cDirect.status} content=${cDirect.contentType}`);
    const cSdk = keys.service_role ? await sdkProbe(url, keys.service_role) : { ok: false, category: "no-key" };
    print(`probeD-sdk-legacy-SERVICE_ROLE (decisive): success=${cSdk.ok} category=${cSdk.category} status=${cSdk.status ?? "n/a"} name=${cSdk.name ?? "n/a"}`);
    strategy = cSdk.ok ? "LEGACY_AUTH_ADMIN_FALLBACK" : "BLOCKED";
  }
  print(`strategy: ${strategy}`);
  // clear runtime creds (in-memory only) and exit.
  credentials.clearRuntime?.();
  process.exit(strategy === "BLOCKED" ? 1 : 0);
}

function print(line) {
  process.stdout.write(line + "\n");
}

main().catch(() => {
  print("strategy: BLOCKED");
  process.exit(1);
});
