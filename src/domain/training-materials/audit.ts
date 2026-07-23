// W7-D — "מבקר החומרים" (7.11): deterministic quality rules over the material
// records. Also the completeness rules the tests enforce: a title alone is
// NEVER a complete material.
import type { CanonicalMaterialDef } from "./content";
import { CANONICAL_MATERIALS } from "./content";
import type { TrainingMaterialV2 } from "./types";

export type MaterialFindingKind =
  | "חסר בעלים"
  | "לא משויך לפרסונה"
  | "ללא תרגול"
  | "ללא תוצאה מדידה"
  | "ניסוח מיושן"
  | "ללא אישור"
  | "חומר שאינו בשימוש";

export interface MaterialFinding {
  materialId: string;
  materialTitle: string;
  kind: MaterialFindingKind;
  detailHe: string;
}

/** wording that must not survive in approved-facing content (outdated terms) */
const OUTDATED_WORDING = [/בקרוב/, /יושק בהמשך/, /גרסה עתידית/, /טרם הוחלט/];

/**
 * A material is content-complete only when it has authored sections with
 * blocks, an owner, personas and a measurable outcome — a title is not enough.
 */
export function isMaterialComplete(
  material: TrainingMaterialV2,
  def: CanonicalMaterialDef | undefined = CANONICAL_MATERIALS.find(
    (d) => d.key === material.canonicalKey,
  ),
): boolean {
  if (!def) return false;
  const hasContent =
    def.sections.length > 0 && def.sections.every((s) => s.blocks.length > 0 && s.heading.length > 0);
  return (
    hasContent &&
    material.title.trim().length > 0 &&
    material.description.trim().length > 0 &&
    typeof material.ownerId === "string" &&
    material.ownerId.length > 0 &&
    material.audiencePersonaIds.length > 0 &&
    typeof material.measurableOutcome === "string" &&
    material.measurableOutcome.length > 0
  );
}

/** the auditor — every rule from the 7.11 rail spec, deterministic */
export function auditMaterials(materials: readonly TrainingMaterialV2[]): MaterialFinding[] {
  const findings: MaterialFinding[] = [];
  for (const m of materials) {
    const def = CANONICAL_MATERIALS.find((d) => d.key === m.canonicalKey);
    if (!m.ownerId) {
      findings.push({
        materialId: m.id,
        materialTitle: m.title,
        kind: "חסר בעלים",
        detailHe: "לא הוקצה אחראי — יש לשייך בעלים בשם.",
      });
    }
    if (m.audiencePersonaIds.length === 0) {
      findings.push({
        materialId: m.id,
        materialTitle: m.title,
        kind: "לא משויך לפרסונה",
        detailHe: "החומר אינו משויך לאף פרסונה — לא ברור מי אמור ללמוד ממנו.",
      });
    }
    if (m.section === "חומרי הוראה ותרגול" && m.practiceIncluded !== true) {
      findings.push({
        materialId: m.id,
        materialTitle: m.title,
        kind: "ללא תרגול",
        detailHe: "חומר הוראה ללא רכיב תרגול מעשי.",
      });
    }
    if (!m.measurableOutcome) {
      findings.push({
        materialId: m.id,
        materialTitle: m.title,
        kind: "ללא תוצאה מדידה",
        detailHe: "לא הוגדרה תוצאה מדידה — אי אפשר לדעת אם החומר עבד.",
      });
    }
    const authoredText = def
      ? def.sections
          .map((s) =>
            s.blocks
              .map((b) => ("text" in b ? b.text : "items" in b ? b.items.join(" ") : ""))
              .join(" "),
          )
          .join(" ")
      : "";
    if (OUTDATED_WORDING.some((re) => re.test(`${m.description} ${authoredText}`))) {
      findings.push({
        materialId: m.id,
        materialTitle: m.title,
        kind: "ניסוח מיושן",
        detailHe: "נמצא ניסוח של הבטחה עתידית — יש לעדכן למצב הקיים.",
      });
    }
    if (m.status !== "מאושר" && m.status !== "בארכיון") {
      findings.push({
        materialId: m.id,
        materialTitle: m.title,
        kind: "ללא אישור",
        detailHe: `סטטוס נוכחי: ${m.status ?? "לא התחיל"} — טרם אושר בזרימת האישורים.`,
      });
    }
    if (m.status === "בארכיון") {
      findings.push({
        materialId: m.id,
        materialTitle: m.title,
        kind: "חומר שאינו בשימוש",
        detailHe: "החומר בארכיון — יש להסיר הפניות אליו או להחזירו לשימוש.",
      });
    }
  }
  return findings;
}
