// W7-D — idempotent bridge + completeness/auditor rules (7.10-7.11).
import { describe, expect, it } from "vitest";
import { TRAINING_MATERIALS } from "@/repositories/seed";
import {
  auditMaterials,
  CANONICAL_CONTENT_VERSION,
  isMaterialComplete,
  upgradeMaterials,
  type TrainingMaterialV2,
} from "@/domain/training-materials";

describe("bridge: seeded 13 → canonical 13 (7.10)", () => {
  it("upgrades all 13 seeded records on first run", () => {
    const result = upgradeMaterials(TRAINING_MATERIALS as TrainingMaterialV2[]);
    expect(result.changedIds).toHaveLength(13);
    expect(result.materials).toHaveLength(13);
    for (const m of result.materials) {
      expect(m.canonicalKey).toBeDefined();
      expect(m.contentVersion).toBe(CANONICAL_CONTENT_VERSION);
    }
  });

  it("is idempotent — a second run changes nothing", () => {
    const first = upgradeMaterials(TRAINING_MATERIALS as TrainingMaterialV2[]);
    const second = upgradeMaterials(first.materials);
    expect(second.changedIds).toHaveLength(0);
    expect(second.materials).toEqual(first.materials);
  });

  it("keeps seeded ids stable (tm-1..tm-13)", () => {
    const result = upgradeMaterials(TRAINING_MATERIALS as TrainingMaterialV2[]);
    expect(result.materials.map((m) => m.id).sort()).toEqual(
      TRAINING_MATERIALS.map((m) => m.id).sort(),
    );
  });

  it("honest statuses: no material becomes מאושר through the bridge", () => {
    const result = upgradeMaterials(TRAINING_MATERIALS as TrainingMaterialV2[]);
    for (const m of result.materials) {
      expect(m.status === "מאושר").toBe(false);
      expect(["טיוטה", "ממתין לבדיקה"]).toContain(m.status);
    }
  });

  it("preserves a human-approved status across content upgrades", () => {
    const first = upgradeMaterials(TRAINING_MATERIALS as TrainingMaterialV2[]);
    const approved = first.materials.map((m) =>
      m.id === "tm-4" ? { ...m, status: "מאושר" as const, contentVersion: 0 } : m,
    );
    const second = upgradeMaterials(approved);
    const tm4 = second.materials.find((m) => m.id === "tm-4");
    expect(second.changedIds).toEqual(["tm-4"]); // content re-applied…
    expect(tm4?.status).toBe("מאושר"); // …but the human decision survives
  });

  it("preserves approvalId and reviewDate set by the approval flow", () => {
    const first = upgradeMaterials(TRAINING_MATERIALS as TrainingMaterialV2[]);
    const withApproval = first.materials.map((m) =>
      m.id === "tm-3"
        ? { ...m, approvalId: "ap-99", reviewDate: "2026-08-01", contentVersion: 0 }
        : m,
    );
    const second = upgradeMaterials(withApproval);
    const tm3 = second.materials.find((m) => m.id === "tm-3");
    expect(tm3?.approvalId).toBe("ap-99");
    expect(tm3?.reviewDate).toBe("2026-08-01");
  });
});

describe("completeness rules — a title alone is never complete (7.10)", () => {
  const bridged = upgradeMaterials(TRAINING_MATERIALS as TrainingMaterialV2[]).materials;

  it("bridged canonical materials are content-complete", () => {
    for (const m of bridged) {
      expect(isMaterialComplete(m), m.id).toBe(true);
    }
  });

  it("a title-only record is NOT complete", () => {
    const titleOnly: TrainingMaterialV2 = {
      id: "tm-x",
      title: "חומר עם כותרת בלבד",
      description: "",
      kind: "מדריך",
      audiencePersonaIds: [],
      url: null,
      stageId: null,
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:00:00.000Z",
    };
    expect(isMaterialComplete(titleOnly)).toBe(false);
  });

  it("a canonical record missing owner or measurable outcome is NOT complete", () => {
    const base = bridged.find((m) => m.id === "tm-1");
    expect(base).toBeDefined();
    if (!base) return;
    expect(isMaterialComplete({ ...base, ownerId: null })).toBe(false);
    expect(isMaterialComplete({ ...base, measurableOutcome: null })).toBe(false);
    expect(isMaterialComplete({ ...base, audiencePersonaIds: [] })).toBe(false);
  });
});

describe("מבקר החומרים — auditor rules (7.11)", () => {
  const bridged = upgradeMaterials(TRAINING_MATERIALS as TrainingMaterialV2[]).materials;

  it("flags a material without an owner", () => {
    const broken = bridged.map((m) => (m.id === "tm-2" ? { ...m, ownerId: null } : m));
    const findings = auditMaterials(broken);
    expect(findings.some((f) => f.materialId === "tm-2" && f.kind === "חסר בעלים")).toBe(true);
  });

  it("flags a material without personas", () => {
    const broken = bridged.map((m) =>
      m.id === "tm-5" ? { ...m, audiencePersonaIds: [] } : m,
    );
    const findings = auditMaterials(broken);
    expect(findings.some((f) => f.materialId === "tm-5" && f.kind === "לא משויך לפרסונה")).toBe(
      true,
    );
  });

  it("flags a teaching material without practice", () => {
    const broken = bridged.map((m) =>
      m.id === "tm-11" ? { ...m, practiceIncluded: false } : m,
    );
    const findings = auditMaterials(broken);
    expect(findings.some((f) => f.materialId === "tm-11" && f.kind === "ללא תרגול")).toBe(true);
  });

  it("flags every unapproved material honestly (nothing is auto-approved)", () => {
    const findings = auditMaterials(bridged);
    const unapproved = findings.filter((f) => f.kind === "ללא אישור");
    expect(unapproved).toHaveLength(13);
  });

  it("flags archived materials as unused", () => {
    const broken = bridged.map((m) =>
      m.id === "tm-13" ? { ...m, status: "בארכיון" as const } : m,
    );
    const findings = auditMaterials(broken);
    expect(
      findings.some((f) => f.materialId === "tm-13" && f.kind === "חומר שאינו בשימוש"),
    ).toBe(true);
  });
});
