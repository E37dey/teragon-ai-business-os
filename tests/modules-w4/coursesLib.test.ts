// Wave 4 — courses module: progress derivation, approval queue, delayed queue,
// deterministic next-exercise recommendation, certificate eligibility.
import { describe, expect, it } from "vitest";
import type { Enrollment, LearningPath, StageProgress } from "@/domain/types";
import {
  approvalQueue,
  certificateEligible,
  completionStats,
  currentStage,
  delayedQueue,
  nextExercise,
  progressPercent,
} from "@/modules/courses/lib";

function sp(stageId: string, patch: Partial<StageProgress> = {}): StageProgress {
  return {
    stageId,
    status: "לא התחיל",
    due: "2026-08-01",
    text: "",
    files: [],
    links: [],
    checklistDone: [],
    notes: [],
    help: "",
    updated: "2026-07-01",
    ...patch,
  };
}

function enr(stages: StageProgress[], patch: Partial<Enrollment> = {}): Enrollment {
  return {
    id: "en-x",
    studentId: "st-x",
    studentName: "תלמיד בדיקה",
    courseId: "c-x",
    payment: "שולם",
    stages,
    createdAt: "2026-07-01T08:00:00.000Z",
    updatedAt: "2026-07-01T08:00:00.000Z",
    ...patch,
  };
}

const PATH: LearningPath = {
  id: "lp-x",
  name: "מסלול בדיקה",
  courseId: "c-x",
  stages: [
    { id: "s1", order: 1, name: "שלב א", requiresApproval: true, description: "", checklist: [] },
    { id: "s2", order: 2, name: "שלב ב", requiresApproval: false, description: "", checklist: [] },
    { id: "s3", order: 3, name: "שלב ג", requiresApproval: true, description: "", checklist: [] },
  ],
  createdAt: "2026-07-01T08:00:00.000Z",
  updatedAt: "2026-07-01T08:00:00.000Z",
};

describe("progressPercent", () => {
  it("is the % of approved stages", () => {
    const e = enr([sp("s1", { status: "אושר" }), sp("s2"), sp("s3")]);
    expect(progressPercent(e)).toBe(33);
  });
  it("is null (unmeasured) with no stages — never invented", () => {
    expect(progressPercent(enr([]))).toBeNull();
  });
  it("100% when all approved", () => {
    const e = enr([sp("s1", { status: "אושר" }), sp("s2", { status: "אושר" })]);
    expect(progressPercent(e)).toBe(100);
  });
});

describe("currentStage", () => {
  it("is the first non-approved stage", () => {
    const e = enr([sp("s1", { status: "אושר" }), sp("s2", { status: "בעבודה" }), sp("s3")]);
    expect(currentStage(e)?.stageId).toBe("s2");
  });
  it("is null when the path is complete", () => {
    expect(currentStage(enr([sp("s1", { status: "אושר" })]))).toBeNull();
  });
});

describe("nextExercise — deterministic recommendation", () => {
  it("a stage returned for fixing wins over everything", () => {
    const e = enr([
      sp("s1", { status: "אושר" }),
      sp("s2", { status: "בעבודה" }),
      sp("s3", { status: "נדרש תיקון" }),
    ]);
    const rec = nextExercise(e, PATH);
    expect(rec?.stage.id).toBe("s3");
    expect(rec?.reason).toContain("החזיר");
  });
  it("a blocked stage wins over the first open one", () => {
    const e = enr([sp("s1", { status: "חסום / צריך עזרה" }), sp("s2", { status: "בעבודה" })]);
    expect(nextExercise(e, PATH)?.stage.id).toBe("s1");
  });
  it("otherwise the first open stage in path order", () => {
    const e = enr([sp("s1", { status: "אושר" }), sp("s2"), sp("s3")]);
    expect(nextExercise(e, PATH)?.stage.id).toBe("s2");
  });
  it("null when complete, empty or no path", () => {
    expect(nextExercise(enr([sp("s1", { status: "אושר" })]), PATH)).toBeNull();
    expect(nextExercise(enr([]), PATH)).toBeNull();
    expect(nextExercise(enr([sp("s1")]), undefined)).toBeNull();
  });
});

