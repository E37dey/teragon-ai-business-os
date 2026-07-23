// W8-E — cross-module wiring (integration-requests-w8d #4): the /system-health
// module (W8-D) writes HealthIncident records into the SAME collection the
// governance module renders (governanceIncidents). The two record shapes are
// distinguished by the honest discriminant `source: "system-health"` — this
// module splits them (so the governance incident table never renders a
// foreign shape) and provides the close action W8-D requested, audited into
// the canonical auditEvents collection.
import type { BaseEntity } from "@/domain/types";
import type { GovernanceIncident } from "@/domain/governance";
import type { HealthIncident } from "@/domain/system-health";
import type { GovernanceStores } from "@/repositories/governanceStores";
import { writeGovernanceAudit, type Clock } from "@/governance/riskRegister";

/** Discriminant: a governanceIncidents record written by /system-health. */
export function isHealthIncidentRecord(record: BaseEntity): record is HealthIncident {
  return (record as { source?: unknown }).source === "system-health";
}

export interface SplitIncidents {
  /** governance-lifecycle incidents (W8-B shape — the incident table rows) */
  governance: GovernanceIncident[];
  /** system-health incidents (W8-D shape — rendered in their own section) */
  health: HealthIncident[];
}

/** Deterministic split of the shared governanceIncidents collection. */
export function splitGovernanceIncidents(records: readonly BaseEntity[]): SplitIncidents {
  const governance: GovernanceIncident[] = [];
  const health: HealthIncident[] = [];
  for (const record of records) {
    if (isHealthIncidentRecord(record)) health.push(record);
    else governance.push(record as unknown as GovernanceIncident);
  }
  health.sort((a, b) => {
    const aOpen = a.status === "פתוח" ? 0 : 1;
    const bOpen = b.status === "פתוח" ? 0 : 1;
    return aOpen - bOpen || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
  });
  return { governance, health };
}

/** Open health incidents only (band/metric helpers). */
export function openHealthIncidents(records: readonly BaseEntity[]): HealthIncident[] {
  return splitGovernanceIncidents(records).health.filter((i) => i.status === "פתוח");
}

/**
 * Close a system-health incident from the governance page (the lifecycle
 * W8-D requested). Named actor mandatory; the closure is audited.
 */
export async function closeHealthIncident(
  stores: GovernanceStores,
  input: { incidentId: string; byId: string; byName: string },
  clock: Clock,
): Promise<HealthIncident> {
  if (!input.byId.trim() || !input.byName.trim()) {
    throw new Error("סגירת אירוע בריאות מחייבת מבצע בשם — אין סגירה אנונימית");
  }
  const repo = stores.collection<HealthIncident>("governanceIncidents");
  const record = await repo.get(input.incidentId);
  if (!record || !isHealthIncidentRecord(record)) {
    throw new Error(`אירוע בריאות "${input.incidentId}" לא נמצא באוסף governanceIncidents`);
  }
  if (record.status !== "פתוח") {
    throw new Error(`האירוע "${input.incidentId}" כבר סגור`);
  }
  const ts = clock();
  const updated = await repo.update(input.incidentId, { status: "סגור", updatedAt: ts });
  await writeGovernanceAudit(stores, clock, {
    actor: input.byId,
    action: "governance.health-incident-closed",
    entityRef: `governance-incident:${input.incidentId}`,
    detailsHe: `אירוע בריאות המערכת «${record.titleHe}» נסגר על ידי ${input.byName}`,
    correlationId: input.incidentId,
  });
  return updated;
}
