#!/usr/bin/env node
// TERAGON AI BUSINESS OS — remote schema verification (Gate S7.1).
// =============================================================================
// Runs AFTER migrate. Queries the LIVE linked project once and verifies the
// applied schema against the locally-validated CI baseline (schema-expectations):
// migration count, 47 public tables, expected namespaces, RLS enabled on EVERY
// protected table, required functions/RPCs incl. bootstrap_admin, FK + CHECK
// constraints present, non-null organization_id on tenant tables, index count,
// storage buckets, and RLS policy presence. It NEVER auto-repairs — it reports
// exact diffs and FAILS closed on unexplained drift. Records safe totals only.
import process from "node:process";
import { log } from "./shared/log.mjs";
import {
  EXPECTED_TABLE_COUNT,
  EXPECTED_MIGRATION_COUNT,
  EXPECTED_NAMESPACES,
  EXPECTED_RLS_DISABLED,
  REQUIRED_FUNCTIONS,
  EXPECTED_STORAGE_BUCKETS,
  buildIntrospectionSql,
} from "./shared/schema-expectations.mjs";
import { normalizeSchemaRow, IntrospectionParseError } from "./shared/schema-normalize.mjs";
import { isEntrypoint } from "./shared/runtime.mjs";

/**
 * PURE comparison of the NORMALIZED introspection totals against the expected
 * baseline. Input is the strictly-typed object from normalizeSchemaRow (integer
 * counts + string[] arrays) — so this function does NO coercion and never turns
 * a parse issue into a false "missing functions". Callers must normalize first.
 * @param {ReturnType<typeof normalizeSchemaRow>} norm
 * @returns {{ok:boolean, diffs:string[], totals:object}}
 */
export function compareSchema(norm) {
  const diffs = [];
  const {
    publicTables,
    namespaces,
    migrations,
    functionsPresent,
    indexes,
    fkConstraints,
    checkConstraints,
    rlsDisabledTables: rlsDisabled,
    nullableOrgidTenantTables: nullableOrgId,
    storageBuckets,
    rlsPolicies,
  } = norm;

  if (publicTables !== EXPECTED_TABLE_COUNT) diffs.push(`public tables: expected ${EXPECTED_TABLE_COUNT}, found ${publicTables}`);
  if (namespaces < EXPECTED_NAMESPACES.length) diffs.push(`namespaces: expected >= ${EXPECTED_NAMESPACES.length} (${EXPECTED_NAMESPACES.join(",")}), found ${namespaces}`);
  if (migrations !== EXPECTED_MIGRATION_COUNT) diffs.push(`applied migrations: expected ${EXPECTED_MIGRATION_COUNT}, found ${migrations}`);
  const missingFns = REQUIRED_FUNCTIONS.filter((f) => !functionsPresent.includes(f));
  if (missingFns.length) diffs.push(`missing functions: ${missingFns.join(", ")}`);
  if (rlsDisabled.length !== EXPECTED_RLS_DISABLED) diffs.push(`tables WITHOUT RLS: ${rlsDisabled.join(", ") || "(none)"} (expected 0)`);
  if (nullableOrgId.length !== 0) diffs.push(`tenant tables with NULLABLE organization_id: ${nullableOrgId.join(", ")}`);
  if (fkConstraints <= 0) diffs.push(`FK constraints: expected > 0, found ${fkConstraints}`);
  if (checkConstraints <= 0) diffs.push(`CHECK constraints: expected > 0, found ${checkConstraints}`);
  if (indexes <= 0) diffs.push(`indexes: expected > 0, found ${indexes}`);
  if (rlsPolicies <= 0) diffs.push(`RLS policies: expected > 0, found ${rlsPolicies}`);
  if (storageBuckets !== EXPECTED_STORAGE_BUCKETS.length) diffs.push(`storage buckets: expected ${EXPECTED_STORAGE_BUCKETS.length} (${EXPECTED_STORAGE_BUCKETS.join(",")}), found ${storageBuckets}`);

  const totals = {
    publicTables,
    namespaces,
    migrations,
    requiredFunctionsPresent: `${functionsPresent.length}/${REQUIRED_FUNCTIONS.length}`,
    bootstrapAdminPresent: functionsPresent.includes("bootstrap_admin"),
    indexes,
    fkConstraints,
    checkConstraints,
    rlsPolicies,
    rlsDisabledCount: rlsDisabled.length,
    nullableOrgIdCount: nullableOrgId.length,
    storageBuckets,
  };
  return { ok: diffs.length === 0, diffs, totals };
}

