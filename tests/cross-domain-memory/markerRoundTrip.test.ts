// W6-E — marker round-trip compatibility: OLD (un-migrated) marker-bearing
// records stay fully readable through the module libs, the NEW canonical
// fields win when present, and the legacy journey/version localStorage
// fallbacks still work. This is the honesty guarantee for mixed-state data.
import { describe, expect, it } from "vitest";
import type { Opportunity, SupportRequest, Task } from "@/domain/types";
import type {
  OpportunityX,
  QuotationX,
  SupportRequestX,
  TaskX,
} from "@/integration/domainExtensions";
import { quotationVersion } from "@/integration/quotationVersions";
import {
  cleanDescription,
  isSharedTask,
  parseMarkers,
  taskOwnership,
  taskWorkState,
  withMarkers,
} from "@/modules/tasks/lib";
import {
  effectiveCategory,
  effectiveSupport,
  parseSupport,
  supportSla,
  withSupportMarkers,
} from "@/modules/support/lib";
import { journeyStepOf } from "@/modules/sales/journey";

const NOW = "2026-07-23T12:00:00.000Z";
const base = { createdAt: NOW, updatedAt: NOW };

const oldTask: Task = {
  id: "task-old",
  title: "ישנה",
  description: "לבדוק חומרים ⟦מצב:ממתין ללקוח⟧ ⟦בעלות:משותפת⟧",
  status: "בתהליך",
  priority: "בינונית",
  due: "2026-07-30",
  ownerId: "u-tzachi",
  relatedRef: null,
  ...base,
};

const newTask: TaskX = {
  ...oldTask,
  id: "task-new",
  description: "לבדוק חומרים",
  workState: "חסום",
  ownership: "אנושית",
  legacyMarker: oldTask.description,
};

describe("marker round-trip compatibility (old data readable, fields win)", () => {
  it("old marker syntax still round-trips through parse/with", () => {
    const parsed = parseMarkers(oldTask.description);
    expect(parsed).toEqual({ state: "ממתין ללקוח", shared: true, clean: "לבדוק חומרים" });
    expect(parseMarkers(withMarkers(parsed.clean, parsed.state, parsed.shared))).toEqual(parsed);
  });

  it("un-migrated task: state/ownership derived from markers", () => {
    expect(taskWorkState(oldTask)).toBe("ממתין ללקוח");
    expect(taskOwnership(oldTask)).toBe("משימה משותפת");
    expect(isSharedTask(oldTask)).toBe(true);
    expect(cleanDescription(oldTask)).toBe("לבדוק חומרים");
  });

  it("migrated task: canonical fields WIN over anything in the description", () => {
    expect(taskWorkState(newTask)).toBe("חסום");
    expect(taskOwnership(newTask)).toBe("משימה אנושית");
    expect(isSharedTask(newTask)).toBe(false);
  });

  it("completed status always wins over any stored workState", () => {
    const done: TaskX = { ...newTask, status: "הושלמה", workState: "חסום" };
    expect(taskWorkState(done)).toBe("הושלם");
  });

  it("un-migrated support request: tier/assignee/feedback from markers", () => {
    const oldSr: SupportRequest = {
      id: "sr-old",
      subject: "בעיה בהרשאות משתמש",
      description: "אין גישה למסך ⟦Tier:3⟧ ⟦מטפל:u-ran⟧ ⟦משוב:שלילי⟧",
      requesterId: "u-maya",
      channel: "מערכת",
      status: "בטיפול",
      priority: "גבוהה",
      resolution: "",
      ...base,
    };
    const eff = effectiveSupport(oldSr);
    expect(eff).toEqual({
      tier: 3,
      assigneeId: "u-ran",
      feedback: "שלילי",
      clean: "אין גישה למסך",
    });
    expect(effectiveCategory(oldSr)).toBe("הרשאות ומשתמשים");
    // SLA target follows the marker tier (Tier 3 ⇒ 8h)
    expect(supportSla(oldSr, new Date(NOW).getTime()).targetHours).toBe(8);
    // legacy writer still produces parseable markers
    expect(parseSupport(withSupportMarkers("טקסט", 2, "u-x", "חיובי"))).toEqual({
      tier: 2,
      assigneeId: "u-x",
      feedback: "חיובי",
      clean: "טקסט",
    });
  });

  it("migrated support request: canonical fields win over stale markers", () => {
    const mixed: SupportRequestX = {
      id: "sr-mixed",
      subject: "כללי",
      description: "טקסט ⟦Tier:3⟧",
      tier: 1,
      assigneeId: null,
      feedback: null,
      category: "תפעול המערכת",
      requesterId: "u-maya",
      channel: "מערכת",
      status: "פתוחה",
      priority: "נמוכה",
      resolution: "",
      ...base,
    };
    expect(effectiveSupport(mixed).tier).toBe(1);
    expect(effectiveSupport(mixed).assigneeId).toBeNull();
    expect(effectiveCategory(mixed)).toBe("תפעול המערכת");
  });

  it("journey step: canonical field → legacy localStorage map → derived", () => {
    const opp: Opportunity = {
      id: "opp-x",
      name: "עסקה",
      leadId: null,
      customerId: null,
      stage: "אפיון צרכים",
      amount: 1000,
      expectedClose: "2026-08-01",
      ownerId: "u-maya",
      notes: "",
      ...base,
    };
    // un-migrated: legacy positions map still honored
    expect(journeyStepOf(opp, { "opp-x": "j4" })).toBe("j4");
    // migrated: the record field wins over the map
    const migrated: OpportunityX = { ...opp, journeyStepId: "j3" };
    expect(journeyStepOf(migrated, { "opp-x": "j4" })).toBe("j3");
    // never regresses behind the coarse stage
    const advanced: OpportunityX = { ...opp, stage: "הצעה", journeyStepId: "j2" };
    expect(journeyStepOf(advanced, {})).toBe("j5");
  });

  it("quotation version: canonical field → legacy map → 1", () => {
    const q: QuotationX = {
      id: "q-x",
      customerName: "לקוח",
      customerId: null,
      title: "הצעה",
      lines: [],
      discountPercent: 0,
      terms: "",
      validUntil: "2026-08-01",
      status: "טיוטה",
      ownerId: "u-maya",
      ...base,
    };
    expect(quotationVersion({ ...q })).toBe(1);
    expect(quotationVersion({ ...q }, { "q-x": 4 })).toBe(4);
    expect(quotationVersion({ ...q, version: 6 }, { "q-x": 4 })).toBe(6);
  });
});
