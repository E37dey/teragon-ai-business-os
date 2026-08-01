#!/usr/bin/env node
// TERAGON AI BUSINESS OS — staging seed stage (Gate S7.2).
// =============================================================================
// Runs AFTER admin bootstrap is verified. Applies the deterministic, idempotent
// staging seed (supabase/seed/staging_seed.sql) to the CANONICAL admin org
// `org-teragon` via the privileged db adapter, then PROVES idempotency by
// running it a second time and asserting the safe per-domain counts are
// unchanged (no duplicate canonical records, no destructive replace). Records
// safe totals by domain only. Never seeds production; never writes credentials.
import process from "node:process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "./shared/log.mjs";
import { REPO_ROOT } from "./shared/context.mjs";
import { parseIntegerField } from "./shared/schema-normalize.mjs";
import { isEntrypoint } from "./shared/runtime.mjs";

export const SEED_PATH = join(REPO_ROOT, "supabase", "seed", "staging_seed.sql");
export const CANONICAL_STAGING_ORG = "org-teragon";
export const SEED_DOMAINS = ["crm", "products_printers", "service_repairs", "training", "tasks_approvals", "knowledge_memory", "governance_audit"];

/** Read-only per-domain row counts for the canonical staging org (safe totals). */
export function buildDomainCountSql(org = CANONICAL_STAGING_ORG) {
  const c = (t) => `(select count(*)::int from public.${t} where organization_id='${org}')`;
  return `
    select
      ${c("customers")} + ${c("leads")} as crm,
      ${c("products")} + ${c("printer_models")} as products_printers,
      ${c("service_tickets")} as service_repairs,
      ${c("courses")} + ${c("students")} + ${c("enrollments")} as training,
      ${c("tasks")} + ${c("approvals")} as tasks_approvals,
      ${c("knowledge_notes")} + ${c("memory_records")} as knowledge_memory,
      ${c("audit_events")} as governance_audit
  `;
}

/** Normalize a domain-count row to integers (fail-closed on a bad shape). */
export function normalizeDomainCounts(row) {
  const out = {};
  for (const d of SEED_DOMAINS) out[d] = parseIntegerField(row?.[d], d);
  return out;
}

async function countDomains(db) {
  const rows = await db.query(buildDomainCountSql());
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("domain count returned no rows");
  return normalizeDomainCounts(rows[0]);
}

/**
 * Core staging-seed routine with an injected db adapter. Never process.exit.
 * @param {Object} deps
 * @param {'plan'|'apply'} deps.mode
 * @param {{query:(sql:string)=>Promise<any[]>, runScriptFile:(p:string)=>Promise<{ok:boolean,error?:string}>}} deps.db
 * @param {ReturnType<import('./shared/stage.mjs').createStageTracker>} deps.stage
 */
export async function seedStaging({ mode, db, stage }) {
  if (mode !== "apply") {
    return {
      ok: true,
      mutated: false,
      action: "plan",
      intended: [
        `apply deterministic idempotent seed to ${CANONICAL_STAGING_ORG} (7 domains, ON CONFLICT DO NOTHING)`,
        "re-run to PROVE idempotency: per-domain safe counts must be unchanged (zero duplicates)",
        "record safe totals by domain only; never seed production; never write credentials",
      ],
    };
  }

  if (!existsSync(SEED_PATH)) {
    stage.fail("seed file missing");
    return { ok: false, mutated: false, reason: "staging seed file not found" };
  }

  // 1. first idempotent apply.
  const first = await db.runScriptFile(SEED_PATH);
  if (!first.ok) {
    stage.fail(`seed apply failed: ${first.error}`);
    return { ok: false, mutated: false, reason: `staging seed failed: ${first.error}` };
  }
  let totals1;
  try {
    totals1 = await countDomains(db);
  } catch (err) {
    stage.fail("seed count failed");
    return { ok: false, mutated: false, reason: `seed count failed: ${err instanceof Error ? err.message : "error"}` };
  }

  // 2. every domain must have at least one canonical record.
  const emptyDomains = SEED_DOMAINS.filter((d) => totals1[d] <= 0);
  if (emptyDomains.length) {
    stage.fail(`seed produced empty domains: ${emptyDomains.join(", ")}`);
    return { ok: false, mutated: false, reason: `seed left domains empty: ${emptyDomains.join(", ")}`, totals: totals1 };
  }

  // 3. second apply → PROVE idempotency (no duplicates, stable counts).
  const second = await db.runScriptFile(SEED_PATH);
  if (!second.ok) {
    stage.fail(`seed re-apply failed: ${second.error}`);
    return { ok: false, mutated: false, reason: `staging seed re-apply failed: ${second.error}` };
  }
  const totals2 = await countDomains(db);
  const drift = SEED_DOMAINS.filter((d) => totals1[d] !== totals2[d]);
  if (drift.length) {
    stage.fail(`seed idempotency drift: ${drift.join(", ")}`);
    return {
      ok: false,
      mutated: true,
      reason: `seed is NOT idempotent — counts changed on re-run in: ${drift.join(", ")}`,
      totals: totals2,
    };
  }

  stage.markComplete("STAGING_SEEDED", { seed: totals2 }, "seeded org-teragon (idempotent, no duplicates)");
  return { ok: true, mutated: true, idempotent: true, totals: totals2 };
}

if (isEntrypoint(import.meta.url)) {
  log.error("seed-staging runs inside `platform:staging:apply` (needs the shared linked db). Run the orchestrator.");
  process.exit(2);
}