/**
 * Core schema-verification with an injected db adapter. Never process.exit.
 * @param {Object} deps
 * @param {'plan'|'apply'} deps.mode
 * @param {{query:(sql:string)=>Promise<any[]>}} deps.db
 * @param {ReturnType<import('./shared/stage.mjs').createStageTracker>} deps.stage
 */
export async function verifySchema({ mode, db, stage }) {
  if (mode !== "apply") {
    return {
      ok: true,
      mutated: false,
      action: "plan",
      intended: [
        `query live schema once and compare against the CI baseline (${EXPECTED_TABLE_COUNT} tables, ${EXPECTED_MIGRATION_COUNT} migrations)`,
        "verify RLS enabled on every protected table + required functions incl. bootstrap_admin",
        "verify FK/CHECK constraints, non-null organization_id on tenant tables, storage buckets, RLS policies",
        "FAIL on unexplained drift; never auto-repair; record safe totals only",
      ],
    };
  }

  // 1. run the introspection query (temp-file adapter).
  let rows;
  try {
    rows = await db.query(buildIntrospectionSql());
  } catch {
    // Query/transport failure — a distinct category, never "schema drift".
    stage.fail("introspection query failed (INTROSPECTION_QUERY_FAILURE)");
    return { ok: false, mutated: false, category: "INTROSPECTION_QUERY_FAILURE", reason: "schema introspection query failed" };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    stage.fail("introspection returned no rows (INTROSPECTION_QUERY_FAILURE)");
    return { ok: false, mutated: false, category: "INTROSPECTION_QUERY_FAILURE", reason: "schema introspection returned no rows" };
  }

  // 2. NORMALIZE + strict-validate. A parse failure is INTROSPECTION_PARSE_FAILURE
  //    and MUST NOT be reported as schema drift / missing functions.
  let norm;
  try {
    norm = normalizeSchemaRow(rows[0]);
  } catch (err) {
    const field = err instanceof IntrospectionParseError ? err.field : "<row>";
    stage.fail(`introspection parse failure at ${field} (INTROSPECTION_PARSE_FAILURE)`);
    return {
      ok: false,
      mutated: false,
      category: "INTROSPECTION_PARSE_FAILURE",
      reason: `introspection parse failure (harness result parsing, NOT a schema defect): field ${field}`,
    };
  }

  // 3. compare the NORMALIZED object against the CI baseline.
  const result = compareSchema(norm);
  if (!result.ok) {
    stage.fail(`schema drift: ${result.diffs.length} finding(s) (SCHEMA_DRIFT)`);
    return {
      ok: false,
      mutated: false,
      category: "SCHEMA_DRIFT",
      reason: `schema drift (no auto-repair): ${result.diffs.join("; ")}`,
      diffs: result.diffs,
      totals: result.totals,
    };
  }
  stage.markComplete("SCHEMA_VERIFIED", { schema: result.totals }, "schema matches CI baseline");
  return { ok: true, mutated: false, totals: result.totals };
}

// --- thin entrypoint (only meaningful inside the orchestrated apply) ---------
if (isEntrypoint(import.meta.url)) {
  log.error("schema-verify runs inside `platform:staging:apply` (needs the shared linked db). Run the orchestrator.");
  process.exit(2);
}
