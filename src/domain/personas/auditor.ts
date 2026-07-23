// W7-B — "מבקר הפרסונות" (Phase 7.6, spec chapter 13 left panel "בדיקת התאמה").
// Deterministic rule engine — no model, no scores. Every finding points at a
// concrete persona + field (clickable anchor in the UI).
import type { TrainingMaterial, User } from "@/domain/types";
import type { PersonaV2 } from "./types";

export type PersonaAuditKind =
  | "חומר חסר"
  | "תרגול חסר"
  | "תוכן גנרי"
  | "אחראי לא שמי"
  | "יעד מספרי חסר"
  | "נתיב חומר כפול"
  | "ללא מסלול תמיכה"
  | "אי-התאמת גרסת חומר";

export type PersonaAuditSeverity = "אזהרה" | "מידע";

/** field anchors — the page renders matching DOM ids: persona-<id>-<field> */
export type PersonaAuditField =
  | "supportingMaterials"
  | "exercise"
  | "adoptionBarrier"
  | "trainingObjective"
  | "namedOwner"
  | "successMetric"
  | "supportTier";

export interface PersonaAuditWarning {
  id: string;
  kind: PersonaAuditKind;
  severity: PersonaAuditSeverity;
  personaId: string;
  personaName: string;
  field: PersonaAuditField;
  message: string;
  /** DOM anchor the UI scrolls to on click */
  anchorId: string;
}

/** phrases that mark content as generic — persona content must be specific */
export const GENERIC_PHRASES = ["הדרכה כללית", "תוכן כללי", "TBD", "להשלים", "לורם"] as const;

const VALID_TIERS: ReadonlySet<number> = new Set([1, 2, 3]);

function anchor(personaId: string, field: PersonaAuditField): string {
  return `persona-${personaId}-${field}`;
}

function warn(
  seq: { n: number },
  kind: PersonaAuditKind,
  severity: PersonaAuditSeverity,
  p: PersonaV2,
  field: PersonaAuditField,
  message: string,
): PersonaAuditWarning {
  seq.n += 1;
  return {
    id: `paw-${seq.n}`,
    kind,
    severity,
    personaId: p.id,
    personaName: p.name,
    field,
    message,
    anchorId: anchor(p.id, field),
  };
}

/**
 * Audit the persona set against the live materials + users collections.
 * Detects: missing material / missing exercise / generic or duplicated
 * content / missing named owner / missing numeric target / duplicated
 * primary material path / persona without a support route / material
 * edited after the persona version was approved.
 */
