// W7-E (7.24) — the content registry drift guards: tests import the ACTUAL
// live sources and FAIL on any drift (identity, names, counts 7/13/6/6/12/5).
import { describe, expect, it } from "vitest";
import { CEO_NAME, COMPANY_NAME, GREETING, PERSONAS, TRAINING_MATERIALS, USERS } from "@/repositories/seed";
import { CANONICAL_PERSONA_NAMES } from "@/domain/personas";
import { CANONICAL_MATERIAL_KEYS } from "@/domain/training-materials";
import { ADOPTION_STAGE_NAMES, ROLLOUT_WAVE_NAMES } from "@/domain/adoption";
import { CANONICAL_STAGE_GATES, STAGE_GATE_KEYS } from "@/domain/stage-gates";
import {
  CANONICAL_CEO_NAME,
  CANONICAL_COMPANY_NAME,
  CANONICAL_GREETING,
  defsMatchRegistry,
  DELIVERABLE_DEFS,
  EXPECTED_COUNTS,
  findIdentityDefects,
  isNamedOwner,
  ONE_PAGER,
  REGISTRY_DELIVERABLE_KEYS,
  REGISTRY_DELIVERABLE_TITLES,
  SUBMISSION_METRICS,
  validateRegistry,
} from "@/domain/submission";

describe("content registry — drift against live sources (7.24)", () => {
  it("no drift: registry literals match the actual sources", () => {
    const findings = validateRegistry({
      companyName: COMPANY_NAME,
      ceoName: CEO_NAME,
      greeting: GREETING,
      personaNames: CANONICAL_PERSONA_NAMES,
      materialKeys: CANONICAL_MATERIAL_KEYS,
      stageNames: ADOPTION_STAGE_NAMES,
      gateKeys: STAGE_GATE_KEYS,
      rolloutWaveNames: ROLLOUT_WAVE_NAMES,
      users: USERS.map((u) => ({ id: u.id, name: u.name })),
    });
    expect(findings).toEqual([]);
  });

  it("detects drift when a source changes (the guard actually guards)", () => {
    const findings = validateRegistry({
      companyName: COMPANY_NAME,
      ceoName: "צחי זוסטהיים", // the rejected donor spelling (C2)
      greeting: GREETING,
      personaNames: [...CANONICAL_PERSONA_NAMES.slice(0, 6), "פרסונה אחרת"],
      materialKeys: CANONICAL_MATERIAL_KEYS,
      stageNames: ADOPTION_STAGE_NAMES,
      gateKeys: STAGE_GATE_KEYS,
      rolloutWaveNames: ROLLOUT_WAVE_NAMES,
      users: USERS.map((u) => ({ id: u.id, name: u.name })),
    });
    expect(findings.some((f) => f.area === "identity")).toBe(true);
    expect(findings.some((f) => f.area === "personas")).toBe(true);
  });

  it("exact counts 7/13/6/6/12/5 hold against the live sources", () => {
    expect(CANONICAL_PERSONA_NAMES).toHaveLength(EXPECTED_COUNTS.personas);
    expect(PERSONAS).toHaveLength(EXPECTED_COUNTS.personas);
    expect(CANONICAL_MATERIAL_KEYS).toHaveLength(EXPECTED_COUNTS.trainingMaterials);
    expect(TRAINING_MATERIALS).toHaveLength(EXPECTED_COUNTS.trainingMaterials);
    expect(ADOPTION_STAGE_NAMES).toHaveLength(EXPECTED_COUNTS.adoptionStages);
    expect(CANONICAL_STAGE_GATES).toHaveLength(EXPECTED_COUNTS.stageGates);
    expect(STAGE_GATE_KEYS).toHaveLength(EXPECTED_COUNTS.stageGates);
    expect(REGISTRY_DELIVERABLE_KEYS).toHaveLength(EXPECTED_COUNTS.deliverables);
    expect(ROLLOUT_WAVE_NAMES).toHaveLength(EXPECTED_COUNTS.rolloutWaves);
  });

  it("the 12 deliverable defs match the registry keys exactly, in order", () => {
    expect(defsMatchRegistry()).toBe(true);
    expect(DELIVERABLE_DEFS).toHaveLength(12);
    expect(DELIVERABLE_DEFS.map((d) => d.titleHe)).toEqual(
      REGISTRY_DELIVERABLE_KEYS.map((k) => REGISTRY_DELIVERABLE_TITLES[k]),
    );
  });

  it("identity: canonical spellings, rejected donor spelling caught", () => {
    expect(CANONICAL_COMPANY_NAME).toBe("טרגון טכנולוגיות");
    expect(CANONICAL_CEO_NAME).toBe("צחי זוסטייהם");
    expect(CANONICAL_GREETING).toBe(GREETING);
    expect(findIdentityDefects("שלום צחי זוסטהיים")).toHaveLength(1);
    expect(findIdentityDefects(`שלום ${CANONICAL_CEO_NAME}`)).toHaveLength(0);
  });

  it("identity everywhere: authored W7-E content carries no rejected spelling", () => {
    const corpus = JSON.stringify({ ONE_PAGER, SUBMISSION_METRICS, REGISTRY_DELIVERABLE_TITLES });
    expect(findIdentityDefects(corpus)).toEqual([]);
    expect(corpus.includes(CANONICAL_CEO_NAME)).toBe(true);
  });

  it("owners: only the five named seed users are valid; roles are not people", () => {
    for (const def of DELIVERABLE_DEFS) {
      expect(isNamedOwner(def.ownerId)).toBe(true);
      expect(USERS.some((u) => u.id === def.ownerId)).toBe(true);
    }
    expect(isNamedOwner("מטמיע")).toBe(false);
    expect(isNamedOwner(null)).toBe(false);
    for (const m of SUBMISSION_METRICS) {
      expect(isNamedOwner(m.ownerId)).toBe(true);
    }
  });
});
