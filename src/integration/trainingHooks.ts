// W6-E — training/learning DRAFT hooks (Phase 6.18 data side).
// PURE draft-producing functions ONLY: a completed exercise yields a
// LearningObservation draft; repeated difficulty across students yields an
// instructor-insight draft. Every draft requires the canonical approval flow
// downstream — nothing here writes or approves (tested). The governed-learning
// workstream owns the concrete collections.
import type { Enrollment, StageProgress } from "@/domain/types";
import { DRAFT_STATUS } from "./serviceMemoryHooks";

export interface LearningObservationDraft {
  kind: "learning-observation";
  status: typeof DRAFT_STATUS;
  approvalRequired: true;
  producedBy: string;
  studentId: string;
  studentName: string;
  courseId: string;
  stageId: string;
  observation: string;
  sourceRef: string;
  observedAt: string;
}

export interface InstructorInsightDraft {
  kind: "instructor-insight";
  status: typeof DRAFT_STATUS;
  approvalRequired: true;
  producedBy: string;
  stageId: string;
  insight: string;
  affectedStudents: { studentId: string; studentName: string }[];
  sourceRefs: string[];
}

/** stage statuses that mean "the exercise is done" */
const COMPLETED_STAGE: ReadonlySet<string> = new Set(["אושר"]);

/** stage statuses that mean "the student is struggling here" */
const DIFFICULTY_STAGE: ReadonlySet<string> = new Set([
  "חסום / צריך עזרה",
  "נדרש תיקון",
  "באיחור",
]);

/**
 * Completed exercise (approved stage) → LearningObservation DRAFT.
 * Returns null when the stage is not completed — no invented progress.
 */
export function observationFromCompletedExercise(
  enrollment: Enrollment,
  stage: StageProgress,
): LearningObservationDraft | null {
  if (!COMPLETED_STAGE.has(stage.status)) return null;
  return {
    kind: "learning-observation",
    status: DRAFT_STATUS,
    approvalRequired: true,
    producedBy: "trainingHooks.observationFromCompletedExercise",
    studentId: enrollment.studentId,
    studentName: enrollment.studentName,
    courseId: enrollment.courseId,
    stageId: stage.stageId,
    observation: `השלב «${stage.stageId}» הושלם ואושר (עודכן ${stage.updated.slice(0, 10)})`,
    sourceRef: `enrollment:${enrollment.id}`,
    observedAt: stage.updated,
  };
}

/**
 * Repeated difficulty: the SAME stage is stuck for ≥ minStudents students →
 * one instructor-insight DRAFT per such stage (deterministic order).
 */
export function insightsFromRepeatedDifficulty(
  enrollments: readonly Enrollment[],
  minStudents = 2,
): InstructorInsightDraft[] {
  const byStage = new Map<string, { enrollment: Enrollment; stage: StageProgress }[]>();
  for (const e of enrollments) {
    for (const s of e.stages) {
      if (!DIFFICULTY_STAGE.has(s.status)) continue;
      const list = byStage.get(s.stageId) ?? [];
      list.push({ enrollment: e, stage: s });
      byStage.set(s.stageId, list);
    }
  }
  return [...byStage.entries()]
    .filter(([, list]) => list.length >= minStudents)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([stageId, list]) => ({
      kind: "instructor-insight" as const,
      status: DRAFT_STATUS,
      approvalRequired: true as const,
      producedBy: "trainingHooks.insightsFromRepeatedDifficulty",
      stageId,
      insight: `${list.length} תלמידים מתקשים באותו שלב («${stageId}») — ייתכן פער בחומר או בהנחיה. מומלץ לבחון את התרגיל.`,
      affectedStudents: list
        .map((x) => ({ studentId: x.enrollment.studentId, studentName: x.enrollment.studentName }))
        .sort((a, b) => a.studentId.localeCompare(b.studentId)),
      sourceRefs: list.map((x) => `enrollment:${x.enrollment.id}`).sort(),
    }));
}
