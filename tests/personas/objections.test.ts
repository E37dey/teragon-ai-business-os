// W7-B — persona objections (the W7-D FAQ feed): full LACE per objection,
// referential integrity to the canonical personas, every persona covered.
import { describe, expect, it } from "vitest";
import {
  objectionsOf,
  PERSONA_OBJECTIONS,
  PERSONA_V2_DEFINITIONS,
} from "@/domain/personas";

describe("PERSONA_OBJECTIONS — W7-D FAQ export", () => {
  it("unique ids; every objection resolves to a canonical persona with a matching name", () => {
    expect(new Set(PERSONA_OBJECTIONS.map((o) => o.id)).size).toBe(PERSONA_OBJECTIONS.length);
    const byId = new Map(PERSONA_V2_DEFINITIONS.map((p) => [p.id, p]));
    for (const o of PERSONA_OBJECTIONS) {
      const persona = byId.get(o.personaId);
      expect(persona, o.id).toBeDefined();
      expect(o.personaName).toBe(persona!.name);
    }
  });

  it("every persona lists its objection ids and each resolves — full LACE on each", () => {
    for (const p of PERSONA_V2_DEFINITIONS) {
      const listed = objectionsOf(p.id);
      expect(listed.length, p.name).toBeGreaterThan(0);
      expect(listed.map((o) => o.id)).toEqual(p.objections);
      for (const o of listed) {
        for (const f of ["quote", "listen", "acknowledge", "clarify", "explore", "sourceNote"] as const) {
          expect(o[f].trim().length, `${o.id}.${f}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("every objection id referenced by a persona exists in the export", () => {
    const ids = new Set(PERSONA_OBJECTIONS.map((o) => o.id));
    for (const p of PERSONA_V2_DEFINITIONS) {
      for (const objId of p.objections) {
        expect(ids.has(objId), `${p.id} → ${objId}`).toBe(true);
      }
    }
  });
});
