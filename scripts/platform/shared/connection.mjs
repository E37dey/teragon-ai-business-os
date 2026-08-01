// TERAGON AI BUSINESS OS — project connection discovery (Gate S7.0.1).
// =============================================================================
// After a project ref is verified, resolve the connection values that only
// exist post-provision and inject them into the credential runtime context:
//   • verify the ref again (belongs to the selected org) — never create anew
//   • resolve the project URL from authoritative metadata
//   • retrieve the project API keys → classify browser/server (keys.mjs)
//   • setRuntimeValues(...) into the provider → refreshReadiness()
//
// Returns NAMES/sources only in its report; the actual key VALUES go straight
// into the runtime context (registered for redaction), never into the report,
// logs, or thrown errors. Injectable adapter → unit-testable with fakes.
import { classifyProjectKeys } from "./keys.mjs";

/**
 * @param {Object} deps
 * @param {ReturnType<import('./adapters/supabase.mjs').createSupabaseAdapter>} deps.supabase
 * @param {ReturnType<import('./credentials.mjs').createCredentialProvider>} deps.credentials
 * @param {string} deps.ref                       verified project ref
 * @param {string} [deps.orgId]                   selected org (for re-verification)
 * @returns {Promise<{ok:boolean, reason?:string, report?:object}>}
 */
export async function discoverAndInjectConnection({ supabase, credentials, ref, orgId }) {
  // 1. re-verify the ref (belongs to the selected org). Never create a project.
  const health = await supabase.getProjectHealth(ref);
  if (!health.found) return { ok: false, reason: `project ref not visible during connection discovery` };
  const projectOrg = health.project?.organization_id ?? health.project?.orgId ?? null;
  if (orgId && projectOrg && projectOrg !== orgId) {
    return { ok: false, reason: `project ref does not belong to the selected org` };
  }

  // 2. resolve URL from authoritative metadata (canonical <ref>.supabase.co).
  const meta = await supabase.getConnectionMetadata(ref);
  const url = meta?.url;
  if (!url) return { ok: false, reason: "could not resolve project URL from metadata" };

  // 3. retrieve + classify API keys (values never logged).
  let classified;
  try {
    const apiKeys = await supabase.getProjectApiKeys(ref);
    classified = classifyProjectKeys(apiKeys);
  } catch (err) {
    // Fail CLOSED after creation: inability to retrieve required key types stops here.
    return { ok: false, reason: err instanceof Error ? err.message : "key retrieval failed" };
  }

  // 4. inject into the runtime context + recalc readiness.
  credentials.setRuntimeValues({
    SUPABASE_PROJECT_REF: ref,
    SUPABASE_URL: url,
    SUPABASE_BROWSER_KEY: classified.browser.value,
    SUPABASE_SERVER_KEY: classified.server.value,
  });
  await credentials.refreshReadiness();

  // report carries NAMES + source kinds only — never a key value.
  return {
    ok: true,
    report: {
      ref,
      urlHost: safeHost(url),
      browserKeySource: classified.browser.source,
      serverKeySource: classified.server.source,
      injected: ["SUPABASE_PROJECT_REF", "SUPABASE_URL", "SUPABASE_BROWSER_KEY", "SUPABASE_SERVER_KEY"],
    },
  };
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "(url)";
  }
}
