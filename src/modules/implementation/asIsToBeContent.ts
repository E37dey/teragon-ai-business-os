// AS-IS/TO-BE mandated content + pure layout math (W7-A, Phase 7.3).
// Separated from the component file (fast-refresh: components-only exports).
// Exact counts: 5 AS-IS steps / 7 TO-BE steps / 6 human items / 5 forbidden.

export const AS_IS_STEPS: readonly string[] = [
  "פנייה נקלטת ידנית בערוץ אקראי (וואטסאפ / טלפון / מייל)",
  "צחי מסווג ומתעדף בראש — לא עקבי",
  "הצעת מחיר נכתבת מאפס (10–20 דק׳)",
  "ליווי ומעקב בוואטסאפ — ללא מקור אמת אחד",
  "אחריות ותקלות ללא מעקב — תיעוד בעל-פה",
] as const;

export const TO_BE_STEPS: readonly string[] = [
  "פנייה נקלטת למערכת אחת — מקור אמת יחיד",
  "◆ מוקד פניות AI מסווג ומנתב + % ביטחון",
  "◆ סטודיו הצעות AI מנסח טיוטה בפחות מדקה",
  "צחי בודק, מאשר ושולח (HITL)",
  "מעקב אוטומטי — משימות ופולואו-אפים",
  "◆ ניטור אחריות + חיזוי נטישה יזום",
  "◆ סיכום תקלה AI למאגר הידע + בקשת המלצה",
] as const;

/** נשאר באחריות אדם — 6 items. */
export const HUMAN_RESPONSIBILITY_ITEMS: readonly string[] = [
  "שליחת כל הצעת מחיר, מייל או הודעה ללקוח",
  "תמחור סופי ומתן הנחות",
  "פעולת שימור ללקוח בסיכון נטישה",
  "כל התחייבות בשם העסק — מועדים, אחריות, תנאים",
  "אישור סיווג AI בביטחון נמוך (מתחת ל-70%)",
  "בדיקה מלאה של לקוח VIP או עסקה גדולה",
] as const;

/** אסור להעביר ל-AI — 5 items. */
export const FORBIDDEN_AI_ITEMS: readonly string[] = [
  "שליחה אוטומטית ללקוח ללא אישור אדם — לעולם",
  "טיפול בתלונה רגשית או בעיה משפטית",
  "אישור עסקה מעל 15,000 ₪ ללא אישור צחי",
  "העלאת מידע לקוח רגיש לכלי LLM חיצוני",
  "החלטות Go/No-Go על הרחבת ההטמעה",
] as const;

// ---------------------------------------------------------------------------
// pure layout math (16:9 presentation frame) — validated by tests
// ---------------------------------------------------------------------------

export interface MapRect {
  /** which band the box belongs to */
  band: "as-is" | "to-be" | "human" | "forbidden";
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const PRESENTATION_WIDTH = 1280;
export const PRESENTATION_HEIGHT = 720;

/**
 * Deterministic box layout for the 16:9 presentation frame. Bands:
 * AS-IS row (5), TO-BE row (7), then two side-by-side list panels
 * (human 6 / forbidden 5). Gaps are explicit — overlap is impossible by
 * construction and asserted by tests (rectanglesOverlap on every pair).
 */
export function computeMapLayout(
  width = PRESENTATION_WIDTH,
  height = PRESENTATION_HEIGHT,
): MapRect[] {
  const margin = 32;
  const gap = 16;
  const innerW = width - margin * 2;
  const rowLabelH = 30;
  const rects: MapRect[] = [];

  const rowOfBoxes = (band: MapRect["band"], count: number, y: number, rowH: number): void => {
    const boxW = (innerW - gap * (count - 1)) / count;
    for (let i = 0; i < count; i += 1) {
      // RTL: step 1 sits at the RIGHT edge
      const x = width - margin - boxW - i * (boxW + gap);
      rects.push({ band, index: i, x, y, width: boxW, height: rowH });
    }
  };

  const asIsY = 56 + rowLabelH;
  const rowH = 96;
  rowOfBoxes("as-is", AS_IS_STEPS.length, asIsY, rowH);

  const toBeY = asIsY + rowH + rowLabelH + gap * 2;
  rowOfBoxes("to-be", TO_BE_STEPS.length, toBeY, rowH);

  const panelsY = toBeY + rowH + rowLabelH + gap * 2;
  const panelH = height - panelsY - margin;
  const panelW = (innerW - gap) / 2;
  // RTL: the human panel first (right), the forbidden panel second (left)
  rects.push({
    band: "human",
    index: 0,
    x: width - margin - panelW,
    y: panelsY,
    width: panelW,
    height: panelH,
  });
  rects.push({ band: "forbidden", index: 0, x: margin, y: panelsY, width: panelW, height: panelH });
  return rects;
}

/** True when two rects intersect (strict interiors — touching edges are fine). */
export function rectanglesOverlap(a: MapRect, b: MapRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