export function auditPersonas(
  personas: readonly PersonaV2[],
  materials: readonly TrainingMaterial[],
  users: readonly User[],
): PersonaAuditWarning[] {
  const warnings: PersonaAuditWarning[] = [];
  const seq = { n: 0 };
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const userById = new Map(users.map((u) => [u.id, u]));

  // duplicated primary material path (computed across the whole set)
  const primaryOwners = new Map<string, PersonaV2[]>();
  for (const p of personas) {
    for (const l of p.supportingMaterials) {
      if (l.role !== "ראשי") continue;
      const list = primaryOwners.get(l.materialId) ?? [];
      list.push(p);
      primaryOwners.set(l.materialId, list);
    }
  }

  // duplicated free-text content across personas (generic-content signal)
  const textOwners = new Map<string, PersonaV2[]>();
  for (const p of personas) {
    for (const f of ["adoptionBarrier", "exercise", "trainingObjective"] as const) {
      const key = `${f}⟂${p[f].trim()}`;
      const list = textOwners.get(key) ?? [];
      list.push(p);
      textOwners.set(key, list);
    }
  }

  for (const p of personas) {
    // 1 — missing material
    if (p.supportingMaterials.length === 0) {
      warnings.push(
        warn(seq, "חומר חסר", "אזהרה", p, "supportingMaterials", "לפרסונה אין אף חומר תמיכה מקושר"),
      );
    } else {
      for (const l of p.supportingMaterials) {
        if (!materialById.has(l.materialId)) {
          warnings.push(
            warn(
              seq,
              "חומר חסר",
              "אזהרה",
              p,
              "supportingMaterials",
              `קישור לחומר ${l.materialId} אינו קיים במאגר החומרים`,
            ),
          );
        }
      }
      if (!p.supportingMaterials.some((l) => l.role === "ראשי")) {
        warnings.push(
          warn(seq, "חומר חסר", "אזהרה", p, "supportingMaterials", "לא הוגדר חומר ראשי לפרסונה"),
        );
      }
    }

    // 2 — missing exercise
    if (p.exercise.trim().length === 0) {
      warnings.push(warn(seq, "תרגול חסר", "אזהרה", p, "exercise", "לפרסונה לא הוגדר תרגול מעשי"));
    }

    // 3 — generic content: known generic phrases
    for (const f of ["adoptionBarrier", "exercise", "trainingObjective"] as const) {
      const value = p[f];
      const generic = GENERIC_PHRASES.find((g) => value.includes(g));
      if (generic) {
        warnings.push(
          warn(seq, "תוכן גנרי", "אזהרה", p, f, `השדה מכיל ניסוח גנרי ("${generic}") — נדרש תוכן ייעודי לפרסונה`),
        );
      }
      // 3b — the same text reused by another persona
      const owners = textOwners.get(`${f}⟂${value.trim()}`) ?? [];
      if (value.trim().length > 0 && owners.length > 1) {
        const others = owners
          .filter((o) => o.id !== p.id)
          .map((o) => o.name)
          .join(", ");
        warnings.push(
          warn(seq, "תוכן גנרי", "אזהרה", p, f, `תוכן זהה משמש גם את: ${others} — כל פרסונה חייבת תוכן ייחודי`),
        );
      }
    }

    // 4 — named owner must be a real named person from the users store
    const owner = p.namedOwner;
    const ownerUser = owner.userId ? userById.get(owner.userId) : undefined;
    if (!owner.name.trim() || !owner.userId.trim()) {
      warnings.push(warn(seq, "אחראי לא שמי", "אזהרה", p, "namedOwner", "לא הוקצה אחראי"));
    } else if (!ownerUser) {
      warnings.push(
        warn(seq, "אחראי לא שמי", "אזהרה", p, "namedOwner", `האחראי ${owner.name} אינו משתמש קיים במערכת`),
      );
    } else if (ownerUser.name !== owner.name) {
      warnings.push(
        warn(
          seq,
          "אחראי לא שמי",
          "אזהרה",
          p,
          "namedOwner",
          `שם האחראי (${owner.name}) אינו תואם את רשומת המשתמש (${ownerUser.name})`,
        ),
      );
    }

    // 5 — numeric target missing (honest informational state, still surfaced)
    if (p.successMetric.numericTarget === null) {
      warnings.push(
        warn(seq, "יעד מספרי חסר", "מידע", p, "successMetric", `${p.successMetric.targetNote} — מדד ההצלחה איכותי בלבד`),
      );
    }

    // 6 — duplicated primary material path
    for (const l of p.supportingMaterials) {
      if (l.role !== "ראשי") continue;
      const owners = primaryOwners.get(l.materialId) ?? [];
      if (owners.length > 1) {
        const others = owners
          .filter((o) => o.id !== p.id)
          .map((o) => o.name)
          .join(", ");
        warnings.push(
          warn(
            seq,
            "נתיב חומר כפול",
            "אזהרה",
            p,
            "supportingMaterials",
            `החומר הראשי ${l.materialId} משמש כראשי גם אצל: ${others}`,
          ),
        );
      }
    }

    // 7 — role without a support route
    if (!VALID_TIERS.has(p.supportTier)) {
      warnings.push(
        warn(seq, "ללא מסלול תמיכה", "אזהרה", p, "supportTier", "לפרסונה לא הוגדר מסלול תמיכה (Tier 1-3)"),
      );
    }

    // 8 — material version mismatch (material edited after persona approval)
    for (const l of p.supportingMaterials) {
      const live = materialById.get(l.materialId);
      if (live && live.updatedAt !== l.expectedUpdatedAt) {
        warnings.push(
          warn(
            seq,
            "אי-התאמת גרסת חומר",
            "אזהרה",
            p,
            "supportingMaterials",
            `החומר "${live.title}" (${l.materialId}) עודכן אחרי אישור גרסת הפרסונה — נדרשת סקירה מחדש`,
          ),
        );
      }
    }
  }

  return warnings;
}
