// W7-D — exactly-13 guard + material completeness rules (7.10).
import { describe, expect, it } from "vitest";
import {
  CANONICAL_MATERIAL_KEYS,
  CANONICAL_MATERIALS,
  canonicalMaterialByKey,
} from "@/domain/training-materials";

const MANDATED_READING = [
  "מסמך מטרת הפתרון",
  "מפת תהליך TO-BE",
  "Quick Start",
  "נוהל שימוש נכון",
  "ספריית תרחישים ופרומפטים",
  "FAQ והתנגדויות",
  "Risk & Governance Sheet",
];

const MANDATED_TEACHING = [
  "תסריט הדרכה",
  "מצגת הדרכה",
  "סרטוני Microlearning",
  "תרגילי Hands-on",
  "מסמך תמיכה ותקלות",
  "דשבורד אימוץ",
];

describe("13 canonical training materials (7.10)", () => {
  it("has exactly 13 materials — no more, no less", () => {
    expect(CANONICAL_MATERIALS).toHaveLength(13);
    expect(CANONICAL_MATERIAL_KEYS).toHaveLength(13);
  });

  it("matches the mandated list exactly: 7 reading + 6 teaching, in order", () => {
    const reading = CANONICAL_MATERIALS.filter((m) => m.section === "חומרי קריאה");
    const teaching = CANONICAL_MATERIALS.filter((m) => m.section === "חומרי הוראה ותרגול");
    expect(reading.map((m) => m.title)).toEqual(MANDATED_READING);
    expect(teaching.map((m) => m.title)).toEqual(MANDATED_TEACHING);
  });

  it("keys and seed ids are unique and cover tm-1..tm-13", () => {
    const keys = new Set(CANONICAL_MATERIALS.map((m) => m.key));
    const seedIds = CANONICAL_MATERIALS.map((m) => m.seedId).sort();
    expect(keys.size).toBe(13);
    expect(seedIds).toEqual(
      Array.from({ length: 13 }, (_, i) => `tm-${i + 1}`).sort(),
    );
  });

  it("every material has REAL structured content — not just a title", () => {
    for (const m of CANONICAL_MATERIALS) {
      expect(m.sections.length, m.key).toBeGreaterThan(0);
      for (const section of m.sections) {
        expect(section.heading.length, m.key).toBeGreaterThan(0);
        expect(section.blocks.length, `${m.key}/${section.heading}`).toBeGreaterThan(0);
      }
      // substantive content: total authored text is real, not a stub
      const textLength = m.sections
        .flatMap((s) => s.blocks)
        .map((b) => ("text" in b ? b.text : "items" in b ? b.items.join(" ") : JSON.stringify(b)))
        .join(" ").length;
      expect(textLength, `${m.key} content too thin`).toBeGreaterThan(120);
    }
  });

  it("every material carries the mandated metadata fields", () => {
    for (const m of CANONICAL_MATERIALS) {
      expect(m.ownerId.length, m.key).toBeGreaterThan(0);
      expect(m.audiencePersonaIds.length, m.key).toBeGreaterThan(0);
      expect(m.relatedStageId, m.key).toMatch(/^is-[1-6]$/);
      expect(m.relatedGateId, m.key).toMatch(/^sg-[1-6]$/);
      expect(m.exportFormats.length, m.key).toBeGreaterThan(0);
      expect(m.qualityValidation.length, m.key).toBeGreaterThan(0);
      expect(m.measurableOutcome, m.key).toBeTruthy();
    }
  });

  it("honest statuses: content-complete materials are NEVER born approved", () => {
    for (const m of CANONICAL_MATERIALS) {
      expect(["טיוטה", "ממתין לבדיקה"]).toContain(m.initialStatus);
    }
  });

  it("teaching materials that promise practice actually include practice", () => {
    const script = canonicalMaterialByKey("training-script");
    const exercises = canonicalMaterialByKey("hands-on-exercises");
    expect(script.practiceIncluded).toBe(true);
    expect(exercises.practiceIncluded).toBe(true);
  });

  it("the 10-minute training script is fully timed and sums to exactly 600 seconds", () => {
    const script = canonicalMaterialByKey("training-script");
    const timed = script.sections
      .flatMap((s) => s.blocks)
      .filter((b) => b.kind === "timed");
    expect(timed.length).toBeGreaterThanOrEqual(5);
    // contiguous coverage from 0 to 600
    let cursor = 0;
    for (const block of timed) {
      expect(block.fromSec).toBe(cursor);
      expect(block.toSec).toBeGreaterThan(block.fromSec);
      expect(block.text.length).toBeGreaterThan(40); // real authored segment
      cursor = block.toSec;
    }
    expect(cursor).toBe(600);
  });

  it("correct-use policy contains the full מותר/חובה לבדוק/אסור lists from the spec", () => {
    const policy = canonicalMaterialByKey("correct-use-policy");
    const allItems = policy.sections
      .flatMap((s) => s.blocks)
      .flatMap((b) => (b.kind === "bullets" ? b.items : []));
    const text = allItems.join(" ");
    for (const required of [
      "לסכם מידע מאושר",
      "להכין טיוטה",
      "להציע פעולה",
      "לחפש ידע",
      "המלצה כספית",
      "הצעת מחיר",
      "מידע טכני",
      "הודעה חיצונית",
      "לשלוח ללא אישור",
      "להמציא מקור",
      "לחשוף מידע רגיש",
      "לשנות הרשאה",
      "לאשר הנחה",
      "למחוק מידע",
    ]) {
      expect(text).toContain(required);
    }
  });
});
