// TERAGON AI BUSINESS OS — immutable memory versioning (Wave 6, W6-A).
// Every approved edit = a NEW MemoryVersion (append-only store — update/remove
// throw, snapshots deep-frozen; see memoryStores.immutableStore). Restore is
// NOT a mutation: it flows through the proposal workflow and lands as a new
// approved version. The usage join answers "which AI envelope used which
// version" from persisted MemoryUsage records only.
import type {
  MemoryRecordV2,
  MemoryUsage,
  MemoryVersion,
} from "@/domain/memory";
import type { MemoryStores } from "@/memory/repositories/memoryStores";
import type { Clock } from "@/agents/runlog";
import type {
  MemoryProposalWorkflow,
  SubmitProposalInput,
} from "./proposalWorkflow";

// ---------------------------------------------------------------------------
// diff / compare (pure)
// ---------------------------------------------------------------------------

/** content fields considered for changedFields / compare */
export const VERSIONED_FIELDS: readonly (keyof MemoryRecordV2)[] = [
  "title",
  "slug",
  "bodyMarkdown",
  "memoryLayer",
  "folder",
  "entityLinks",
  "tags",
  "wikiLinks",
  "sourceIds",
  "sensitivity",
  "verificationState",
  "retentionPolicy",
  "reviewDate",
] as const;

function serialize(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** deterministic list of content fields that differ between two records */
export function diffRecordFields(a: MemoryRecordV2, b: MemoryRecordV2): string[] {
  const changed: string[] = [];
  for (const field of VERSIONED_FIELDS) {
    if (serialize(a[field]) !== serialize(b[field])) changed.push(field);
  }
  return changed;
}

export interface VersionFieldDiff {
  field: string;
  before: string;
  after: string;
}

/** compare(vA, vB): field-level diff of the two frozen snapshots */
export function compareVersions(vA: MemoryVersion, vB: MemoryVersion): VersionFieldDiff[] {
  const out: VersionFieldDiff[] = [];
  for (const field of VERSIONED_FIELDS) {
    const before = serialize(vA.snapshot[field]);
    const after = serialize(vB.snapshot[field]);
    if (before !== after) out.push({ field, before, after });
  }
  return out;
}

/** all versions of a record, ascending by versionNumber */
export function versionsOf(versions: readonly MemoryVersion[], recordId: string): MemoryVersion[] {
  return versions
    .filter((v) => v.recordId === recordId)
    .sort((a, b) => a.versionNumber - b.versionNumber);
}

export function latestVersion(
  versions: readonly MemoryVersion[],
  recordId: string,
): MemoryVersion | null {
  const list = versionsOf(versions, recordId);
  return list[list.length - 1] ?? null;
}

// ---------------------------------------------------------------------------
// restore — a NEW approved version via the proposal workflow (no bypass)
// ---------------------------------------------------------------------------

export interface RestoreRequestInput {
  recordId: string;
  versionId: string;
  requestedById: string;
  requestedByName: string;
}

/**
 * Open a restore proposal from a frozen snapshot. The restore only lands
 * after the normal human approval (workflow.approve) — as a NEW version.
 */
export async function submitRestoreProposal(
  workflow: MemoryProposalWorkflow,
  stores: MemoryStores,
  input: RestoreRequestInput,
) {
  const version = await stores.versions.get(input.versionId);
  if (!version || version.recordId !== input.recordId) {
    throw new Error(`גרסה "${input.versionId}" לא נמצאה עבור הפריט "${input.recordId}"`);
  }
  if (!version.rollbackEligible) {
    throw new Error(`גרסה ${version.versionNumber} מסומנת כלא-זמינה לשחזור`);
  }
  const s = version.snapshot;
  const submit: SubmitProposalInput = {
    observationHe: `שחזור «${s.title}» לגרסה ${version.versionNumber} (${version.id})`,
    proposedById: input.requestedById,
    proposedByName: input.requestedByName,
    draft: {
      title: s.title,
      slug: s.slug,
      bodyMarkdown: s.bodyMarkdown,
      memoryLayer: s.memoryLayer,
      folder: s.folder,
      entityLinks: s.entityLinks,
      tags: s.tags,
      sourceIds: s.sourceIds,
      sensitivity: s.sensitivity,
      retentionPolicy: s.retentionPolicy,
      reviewDate: s.reviewDate,
    },
    restore: { recordId: input.recordId, versionId: input.versionId },
  };
  return workflow.submitProposal(submit);
}

// ---------------------------------------------------------------------------
// usage join — which envelope used which version
// ---------------------------------------------------------------------------

export interface RecordUsageInput {
  envelopeId: string;
  operation: string;
  recordId: string;
  versionId: string;
  versionNumber: number;
}

/** persist one usage row (called by AI consumers when citing memory). */
export async function recordUsage(
  stores: MemoryStores,
  clock: Clock,
  input: RecordUsageInput,
): Promise<MemoryUsage> {
  const existing = await stores.usage.list();
  const ts = clock();
  const usage: MemoryUsage = {
    id: `muse-${existing.length + 1}`,
    createdAt: ts,
    updatedAt: ts,
    envelopeId: input.envelopeId,
    operation: input.operation,
    recordId: input.recordId,
    versionId: input.versionId,
    versionNumber: input.versionNumber,
    usedAt: ts,
  };
  return stores.usage.create(usage);
}

export interface UsageJoinRow {
  usage: MemoryUsage;
  version: MemoryVersion | null;
}

/** join usage rows of a record to their (immutable) versions */
export function usageJoinForRecord(
  usage: readonly MemoryUsage[],
  versions: readonly MemoryVersion[],
  recordId: string,
): UsageJoinRow[] {
  return usage
    .filter((u) => u.recordId === recordId)
    .sort((a, b) => b.usedAt.localeCompare(a.usedAt))
    .map((u) => ({ usage: u, version: versions.find((v) => v.id === u.versionId) ?? null }));
}

/** envelopes that used a SPECIFIC version */
export function envelopesForVersion(
  usage: readonly MemoryUsage[],
  versionId: string,
): string[] {
  return [...new Set(usage.filter((u) => u.versionId === versionId).map((u) => u.envelopeId))];
}
