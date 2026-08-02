#!/usr/bin/env node
// TERAGON AI BUSINESS OS — configure the LINKED Netlify site, PREVIEW context (S7.3A).
// =============================================================================
// Resolves the linked site, verifies it is the EXISTING Teragon site (never
// creates a second site, never deploys), and sets ONLY browser-safe Supabase
// vars in the **deploy-preview context** (Production is NEVER touched):
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (the app's browser-key contract,
//   holding the PUBLISHABLE/browser-safe key), VITE_SUPABASE_ORG,
//   VITE_PERSISTENCE_PROVIDER=SUPABASE.
// No privileged server var is set: no Netlify Function consumes a Supabase
// server var, so per policy none are configured (the Auth-Admin legacy key stays
// server-process in-memory only). Unrelated vars + all other contexts are
// PRESERVED (single-context upsert — no replace-all). Names/scopes/contexts are
// verified after setting; values are never printed.
import process from "node:process";
import { log } from "./shared/log.mjs";
import { createCredentialProvider, enforceOrExit, describeValidation } from "./shared/credentials.mjs";
import { createNetlifyAdapter } from "./shared/adapters/netlify.mjs";
import { createStageTracker } from "./shared/stage.mjs";
import { resolveMode, assertApplyAllowed, isEntrypoint } from "./shared/runtime.mjs";

const BROWSER = ["builds", "runtime"];
export const PREVIEW_CONTEXT = "deploy-preview";
export const PRODUCTION_CONTEXT = "production";

/**
 * PURE variable plan. ONLY browser-safe VITE_ vars, all in the Preview
 * (deploy-preview) context. No privileged/server var (no consumer). NEVER a
 * VITE_ secret. Unit-tested on the SHAPE (keys, scopes, browserSafe, context).
 * @param {{supabaseUrl?:string, browserKey?:string, org?:string, previewProvider?:string}} v
 */
export function buildNetlifyVarPlan(v) {
  const plan = [
    { key: "VITE_SUPABASE_URL", value: v.supabaseUrl ?? "", scopes: BROWSER, secret: false, browserSafe: true, context: PREVIEW_CONTEXT },
    // The app's browser contract reads VITE_SUPABASE_ANON_KEY; the value is the
    // PUBLISHABLE/browser-safe key (kept redacted in output).
    { key: "VITE_SUPABASE_ANON_KEY", value: v.browserKey ?? "", scopes: BROWSER, secret: false, browserSafe: true, context: PREVIEW_CONTEXT },
    { key: "VITE_SUPABASE_ORG", value: v.org ?? "", scopes: BROWSER, secret: false, browserSafe: true, context: PREVIEW_CONTEXT },
    // explicit preview persistence-provider selector (so the Preview talks to
    // staging Supabase). Does NOT change the source default (LOCAL_INDEXEDDB)
    // outside Preview — it is set ONLY in the deploy-preview context.
    { key: "VITE_PERSISTENCE_PROVIDER", value: v.previewProvider ?? "SUPABASE", scopes: BROWSER, secret: false, browserSafe: true, context: PREVIEW_CONTEXT },
  ];
  assertScopeInvariants(plan);
  assertPreviewOnly(plan);
  return plan;
}

/** Every var must target the Preview context only — never Production/all. */
export function assertPreviewOnly(plan) {
  for (const item of plan) {
    if (item.context !== PREVIEW_CONTEXT) {
      throw new Error(`preview invariant: ${item.key} context is "${item.context}", expected "${PREVIEW_CONTEXT}"`);
    }
  }
  return true;
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
    previewProvider: credentials.get("VITE_PERSISTENCE_PROVIDER") ?? "SUPABASE",
  });
  const ourKeys = varPlan.map((p) => p.key);
  const plan = mode !== "apply";

  if (plan) {
    return {
      ok: true,
      mutated: false,
      action: "plan",
      vars: varPlan.map((p) => ({ key: p.key, scopes: p.scopes, secret: p.secret, browserSafe: p.browserSafe, context: p.context })),
      intended: [
        "verify linked site is the EXISTING Teragon site (no new site, no deploy)",
        `set ONLY browser-safe VITE_ vars in the ${PREVIEW_CONTEXT} context (Production NEVER touched)`,
        "no privileged/server var (no Function consumer); Auth-Admin legacy key stays in-memory",
        "preserve unrelated Preview vars; verify names/scopes/context; verify Production unchanged; never print values",
      ],
    };
  }

  if (!validation.ok) return { ok: false, mutated: false, reason: "credentials not ready" };

  // S7.3A: fail-closed. Any Netlify adapter exception is caught here — it can
  // NEVER escape the stage tracker (a raw throw previously crashed the run). On
  // failure we record a SAFE reason (no values), preserve STAGING_SEEDED, and
  // run nothing further.
  try {
    const expectedSiteId = credentials.get("NETLIFY_SITE_ID");
    const site = await netlify.getLinkedSite();
    if (!isTeragonSite(site, expectedSiteId)) {
      stage.fail("linked site is not the existing Teragon site");
      return { ok: false, mutated: false, reason: `linked site "${site?.name ?? "?"}" is not the expected Teragon site` };
    }

    // Read-before-write: capture PRESENCE-only metadata for BOTH contexts.
    const previewBefore = envKeys(await netlify.listEnv(PREVIEW_CONTEXT));
    const productionBefore = envKeys(await netlify.listEnv(PRODUCTION_CONTEXT));

    // Set each var — before EACH write verify name + Preview context + scope +
    // Production excluded, then upsert into the Preview context ONLY.
    for (const item of varPlan) {
      if (item.context !== PREVIEW_CONTEXT || item.context === PRODUCTION_CONTEXT) {
        stage.fail(`refusing non-preview write for ${item.key}`);
        return { ok: false, mutated: true, reason: `refused: ${item.key} not targeting ${PREVIEW_CONTEXT}` };
      }
      if (!ourKeys.includes(item.key) || item.key.startsWith("VITE_") === false || item.secret) {
        stage.fail(`refusing unexpected/privileged write for ${item.key}`);
        return { ok: false, mutated: true, reason: `refused: ${item.key} is not a browser-safe Preview var` };
      }
      await netlify.setEnv({ key: item.key, value: item.value, scopes: item.scopes, secret: false, context: PREVIEW_CONTEXT });
    }

    // Verify: our keys present in Preview; unrelated Preview vars preserved;
    // Production context UNCHANGED (same key set before/after).
    const previewAfter = envKeys(await netlify.listEnv(PREVIEW_CONTEXT));
    const productionAfter = envKeys(await netlify.listEnv(PRODUCTION_CONTEXT));

    const missingAfter = ourKeys.filter((k) => !previewAfter.includes(k));
    const droppedPreviewUnrelated = previewBefore.filter((k) => !ourKeys.includes(k)).filter((k) => !previewAfter.includes(k));
    const productionChanged = symmetricDiff(productionBefore, productionAfter);
    if (missingAfter.length) {
      stage.fail(`preview vars not present after set: ${missingAfter.join(", ")}`);
      return { ok: false, mutated: true, reason: `expected preview vars missing after set: ${missingAfter.join(", ")}` };
    }
    if (droppedPreviewUnrelated.length) {
      stage.fail(`unrelated preview vars dropped: ${droppedPreviewUnrelated.join(", ")}`);
      return { ok: false, mutated: true, reason: `unrelated preview vars dropped (replace-all bug): ${droppedPreviewUnrelated.join(", ")}` };
    }
    if (productionChanged.length) {
      stage.fail(`PRODUCTION context changed: ${productionChanged.join(", ")}`);
      return { ok: false, mutated: true, reason: `Production context was modified (must be untouched): ${productionChanged.join(", ")}` };
    }

    return finalize({ stage, ourKeys, previewBefore, productionBefore });
  } catch (err) {
    const category = err instanceof Error ? sanitizeNetlifyError(err.message) : "netlify error";
    stage.fail(`configure-netlify failed (Netlify adapter): ${category}`);
    return { ok: false, mutated: false, reason: `configure-netlify failed: ${category}` };
  }
}

