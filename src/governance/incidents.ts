// TERAGON AI BUSINESS OS — incident management (Wave 8, W8-B).
// Real records with a guarded flow: open → assign → contain → resolve →
// post-incident review → close. Closing REQUIRES a GovernanceReview (no
// closure without lessons learned) — enforced here and by the schema.
import {
  governanceIncidentSchema,
  governanceReviewSchema,
  type GovernanceIncident,
  type GovernanceReview,
  type GovernanceRiskSeverity,
} from "@/domain/governance";
import { nextId } from "@/repositories/Repository";
import type { GovernanceStores } from "@/repositories/governanceStores";
import { GovernanceError } from "./errors";
import { writeGovernanceAudit, type Clock } from "./riskRegister";

export interface OpenIncidentInput {
  titleHe: string;
  descriptionHe: string;
  severity: GovernanceRiskSeverity;
  reportedById: string;
  reportedByName: string;
  relatedAuditEventIds?: string[];
  relatedRiskIds?: string[];
}

export async function openIncident(
  stores: GovernanceStores,
  input: OpenIncidentInput,
  clock: Clock,
): Promise<GovernanceIncident> {
  if (!input.titleHe.trim() || !input.descriptionHe.trim()) {
    throw new GovernanceError("GOV_INCIDENT_STATE_INVALID", "אירוע מחייב כותרת ותיאור");
  }
  // related audit events must be REAL records — never free-text references
  const auditIds = new Set((await stores.audit.list()).map((a) => a.id));
  for (const ref of input.relatedAuditEventIds ?? []) {
    if (!auditIds.has(ref)) {
      throw new GovernanceError(
        "GOV_INCIDENT_STATE_INVALID",
        `אירוע ביקורת "${ref}" אינו קיים — קישור חייב להצביע על רשומה אמיתית`,
      );
    }
  }
  const ts = clock();
  const existing = await stores.incidents.list();
  const incident: GovernanceIncident = governanceIncidentSchema.parse({
    id: nextId("gi", existing.map((i) => i.id)),
    createdAt: ts,
    updatedAt: ts,
    titleHe: input.titleHe,
    descriptionHe: input.descriptionHe,
    severity: input.severity,
    status: "חדש",
    reportedById: input.reportedById,
    reportedByName: input.reportedByName,
    assignedToId: null,
    assignedToName: null,
    relatedAuditEventIds: input.relatedAuditEventIds ?? [],
    relatedRiskIds: input.relatedRiskIds ?? [],
    containmentHe: null,
    resolutionHe: null,
    reviewId: null,
    followUpActionsHe: [],
    openedAt: ts,
    containedAt: null,
    resolvedAt: null,
    closedAt: null,
  } satisfies GovernanceIncident);
  const created = await stores.incidents.create(incident);
  await writeGovernanceAudit(stores, clock, {
    actor: input.reportedById,
    action: "governance.incident-opened",
    entityRef: `governance-incident:${created.id}`,
    detailsHe: `נפתח אירוע: "${input.titleHe}" (חומרה: ${input.severity})`,
    correlationId: created.id,
  });
  return created;
}

async function requireIncident(
  stores: GovernanceStores,
  incidentId: string,
): Promise<GovernanceIncident> {
  const incident = await stores.incidents.get(incidentId);
  if (!incident) {
    throw new GovernanceError("GOV_INCIDENT_NOT_FOUND", `אירוע "${incidentId}" לא נמצא`);
  }
  return incident;
}

export async function assignIncident(
  stores: GovernanceStores,
  input: { incidentId: string; assignedToId: string; assignedToName: string; byId: string },
  clock: Clock,
): Promise<GovernanceIncident> {
  const incident = await requireIncident(stores, input.incidentId);
  if (incident.status === "סגור") {
    throw new GovernanceError("GOV_INCIDENT_STATE_INVALID", "אין להקצות אירוע סגור");
  }
  const ts = clock();
  const updated = await stores.incidents.update(incident.id, {
    assignedToId: input.assignedToId,
    assignedToName: input.assignedToName,
    status: incident.status === "חדש" ? "בטיפול" : incident.status,
    updatedAt: ts,
  });
  await writeGovernanceAudit(stores, clock, {
    actor: input.byId,
    action: "governance.incident-assigned",
    entityRef: `governance-incident:${incident.id}`,
    detailsHe: `האירוע הוקצה ל-${input.assignedToName}`,
    correlationId: incident.id,
  });
  return updated;
}

