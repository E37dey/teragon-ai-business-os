#!/usr/bin/env node
// TERAGON AI BUSINESS OS — provision the staging Supabase project (Gate S7.0).
// =============================================================================
// Verify-before-create, fail-closed, idempotent, ZERO duplicate projects.
//
// Flow (apply):
//   1. inspect orgs → verify the selected org is accessible
//   2. inspect existing projects → select by the rules in selectStagingProject:
//        • reuse ONLY a project explicitly identified as Teragon staging in the
//          selected org (exact name OR a verified SUPABASE_PROJECT_REF)
//        • REJECT production-looking / unrelated / ambiguous matches
//   3. verify region
//   4. create ONLY when no approved staging project exists — DB password supplied
//      via env (never a logged argv flag)
//   5. poll project health with a bounded timeout
//   6. capture the real ref, verify it belongs to the selected org, THEN link
//   7. record the SAFE masked ref via the stage tracker
//
// plan mode contacts nothing and mutates nothing: it reports credential
// readiness and the intended actions.
import process from "node:process";
import { log } from "./shared/log.mjs";
import { createCredentialProvider, enforceOrExit, describeValidation } from "./shared/credentials.mjs";
import { createSupabaseAdapter } from "./shared/adapters/supabase.mjs";
import { createStageTracker, mask } from "./shared/stage.mjs";
import { discoverAndInjectConnection } from "./shared/connection.mjs";
import { resolveMode, assertApplyAllowed, isEntrypoint } from "./shared/runtime.mjs";

export const DEFAULT_STAGING_NAME = "teragon-staging";
const PRODUCTION_RE = /prod|production|live/i;
const STAGING_HINT_RE = /staging|teragon/i;

function projectRef(p) {
  return p?.id ?? p?.ref ?? null;
}
function projectOrg(p) {
  return p?.organization_id ?? p?.orgId ?? p?.organizationId ?? null;
}

/**
 * PURE project-selection decision. No adapters, no I/O — unit-tested directly.
 * @param {Object} args
 * @param {Array<object>} args.projects           all projects visible to the token
 * @param {string} args.orgId                     selected organization
 * @param {string} [args.desiredName]             canonical staging project name
 * @param {string} [args.explicitRef]             SUPABASE_PROJECT_REF, if provided
 * @returns {{action:'reuse'|'create'|'reject', ref:(string|null), project:(object|null), reason:string}}
 */
export function selectStagingProject({ projects, orgId, desiredName = DEFAULT_STAGING_NAME, explicitRef }) {
  const all = Array.isArray(projects) ? projects : [];

  // Path A — an explicit ref was supplied: verify it hard.
  if (explicitRef && explicitRef.trim()) {
    const ref = explicitRef.trim();
    const found = all.find((p) => projectRef(p) === ref);
    if (!found) return reject(null, `SUPABASE_PROJECT_REF ${mask(ref)} is not visible to this token`);
    if (projectOrg(found) !== orgId)
      return reject(ref, `SUPABASE_PROJECT_REF belongs to a different org than the selected one`);
    if (PRODUCTION_RE.test(String(found.name ?? "")))
      return reject(ref, `SUPABASE_PROJECT_REF names a production-looking project ("${found.name}") — refusing`);
    if (String(found.name ?? "") !== desiredName && !/staging/i.test(String(found.name ?? "")))
      return reject(ref, `SUPABASE_PROJECT_REF is not an identified Teragon staging project ("${found.name}")`);
    return { action: "reuse", ref, project: found, reason: `verified existing staging project ${mask(ref)} in org` };
  }

  // Path B — discover by name in the selected org.
  const inOrg = all.filter((p) => projectOrg(p) === orgId);
  const exact = inOrg.filter((p) => String(p.name ?? "") === desiredName);
  if (exact.length === 1) {
    const ref = projectRef(exact[0]);
    if (PRODUCTION_RE.test(String(exact[0].name ?? "")))
      return reject(ref, `the single name match looks production — refusing`);
    return { action: "reuse", ref, project: exact[0], reason: `reusing the one project named "${desiredName}" in the org` };
  }
  if (exact.length > 1) {
    return reject(null, `ambiguous: ${exact.length} projects named "${desiredName}" in the org — set SUPABASE_PROJECT_REF`);
  }

  // No exact match. If any staging-hinted (but not exact) project exists, it is
  // ambiguous — refuse to create a possible duplicate; require an explicit ref.
  const hinted = inOrg.filter((p) => STAGING_HINT_RE.test(String(p.name ?? "")) && !PRODUCTION_RE.test(String(p.name ?? "")));
  if (hinted.length > 0) {
    return reject(
      null,
      `no exact "${desiredName}", but ${hinted.length} staging-like project(s) exist — refusing to create a duplicate; set SUPABASE_PROJECT_REF`,
    );
  }
  return { action: "create", ref: null, project: null, reason: `no staging project exists in the org — will create "${desiredName}"` };
}

