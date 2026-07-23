// W7-B — "מבקר הפרסונות": each detection fires on a constructed violating
// fixture and stays silent on the clean canonical set.
import { describe, expect, it } from "vitest";
import { TRAINING_MATERIALS, USERS } from "@/repositories/seed/seedData";
import {
  auditPersonas,
  PERSONA_V2_DEFINITIONS,
  type PersonaV2,
} from "@/domain/personas";

function mutateFirst(patch: Partial<PersonaV2>): PersonaV2[] {
  return PERSONA_V2_DEFINITIONS.map((p, i) => (i === 0 ? { ...p, ...patch } : { ...p }));
}

function kinds(personas: readonly PersonaV2[], materials = TRAINING_MATERIALS, users = USERS) {
  return auditPersonas(personas, materials, users).map((w) => w.kind);
}

describe("auditPersonas — clean canonical set", () => {
  it("no אזהרה findings; only the honest 'יעד מספרי חסר' info rows (6 personas)", () => {
    const warnings = auditPersonas(PERSONA_V2_DEFINITIONS, TRAINING_MATERIALS, USERS);
    expect(warnings.filter((w) => w.severity === "אזהרה")).toEqual([]);
    const infos = warnings.filter((w) => w.severity === "מידע");
    expect(infos).toHaveLength(6);
    expect(new Set(infos.map((w) => w.kind))).toEqual(new Set(["יעד מספרי חסר"]));
  });

  it("every warning carries a clickable field anchor (persona-<id>-<field>)", () => {
    for (const w of auditPersonas(PERSONA_V2_DEFINITIONS, TRAINING_MATERIALS, USERS)) {
      expect(w.anchorId).toBe(`persona-${w.personaId}-${w.field}`);
    }
  });
});

describe("auditPersonas — violating fixtures", () => {
  it("missing material: persona without any material link", () => {
    const result = kinds(mutateFirst({ supportingMaterials: [] }));
    expect(result).toContain("חומר חסר");
  });

  it("missing material: link to a non-existent material id", () => {
    const result = kinds(
      mutateFirst({
        supportingMaterials: [
          { materialId: "tm-999", role: "ראשי", expectedUpdatedAt: "2026-01-01T00:00:00.000Z" },
        ],
      }),
    );
    expect(result).toContain("חומר חסר");
  });

  it("missing exercise: blank exercise text", () => {
    expect(kinds(mutateFirst({ exercise: "  " }))).toContain("תרגול חסר");
  });

  it("generic content: known generic phrase", () => {
    expect(kinds(mutateFirst({ exercise: "הדרכה כללית לכל המשתמשים" }))).toContain("תוכן גנרי");
  });

  it("generic content: identical text reused by two personas", () => {
    const shared = "אותו תרגול בדיוק לשתי פרסונות";
    const personas = PERSONA_V2_DEFINITIONS.map((p, i) =>
      i <= 1 ? { ...p, exercise: shared } : { ...p },
    );
    const warnings = auditPersonas(personas, TRAINING_MATERIALS, USERS);
    const dup = warnings.filter((w) => w.kind === "תוכן גנרי" && w.field === "exercise");
    expect(dup).toHaveLength(2); // flagged on BOTH personas
  });

  it("missing named owner: empty owner", () => {
    expect(kinds(mutateFirst({ namedOwner: { userId: "", name: "" } }))).toContain("אחראי לא שמי");
  });

  it("missing named owner: owner is not an existing user", () => {
    expect(
      kinds(mutateFirst({ namedOwner: { userId: "u-ghost", name: "רוח רפאים" } })),
    ).toContain("אחראי לא שמי");
  });

  it("missing named owner: name does not match the user record", () => {
    expect(
      kinds(mutateFirst({ namedOwner: { userId: "u-tzachi", name: "שם שגוי" } })),
    ).toContain("אחראי לא שמי");
  });

  it("duplicated primary material path: two personas share the same ראשי", () => {
    const primary = PERSONA_V2_DEFINITIONS[0]!.supportingMaterials.find((l) => l.role === "ראשי")!;
    const personas = PERSONA_V2_DEFINITIONS.map((p, i) =>
      i === 1 ? { ...p, supportingMaterials: [{ ...primary }] } : { ...p },
    );
    const warnings = auditPersonas(personas, TRAINING_MATERIALS, USERS);
    expect(warnings.map((w) => w.kind)).toContain("נתיב חומר כפול");
  });

  it("role without a support route: invalid tier", () => {
    const result = kinds(
      mutateFirst({ supportTier: 0 as unknown as PersonaV2["supportTier"] }),
    );
    expect(result).toContain("ללא מסלול תמיכה");
  });

  it("material version mismatch: material edited after persona approval", () => {
    const first = PERSONA_V2_DEFINITIONS[0]!;
    const primaryId = first.supportingMaterials.find((l) => l.role === "ראשי")!.materialId;
    const editedMaterials = TRAINING_MATERIALS.map((m) =>
      m.id === primaryId ? { ...m, updatedAt: "2026-07-23T09:00:00.000Z" } : m,
    );
    const warnings = auditPersonas(PERSONA_V2_DEFINITIONS, editedMaterials, USERS);
    const mismatch = warnings.filter((w) => w.kind === "אי-התאמת גרסת חומר");
    expect(mismatch.length).toBeGreaterThan(0);
    expect(mismatch[0]!.personaId).toBe(first.id);
  });
});