/** SAFE error category for a Netlify adapter failure — never a value/body. */
export function sanitizeNetlifyError(text) {
  const t = String(text ?? "").toLowerCase();
  if (t.includes("json") || t.includes("unexpected") || t.includes("syntax")) return "non-json/parse error (CLI arg or response)";
  if (t.includes("401") || t.includes("unauthor") || t.includes("token")) return "unauthorized (Netlify token)";
  if (t.includes("404") || t.includes("not found")) return "site/resource not found";
  if (t.includes("network") || t.includes("fetch") || t.includes("timeout")) return "network/timeout";
  return "netlify adapter error";
}

function finalize({ stage, ourKeys, previewBefore, productionBefore }) {
  stage.markComplete(
    "NETLIFY_PREVIEW_CONFIGURED",
    {
      netlify: {
        siteIdMask: null,
        context: PREVIEW_CONTEXT,
        previewVarNames: ourKeys,
        scopes: BROWSER,
        previousConfig: { previewKeyCount: previewBefore.length, productionKeyCount: productionBefore.length },
      },
    },
    `set ${ourKeys.length} preview vars`,
  );
  // Reached only after all invariants passed: unrelated preserved + Production
  // unchanged are guaranteed here.
  return {
    ok: true,
    mutated: true,
    context: PREVIEW_CONTEXT,
    setKeys: ourKeys,
    scopes: BROWSER,
    preservedUnrelated: true,
    productionUnchanged: true,
  };
}

/** Keys present in exactly one of the two sets. */
function symmetricDiff(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  return [...new Set([...a, ...b])].filter((k) => sa.has(k) !== sb.has(k));
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
    for (const v of result.vars) log.plain(`  var ${v.key} — context=${v.context} scopes=[${v.scopes.join(",")}] secret=${v.secret} browserSafe=${v.browserSafe}`);
    for (const line of result.intended) log.plain(`  would: ${line}`);
    log.step("configure-netlify PLAN — nothing set or contacted.");
    process.exit(0);
  }
  if (!result.ok) {
    log.error(`configure-netlify refused/failed: ${result.reason}`);
    process.exit(2);
  }
  log.ok(`configure-netlify complete (set ${result.setKeys.length} Preview vars; unrelated preserved; Production unchanged=${result.productionUnchanged}).`);
  process.exit(0);
}

if (isEntrypoint(import.meta.url)) {
  main().catch((err) => {
    log.error(`configure-netlify failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