function reject(ref, reason) {
  return { action: "reject", ref: ref ?? null, project: null, reason };
}

/**
 * Core provisioning routine with injected adapters. Returns a structured result
 * (never process.exit — the entrypoint decides). Mutates nothing in plan mode.
 * @param {Object} deps
 * @param {'plan'|'apply'} deps.mode
 * @param {ReturnType<import('./shared/credentials.mjs').createCredentialProvider>} deps.credentials
 * @param {ReturnType<import('./shared/adapters/supabase.mjs').createSupabaseAdapter>} deps.supabase
 * @param {ReturnType<import('./shared/stage.mjs').createStageTracker>} deps.stage
 * @param {import('./shared/credentials.mjs').CredentialValidation} deps.validation
 * @param {{healthTimeoutMs?:number, pollIntervalMs?:number, sleep?:(ms:number)=>Promise<void>}} [deps.opts]
 */
export async function provisionStaging({ mode, credentials, supabase, stage, validation, opts = {} }) {
  const orgId = credentials.get("SUPABASE_ORG_ID");
  const region = (credentials.get("SUPABASE_REGION") ?? "eu-central-1").trim();
  const explicitRef = credentials.get("SUPABASE_PROJECT_REF");
  const plan = mode !== "apply";

  if (plan) {
    return {
      ok: true,
      mutated: false,
      action: "plan",
      intended: [
        `verify org ${orgId ?? "(missing)"} is accessible`,
        `inspect projects → select "${DEFAULT_STAGING_NAME}" (verify-before-create; reject prod/ambiguous)`,
        `verify region ${region}`,
        explicitRef ? `reuse verified ref ${mask(explicitRef)}` : "create only if no approved staging project exists",
        "poll health (bounded), verify ref↔org, then link; record masked ref",
      ],
    };
  }

  if (!validation.ok) return { ok: false, mutated: false, reason: "credentials not ready" };

  // 1. verify org
  stage.enter("PROVISIONING", "verifying org + inspecting projects");
  const orgs = await supabase.listOrgs();
  if (!Array.isArray(orgs) || !orgs.some((o) => (o.id ?? o.organization_id) === orgId)) {
    stage.fail("selected org not accessible");
    return { ok: false, mutated: false, reason: `selected org ${orgId} is not accessible to this authorization` };
  }

  // 2. select
  const projects = await supabase.listProjects();
  const decision = selectStagingProject({ projects, orgId, explicitRef });
  if (decision.action === "reject") {
    stage.fail(decision.reason);
    return { ok: false, mutated: false, reason: decision.reason };
  }

  let ref = decision.ref;
  let mutated = false;
  if (decision.action === "create") {
    // 4. create — the DB password is REQUIRED as an explicit --db-password argv
    //    element (CLI mandate in non-interactive mode). Sourced from the provider
    //    (never process.env directly); the value is redacted in every log/report.
    log.info(`creating staging project "${DEFAULT_STAGING_NAME}" in org (region ${region}).`);
    const created = await supabase.createProject({
      name: DEFAULT_STAGING_NAME,
      orgId,
      region,
      dbPassword: credentials.getRequired("SUPABASE_DB_PASSWORD"),
    });
    ref = created.ref;
    mutated = true;
    if (!ref) {
      stage.fail("create returned no project ref");
      return { ok: false, mutated, reason: "project create returned no ref" };
    }
  } else {
    log.ok(`reuse: ${decision.reason} (${mask(ref)}).`);
  }

  // 3/5. verify region + poll health (bounded)
  const healthTimeout = opts.healthTimeoutMs ?? 180000;
  const interval = opts.pollIntervalMs ?? 5000;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const deadline = Date.now() + healthTimeout;
  let healthy = false;
  let lastStatus = "UNKNOWN";
  let health = null;
  while (Date.now() < deadline) {
    health = await supabase.getProjectHealth(ref);
    lastStatus = health.status;
    if (health.found && projectOrg(health.project) && projectOrg(health.project) !== orgId) {
      stage.fail("provisioned ref does not belong to the selected org");
      return { ok: false, mutated, reason: "ref↔org mismatch after provisioning" };
    }
    if (health.project && String(health.project.region ?? region) !== region) {
      stage.fail(`region mismatch: expected ${region}, got ${health.project.region}`);
      return { ok: false, mutated, reason: `region mismatch (expected ${region})` };
    }
    if (/ACTIVE_HEALTHY|ACTIVE|HEALTHY/i.test(String(lastStatus))) {
      healthy = true;
      break;
    }
    await sleep(interval);
  }
  if (!healthy) {
    stage.fail(`project health timeout (last=${lastStatus})`);
    return { ok: false, mutated, reason: `project did not become healthy within ${healthTimeout}ms (last=${lastStatus})` };
  }

  // 6. link only after verification
  await supabase.link(ref);

  // 7. record the ref. The project ref is PUBLIC (it is the <ref>.supabase.co
  //    host component, not a secret), so the full ref is stored to enable a
  //    later resume to detect the exact project; a masked form is kept for logs.
  stage.markComplete("PROJECT_READY", { project: { ref, refMask: mask(ref), orgVerified: true, region } }, decision.action);

  // 8. connection discovery (S7.0.1): resolve URL + classify API keys, inject
  //    into the runtime context so migrate/bootstrap/netlify become ready in the
  //    SAME apply. Fails CLOSED if required key types cannot be retrieved AFTER
  //    creation. Persist only SAFE metadata (ref + URL); never the server key.
  const conn = await discoverAndInjectConnection({ supabase, credentials, ref, orgId });
  if (!conn.ok) {
    stage.fail(`connection discovery failed: ${conn.reason}`);
    return { ok: false, mutated, reason: `connection discovery failed: ${conn.reason}` };
  }
  stage.markComplete(
    "PROJECT_READY",
    { project: { ref, refMask: mask(ref), orgVerified: true, region, urlHost: conn.report.urlHost, browserKeySource: conn.report.browserKeySource, serverKeySource: conn.report.serverKeySource } },
    "connection discovered",
  );
  return { ok: true, mutated, action: decision.action, refMask: mask(ref), connection: conn.report };
}