export async function containIncident(
  stores: GovernanceStores,
  input: { incidentId: string; containmentHe: string; byId: string },
  clock: Clock,
): Promise<GovernanceIncident> {
  const incident = await requireIncident(stores, input.incidentId);
  if (incident.status !== "בטיפול") {
    throw new GovernanceError(
      "GOV_INCIDENT_STATE_INVALID",
      `הכלה מותרת רק לאירוע בטיפול (מצב: ${incident.status})`,
    );
  }
  if (!input.containmentHe.trim()) {
    throw new GovernanceError("GOV_REASON_REQUIRED", "הכלה מחייבת תיאור צעדי הכלה");
  }
  const ts = clock();
  const updated = await stores.incidents.update(incident.id, {
    status: "מוכל",
    containmentHe: input.containmentHe,
    containedAt: ts,
    updatedAt: ts,
  });
  await writeGovernanceAudit(stores, clock, {
    actor: input.byId,
    action: "governance.incident-contained",
    entityRef: `governance-incident:${incident.id}`,
    detailsHe: `האירוע הוכל: ${input.containmentHe}`,
    correlationId: incident.id,
  });
  return updated;
}

export async function resolveIncident(
  stores: GovernanceStores,
  input: { incidentId: string; resolutionHe: string; byId: string },
  clock: Clock,
): Promise<GovernanceIncident> {
  const incident = await requireIncident(stores, input.incidentId);
  if (incident.status !== "מוכל") {
    throw new GovernanceError(
      "GOV_INCIDENT_STATE_INVALID",
      `פתרון מותר רק לאירוע מוכל (מצב: ${incident.status})`,
    );
  }
  if (!input.resolutionHe.trim()) {
    throw new GovernanceError("GOV_REASON_REQUIRED", "פתרון מחייב תיאור");
  }
  const ts = clock();
  const updated = await stores.incidents.update(incident.id, {
    status: "נפתר",
    resolutionHe: input.resolutionHe,
    resolvedAt: ts,
    updatedAt: ts,
  });
  await writeGovernanceAudit(stores, clock, {
    actor: input.byId,
    action: "governance.incident-resolved",
    entityRef: `governance-incident:${incident.id}`,
    detailsHe: `האירוע נפתר: ${input.resolutionHe}`,
    correlationId: incident.id,
  });
  return updated;
}

export interface ReviewIncidentInput {
  incidentId: string;
  reviewerId: string;
  reviewerName: string;
  summaryHe: string;
  findingsHe: string[];
  followUpsHe: string[];
}

/** Post-incident review — creates the GovernanceReview and links it. */
export async function reviewIncident(
  stores: GovernanceStores,
  input: ReviewIncidentInput,
  clock: Clock,
): Promise<GovernanceReview> {
  const incident = await requireIncident(stores, input.incidentId);
  if (incident.status !== "נפתר") {
    throw new GovernanceError(
      "GOV_INCIDENT_STATE_INVALID",
      `תחקיר מותר רק לאירוע נפתר (מצב: ${incident.status})`,
    );
  }
  if (!input.summaryHe.trim()) {
    throw new GovernanceError("GOV_REASON_REQUIRED", "תחקיר מחייב סיכום");
  }
  const ts = clock();
  const existing = await stores.reviews.list();
  const review: GovernanceReview = governanceReviewSchema.parse({
    id: nextId("grv", existing.map((r) => r.id)),
    createdAt: ts,
    updatedAt: ts,
    subjectKind: "incident",
    subjectRef: `governance-incident:${incident.id}`,
    reviewerId: input.reviewerId,
    reviewerName: input.reviewerName,
    summaryHe: input.summaryHe,
    findingsHe: input.findingsHe,
    followUpsHe: input.followUpsHe,
    reviewedAt: ts,
    nextReviewAt: null,
  } satisfies GovernanceReview);
  const created = await stores.reviews.create(review);
  await stores.incidents.update(incident.id, {
    status: "בתחקיר",
    reviewId: created.id,
    followUpActionsHe: input.followUpsHe,
    updatedAt: ts,
  });
  await writeGovernanceAudit(stores, clock, {
    actor: input.reviewerId,
    action: "governance.incident-reviewed",
    entityRef: `governance-incident:${incident.id}`,
    detailsHe: `תחקיר הושלם על ידי ${input.reviewerName}: ${input.summaryHe}`,
    correlationId: incident.id,
  });
  return created;
}

/** Close an incident — ONLY after the post-incident review exists. */
export async function closeIncident(
  stores: GovernanceStores,
  input: { incidentId: string; byId: string; byName: string },
  clock: Clock,
): Promise<GovernanceIncident> {
  const incident = await requireIncident(stores, input.incidentId);
  if (incident.status !== "בתחקיר" || !incident.reviewId) {
    throw new GovernanceError(
      "GOV_INCIDENT_STATE_INVALID",
      "סגירת אירוע מחייבת תחקיר שהושלם — אין סגירה ללא הפקת לקחים",
    );
  }
  const ts = clock();
  const updated = await stores.incidents.update(incident.id, {
    status: "סגור",
    closedAt: ts,
    updatedAt: ts,
  });
  await writeGovernanceAudit(stores, clock, {
    actor: input.byId,
    action: "governance.incident-closed",
    entityRef: `governance-incident:${incident.id}`,
    detailsHe: `האירוע נסגר על ידי ${input.byName} לאחר תחקיר ${incident.reviewId}`,
    correlationId: incident.id,
  });
  return updated;
}
