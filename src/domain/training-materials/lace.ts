// W7-D — LACE conversation simulator (7.14): a DETERMINISTIC, LocalRules-style
// evaluator of a trainee's response to an objection.
//
// Honesty contract (tested):
// - purely rule-based; the same input always yields the same output;
// - NO numeric coaching score — no measured coaching accuracy exists, so none
//   is claimed. The mandatory label is LACE_SIMULATOR_HONESTY_LABEL;
// - envelope output follows AIResponseEnvelopeV2 with model=null, unmeasured
//   usage and "unavailable" confidence ("טרם נמדד").
import type { AIResponseEnvelopeV2, EvidenceItem } from "@/domain/ai/envelope";
import { unavailableConfidence } from "@/domain/ai/envelope";
import type { ObjectionRecord } from "./types";

export const LACE_COACH_PROVIDER_ID = "local-rules-lace";
export const LACE_COACH_DISPLAY_NAME = "מאמן שיחה מקומי מבוסס כללים";

/** the exact honest label the UI must show — asserted by tests */
export const LACE_SIMULATOR_HONESTY_LABEL = "הערכה דטרמיניסטית מבוססת כללים — טרם נמדד";

// ---------------------------------------------------------------------------
// detection rules — dismissive / over-promising / policy-bypassing wording
// ---------------------------------------------------------------------------

export type LaceWarningRule = "ביטול" | "הבטחת-יתר" | "עקיפת-מדיניות";

interface DetectionRule {
  rule: LaceWarningRule;
  pattern: RegExp;
  explanationHe: string;
  saferWordingHe: string;
}

export const LACE_DETECTION_RULES: readonly DetectionRule[] = [
  {
    rule: "ביטול",
    pattern:
      /שטויות|אין (?:לך )?מה לדאוג|אתה מגזים|את מגזימה|זה לא נכון בכלל|פשוט תתרגל|אל תדאג|אל תדאגי|זו לא בעיה|תפסיק להתלונן|אין סיבה לחשוש/,
    explanationHe: "ניסוח מבטל — דוחה את הרגש של הדובר/ת במקום להכיר בו (שלב Acknowledge נשבר).",
    saferWordingHe: '"אני מבין/ה למה זה מדאיג — בוא/י נבדוק את זה יחד" במקום לבטל את החשש.',
  },
  {
    rule: "הבטחת-יתר",
    pattern:
      /אף פעם לא טוע|תמיד צודק|תמיד נכון|100%|מאה אחוז|בלי (?:שום )?שגיאות|לעולם לא (?:טועה|תטעה)|מושלם|אין (?:שום )?סיכוי לטעות|מבטיח (?:לך )?ש/,
    explanationHe:
      "הבטחת-יתר — טענת ודאות שאין לה מדידה מאחוריה. במערכת כנה אומרים מה נבדק ומה טרם נמדד.",
    saferWordingHe: '"המערכת מציגה ראיות לכל תשובה, וכשמשהו לא נמדד היא אומרת זאת" — בלי הבטחות מוחלטות.',
  },
  {
    rule: "עקיפת-מדיניות",
    pattern:
      /בלי אישור|תעקוף|לעקוף|לא צריך אישור|תשלח ישר|שלח ישירות|בלי לבדוק|תדלג על הבדיקה|אפשר לדלג על|לא חייבים לבדוק/,
    explanationHe:
      "ניסוח שעוקף מדיניות — סותר את נוהל השימוש הנכון (שליחה ופעולה רגישה מחייבות אישור ובדיקה).",
    saferWordingHe: '"כל פעולה רגישה עוברת אישור — וזה בדיוק מה ששומר עלינו" — המדיניות היא חלק מהמענה.',
  },
];

// positive-signal rules — which LACE stages the response actually covers
const STAGE_SIGNALS = {
  listen: /ספר לי|ספרי לי|מה בדיוק|אשמח לשמוע|מקשיב|מקשיבה|תרחיב|תרחיבי/,
  acknowledge: /מבין (?:אותך|למה)|מבינה (?:אותך|למה)|לגיטימי|מוצדק|חשש אמיתי|דאגה (?:לגיטימית|מובנת)|זה מובן|אני שומע|אני שומעת/,
  confirm: /אם הבנתי נכון|רק שאבין|כלומר|זאת אומרת|האם הכוונה|מה שאתה אומר|מה שאת אומרת/,
  explore: /בוא נ|בואי נ|יחד|ננסה|נבדוק|מה היה עוזר|איך נוכל|מה מבחינתך/,
} as const;

