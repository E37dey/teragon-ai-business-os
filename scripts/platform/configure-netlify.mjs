#!/usr/bin/env node
// TERAGON AI BUSINESS OS — configure the LINKED Netlify site (Gate S7.0).
// =============================================================================
// Resolves the linked site and verifies it is the EXISTING Teragon site (never
// creates a second site). Sets variables by context/scope with a hard rule:
//   • browser-safe (build+runtime): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
//     VITE_SUPABASE_ORG, and the explicit preview persistence-provider selector
//     VITE_PERSISTENCE_PROVIDER — these are meant to ship to the client.
//   • server-only privileged (Functions scope, SECRET, NEVER VITE_-prefixed):
//     SUPABASE_SERVICE_ROLE_KEY.
// Unrelated existing vars are PRESERVED (no replace-all — only our known keys
// are upserted). Names + scopes are verified after setting. Values are never
// printed; the bundle scanner rejects any privileged-key exposure.
import process from "node:process";
import { log } from "./shared/log.mjs";
import { createCredentialProvider, enforceOrExit, describeValidation } from "./shared/credentials.mjs";
import { createNetlifyAdapter } from "./shared/adapters/netlify.mjs";
import { createStageTracker } from "./shared/stage.mjs";
import { resolveMode, assertApplyAllowed, isEntrypoint } from "./shared/runtime.mjs";

const BROWSER = ["builds", "runtime"];
const FUNCTIONS = ["functions"];

/**
 * PURE variable-scope plan. Given resolved connection values, produce the exact
 * set of vars to upsert with their scopes + secrecy + browser-safety. NEVER
 * assigns a privileged (service-role) value to a VITE_-prefixed key. Values are
 * carried for the adapter but this function is unit-tested on the SHAPE (keys,
 * scopes, browserSafe, secret) — the assertion below proves the invariant.
 * @param {{supabaseUrl?:string, anonKey?:string, org?:string, serviceKey?:string, previewProvider?:string}} v
 */
export function buildNetlifyVarPlan(v) {
  const plan = [
    // --- browser-safe (build+runtime) ---------------------------------------
    { key: "VITE_SUPABASE_URL", value: v.supabaseUrl ?? "", scopes: BROWSER, secret: false, browserSafe: true },
    // The app supports VITE_SUPABASE_ANON_KEY; the value is the normalized
    // browser key (publishable modern OR anon legacy) — kept redacted in output.
    { key: "VITE_SUPABASE_ANON_KEY", value: v.browserKey ?? "", scopes: BROWSER, secret: false, browserSafe: true },
    { key: "VITE_SUPABASE_ORG", value: v.org ?? "", scopes: BROWSER, secret: false, browserSafe: true },
    // explicit preview persistence-provider selector (so the preview really
    // talks to staging Supabase and the acceptance harness can prove no silent
    // IndexedDB fallback). Does NOT change the source default (LOCAL_INDEXEDDB).
    { key: "VITE_PERSISTENCE_PROVIDER", value: v.previewProvider ?? "SUPABASE", scopes: BROWSER, secret: false, browserSafe: true },
    // --- server-only (Functions scope, NEVER VITE_) -------------------------
    { key: "SUPABASE_URL", value: v.supabaseUrl ?? "", scopes: FUNCTIONS, secret: false, browserSafe: false },
    // privileged server key — Functions scope, secret, NEVER VITE_, never browser.
    { key: "SUPABASE_SERVICE_ROLE_KEY", value: v.serverKey ?? "", scopes: FUNCTIONS, secret: true, browserSafe: false },
  ];
  assertScopeInvariants(plan);
  return plan;
}

/**
 * Enforce the non-negotiable invariants: no privileged/secret var is VITE_-
 * prefixed; every VITE_ var is browser-safe (non-secret, build scope); every
 * secret is Functions-scoped and NOT build/runtime. Throws on violation.
 * @param {Array<{key:string,scopes:string[],secret:boolean,browserSafe:boolean}>} plan
 */
export function assertScopeInvariants(plan) {
  for (const item of plan) {
    const isVite = item.key.startsWith("VITE_");
    if (isVite && (item.secret || !item.browserSafe)) {
      throw new Error(`scope invariant: privileged/secret value assigned to VITE_ key ${item.key}`);
    }
    if (item.secret && (item.scopes.includes("builds") || item.scopes.includes("runtime"))) {
      throw new Error(`scope invariant: secret ${item.key} must not be build/runtime-scoped`);
    }
    if (!isVite && item.browserSafe) {
      throw new Error(`scope invariant: non-VITE key ${item.key} marked browserSafe`);
    }
  }
  return true;
}

/** Is the linked site the existing Teragon site? (id match OR teragon-named) */
export function isTeragonSite(site, expectedSiteId) {
  if (!site) return false;
  if (expectedSiteId && site.id && site.id === expectedSiteId) return true;
  return /teragon/i.test(String(site.name ?? ""));
}

/**
 * Core Netlify configuration with an injected adapter. Never process.exit.
 * @param {Object} deps
 * @param {'plan'|'apply'} deps.mode
 * @param {ReturnType<import('./shared/credentials.mjs').createCredentialProvider>} deps.credentials
 * @param {ReturnType<import('./shared/adapters/netlify.mjs').createNetlifyAdapter>} deps.netlify
 * @param {ReturnType<import('./shared/stage.mjs').createStageTracker>} deps.stage
 * @param {import('./shared/credentials.mjs').CredentialValidation} deps.validation
 */
