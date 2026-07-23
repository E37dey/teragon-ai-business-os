// W7-B — field completeness per persona: every mandated PersonaV2 field is
// filled, content is unique per persona, materials resolve to the 13 seeded
// records, and the owner is a NAMED person from the users seed.
import { describe, expect, it } from "vitest";
import { TRAINING_MATERIALS, USERS } from "@/repositories/seed/seedData";
import { PERSONA_V2_DEFINITIONS } from "@/domain/personas";

const TEXT_FIELDS = [
  "name",
  "legacyName",
  "role",
  "businessContext",
  "primaryQuestion",
  "desiredValue",
  "adoptionBarrier",
  "currentKnowledge",
  "requiredKnowledge",
  "requiredAbility",
  "trainingObjective",
  "trainingFormat",
  "exercise",
] as const;

describe("PersonaV2 field completeness", () => {
  it("every mandated field is present and non-empty on all 7 personas", () => {
    for (const p of PERSONA_V2_DEFINITIONS) {
      for (const f of TEXT_FIELDS) {
        expect(p[f].trim().length, `${p.id}.${f}`).toBeGreaterThan(0);
      }
      expect(p.durationMinutes).toBeGreaterThan(0);
      expect(p.successMetric.description.trim().length).toBeGreaterThan(0);
      expect(p.successMetric.targetNote.trim().length).toBeGreaterThan(0);
      expect(p.supportingMaterials.length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(p.supportTier);
      expect(p.objections.length, `${p.id} objections`).toBeGreaterThan(0);
      expect(["טיוטה", "ממתין לאישור", "מאושר"]).toContain(p.approvalState);
      expect(p.version).toBeGreaterThanOrEqual(1);
    }
  });

  it("adoption barrier and exercise are UNIQUE per persona (no clones)", () => {
    const barriers = PERSONA_V2_DEFINITIONS.map((p) => p.adoptionBarrier.trim());
    const exercises = PERSONA_V2_DEFINITIONS.map((p) => p.exercise.trim());
    expect(new Set(barriers).size).toBe(7);
    expect(new Set(exercises).size).toBe(7);
  });

  it("every material link resolves to one of the 13 seeded trainingMaterials", () => {
    const materialIds = new Set(TRAINING_MATERIALS.map((m) => m.id));
    expect(materialIds.size).toBe(13);
    for (const p of PERSONA_V2_DEFINITIONS) {
      for (const l of p.supportingMaterials) {
        expect(materialIds.has(l.materialId), `${p.id} → ${l.materialId}`).toBe(true);
      }
    }
  });

  it("each persona has exactly one PRIMARY material and primaries are unique across personas", () => {
    const primaries = PERSONA_V2_DEFINITIONS.map((p) => {
      const prim = p.supportingMaterials.filter((l) => l.role === "ראשי");
      expect(prim, `${p.id} primary count`).toHaveLength(1);
      return prim[0]!.materialId;
    });
    expect(new Set(primaries).size).toBe(7);
  });

  it("namedOwner is a real named person from the users seed (id AND name match)", () => {
    const userById = new Map(USERS.map((u) => [u.id, u]));
    for (const p of PERSONA_V2_DEFINITIONS) {
      const user = userById.get(p.namedOwner.userId);
      expect(user, `${p.id} owner ${p.namedOwner.userId}`).toBeDefined();
      expect(p.namedOwner.name).toBe(user!.name);
      // a named person, not a role/team word
      expect(p.namedOwner.name).not.toMatch(/צוות|מחלקה|כולם|TBD/);
    }
  });
});