// --- thin entrypoint ---------------------------------------------------------
async function main() {
  const mode = resolveMode();
  const gate = assertApplyAllowed(mode);
  const credentials = createCredentialProvider();
  const validation = await credentials.validate("provision-staging");

  log.step(`provision-staging — mode=${mode}`);
  if (mode === "apply" && !gate.allowed) {
    log.error(`refused: ${gate.reason}. No remote action taken.`);
    process.exit(3);
  }
  if (mode === "apply") {
    enforceOrExit(validation);
  } else {
    for (const line of describeValidation(validation)) log.plain(`  ${line}`);
  }

  const supabase = createSupabaseAdapter({ credentials: credentials.get });
  const stage = createStageTracker();
  const result = await provisionStaging({ mode, credentials, supabase, stage, validation });
  if (!result.ok) {
    log.error(`provision-staging refused/failed: ${result.reason}`);
    process.exit(result.reason && result.mutated ? 1 : 2);
  }
  if (result.action === "plan") {
    log.step("provision-staging PLAN — nothing contacted or mutated.");
    for (const line of result.intended) log.plain(`  would: ${line}`);
  } else {
    log.ok(`provision-staging complete (${result.action}, ref ${result.refMask}).`);
  }
  process.exit(0);
}

if (isEntrypoint(import.meta.url)) {
  main().catch((err) => {
    log.error(`provision-staging failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
