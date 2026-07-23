// W6-E — cross-domain hook guarantees: every hook is PURE, produces
// draft-only objects born pending with approvalRequired=true, writes nothing,
// and tampered "auto-approved" drafts are rejected by the guard.
import { describe, expect, it } from "vitest";
import type { Enrollment, RepairAction, ServiceTicket, StageProgress } from "@/domain/types";
import {
  assertDraftOnly,
  DRAFT_STATUS,
  proposalFromCompletedRepair,
  questionFromRecurringIssue,
} from "@/integration/serviceMemoryHooks";
import {
  insightsFromRepeatedDifficulty,
  observationFromCompletedExercise,
} from "@/integration/trainingHooks";
import { customer360MemoryView } from "@/integration/customer360Memory";
import type { MemoryRecord } from "@/domain/types";

const NOW = "2026-07-23T12:00:00.000Z";
const base = { createdAt: NOW, updatedAt: NOW };

const closedTicket: ServiceTicket = {
  id: "t-100",
  customerName: "סטודיו דגש",
  customerId: "cu-3",
  printer: "Bambu X1C",
  issue: "סתימת אקסטרודר",
  description: "חוזר על עצמו",
  priority: "גבוהה",
  status: "נסגר",
  openedAt: NOW,
  ownerId: "u-ran",
  solution: "ניקוי + החלפת נוזל",
  ...base,
};

const action: RepairAction = {
  id: "ra-100",
  ticketId: "t-100",
  description: "תיקון: החלפת חיישן",
  performedById: "u-ran",
  performedAt: NOW,
  partsCost: 120,
  ...base,
};

const stageDone: StageProgress = {
  stageId: "st-1",
  status: "אושר",
  due: "2026-07-20",
  text: "",
  files: [],
  links: [],
  checklistDone: [],
  notes: [],
  help: "",
  updated: NOW,
};

const stageStuck: StageProgress = { ...stageDone, status: "חסום / צריך עזרה" };

const enrollment = (id: string, studentId: string, stages: StageProgress[]): Enrollment => ({
  id,
  studentId,
  studentName: `תלמיד ${studentId}`,
  courseId: "c-1",
  payment: "שולם",
  stages,
  ...base,
});

describe("cross-domain hooks — draft-only guarantees", () => {
  it("completed repair → MemoryProposal draft (pending, approval required, evidence-backed)", () => {
    const draft = proposalFromCompletedRepair(closedTicket, [action]);
    expect(draft).not.toBeNull();
    expect(draft?.status).toBe(DRAFT_STATUS);
    expect(draft?.approvalRequired).toBe(true);
    expect(draft?.layer).toBe("customer");
    expect(draft?.customerId).toBe("cu-3");
    expect(draft?.sourceRef).toBe("serviceTicket:t-100");
    expect(draft?.evidence.length).toBeGreaterThan(0);
    expect(() => assertDraftOnly(draft!)).not.toThrow();
  });

  it("open ticket / empty ticket → null, never an invented memory", () => {
    expect(proposalFromCompletedRepair({ ...closedTicket, status: "בבדיקה" }, [action])).toBeNull();
    expect(
      proposalFromCompletedRepair({ ...closedTicket, solution: "  " }, []),
    ).toBeNull();
  });

  it("recurring issue → KnowledgeQuestion draft (pending)", () => {
    const draft = questionFromRecurringIssue({
      category: "דוחות וייצוא",
      count: 4,
      requestIds: ["sr-1", "sr-2", "sr-3", "sr-4"],
    });
    expect(draft.status).toBe(DRAFT_STATUS);
    expect(draft.approvalRequired).toBe(true);
    expect(draft.sourceRefs).toHaveLength(4);
    expect(draft.question).toContain("דוחות וייצוא");
  });

  it("completed exercise → LearningObservation draft; incomplete → null", () => {
    const e = enrollment("en-1", "s-1", [stageDone]);
    const draft = observationFromCompletedExercise(e, stageDone);
    expect(draft?.status).toBe(DRAFT_STATUS);
    expect(draft?.approvalRequired).toBe(true);
    expect(draft?.sourceRef).toBe("enrollment:en-1");
    expect(observationFromCompletedExercise(e, stageStuck)).toBeNull();
  });

  it("repeated difficulty (≥2 students, same stage) → instructor insight draft", () => {
    const drafts = insightsFromRepeatedDifficulty([
      enrollment("en-1", "s-1", [stageStuck]),
      enrollment("en-2", "s-2", [stageStuck]),
      enrollment("en-3", "s-3", [stageDone]),
    ]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.status).toBe(DRAFT_STATUS);
    expect(drafts[0]?.affectedStudents.map((s) => s.studentId)).toEqual(["s-1", "s-2"]);
    // a single struggling student is NOT a pattern
    expect(insightsFromRepeatedDifficulty([enrollment("en-1", "s-1", [stageStuck])])).toEqual([]);
  });

  it("attempting to pass off an auto-approved draft FAILS the guard", () => {
    const draft = questionFromRecurringIssue({ category: "כללי", count: 3, requestIds: [] });
    const tamperedStatus = { ...draft, status: "אושר" } as unknown as typeof draft;
    const tamperedFlag = { ...draft, approvalRequired: false } as unknown as typeof draft;
    expect(() => assertDraftOnly(tamperedStatus)).toThrow(/אישור אוטומטי/);
    expect(() => assertDraftOnly(tamperedFlag)).toThrow(/אישור אוטומטי/);
  });

  it("hooks are pure — same input twice yields deep-equal drafts, inputs untouched", () => {
    const inputCopy = JSON.parse(JSON.stringify(closedTicket)) as ServiceTicket;
    const a = proposalFromCompletedRepair(closedTicket, [action]);
    const b = proposalFromCompletedRepair(closedTicket, [action]);
    expect(a).toEqual(b);
    expect(closedTicket).toEqual(inputCopy);
  });

  it("customer360 selector separates approved memory from pending proposals (derived only)", () => {
    const mem: MemoryRecord = {
      id: "mem-x",
      title: "העדפות תקשורת — סטודיו דגש",
      markdown: "",
      frontmatter: { customer: "סטודיו דגש" },
      folder: "לקוחות",
      tags: ["לקוח"],
      links: [],
      ...base,
    };
    const view = customer360MemoryView("cu-3", "סטודיו דגש", [mem], [
      { id: "mp-1", title: "לקח חדש על סטודיו דגש", status: "ממתין לאישור", customerId: "cu-3" },
      { id: "mp-2", title: "לא קשור", status: "ממתין לאישור", customerId: "cu-9" },
      { id: "mp-3", title: "כבר אושר על סטודיו דגש", status: "אושר", customerId: "cu-3" },
    ]);
    expect(view.approvedCount).toBe(1);
    expect(view.approved[0]?.id).toBe("mem-x");
    // pending shows ONLY undecided proposals for this customer — approved ones
    // are represented by the canonical memoryRecords, nothing auto-promotes
    expect(view.pending.map((p) => p.id)).toEqual(["mp-1"]);
  });
});
