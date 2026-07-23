// TERAGON AI BUSINESS OS — governance bootstrap (Wave 8, W8-B).
// Idempotent, create-if-missing seeding of the governance control center:
// 10 canonical policies (drafts — NEVER auto-approved), 10 canonical risks
// (פתוח, named owners), the derived prompt registry (checksums only), and one
// labeled demo incident referencing REAL seeded audit events.
import { ApprovalEngine } from "@/agents";
import { agentStores } from "@/repositories/agentStores";
import { governanceStores, type GovernanceStores } from "@/repositories/governanceStores";
import { openIncident } from "./incidents";
import { bootstrapPolicies } from "./policies";
import { derivePromptRegistry } from "./promptRegistry";
import { bootstrapRisks, type Clock } from "./riskRegister";

export interface GovernanceBootstrapDeps {
  stores?: GovernanceStores;
  engine?: ApprovalEngine;
  clock?: Clock;
}

export interface GovernanceBootstrapResult {
  policies: number;
  risks: number;
  promptVersions: number;
  incidents: number;
}

/** Idempotent boot — safe to call on every page mount. */
export async function ensureGovernanceData(
  deps: GovernanceBootstrapDeps = {},
): Promise<GovernanceBootstrapResult> {
  const stores = deps.stores ?? governanceStores();
  const clock = deps.clock ?? (() => new Date().toISOString());
  const engine = deps.engine ?? new ApprovalEngine({ stores: agentStores(), clock });

  const policies = await bootstrapPolicies(stores, engine, clock);
  const risks = await bootstrapRisks(stores, clock);

  // prompt registry — derived from the frozen definitions; create-if-missing
  const existingPrompts = new Set((await stores.promptVersions.list()).map((p) => p.id));
  let promptVersions = 0;
  for (const record of derivePromptRegistry(clock())) {
    if (existingPrompts.has(record.id)) continue;
    await stores.promptVersions.create(record);
    promptVersions += 1;
  }

  // one labeled demo incident, referencing REAL seeded audit events (ae-1)
  let incidents = 0;
  const existingIncidents = await stores.incidents.list();
  if (existingIncidents.length === 0) {
    const auditIds = new Set((await stores.audit.list()).map((a) => a.id));
    const related = ["ae-1"].filter((id) => auditIds.has(id));
    await openIncident(
      stores,
      {
        titleHe: "נתוני הדגמה — בקשת אישור ממתינה מעל 24 שעות",
        descriptionHe:
          "טיוטת הפולואו-אפ של סוכן המכירות (approval:ap-1) ממתינה להכרעה מעל יממה — חריגה מיעד זמן התגובה לאישורים.",
        severity: "נמוכה",
        reportedById: "u-noa",
        reportedByName: "נעה פרידמן",
        relatedAuditEventIds: related,
        relatedRiskIds: ["gr-rubber-stamp-approval"],
      },
      clock,
    );
    incidents = 1;
  }

  return { policies, risks, promptVersions, incidents };
}
