// TERAGON AI BUSINESS OS — zod schemas for the system-health domain (W8-D).
// Every snapshot persisted to healthSnapshots and every incident written to
// governanceIncidents is validated here first — malformed records never land.
import { z } from "zod";
import { COMPONENT_STATES, HEALTH_COMPONENT_IDS } from "./types";

export const componentStateSchema = z.enum(COMPONENT_STATES);
export const healthComponentIdSchema = z.enum(HEALTH_COMPONENT_IDS);

const isoDate = z.string().min(1);

export const systemComponentHealthSchema = z.object({
  componentId: healthComponentIdSchema,
  nameHe: z.string().min(1),
  state: componentStateSchema,
  lastCheck: isoDate.nullable(),
  checkMethodHe: z.string().min(1),
  responseTimeMs: z.number().nonnegative().nullable(),
  lastSuccess: isoDate.nullable(),
  lastFailure: isoDate.nullable(),
  limitationHe: z.string().nullable(),
  recommendedActionHe: z.string().nullable(),
  detailHe: z.string(),
});

export const storageHealthSchema = z.object({
  usageBytes: z.number().nonnegative().nullable(),
  quotaBytes: z.number().nonnegative().nullable(),
  measured: z.boolean(),
  detailHe: z.string(),
});

export const migrationHealthSchema = z.object({
  schemaVersion: z.number().int().nullable(),
  registeredMigrations: z.number().int().nonnegative(),
  appliedMigrations: z.number().int().nonnegative(),
  pendingMigrations: z.array(z.string()),
  detailHe: z.string(),
});

export const repositoryHealthSchema = z.object({
  collection: z.string().min(1),
  count: z.number().int().nonnegative().nullable(),
  lastWrite: isoDate.nullable(),
});

export const functionHealthSchema = z.object({
  name: z.string().min(1),
  reachable: z.boolean().nullable(),
  httpStatus: z.number().int().nullable(),
  detailHe: z.string(),
});

export const providerHealthRecordSchema = z.object({
  providerId: z.string().min(1),
  displayNameHe: z.string().min(1),
  stateHe: z.string().min(1),
  checkedAt: isoDate.nullable(),
  detailHe: z.string(),
});

export const queueHealthSchema = z.object({
  agentId: z.string().min(1),
  queued: z.number().int().nonnegative(),
});

export const buildInformationSchema = z.object({
  mode: z.string().min(1),
  appVersion: z.string().min(1),
  commit: z.string().min(1),
  detailHe: z.string(),
});

export const runtimeDiagnosticSchema = z.object({
  key: z.string().min(1),
  labelHe: z.string().min(1),
  value: z.string().nullable(),
});

export const healthIncidentSchema = z.object({
  id: z.string().min(1),
  createdAt: isoDate,
  updatedAt: isoDate,
  componentId: healthComponentIdSchema,
  titleHe: z.string().min(1),
  descriptionHe: z.string().min(1),
  stateAtOpen: componentStateSchema,
  openedBy: z.string().min(1),
  status: z.enum(["פתוח", "סגור"]),
  source: z.literal("system-health"),
});

export const systemHealthSnapshotSchema = z.object({
  id: z.string().min(1),
  createdAt: isoDate,
  updatedAt: isoDate,
  takenAt: isoDate,
  components: z.array(systemComponentHealthSchema),
  storage: storageHealthSchema,
  migration: migrationHealthSchema,
  build: buildInformationSchema,
  okCount: z.number().int().nonnegative(),
  attentionCount: z.number().int().nonnegative(),
  unavailableCount: z.number().int().nonnegative(),
  uncheckedCount: z.number().int().nonnegative(),
});
