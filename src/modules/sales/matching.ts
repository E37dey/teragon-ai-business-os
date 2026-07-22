// Wave 3 — "מנוע מקומי מבוסס כללים": deterministic printer matching over the
// printerModels catalogue ONLY. No network, no model, no invented confidence —
// every result carries an explanation, limitations and a full solution estimate.
import type { PrinterModel, Product } from "@/domain/types";

export type UseCase =
  | "תחביב"
  | "לימודים"
  | "אב־טיפוס"
  | "ייצור קטן"
  | "חלקים טכניים"
  | "מיניאטורות"
  | "מודלים אדריכליים";

export const USE_CASES: readonly UseCase[] = [
  "תחביב",
  "לימודים",
  "אב־טיפוס",
  "ייצור קטן",
  "חלקים טכניים",
  "מיניאטורות",
  "מודלים אדריכליים",
];

export type MaterialChoice = "PLA" | "PETG" | "ABS" | "ניילון" | "רזין";

export const MATERIALS: readonly MaterialChoice[] = ["PLA", "PETG", "ABS", "ניילון", "רזין"];

export type BuildVolume = "קטן" | "בינוני" | "גדול";

export const BUILD_VOLUMES: readonly BuildVolume[] = ["קטן", "בינוני", "גדול"];

export interface NeedAssessment {
  useCase: UseCase;
  materials: readonly MaterialChoice[];
  buildVolume: BuildVolume;
  /** budget in ₪ for the printer itself */
  budget: number;
}

export interface MatchResult {
  model: PrinterModel;
  /** deterministic rule score (not a probability — never presented as confidence) */
  score: number;
  /** why this model fits (rule hits, Hebrew) */
  suitability: string[];
  /** honest limitations of this model for the stated needs */
  limitations: string[];
  /** true when the model exceeds the stated budget */
  overBudget: boolean;
}

export interface SolutionEstimate {
  printerPrice: number;
  accessories: { product: Product; reason: string }[];
  recommendedCourse: Product | null;
  /** printer + accessories + course, ₪ before VAT */
  total: number;
}

/** materials that demand an enclosed / technical FDM printer */
const TECHNICAL_MATERIALS: ReadonlySet<string> = new Set(["ABS", "ניילון"]);

/** deterministic tag hints per model name (derived from catalogue tags only). */
function volumeHint(model: PrinterModel): BuildVolume {
  // catalogue-derived: Mini/Mars are small, K1/X1C/MK4 medium-large
  if (model.name.includes("Mini") || model.name.includes("Mars")) return "קטן";
  if (model.tags.includes("ייצור קטן") || model.name.includes("K1")) return "גדול";
  return "בינוני";
}

/**
 * Score catalogue models against the assessment. Pure + deterministic:
 * the same input always produces the same ranking. Returns ONLY models
 * from the given catalogue, sorted best-first.
 */
export function matchPrinters(
  catalogue: readonly PrinterModel[],
  need: NeedAssessment,
  limit = 3,
): MatchResult[] {
  const wantsResin = need.materials.includes("רזין");
  const wantsTechnical = need.materials.some((m) => TECHNICAL_MATERIALS.has(m));

  const results: MatchResult[] = catalogue.map((model) => {
    let score = 0;
    const suitability: string[] = [];
    const limitations: string[] = [];

    // technology fit
    if (wantsResin && model.technology === "רזין") {
      score += 30;
      suitability.push("טכנולוגיית רזין — מתאימה לחומר המבוקש");
    } else if (wantsResin && model.technology === "FDM") {
      score -= 25;
      limitations.push("מדפסת FDM — אינה מדפיסה רזין");
    } else if (!wantsResin && model.technology === "רזין") {
      score -= 20;
      limitations.push("מדפסת רזין — פחות מתאימה לחומרים תרמופלסטיים שביקשתם");
    }

    // use-case tag match
    if (model.tags.includes(need.useCase)) {
      score += 25;
      suitability.push(`מתויגת בקטלוג לשימוש «${need.useCase}»`);
    }

    // technical materials need an enclosed/technical machine
    if (wantsTechnical) {
      if (model.tags.includes("חלקים טכניים") || model.tags.includes("מקצועי")) {
        score += 15;
        suitability.push("מתאימה לחומרים טכניים (ABS/ניילון)");
      } else {
        limitations.push("לא מיועדת לחומרים טכניים — ABS/ניילון דורשים תא סגור");
      }
    }

    // build volume
    const hint = volumeHint(model);
    if (hint === need.buildVolume) {
      score += 10;
      suitability.push(`נפח הדפסה ${hint} — תואם את הצורך`);
    } else if (need.buildVolume === "גדול" && hint === "קטן") {
      score -= 10;
      limitations.push("נפח הדפסה קטן מהנדרש");
    }

    // budget
    const overBudget = model.price > need.budget;
    if (overBudget) {
      score -= 40;
      limitations.push(`המחיר (${model.price.toLocaleString("he-IL")} ₪) גבוה מהתקציב שהוגדר`);
    } else {
      score += 10;
      suitability.push("במסגרת התקציב");
      // prefer using more of the budget for capability (closer to budget = more capable)
      score += Math.round((model.price / Math.max(need.budget, 1)) * 10);
    }

    return { model, score, suitability, limitations, overBudget };
  });

  return results.sort((a, b) => b.score - a.score || a.model.price - b.model.price).slice(0, limit);
}

/** deterministic accessory + course recommendation from the products catalogue. */
export function solutionEstimate(
  match: MatchResult,
  products: readonly Product[],
  need: NeedAssessment,
): SolutionEstimate {
  const accessories: { product: Product; reason: string }[] = [];

  const filament = products.find((p) => p.category === "חומר גלם" && p.active);
  if (filament && match.model.technology === "FDM") {
    accessories.push({ product: filament, reason: "חומר גלם לתחילת עבודה" });
  }
  const install = products.find((p) => p.name.includes("תיקון") && p.active);
  if (install) {
    accessories.push({ product: install, reason: "אבחון וכיול ראשוני בעת המסירה" });
  }

  const recommendedCourse = products.find((p) => p.category === "קורס" && p.active) ?? null;

  const accessoriesTotal = accessories.reduce((s, a) => s + a.product.price, 0);
  const courseTotal = recommendedCourse ? recommendedCourse.price : 0;
  // course recommended for hobby/studies use cases; still included in estimate when present
  void need;

  return {
    printerPrice: match.model.price,
    accessories,
    recommendedCourse,
    total: match.model.price + accessoriesTotal + courseTotal,
  };
}