export async function configureNetlify({ mode, credentials, netlify, stage, validation }) {
  const varPlan = buildNetlifyVarPlan({
    supabaseUrl: credentials.get("SUPABASE_URL"),
    browserKey: credentials.get("SUPABASE_BROWSER_KEY"),
    org: credentials.get("SUPABASE_ORG_ID"),
    serverKey: credentials.get("SUPABASE_SERVER_KEY"),
    previewProvider: credentials.get("VITE_PERSISTENCE_PROVIDER") ?? "SUPABASE",
  });
  const plan = mode !== "apply";

  if (plan) {
    return {
      ok: true,
      mutated: false,
      action: "plan",
      vars: varPlan.map((p) => ({ key: p.key, scopes: p.scopes, secret: p.secret, browserSafe: p.browserSafe })),
      intended: [
        "verify linked site is the EXISTING Teragon site (no new site)",
        "read existing env (preserve unrelated vars — no replace-all)",
        "upsert the known keys at their scopes; SUPABASE_SERVICE_ROLE_KEY Functions-only + secret",
        "verify names + scopes after setting; never print values",
      ],
    };
  }

  if (!validation.ok) return { ok: false, mutated: false, reason: "credentials not ready" };

  const expectedSiteId = credentials.get("NETLIFY_SITE_ID");
  const site = await netlify.getLinkedSite();
  if (!isTeragonSite(site, expectedSiteId)) {
    stage.fail("linked site is not the existing Teragon site");
    return { ok: false, mutated: false, reason: `linked site "${site?.name ?? "?"}" is not the expected Teragon site` };
  }

  // Read-before-write: capture the existing var keys so we can prove preservation.
  const before = await netlify.listEnv();
  const beforeKeys = envKeys(before);

  for (const item of varPlan) {
    await netlify.setEnv({ key: item.key, value: item.value, scopes: item.scopes, secret: item.secret });
  }

  // Verify: our keys now present at expected scopes; unrelated keys preserved.
  const after = await netlify.listEnv();
  const afterKeys = envKeys(after);
  const missingAfter = varPlan.map((p) => p.key).filter((k) => !afterKeys.includes(k));
  const droppedUnrelated = beforeKeys.filter((k) => !varPlan.some((p) => p.key === k)).filter((k) => !afterKeys.includes(k));
  if (missingAfter.length) {
    stage.fail(`vars not present after set: ${missingAfter.join(", ")}`);
    return { ok: false, mutated: true, reason: `expected vars missing after set: ${missingAfter.join(", ")}` };
  }
  if (droppedUnrelated.length) {
    stage.fail(`unrelated vars were dropped: ${droppedUnrelated.join(", ")}`);
    return { ok: false, mutated: true, reason: `unrelated vars dropped (replace-all bug): ${droppedUnrelated.join(", ")}` };
  }

  stage.markComplete("NETLIFY_CONFIGURED", { netlify: { siteIdMask: null } }, `set ${varPlan.length} vars`);
  return { ok: true, mutated: true, setKeys: varPlan.map((p) => p.key), preservedUnrelated: droppedUnrelated.length === 0 };
}

/** Extract var keys from either an array or a map-shaped env:list result. */
function envKeys(listResult) {
  if (Array.isArray(listResult)) return listResult.map((e) => e.key ?? e.name).filter(Boolean);
  if (listResult && typeof listResult === "object") return Object.keys(listResult);
  return [];
}

// --- thin entrypoint ---------------------------------------------------------
async function main() {
  const mode = resolveMode();
  const gate = assertApplyAllowed(mode);
  const credentials = createCredentialProvider();
  const validation = await credentials.validate("configure-netlify");

  log.step(`configure-netlify — mode=${mode}`);
  if (mode === "apply" && !gate.allowed) {
    log.error(`refused: ${gate.reason}. No remote action taken.`);
    process.exit(3);
  }
  if (mode === "apply") enforceOrExit(validation);
  else for (const line of describeValidation(validation)) log.plain(`  ${line}`);

  const netlify = createNetlifyAdapter({ credentials: credentials.get });
  const stage = createStageTracker();
  const result = await configureNetlify({ mode, credentials, netlify, stage, validation });

  if (result.action === "plan") {
    for (const v of result.vars) log.plain(`  var ${v.key} — scopes=[${v.scopes.join(",")}] secret=${v.secret} browserSafe=${v.browserSafe}`);
    for (const line of result.intended) log.plain(`  would: ${line}`);
    log.step("configure-netlify PLAN — nothing set or contacted.");
    process.exit(0);
  }
  if (!result.ok) {
    log.error(`configure-netlify refused/failed: ${result.reason}`);
    process.exit(2);
  }
  log.ok(`configure-netlify complete (set ${result.setKeys.length} vars; unrelated preserved).`);
  process.exit(0);
}

if (isEntrypoint(import.meta.url)) {
  main().catch((err) => {
    log.error(`configure-netlify failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
