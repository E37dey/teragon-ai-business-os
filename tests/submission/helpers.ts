// W7-E test helpers — build a REAL SubmissionSources from the seed + the
// idempotent pure bridges (no repository needed; deterministic).
import {
  ACTIVITIES,
  APPROVALS,
  ENROLLMENTS,
  LEADS,
  METRIC_DEFINITIONS,
  METRIC_OBSERVATIONS,
  PERSONAS,
  QUOTATIONS,
  SERVICE_TICKETS,
  SUPPORT_REQUESTS,
  TRAINING_MATERIALS,
  USERS,
} from "@/repositories/seed";
import { bridgePersonas } from "@/domain/personas";
import {
  upgradeMaterials,
  upgradeObjections,
  type ObjectionRecord,
  type TrainingMaterialV2,
} from "@/domain/training-materials";
import type { SubmissionSources } from "@/domain/submission";

export const TEST_NOW_ISO = "2026-07-23T12:00:00.000Z";

export function seedObjections(): ObjectionRecord[] {
  return upgradeObjections([], TEST_NOW_ISO, (i) => `obj-${i + 1}`).records;
}

/** the honest current state: seed + pure bridges, NO deliverable approvals */
export function buildSources(overrides: Partial<SubmissionSources> = {}): SubmissionSources {
  return {
    users: USERS,
    personas: bridgePersonas(PERSONAS).personas,
    materials: upgradeMaterials(TRAINING_MATERIALS as TrainingMaterialV2[]).materials,
    objections: seedObjections(),
    approvals: APPROVALS,
    programmes: [],
    gateValidations: null,
    presenterNotes: [],
    presentationSections: [],
    supportRequests: SUPPORT_REQUESTS,
    quotations: QUOTATIONS,
    serviceTickets: SERVICE_TICKETS,
    activities: ACTIVITIES,
    leads: LEADS,
    enrollments: ENROLLMENTS,
    metricDefinitions: METRIC_DEFINITIONS,
    metricObservations: METRIC_OBSERVATIONS,
    nowISO: TEST_NOW_ISO,
    ...overrides,
  };
}
