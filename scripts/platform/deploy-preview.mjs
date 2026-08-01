#!/usr/bin/env node
// TERAGON AI BUSINESS OS — deploy a Netlify DEPLOY PREVIEW (Gate S7.0).
// =============================================================================
// Non-production by construction (no --prod). Completed so a FUTURE apply run
// will: require a clean tree, require the EXACT reviewed branch+commit, build
// once, compute a build checksum, deploy that exact dist, verify the Netlify
// deploy's commit/provenance, reject a mismatched site/commit, and return a
// real Preview URL ONLY after success. NOT executed during S7.0 (plan/fake only).
import process from "node:process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "./shared/log.mjs";
import { createCredentialProvider, enforceOrExit, describeValidation } from "./shared/credentials.mjs";
import { createNetlifyAdapter } from "./shared/adapters/netlify.mjs";
import { createStageTracker } from "./shared/stage.mjs";
import { run } from "./shared/exec.mjs";
import { gitFacts, REPO_ROOT } from "./shared/context.mjs";
import { resolveMode, assertApplyAllowed, isEntrypoint } from "./shared/runtime.mjs";

/**
 * PURE precondition check: tree must be clean and on the exact reviewed
 * branch+commit before a deploy. Returns a structured verdict.
 * @param {{commit:string|null, branch:string|null, clean:boolean|null}} git
 * @param {{branch?:string, commit?:string}} expected
 */
export function assertCleanAndReviewed(git, expected) {
  const problems = [];
  if (git.clean !== true) problems.push("working tree is not clean");
  if (!expected.branch) problems.push("REVIEW_BRANCH not provided");
  else if (git.branch !== expected.branch) problems.push(`on branch ${git.branch}, expected reviewed ${expected.branch}`);
  if (!expected.commit) problems.push("REVIEW_COMMIT not provided");
  else if (git.commit && !expected.commit.startsWith(git.commit) && !git.commit.startsWith(expected.commit))
    problems.push(`commit ${git.commit} != reviewed ${expected.commit}`);
  return { ok: problems.length === 0, problems };
}

/**
 * PURE provenance check on a returned deploy: it must be ready, on the expected
 * commit, and on the expected site. Any mismatch rejects.
 * @param {{state:string|null, commit:string|null, siteId:string|null}} deploy
 * @param {{commit?:string, siteId?:string}} expected
 */
export function verifyDeployProvenance(deploy, expected) {
  const problems = [];
  if (!deploy) return { ok: false, problems: ["no deploy returned"] };
  if (deploy.state && !/ready|prepared|uploaded/i.test(String(deploy.state))) problems.push(`deploy state ${deploy.state}`);
  if (expected.siteId && deploy.siteId && deploy.siteId !== expected.siteId) problems.push(`deploy site ${deploy.siteId} != ${expected.siteId}`);
  if (expected.commit && deploy.commit && !commitMatch(deploy.commit, expected.commit)) problems.push(`deploy commit ${deploy.commit} != intended ${expected.commit}`);
  return { ok: problems.length === 0, problems };
}

function commitMatch(a, b) {
  return a.startsWith(b) || b.startsWith(a);
}

/** Deterministic checksum of the built dist/ (sorted file digests). */
export function computeDistChecksum(dir = join(REPO_ROOT, "dist")) {
  if (!existsSync(dir)) return null;
  const files = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(dir);
  const h = createHash("sha256");
  for (const f of files) {
    h.update(f.replace(REPO_ROOT, ""));
    h.update(readFileSync(f));
  }
  return h.digest("hex");
}

/**
 * Core preview-deploy routine with injected adapter + command runner.
 * @param {Object} deps
 */
export async function deployPreview({ mode, credentials, netlify, stage, validation, cmd = run, git }) {
  const plan = mode !== "apply";
  // Reviewed branch/commit pins come through the provider (no direct env read).
  const expected = { branch: credentials.getOptional("REVIEW_BRANCH"), commit: credentials.getOptional("REVIEW_COMMIT") };

  if (plan) {
    return {
      ok: true,
      mutated: false,
      action: "plan",
      intended: [
        "require clean tree + exact reviewed REVIEW_BRANCH/REVIEW_COMMIT",
        "build once (npm run build); compute dist checksum",
        "deploy that exact dist as a Netlify PREVIEW (never --prod)",
        "verify deploy commit + site provenance; reject mismatch",
        "return the real Preview URL only after success",
      ],
    };
  }

  if (!validation.ok) return { ok: false, mutated: false, reason: "credentials not ready" };
  const facts = git ?? (await gitFacts());
  const pre = assertCleanAndReviewed(facts, expected);
  if (!pre.ok) {
    stage.fail(`preflight: ${pre.problems.join("; ")}`);
    return { ok: false, mutated: false, reason: pre.problems.join("; ") };
  }

  // build once
  const buildCode = await cmd("npm", ["run", "build"]);
  if (buildCode !== 0) {
    stage.fail("build failed");
    return { ok: false, mutated: false, reason: `build exited ${buildCode}` };
  }
  const checksum = computeDistChecksum();

  // deploy exact dist (preview — never --prod)
  const deployMeta = await netlify.deploy({ dir: "dist", prod: false });
  const deploy = deployMeta.deployId ? await netlify.getDeploy(deployMeta.deployId) : null;
  const prov = verifyDeployProvenance(deploy, { commit: facts.commit, siteId: credentials.get("NETLIFY_SITE_ID") });
  if (!prov.ok) {
    stage.fail(`provenance: ${prov.problems.join("; ")}`);
    return { ok: false, mutated: true, reason: prov.problems.join("; ") };
  }

  stage.markComplete("PREVIEW_DEPLOYED", {}, `checksum ${String(checksum).slice(0, 12)}`);
  return { ok: true, mutated: true, url: deployMeta.url, checksum, deployCommit: deploy?.commit ?? null };
}

// --- thin entrypoint ---------------------------------------------------------
async function main() {
  const mode = resolveMode();
  const gate = assertApplyAllowed(mode);
  const credentials = createCredentialProvider();
  const validation = await credentials.validate("deploy-preview");

  log.step(`deploy-preview — mode=${mode}`);
  if (mode === "apply" && !gate.allowed) {
    log.error(`refused: ${gate.reason}. No remote action taken.`);
    process.exit(3);
  }
  if (mode === "apply") enforceOrExit(validation);
  else for (const line of describeValidation(validation)) log.plain(`  ${line}`);

  const netlify = createNetlifyAdapter({ credentials: credentials.get });
  const stage = createStageTracker();
  const result = await deployPreview({ mode, credentials, netlify, stage, validation });

  if (result.action === "plan") {
    for (const line of result.intended) log.plain(`  would: ${line}`);
    log.step("deploy-preview PLAN — nothing built, deployed, or contacted.");
    process.exit(0);
  }
  if (!result.ok) {
    log.error(`deploy-preview refused/failed: ${result.reason}`);
    process.exit(2);
  }
  log.ok(`deploy-preview complete — preview URL issued (commit ${result.deployCommit}).`);
  process.exit(0);
}

if (isEntrypoint(import.meta.url)) {
  main().catch((err) => {
    log.error(`deploy-preview failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
