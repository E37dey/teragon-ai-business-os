// Courses module — pure, unit-tested derivations (module-local selectors per
// PAGE_CONTRACT: repositories in, derived values out; no invented numbers).
import type {
  Course,
  CourseSession,
  Enrollment,
  ISODate,
  LearningPath,
  LearningPathStage,
  StageProgress,
} from "@/domain/types";

/** Label required next to every deterministic engine output (honesty contract). */
export const RULES_ENGINE_LABEL = "מנוע מקומי מבוסס כללים";

/** Local-time "YYYY-MM-DD" of now — matches the wall clock, not UTC. */
export function todayISO(now: Date = new Date()): ISODate {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function formatDateHe(iso: ISODate): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Statuses that count as "done" for progress purposes. */
const DONE: ReadonlySet<string> = new Set(["אושר"]);
/** Statuses that mean the student is actively waiting on the instructor. */
const AWAITING_INSTRUCTOR: ReadonlySet<string> = new Set(["הוגש לבדיקה", "ממתין לאישור מדריך"]);
/** Statuses that flag risk on their own. */
const RISK: ReadonlySet<string> = new Set(["באיחור", "חסום / צריך עזרה", "נדרש תיקון"]);

/** A stage is effectively late when its due passed and it is not done/submitted. */
export function isStageLate(sp: StageProgress, today: ISODate): boolean {
  if (DONE.has(sp.status) || AWAITING_INSTRUCTOR.has(sp.status)) return false;
  if (sp.status === "באיחור") return true;
  return sp.due < today;
}

/** Percent of approved stages (0-100, rounded). Empty stage list ⇒ null (unmeasured). */
export function progressPercent(enr: Enrollment): number | null {
  if (enr.stages.length === 0) return null;
  const done = enr.stages.filter((s) => DONE.has(s.status)).length;
  return Math.round((done / enr.stages.length) * 100);
}

/** First stage that is not approved — the student's current working stage. */
export function currentStage(enr: Enrollment): StageProgress | null {
  return enr.stages.find((s) => !DONE.has(s.status)) ?? null;
}

export interface NextExercise {
  stage: LearningPathStage;
  progress: StageProgress;
  /** deterministic reasoning line (rules engine, not a model) */
  reason: string;
}

/**
 * "התרגיל הבא" — deterministic recommendation: the first non-approved stage;
 * stages needing fix win over untouched ones. Rules engine — no model, no
 * invented confidence.
 */
export function nextExercise(enr: Enrollment, path: LearningPath | undefined): NextExercise | null {
  if (!path || enr.stages.length === 0) return null;
  const byId = new Map(path.stages.map((s) => [s.id, s]));
  const needsFix = enr.stages.find((s) => s.status === "נדרש תיקון");
  const blocked = enr.stages.find((s) => s.status === "חסום / צריך עזרה");
  const firstOpen = enr.stages.find((s) => !DONE.has(s.status));
  const pick = needsFix ?? blocked ?? firstOpen;
  if (!pick) return null;
  const stage = byId.get(pick.stageId);
  if (!stage) return null;
  const reason =
    pick === needsFix
      ? "המדריך החזיר את השלב עם הערה — התיקון קודם לכל שלב חדש."
      : pick === blocked
        ? "התלמיד סימן 'צריך עזרה' — נדרש טיפול לפני המשך המסלול."
        : "השלב הפתוח הראשון במסלול לפי הסדר שהוגדר.";
  return { stage, progress: pick, reason };
}

export interface DelayedStudentEntry {
  enrollment: Enrollment;
  stage: StageProgress;
  kind: "באיחור" | "חסום / צריך עזרה" | "נדרש תיקון";
}

/**
 * Delayed-students queue — an entry per explicitly risky stage (blocked /
 * needs-fix / marked late), plus the CURRENT working stage when its due date
 * passed (so a behind student appears once, not once per untouched stage).
 */
export function delayedQueue(
  enrollments: readonly Enrollment[],
  today: ISODate,
): DelayedStudentEntry[] {
  const out: DelayedStudentEntry[] = [];
  for (const enr of enrollments) {
    const counted = new Set<string>();
    for (const sp of enr.stages) {
      if (
        sp.status === "חסום / צריך עזרה" ||
        sp.status === "נדרש תיקון" ||
        sp.status === "באיחור"
      ) {
        out.push({ enrollment: enr, stage: sp, kind: sp.status });
        counted.add(sp.stageId);
      }
    }
    const cur = currentStage(enr);
    if (
      cur &&
      !counted.has(cur.stageId) &&
      !AWAITING_INSTRUCTOR.has(cur.status) &&
      isStageLate(cur, today)
    ) {
      out.push({ enrollment: enr, stage: cur, kind: "באיחור" });
    }
  }
  return out;
}

export interface ApprovalQueueEntry {
  enrollment: Enrollment;
  stage: StageProgress;
}

/** Stages waiting for instructor review (submit → review → approve/return). */
export function approvalQueue(enrollments: readonly Enrollment[]): ApprovalQueueEntry[] {
  const out: ApprovalQueueEntry[] = [];
  for (const enr of enrollments) {
    for (const sp of enr.stages) {
      if (AWAITING_INSTRUCTOR.has(sp.status)) out.push({ enrollment: enr, stage: sp });
    }
  }
  return out;
}

/** Certificate is derived: every stage of a non-empty path approved. */
export function certificateEligible(enr: Enrollment): boolean {
  return enr.stages.length > 0 && enr.stages.every((s) => DONE.has(s.status));
}

export interface CourseCompletionStat {
  courseId: string;
  students: number;
  /** average progress % across enrollments with stages; null when nothing measurable */
  avgProgress: number | null;
}

export function completionStats(
  courses: readonly Course[],
  enrollments: readonly Enrollment[],
): CourseCompletionStat[] {
  return courses.map((c) => {
    const enrs = enrollments.filter((e) => e.courseId === c.id);
    const pcts = enrs.map(progressPercent).filter((p): p is number => p !== null);
    return {
      courseId: c.id,
      students: enrs.length,
      avgProgress:
        pcts.length === 0 ? null : Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length),
    };
  });
}

/** Upcoming sessions sorted by time (>= now). */
export function upcomingSessions(
  sessions: readonly CourseSession[],
  nowIso: string,
): CourseSession[] {
  return sessions
    .filter((s) => s.scheduledAt >= nowIso)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

/** Count of enrollments per course. */
export function studentCount(enrollments: readonly Enrollment[], courseId: string): number {
  return enrollments.filter((e) => e.courseId === courseId).length;
}

/** Set of risky statuses exported for UI chips. */
export function isRiskStatus(status: StageProgress["status"]): boolean {
  return RISK.has(status);
}