const EVIDENCE_SIGNAL = /ראיות|ראיה|רשומ|יומן|אישור|מרכז האישורים|טרם נמדד|נימוק|מקור/;

export type LaceStage = keyof typeof STAGE_SIGNALS;

export interface LaceWarning {
  rule: LaceWarningRule;
  matchedText: string;
  explanationHe: string;
  saferWordingHe: string;
}

export interface LaceEvaluation {
  /** the objection being practiced */
  objectionKey: string;
  /** detected unsafe wording (empty = none detected by the rules) */
  warnings: LaceWarning[];
  /** which LACE stages the wording signals covered */
  stageCoverage: Record<LaceStage, boolean>;
  /** did the response point at real evidence / governance? */
  citesEvidence: boolean;
  strengths: string[];
  suggestions: string[];
  /** always LACE_SIMULATOR_HONESTY_LABEL — no measured accuracy is claimed */
  honestyLabel: string;
}

const STAGE_LABELS: Record<LaceStage, string> = {
  listen: "Listen — הקשבה",
  acknowledge: "Acknowledge — הכרה בחשש",
  confirm: "Confirm — וידוא הבנה",
  explore: "Explore — חקירה משותפת",
};

const STAGE_SUGGESTIONS: Record<LaceStage, string> = {
  listen: 'להוסיף שאלת הקשבה פתוחה, למשל: "ספר/י לי עוד — מה בדיוק מדאיג אותך?"',
  acknowledge: 'להכיר בחשש לפני שעונים, למשל: "זו דאגה לגיטימית לגמרי".',
  confirm: 'לוודא הבנה במילים שלכם, למשל: "אם הבנתי נכון, החשש הוא ש…".',
  explore: 'לסיים בהזמנה לחקירה משותפת, למשל: "בוא/י נבדוק יחד תרחיש אמיתי".',
};

/**
 * Deterministic evaluation of a trainee response. Same input ⇒ same output.
 * There is NO score — only detected patterns and concrete suggestions.
 */
export function evaluateLaceResponse(objection: ObjectionRecord, response: string): LaceEvaluation {
  const text = response.trim();

  const warnings: LaceWarning[] = [];
  for (const rule of LACE_DETECTION_RULES) {
    const match = rule.pattern.exec(text);
    if (match) {
      warnings.push({
        rule: rule.rule,
        matchedText: match[0],
        explanationHe: rule.explanationHe,
        saferWordingHe: rule.saferWordingHe,
      });
    }
  }

  const stageCoverage = {
    listen: STAGE_SIGNALS.listen.test(text),
    acknowledge: STAGE_SIGNALS.acknowledge.test(text),
    confirm: STAGE_SIGNALS.confirm.test(text),
    explore: STAGE_SIGNALS.explore.test(text) || text.includes("?"),
  };
  const citesEvidence = EVIDENCE_SIGNAL.test(text);

  const strengths: string[] = [];
  for (const stage of Object.keys(STAGE_SIGNALS) as LaceStage[]) {
    if (stageCoverage[stage]) strengths.push(`המענה כולל ${STAGE_LABELS[stage]}`);
  }
  if (citesEvidence) strengths.push("המענה מפנה לראיות/מנגנוני בקרה אמיתיים במקום להבטיח");

  const suggestions: string[] = [];
  for (const warning of warnings) suggestions.push(warning.saferWordingHe);
  for (const stage of Object.keys(STAGE_SIGNALS) as LaceStage[]) {
    if (!stageCoverage[stage]) suggestions.push(STAGE_SUGGESTIONS[stage]);
  }
  if (!citesEvidence) {
    suggestions.push(
      "לעגן את המענה בראיה אמיתית — מרכז האישורים, יומן הביקורת או מעטפת הראיות.",
    );
  }
  if (text.length > 0 && text.length < 25) {
    suggestions.push("המענה קצר מכדי לכסות את שלבי LACE — כדאי להרחיב בהקשבה ובווידוא הבנה.");
  }

  return {
    objectionKey: objection.key,
    warnings,
    stageCoverage,
    citesEvidence,
    strengths,
    suggestions,
    honestyLabel: LACE_SIMULATOR_HONESTY_LABEL,
  };
}

