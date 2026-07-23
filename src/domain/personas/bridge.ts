// W7-B — seed → PersonaV2 bridge (idempotent) + exactly-7 count guard.
//
// The bridge is a PURE function: given the live seeded persona records it
// returns the canonical V2 records for the SAME ids (Lead decision C1 —
// 1:1 by order, content replaced, legacy name preserved). Running it twice
// on the same input yields identical output; it never writes to any store,
// so re-running on refresh cannot duplicate anything.
import type { Persona } from "@/domain/types";
import { PERSONA_V2_DEFINITIONS } from "./canonical";
import { CANONICAL_PERSONA_NAMES, type Exactly7Result, type PersonaV2 } from "./types";

/**
 * Count guard (Phase 7.4): EXACTLY 7 personas, unique ids, and the name set
 * must be EXACTLY the 7 canonical names — an 8th persona, a duplicate, or a
 * renamed lane all fail.
 */
export function exactly7Personas(personas: readonly PersonaV2[]): Exactly7Result {
  const problems: string[] = [];
  if (personas.length !== 7) {
    problems.push(`נדרשות בדיוק 7 פרסונות — נמצאו ${personas.length}`);
  }
  const ids = new Set(personas.map((p) => p.id));
  if (ids.size !== personas.length) {
    problems.push("מזהי פרסונות כפולים");
  }
  const names = personas.map((p) => p.name);
  const nameSet = new Set<string>(names);
  if (nameSet.size !== names.length) {
    problems.push("שמות פרסונות כפולים");
  }
  for (const canonical of CANONICAL_PERSONA_NAMES) {
    if (!nameSet.has(canonical)) {
      problems.push(`חסרה פרסונה קנונית: ${canonical}`);
    }
  }
  for (const name of nameSet) {
    if (!(CANONICAL_PERSONA_NAMES as readonly string[]).includes(name)) {
      problems.push(`שם פרסונה לא קנוני: ${name}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

export interface BridgeResult {
  personas: PersonaV2[];
  /** honest gaps — e.g. a canonical id missing from the seed store */
  problems: string[];
}

/**
 * Bridge the 7 seeded persona records to the canonical V2 shape.
 * - same ids (per-1..per-7), canonical content, `legacyName` = live seed name;
 * - a canonical definition whose seed record is missing is still returned
 *   (the programme exists regardless) but reported in `problems`;
 * - an extra seed persona (an 8th) is NEVER admitted into the canonical set —
 *   it is reported as a problem instead (count guard).
 */
export function bridgePersonas(seedPersonas: readonly Persona[]): BridgeResult {
  const problems: string[] = [];
  const byId = new Map(seedPersonas.map((p) => [p.id, p]));

  const personas = PERSONA_V2_DEFINITIONS.map((def): PersonaV2 => {
    const seed = byId.get(def.id);
    if (!seed) {
      problems.push(`רשומת seed חסרה לפרסונה ${def.id} (${def.name})`);
      return { ...def };
    }
    // legacyName tracks the LIVE seed record (provenance survives edits)
    return { ...def, legacyName: seed.name };
  });

  const canonicalIds = new Set(PERSONA_V2_DEFINITIONS.map((d) => d.id));
  for (const seed of seedPersonas) {
    if (!canonicalIds.has(seed.id)) {
      problems.push(`רשומת פרסונה עודפת מעבר ל-7 הקנוניות: ${seed.id} (${seed.name}) — לא נכללת`);
    }
  }

  const guard = exactly7Personas(personas);
  if (!guard.ok) problems.push(...guard.problems);

  return { personas, problems };
}
