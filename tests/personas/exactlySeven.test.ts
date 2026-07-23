// W7-B — the exactly-7 count guard: 7 pass, an 8th fails, 6 fail,
// a renamed lane fails, duplicates fail.
import { describe, expect, it } from "vitest";
import {
  CANONICAL_PERSONA_NAMES,
  exactly7Personas,
  PERSONA_V2_DEFINITIONS,
  type PersonaV2,
} from "@/domain/personas";

function clone(p: PersonaV2, patch: Partial<PersonaV2>): PersonaV2 {
  return { ...p, ...patch };
}

describe("exactly7Personas — count guard", () => {
  it("the canonical definitions pass: exactly 7, all canonical names present", () => {
    const result = exactly7Personas(PERSONA_V2_DEFINITIONS);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(PERSONA_V2_DEFINITIONS).toHaveLength(7);
    expect(new Set(PERSONA_V2_DEFINITIONS.map((p) => p.name))).toEqual(
      new Set(CANONICAL_PERSONA_NAMES),
    );
  });

  it("adding an 8th persona FAILS the guard", () => {
    const first = PERSONA_V2_DEFINITIONS[0]!;
    const eighth = clone(first, { id: "per-8" });
    const result = exactly7Personas([...PERSONA_V2_DEFINITIONS, eighth]);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("נדרשות בדיוק 7 פרסונות — נמצאו 8");
  });

  it("6 personas fail (a canonical lane is missing)", () => {
    const result = exactly7Personas(PERSONA_V2_DEFINITIONS.slice(0, 6));
    expect(result.ok).toBe(false);
    const missingName = PERSONA_V2_DEFINITIONS[6]!.name;
    expect(result.problems.join(" ")).toContain(`חסרה פרסונה קנונית: ${missingName}`);
  });

  it("a renamed (non-canonical) lane fails even at count 7", () => {
    const renamed = PERSONA_V2_DEFINITIONS.map((p, i) =>
      i === 0 ? clone(p, { name: "פרסונה אחרת" as PersonaV2["name"] }) : p,
    );
    const result = exactly7Personas(renamed);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("שם פרסונה לא קנוני: פרסונה אחרת");
  });

  it("duplicate ids fail", () => {
    const dup = PERSONA_V2_DEFINITIONS.map((p, i) =>
      i === 1 ? clone(p, { id: PERSONA_V2_DEFINITIONS[0]!.id }) : p,
    );
    const result = exactly7Personas(dup);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("מזהי פרסונות כפולים");
  });
});