// ---------------------------------------------------------------------------
// envelope-honest wrapper
// ---------------------------------------------------------------------------

let laceSeq = 0;

/** test hook — deterministic envelope ids across runs */
export function __resetLaceSeqForTests(): void {
  laceSeq = 0;
}

/** Wrap an evaluation in the canonical honest envelope (V2). */
export function laceEnvelope(
  objection: ObjectionRecord,
  evaluation: LaceEvaluation,
  now: () => string = () => new Date().toISOString(),
): AIResponseEnvelopeV2 {
  laceSeq += 1;
  const id = `lace-env-${laceSeq}`;
  const createdAt = now();
  const evidence: EvidenceItem[] = [
    {
      sourceType: "entity",
      sourceId: objection.id,
      title: `התנגדות: "${objection.surfaceStatement}"`,
      relevantExcerpt: objection.underlyingConcern,
      relevanceMethod: "רשומת ההתנגדות שנבחרה לתרגול",
      verified: true,
      lastUpdated: objection.updatedAt,
    },
    {
      sourceType: "computation",
      sourceId: `lace-rules-v${1}`,
      title: "כללי הזיהוי הדטרמיניסטיים",
      relevantExcerpt:
        evaluation.warnings.length > 0
          ? evaluation.warnings.map((w) => `${w.rule}: «${w.matchedText}»`).join(" · ")
          : "אף כלל אזהרה לא נורה על הנוסח שנבדק",
      relevanceMethod: "התאמת תבניות קבועות (regex) על נוסח המענה",
      verified: true,
      lastUpdated: createdAt,
    },
  ];
  const summary =
    evaluation.warnings.length > 0
      ? `זוהו ${evaluation.warnings.length} דפוסי ניסוח לשיפור (${evaluation.warnings.map((w) => w.rule).join(", ")}).`
      : "לא זוהו דפוסי ניסוח בעייתיים על ידי הכללים.";
  return {
    id,
    requestId: `${id}-req`,
    correlationId: `${id}-corr`,
    provider: LACE_COACH_PROVIDER_ID,
    model: null, // rules engine — never fakes a model
    createdAt,
    operation: "coach.lace-response",
    recommendation: `${summary} ${evaluation.suggestions.length > 0 ? `הצעות שיפור: ${evaluation.suggestions.length}.` : "אין הצעות נוספות מהכללים."}`,
    reason:
      "הערכה דטרמיניסטית: התאמת תבניות מילוליות קבועות (ביטול / הבטחת-יתר / עקיפת-מדיניות) " +
      "וזיהוי סימני שלבי LACE — לא מודל שפה ולא מדידת איכות אימון.",
    evidence,
    confidence: unavailableConfidence(
      "איכות אימון (coaching) מעולם לא נמדדה — הכללים מזהים דפוסים, לא מודדים שכנוע",
      evaluation.warnings.map((w) => `כלל ${w.rule} נורה על «${w.matchedText}»`),
    ),
    nextStep:
      evaluation.warnings.length > 0
        ? "לנסח מחדש לפי ההצעות ולהריץ שוב את הבדיקה"
        : "לתרגל את המענה בקול מול עמית/ה ולעדכן את סטטוס הבדיקה של ההתנגדות",
    limitations: [
      "מנוע כללים מקומי ודטרמיניסטי — לא מודל שפה; אותו קלט מחזיר תמיד אותו פלט",
      "הכללים מזהים דפוסי ניסוח בלבד — נימה, הקשר ושפת גוף אינם נבדקים",
      LACE_SIMULATOR_HONESTY_LABEL,
    ],
    approval: { required: false, state: "not_required" },
    usage: { measured: false },
    status: "הצלחה",
  };
}
