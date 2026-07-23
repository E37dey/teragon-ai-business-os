// W7-D — quick-start actions navigate to REAL routes + policy coach (7.12).
import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "@/app/routes";
import {
  CANONICAL_MATERIALS,
  classifyPlannedAction,
  CORRECT_USE_RULES,
  PLANNED_ACTION_SAMPLE,
  QUICK_START_ACTIONS,
} from "@/domain/training-materials";

const realPaths = new Set(APP_ROUTES.map((r) => r.path));

describe("quick start — three actions (7.12)", () => {
  it("has exactly the three mandated actions in order", () => {
    expect(QUICK_START_ACTIONS.map((a) => a.title)).toEqual([
      "פתח לקוח או פנייה",
      "בקש סיכום או המלצה",
      "בדוק ראיות ואשר",
    ]);
    expect(QUICK_START_ACTIONS.map((a) => a.order)).toEqual([1, 2, 3]);
  });

  it("every 'נסה זאת' route is a REAL app route", () => {
    for (const action of QUICK_START_ACTIONS) {
      expect(realPaths.has(action.route), `${action.title} → ${action.route}`).toBe(true);
    }
  });

  it("every action carries demo, expected result, time, mistake and safety note", () => {
    for (const action of QUICK_START_ACTIONS) {
      expect(action.demo.header.length).toBeGreaterThan(0);
      expect(action.demo.rows.length).toBeGreaterThan(0);
      expect(action.expectedResult.length).toBeGreaterThan(10);
      expect(action.estimatedTime.length).toBeGreaterThan(0);
      expect(action.commonMistake.length).toBeGreaterThan(10);
      expect(action.safetyNote.length).toBeGreaterThan(10);
    }
  });

  it("time estimates are honestly labeled as unmeasured estimates", () => {
    for (const action of QUICK_START_ACTIONS) {
      expect(action.estimatedTime).toContain("טרם נמדד");
    }
  });

  it("every routeRef inside the 13 materials also points at a real route", () => {
    const refs = CANONICAL_MATERIALS.flatMap((m) =>
      m.sections.flatMap((s) => s.blocks.filter((b) => b.kind === "routeRef")),
    );
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(realPaths.has(ref.route), ref.route).toBe(true);
    }
    for (const m of CANONICAL_MATERIALS) {
      if (m.contentRoute) expect(realPaths.has(m.contentRoute), m.contentRoute).toBe(true);
    }
  });
});

describe("כללי שימוש נכון — the mandated policy block (7.12)", () => {
  it("matches the spec lists exactly", () => {
    expect(CORRECT_USE_RULES.allowed).toEqual([
      "לסכם מידע מאושר",
      "להכין טיוטה",
      "להציע פעולה",
      "לחפש ידע",
    ]);
    expect(CORRECT_USE_RULES.mustVerify).toEqual([
      "המלצה כספית",
      "הצעת מחיר",
      "מידע טכני",
      "הודעה חיצונית",
    ]);
    expect(CORRECT_USE_RULES.forbidden).toEqual([
      "לשלוח ללא אישור",
      "להמציא מקור",
      "לחשוף מידע רגיש",
      "לשנות הרשאה",
      "לאשר הנחה",
      "למחוק מידע",
    ]);
  });
});

describe("'בדוק אם הפעולה שתכננת מותרת' — deterministic coach", () => {
  it("forbidden beats verify beats allowed (most restrictive wins)", () => {
    expect(classifyPlannedAction("לשלוח ללא אישור הצעת מחיר ללקוח").verdict).toBe("אסור");
    expect(classifyPlannedAction("להכין טיוטת הצעת מחיר").verdict).toBe("חובה לבדוק");
    expect(classifyPlannedAction("לסכם את הפגישות של השבוע").verdict).toBe("מותר");
  });

  it("answers honestly when the rules do not recognize the action", () => {
    const result = classifyPlannedAction("פעולה עמומה לגמרי");
    expect(result.verdict).toBe("לא זוהה");
    expect(result.answerHe).toContain("לא זיהו");
    expect(result.matchedRule).toBeNull();
  });

  it("is deterministic — same input, same output", () => {
    const a = classifyPlannedAction("למחוק רשומת לקוח ישנה");
    const b = classifyPlannedAction("למחוק רשומת לקוח ישנה");
    expect(a).toEqual(b);
    expect(a.verdict).toBe("אסור");
  });

  it("the sample question renders a governed answer", () => {
    expect(PLANNED_ACTION_SAMPLE.questionHe.length).toBeGreaterThan(0);
    expect(PLANNED_ACTION_SAMPLE.answer.verdict).toBe("חובה לבדוק");
  });
});
