// TERAGON AI BUSINESS OS — W7-E: submission snapshot writer. A snapshot is an
// immutable point-in-time record of the HONEST evaluated state (never edited,
// only appended) persisted to submissionSnapshots.
import { getRepository, nextId } from "@/repositories";
import { qualitySummary, type QualityValidationResult } from "@/validation/submission/qualityValidator";
import type {
  DeliverableEvaluation,
  DeliverableState,
  ReadinessState,
  SubmissionSnapshotRecord,
} from "./types";

export async function createSubmissionSnapshot(input: {
  evaluations: readonly DeliverableEvaluation[];
  quality: readonly QualityValidationResult[];
  readiness: ReadinessState;
  blockerCount: number;
  takenById: string;
  noteHe?: string;
  nowISO?: string;
}): Promise<SubmissionSnapshotRecord> {
  const repo = getRepository<SubmissionSnapshotRecord>("submissionSnapshots");
  const now = input.nowISO ?? new Date().toISOString();
  const existing = await repo.list();
  const deliverableStates: Record<string, DeliverableState> = {};
  for (const e of input.evaluations) deliverableStates[e.key] = e.state;
  const record: SubmissionSnapshotRecord = {
    id: nextId("ssnap", existing.map((r) => r.id)),
    createdAt: now,
    updatedAt: now,
    takenAt: now,
    takenById: input.takenById,
    readiness: input.readiness,
    deliverableStates,
    qualitySummary: qualitySummary(input.quality),
    blockerCount: input.blockerCount,
    noteHe: input.noteHe ?? "",
  };
  return repo.create(record);
}