describe("approvalQueue", () => {
  it("collects stages waiting for the instructor", () => {
    const list = [
      enr([sp("s1", { status: "הוגש לבדיקה" })], { id: "en-1" }),
      enr([sp("s2", { status: "ממתין לאישור מדריך" })], { id: "en-2" }),
      enr([sp("s3", { status: "בעבודה" })], { id: "en-3" }),
    ];
    const q = approvalQueue(list);
    expect(q).toHaveLength(2);
    expect(q.map((x) => x.enrollment.id)).toEqual(["en-1", "en-2"]);
  });
});

describe("delayedQueue", () => {
  const today = "2026-07-22";
  it("includes blocked / needs-fix stages and the overdue current stage once", () => {
    const e = enr([
      sp("s1", { status: "אושר" }),
      sp("s2", { status: "בעבודה", due: "2026-07-10" }), // current + overdue
      sp("s3", { status: "לא התחיל", due: "2026-07-01" }), // untouched overdue — NOT counted
    ]);
    const q = delayedQueue([e], today);
    expect(q).toHaveLength(1);
    expect(q[0]?.stage.stageId).toBe("s2");
    expect(q[0]?.kind).toBe("באיחור");
  });
  it("blocked stages always appear", () => {
    const e = enr([sp("s1", { status: "חסום / צריך עזרה" })]);
    expect(delayedQueue([e], today)[0]?.kind).toBe("חסום / צריך עזרה");
  });
  it("a submitted stage is not delayed", () => {
    const e = enr([sp("s1", { status: "הוגש לבדיקה", due: "2026-07-01" })]);
    expect(delayedQueue([e], today)).toHaveLength(0);
  });
});

describe("certificateEligible", () => {
  it("true only when every stage of a non-empty path is approved", () => {
    expect(certificateEligible(enr([sp("s1", { status: "אושר" })]))).toBe(true);
    expect(certificateEligible(enr([sp("s1", { status: "אושר" }), sp("s2")]))).toBe(false);
    expect(certificateEligible(enr([]))).toBe(false);
  });
});

describe("completionStats", () => {
  it("averages measurable enrollments per course", () => {
    const course = {
      id: "c-x",
      name: "קורס",
      type: "קורס",
      start: "2026-07-01",
      end: "2026-08-01",
      price: 0,
      status: "פעיל" as const,
      zoom: "",
      instructorId: "u-oren",
      isAI: false,
      blurb: "",
      createdAt: "2026-07-01T08:00:00.000Z",
      updatedAt: "2026-07-01T08:00:00.000Z",
    };
    const stats = completionStats(
      [course],
      [
        enr([sp("s1", { status: "אושר" }), sp("s2")], { id: "en-1" }), // 50%
        enr([sp("s1", { status: "אושר" })], { id: "en-2" }), // 100%
        enr([], { id: "en-3" }), // unmeasurable
      ],
    );
    expect(stats[0]?.students).toBe(3);
    expect(stats[0]?.avgProgress).toBe(75);
  });
  it("avgProgress is null when nothing is measurable", () => {
    const stats = completionStats(
      [
        {
          id: "c-y",
          name: "y",
          type: "y",
          start: "2026-07-01",
          end: "2026-08-01",
          price: 0,
          status: "פעיל",
          zoom: "",
          instructorId: "u",
          isAI: false,
          blurb: "",
          createdAt: "2026-07-01T08:00:00.000Z",
          updatedAt: "2026-07-01T08:00:00.000Z",
        },
      ],
      [],
    );
    expect(stats[0]?.avgProgress).toBeNull();
  });
});
