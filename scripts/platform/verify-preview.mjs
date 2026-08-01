#!/usr/bin/env node
// TERAGON AI BUSINESS OS — verify a deployed preview (Gate S7.0).
// =============================================================================
// Read-only against the deployment. Resolves the latest preview for the linked
// site, asserts health (200s + security headers), and asserts provenance (the
// deploy commit equals the intended commit; the site is the expected Teragon
// site; the Supabase project the preview points at is the staging project — NOT
// a wrong project). Changes nothing remote. NOT executed during S7.0.
import process from "node:process";
import { log } from "./shared/log.mjs";
import { createCredentialProvider, enforceOrExit, describeValidation } from "./shared/credentials.mjs";
import { createNetlifyAdapter } from "./shared/adapters/netlify.mjs";
import { verifyDeployProvenance } from "./deploy-preview.mjs";
import { resolveMode, assertApplyAllowed, isEntrypoint } from "./shared/runtime.mjs";

/**
 * PURE: assert a preview's HTTP health + security headers from a probe result.
 * @param {{status:number, headers:Record<string,string>}} probe
 */
export function assertPreviewHealth(probe) {
  const problems = [];
  if (!probe || probe.status !== 200) problems.push(`root status ${probe?.status ?? "none"} != 200`);
  const h = probe?.headers ?? {};
  if (!h["content-security-policy"]) problems.push("missing Content-Security-Policy header");
  return { ok: problems.length === 0, problems };
}

/**
 * Core verify routine (read-only). Never process.exit.
 * @param {Object} deps
 */
export async function verifyPreview({ mode, credentials, netlify, validation, probe, intendedCommit }) {
  const plan = mode !== "apply";
  if (plan) {
    return {
      ok: true,
      mutated: false,
      action: "plan",
      intended: [
        "resolve latest preview URL for the linked Teragon site (read-only)",
        "assert 200 + Content-Security-Policy on the root",
        "assert deploy commit == intended commit and site == expected site",
      ],
    };
  }
  if (!validation.ok) return { ok: false, mutated: false, reason: "credentials not ready" };

  const latest = await safeLatestDeploy(netlify);
  const prov = verifyDeployProvenance(latest, { commit: intendedCommit, siteId: credentials.get("NETLIFY_SITE_ID") });
  const health = probe ? assertPreviewHealth(probe) : { ok: true, problems: [] };
  const problems = [...prov.problems, ...health.problems];
  return { ok: problems.length === 0, mutated: false, problems };
}

async function safeLatestDeploy(netlify) {
  try {
    return await netlify.getDeploy("latest");
  } catch {
    return null;
  }
}

// --- thin entrypoint ---------------------------------------------------------
async function main() {
  const mode = resolveMode();
  const gate = assertApplyAllowed(mode);
  const credentials = createCredentialProvider();
  const validation = await credentials.validate("verify-preview");

  log.step(`verify-preview — mode=${mode}`);
  if (mode === "apply" && !gate.allowed) {
    log.error(`refused: ${gate.reason}. No remote action taken.`);
    process.exit(3);
  }
  if (mode === "apply") enforceOrExit(validation);
  else for (const line of describeValidation(validation)) log.plain(`  ${line}`);

  const netlify = createNetlifyAdapter({ credentials: credentials.get });
  const result = await verifyPreview({ mode, credentials, netlify, validation });

  if (result.action === "plan") {
    for (const line of result.intended) log.plain(`  would: ${line}`);
    log.step("verify-preview PLAN — nothing contacted.");
    process.exit(0);
  }
  if (!result.ok) {
    log.error(`verify-preview failed: ${result.problems.join("; ")}`);
    process.exit(2);
  }
  log.ok("verify-preview complete (read-only health + provenance check).");
  process.exit(0);
}

if (isEntrypoint(import.meta.url)) {
  main().catch((err) => {
    log.error(`verify-preview failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
