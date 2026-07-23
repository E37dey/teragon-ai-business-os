// W7-B — the Training Matrix values match the mandated programme
// definitions EXACTLY (format + duration per canonical persona).
import { describe, expect, it } from "vitest";
import {
  PERSONA_V2_DEFINITIONS,
  TRAINING_PROGRAMMES,
  type CanonicalPersonaName,
} from "@/domain/personas";

/** the wave-spec mandated programme table, spelled out independently */
const SPEC: Record<CanonicalPersonaName, { format: string; durationMinutes: number }> = {
  "משתמש קצה": { format: "סדנה + Microlearning", durationMinutes: 60 },
  "מנהל צוות": { format: "תדריך ניהולי", durationMinutes: 45 },
  הנהלה: { format: "תדריך מנהלים", durationMinutes: 20 },
  "IT / אבטחת מידע": { format: "מפגש טכני", durationMinutes: 60 },
  "Legal / Compliance": { format: "מפגש ממשל", durationMinutes: 60 },
  "Champion · השגריר": { format: "סדנה מתקדמת", durationMinutes: 90 },
  המתנגד: { format: "שיחה ממוקדת", durationMinutes: 30 },
};

describe("Training Matrix — mandated programme values", () => {
  it("TRAINING_PROGRAMMES equals the spec table exactly", () => {
    expect(TRAINING_PROGRAMMES).toEqual(SPEC);
  });

  it("every persona record carries EXACTLY its programme format and duration", () => {
    for (const p of PERSONA_V2_DEFINITIONS) {
      expect(p.trainingFormat, p.name).toBe(SPEC[p.name].format);
      expect(p.durationMinutes, p.name).toBe(SPEC[p.name].durationMinutes);
    }
  });

  it("durations are the mandated multiset: 20/30/45/60/60/60/90", () => {
    const durations = PERSONA_V2_DEFINITIONS.map((p) => p.durationMinutes).sort((a, b) => a - b);
    expect(durations).toEqual([20, 30, 45, 60, 60, 60, 90]);
  });
});
