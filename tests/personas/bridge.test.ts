// W7-B — seed → V2 bridge: same ids, canonical content, legacyName
// provenance (Lead decision C1), idempotent, count-guarded.
import { describe, expect, it } from "vitest";
import { PERSONAS } from "@/repositories/seed/seedData";
import { bridgePersonas, CANONICAL_PERSONA_NAMES } from "@/domain/personas";

describe("bridgePersonas — C1 bridge over the live seed", () => {
  it("keeps the 7 seed ids and replaces names with the canonical adoption set, 1:1 by order", () => {
    const { personas, problems } = bridgePersonas(PERSONAS);
    expect(problems).toEqual([]);
    expect(personas.map((p) => p.id)).toEqual([
      "per-1",
      "per-2",
      "per-3",
      "per-4",
      "per-5",
      "per-6",
      "per-7",
    ]);
    expect(personas.map((p) => p.name)).toEqual([...CANONICAL_PERSONA_NAMES]);
  });

  it("preserves the ORIGINAL seed names in legacyName (honest provenance, never blended)", () => {
    const { personas } = bridgePersonas(PERSONAS);
    const legacyById = new Map(personas.map((p) => [p.id, p.legacyName]));
    for (const seed of PERSONAS) {
      expect(legacyById.get(seed.id)).toBe(seed.name);
      // the canonical name must NOT equal the legacy taxonomy name
      const bridged = personas.find((p) => p.id === seed.id)!;
      expect(bridged.name).not.toBe(seed.name);
    }
  });

  it("is idempotent — same input, same output, no accumulation", () => {
    const first = bridgePersonas(PERSONAS);
    const second = bridgePersonas(PERSONAS);
    expect(second).toEqual(first);
    expect(second.personas).toHaveLength(7);
  });

  it("an extra (8th) seed persona is reported and NEVER admitted", () => {
    const extra = { ...PERSONAS[0]!, id: "per-99", name: "פרסונה עודפת" };
    const { personas, problems } = bridgePersonas([...PERSONAS, extra]);
    expect(personas).toHaveLength(7);
    expect(personas.some((p) => p.id === "per-99")).toBe(false);
    expect(problems.join(" ")).toContain("per-99");
  });

  it("a missing seed record is reported honestly but the canonical lane still exists", () => {
    const withoutFirst = PERSONAS.filter((p) => p.id !== "per-1");
    const { personas, problems } = bridgePersonas(withoutFirst);
    expect(personas).toHaveLength(7);
    expect(problems.join(" ")).toContain("per-1");
  });
});
