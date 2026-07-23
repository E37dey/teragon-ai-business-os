// W5-D — deterministic prompt-injection heuristics (pure, shared with tests).
/** Deterministic, documented markers — not a model, not a probability. */
const INJECTION_PATTERNS: readonly { pattern: RegExp; labelHe: string }[] = [
  { pattern: /התעלם\s+מ?ההוראות|התעלמי\s+מ?ההוראות/, labelHe: "בקשת התעלמות מהוראות" },
  {
    pattern: /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
    labelHe: "בקשת התעלמות מהוראות (אנגלית)",
  },
  { pattern: /system\s*prompt|פרומפט\s+מערכת/i, labelHe: "ניסיון גישה להנחיות המערכת" },
  {
    pattern: /חשוף\s+את\s+(המפתח|הסוד)|reveal\s+(the\s+)?(api\s*key|secret)/i,
    labelHe: "בקשת חשיפת סודות",
  },
  { pattern: /אתה\s+עכשיו|from\s+now\s+on\s+you\s+are/i, labelHe: "ניסיון שינוי זהות הסוכן" },
  { pattern: /בצע\s+ללא\s+אישור|without\s+approval/i, labelHe: "ניסיון עקיפת שער האישור האנושי" },
];

export interface InjectionFinding {
  labelHe: string;
}

/** Pure detector (unit-tested). Empty array ⇒ no marker matched. */
export function detectInjection(text: string): InjectionFinding[] {
  const findings: InjectionFinding[] = [];
  for (const rule of INJECTION_PATTERNS) {
    if (rule.pattern.test(text)) findings.push({ labelHe: rule.labelHe });
  }
  return findings;
}
