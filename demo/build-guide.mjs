// TERAGON — builds the Hebrew training booklet (חוברת הדרכה) with annotated
// screenshots (numbered arrow callouts + legend + narration + summary).
// Presenter/submission tool only — changes NO product code.
// Output: docs/submission/he/GUIDE_HE.html  (self-contained; embeds the PNGs).
// Run:  node demo/build-guide.mjs   → then open the HTML / print to PDF.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs", "submission", "screenshots");
const OUT = join(ROOT, "docs", "submission", "he", "GUIDE_HE.html");

const b64 = (f) => "data:image/png;base64," + readFileSync(join(SHOTS, f)).toString("base64");

// c = callout: n number · (tx,ty) arrow target on the element · (bx,by) number-badge spot · t legend text
const c = (n, tx, ty, bx, by, t) => ({ n, tx, ty, bx, by, t });

const FIGS = [
  {
    id: "login", file: "01-login.png", w: 1440, h: 930,
    kicker: "פרק 1 · הכניסה", title: "מסך הכניסה — בחירת סביבת עבודה",
    lede: "נקודת ההתחלה. אותה מערכת אחת, אבל כל תפקיד נכנס לחוויה שונה. הבחירה כאן קובעת איזה פורטל ואילו מסכים ייפתחו.",
    say: "\"זו מערכת אחת מבוקרת. אני בוחר תפקיד — והמערכת מרכיבה עבורו פורטל אחר לגמרי. שימו לב: בחירת פורטל לעולם לא מעלה הרשאות; היא נגזרת מהתפקיד.\"",
    calls: [
      c(1, 720, 88, 720, 45, "מיתוג המערכת — TERAGON AI BUSINESS OS."),
      c(2, 1010, 208, 1200, 175, "כרטיס מנהל — ניהול, בקרה וקבלת החלטות (המשתמש: צחי זוסטייהם)."),
      c(3, 720, 208, 720, 150, "כרטיס תלמיד — למידה, משימות והתקדמות."),
      c(4, 430, 208, 250, 175, "כרטיס טכנאי — משימות שטח, ידע טכני ושירות."),
      c(5, 1098, 290, 1210, 300, "\"כניסה כדמו\" — מזין פרטים ונכנס בקליק לתפקיד שנבחר."),
      c(6, 720, 455, 470, 455, "כניסה ידנית (דוא\"ל + סיסמה) — לצד פרטי הדמו למטה."),
    ],
  },
  {
    id: "manager", file: "02-manager-home.png", w: 1440, h: 930,
    kicker: "פרק 2 · פורטל מנהל", title: "בית המנהל — קודם החלטות, אחר-כך מדדים",
    lede: "מסך הבית של המנהל בנוי סביב שאלה אחת: מה דורש את תשומת ליבי עכשיו? למעלה — החלטות ואישורים; באמצע — אותות חיים; למטה — מדדים וקיצורי דרך.",
    say: "\"המנהל לא מקבל דף נתונים — הוא מקבל סדר יום. מרכז התפעול שם למעלה מרכז מה מחכה להחלטה, ורק אחר-כך באים המדדים.\"",
    calls: [
      c(1, 1150, 63, 1165, 22, "זהות מחוברת — שם המשתמש והתפקיד נשלפים מהחשבון (לא נבחרים ידנית)."),
      c(2, 430, 57, 430, 20, "חיפוש חכם בכל המערכת — מדורג לפי רלוונטיות ובכפוף להרשאות."),
      c(3, 795, 57, 700, 20, "מתג מצב תצוגה (בהיר/כהה)."),
      c(4, 888, 57, 980, 20, "\"יציאה\" — יציאה מהפורטל והחלפת חשבון."),
      c(5, 1332, 233, 1412, 300, "ניווט צדדי מקובץ — הקבוצות והמסכים משתנים לפי הרשאות התפקיד."),
      c(6, 1000, 335, 1040, 300, "מרכז תפעול — מונים חיים: ממתין להחלטה · נכשל/התנגשות · הושלם · דורש חיבור מחדש."),
      c(7, 600, 452, 300, 452, "תיבת פעולות — כאן יופיעו פריטים שדורשים אישור אנושי (כרגע ריק = הכול נקי)."),
      c(8, 600, 640, 300, 640, "רצועת KPI — אישורים ממתינים, משימות פתוחות, ריצות פעילות."),
      c(9, 1150, 890, 980, 872, "AI Copilot — עוזר שיחה זמין בכל מסך."),
    ],
  },
  {
    id: "ai", file: "05-ai-workspace.png", w: 1440, h: 900,
    kicker: "פרק 3 · מרחב ה-AI", title: "מרחב AI — שבעה סוכנים שמפיקים תוצאה מנומקת",
    lede: "הלב של המערכת. מנוע AI מקומי ודטרמיניסטי (ללא מודל מרוחק): כל סוכן בודק את נתוני הדמו, מסמן מה דורש טיפול, ומציע פעולה — עם ראיות והסבר.",
    say: "\"זה לא צ'אט-בוט. שבעה סוכנים סורקים את המצב ומחזירים ממצאים עם חומרה, מקור והצעת פעולה. Orchestrator מתזמר; אף סוכן לא פועל לבד; וכל כתיבה מחייבת אישור.\"",
    calls: [
      c(1, 880, 140, 660, 108, "הצהרת המנוע — מקומי, דטרמיניסטי, ניתן להסבר, ללא מודל מרוחק, כתיבה מחייבת אישור."),
      c(2, 1060, 205, 1085, 250, "כרטיסי מצב — סוכנים זמינים (7), תוצאות אחרונות, ממתין לאישור, ודורש טיפול (12)."),
      c(3, 700, 392, 300, 392, "\"מה דורש טיפול עכשיו?\" — ממצאים שנגזרו ע\"י Hunter ו-Orchestrator מנתוני הדמו."),
      c(4, 120, 495, 300, 520, "פעולה לכל ממצא — לפתוח את המסך הרלוונטי, או \"העבר ל-Fixer להצעת תיקון\"."),
      c(5, 180, 618, 130, 596, "תצוגות הסביבה — רשת סוכנים · מפת ידע · מסך מפוצל · תהליך חי."),
      c(6, 250, 828, 150, 788, "רשת הסוכנים — גרף חי של הסוכנים והקשרים ביניהם."),
      c(7, 1385, 337, 1412, 337, "ניווט ה-AI — סוכני AI וחדר התיאום."),
    ],
  },
  {
    id: "workflow", file: "08-governed-workflow.png", w: 1440, h: 900,
    kicker: "פרק 4 · תהליך מבוקר", title: "תהליך ידע מבוקר — הסוכן קורא מהכספת, האדם מאשר",
    lede: "לשונית \"תהליך חי\": תהליכים עסקיים אמיתיים. תיעוד-ידע-מבוקר מפיק המלצה מתוך כספת Obsidian ומכין עדכון ליומן ההחלטות — אבל עוצר לאישור אנושי. שום כתיבה אוטומטית.",
    say: "\"כאן מתחברים ה-AI והמשילות. אני מריץ תהליך; הסוכן קורא מהכספת, מסכם וממליץ — ואז נעצר. הכתיבה קורית רק כשהאדם מאשר. זה 'ה-AI ממליץ, האדם מחליט' בפועל.\"",
    calls: [
      c(1, 1120, 661, 1140, 628, "\"תהליכים עסקיים\" — מקטלוג התהליכים הזמינים."),
      c(2, 800, 700, 900, 662, "תיעוד ידע מבוקר — תג \"פעולה מבוקרת\": מפיק המלצה מאושרת ליומן ההחלטות."),
      c(3, 300, 700, 300, 662, "התאוששות תפעולית — מריץ מחדש תהליך ידע שנכשל (ללא מוטציה עיוורת)."),
      c(4, 970, 817, 1060, 855, "משימת הריצה — למשל \"בדוק את הידע על AI Operations והכן עדכון מבוקר\"."),
      c(5, 918, 783, 780, 758, "תג \"חסום · בשליטת אנוש\" — התהליך יעצור לאישורך לפני כל כתיבה."),
      c(6, 77, 817, 77, 858, "\"התחל תהליך\" — מפעיל את הריצה החיה."),
    ],
  },
  {
    id: "memory", file: "07-knowledge-map.png", w: 1440, h: 900,
    kicker: "פרק 5 · ידע וזיכרון", title: "זיכרון וכספת Obsidian — מקור הידע של הסוכנים",
    lede: "הזיכרון נשמר מקומית במכשיר (IndexedDB), ומתחבר לכספת Obsidian אמיתית לקריאה בלבד. מכאן הסוכנים שואבים ידע — ולכאן נכתבות החלטות, רק באישור אנושי.",
    say: "\"הידע לא מומצא — הוא מגיע מכספת Obsidian אמיתית. החיבור הוא קריאה-בלבד; המערכת לעולם לא כותבת לכספת בלי שאדם אישר. אם החיבור מנותק — המערכת אומרת זאת בכנות ולא מזייפת הצלחה.\"",
    calls: [
      c(1, 900, 166, 720, 132, "היכן נשמר הזיכרון — מקומית במכשיר (IndexedDB), לא בענן."),
      c(2, 1080, 290, 1130, 250, "כרטיס Obsidian — קריאה בלבד · מצב חיבור (\"לא מחובר\") · חבר / בדוק חיבור."),
      c(3, 745, 503, 590, 503, "מפת ידע — \"טען מפה\" מציגה את גרף הידע החי מהכספת."),
      c(4, 160, 300, 120, 250, "לוח הקשר — ייבוא כספת Obsidian וייצוא ל-Markdown/ZIP (עם checksum)."),
      c(5, 1050, 668, 1100, 630, "רשומות הזיכרון — זיכרונות פעילים / בארכיון / מוצגים כעת."),
      c(6, 1000, 815, 760, 852, "רשומה — למשל \"החלטה: אישור אנושי לכל כתיבה\", עם עריכה/ארכוב."),
    ],
  },
  {
    id: "analytics", file: "10-analytics.png", w: 1440, h: 900,
    kicker: "פרק 6 · דוחות וניתוחים", title: "אנליטיקה — הפיכת תפעול לאותות החלטה",
    lede: "מסך הדוחות מסכם את נתוני הדמו למדדים ומגמות: לידים, שיעור המרה, שווי הצעות, הצלחת אוטומציות — עם סינון, השוואה לתקופה קודמת וייצוא.",
    say: "\"המנהל רואה לא רק 'מה קורה' אלא 'לאן זה הולך' — מגמה מול תקופה קודמת. הכול מסונן לפי טווח, בעלים וסוג, וניתן לייצוא ל-CSV או לטבלה נגישה.\"",
    calls: [
      c(1, 120, 114, 120, 75, "ייצוא — CSV או תצוגת טבלה נגישה."),
      c(2, 1140, 176, 1160, 148, "לשוניות — מדדים / דוחות."),
      c(3, 700, 233, 700, 195, "מסננים — טווח זמן, בעלים, סוג ישות, סטטוס + השוואה לתקופה קודמת."),
      c(4, 760, 328, 300, 300, "כרטיסי KPI — הצלחת אוטומציות, שווי הצעות שאושרו, שיעור המרה, לידים חדשים."),
      c(5, 700, 560, 300, 560, "גרף מגמה — עם קו התקופה הקודמת להשוואה."),
      c(6, 700, 754, 700, 800, "קטגוריות — פעילות, מכירות, שירות, הדרכה, AI וממשל, תוצאות עסקיות."),
    ],
  },
  {
    id: "denied", file: "11-access-denied.png", w: 1440, h: 930,
    kicker: "פרק 7 · אבטחה", title: "חסימת גישה — הרשאות אמיתיות, deny-by-default",
    lede: "כשתפקיד מנסה להיכנס למסך שאין לו הרשאה אליו — הוא נחסם. כאן טכנאי מנסה להגיע לאנליטיקה של המנהל ומקבל \"גישה חסומה\". השרשרת: זהות → תפקיד → יכולת → פורטל → רשומה.",
    say: "\"האבטחה לא מסתתרת — היא נאכפת. טכנאי פשוט לא רואה את מסכי הניהול, ואם הוא ינסה גישה ישירה בכתובת — הוא נחסם. שקוף וכנה: זו סימולציית הרשאות במצב הדגמה, לא אימות ייצור.\"",
    calls: [
      c(1, 1150, 57, 1165, 20, "הזהות עכשיו — \"טכנאי דמו\" (תפקיד טכנאי)."),
      c(2, 610, 155, 300, 130, "הודעת \"גישה חסומה\" — אין הרשאה למסך /analytics."),
      c(3, 610, 182, 300, 212, "כנות: \"סימולציית הרשאות במצב הדגמה — אין כאן מנגנון אימות אמיתי\"."),
      c(4, 605, 206, 790, 240, "\"חזרה לסביבה שלי\" — מחזיר את הטכנאי למסכים המותרים לו."),
      c(5, 1332, 300, 1412, 360, "הניווט מצומצם — אין כאן כלל אנליטיקה/ממשל (deny-by-default)."),
    ],
  },
  {
    id: "student", file: "03-student-home.png", w: 1440, h: 930,
    kicker: "פרק 8 · פורטל תלמיד", title: "בית התלמיד — סביבת למידה נקייה",
    lede: "אותה מערכת, חוויה אחרת לגמרי. התלמיד לא רואה נתוני ניהול — רק את מסע הלמידה שלו: המשך למידה, המשימות שלי, והמנטור.",
    say: "\"אין כאן לקוחות, אין מכירות, אין דוחות. התלמיד מקבל את הצעד הבא, את ההתקדמות ואת המנטור. זו ההוכחה ש'פורטל' זו חוויה נגזרת-תפקיד, לא רק תפריט מוסתר.\"",
    calls: [
      c(1, 1150, 57, 1165, 20, "זהות — \"תלמיד דמו\" (תפקיד תלמיד)."),
      c(2, 1332, 250, 1412, 300, "ניווט מצומצם — מותאם לתלמיד בלבד."),
      c(3, 700, 345, 300, 312, "המשך למידה — הקורס הנוכחי עם התקדמות (3/14 · 21%)."),
      c(4, 1050, 402, 1130, 440, "פעולות — המשך ללמידה / חיפוש במאגר הידע."),
      c(5, 300, 500, 150, 540, "המנטור שלך — שיחה עם המנטור או חיפוש במאגר הידע."),
      c(6, 900, 520, 1010, 560, "המשימות שלי — שלבים עם סטטוס (הוגש/בעבודה/לא התחיל)."),
    ],
  },
  {
    id: "tech", file: "04-technician-home.png", w: 1440, h: 930,
    kicker: "פרק 9 · פורטל טכנאי", title: "בית הטכנאי — תשובה אחת: מה עכשיו",
    lede: "הטכנאי צריך למקד. המסך פותח בעבודה הנוכחית לפי עדיפות, ואז התור המוקצה לו — רק העבודה שלו, עם קיצור מהיר לעוזר Fixer ולידע טכני.",
    say: "\"טכנאי בשטח לא רוצה דשבורד — הוא רוצה לדעת מה הקריאה הדחופה. שם למעלה: הקריאה הנוכחית, עדיפות גבוהה, ובלחיצה — פותח אותה, מקבל הצעת תיקון מ-Fixer, או ידע טכני.\"",
    calls: [
      c(1, 1150, 57, 1165, 20, "זהות — \"טכנאי דמו\" (תפקיד טכנאי)."),
      c(2, 900, 315, 950, 280, "העבודה הנוכחית — הקריאה הדחופה ביותר + תג עדיפות \"גבוהה\"."),
      c(3, 1000, 380, 1130, 420, "פעולות מהירות — פתח את הקריאה · עוזר טכני (Fixer) · ידע טכני."),
      c(4, 300, 460, 150, 500, "המשימות שלי — פעולות ומעקב אישיים."),
      c(5, 900, 480, 1010, 520, "בהמתנה לפי עדיפות — התור המוקצה, כל קריאה עם דירוג חומרה."),
    ],
  },
  {
    id: "coord", file: "06-agent-coordination.png", w: 1440, h: 900,
    kicker: "פרק 10 · חדר התיאום", title: "חדר התיאום — תזמור ריצות הסוכנים",
    lede: "כאן רואים איך הסוכנים עובדים יחד: ריצות תזמור, קונפליקטים, ואישורים ממתינים. \"הפעל תרחיש הדגמה\" מריץ תזמור אמיתי דרך המנוע.",
    say: "\"זה חדר הבקרה של ה-AI. אני יכול להריץ תרחיש הדגמה ולראות את הסוכנים מתואמים — עם מונים לריצות, קונפליקטים ואישורים. שוב: מה שנשמר זה רק רשומות אמיתיות, לא נתונים מזויפים.\"",
    calls: [
      c(1, 880, 137, 700, 105, "כותרת — \"הגרף, השיחות והקונפליקטים נגזרים; רק רשומות שנשמרו\"."),
      c(2, 368, 122, 360, 82, "\"הפעל תרחיש הדגמה\" — מריץ תזמור אמיתי דרך המנוע."),
      c(3, 760, 200, 300, 250, "מונים — ריצות פעילות, קונפליקטים פתוחים, אישורים ממתינים, משימות בעבודה."),
      c(4, 900, 320, 700, 360, "מסננים — לפי ריצה, מנוע וסטטוס."),
      c(5, 740, 420, 450, 420, "רשימת הריצות — ריקה עד שמריצים תרחיש (כנות: אין ריצות מזויפות)."),
    ],
  },
];

const MOBILE = [
  { file: "12-mobile-student.png", w: 390, h: 874, cap: "פורטל תלמיד במובייל — RTL מלא, ניווט מותאם למגע." },
  { file: "13-mobile-technician.png", w: 390, h: 874, cap: "פורטל טכנאי במובייל — אותה אכיפת הרשאות, מסך אחד ממוקד." },
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function overlay(fig) {
  const parts = [`<svg class="ov" viewBox="0 0 ${fig.w} ${fig.h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`,
    `<defs><marker id="ah" markerWidth="9" markerHeight="9" refX="7" refY="3.2" orient="auto"><path d="M0,0 L7,3.2 L0,6.4 Z" fill="var(--accent)"/></marker></defs>`];
  for (const k of fig.calls) {
    // white halo + accent arrow from badge to target
    parts.push(`<line x1="${k.bx}" y1="${k.by}" x2="${k.tx}" y2="${k.ty}" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.85"/>`);
    parts.push(`<line x1="${k.bx}" y1="${k.by}" x2="${k.tx}" y2="${k.ty}" stroke="var(--accent)" stroke-width="3.4" stroke-linecap="round" marker-end="url(#ah)"/>`);
  }
  for (const k of fig.calls) {
    parts.push(`<circle cx="${k.bx}" cy="${k.by}" r="19" fill="var(--accent)" stroke="#fff" stroke-width="3.5"/>`);
    parts.push(`<text x="${k.bx}" y="${k.by + 8}" text-anchor="middle" font-family="Heebo, sans-serif" font-size="24" font-weight="800" fill="#fff">${k.n}</text>`);
  }
  parts.push(`</svg>`);
  return parts.join("");
}

function chapter(fig) {
  const legend = fig.calls.map((k) =>
    `<li><span class="num">${k.n}</span><span class="lt">${esc(k.t)}</span></li>`).join("");
  return `<section class="chapter" id="${fig.id}">
    <header class="chead">
      <div class="kicker">${esc(fig.kicker)}</div>
      <h2>${esc(fig.title)}</h2>
      <p class="lede">${esc(fig.lede)}</p>
    </header>
    <figure class="shot">
      <div class="frame"><img src="${b64(fig.file)}" alt="${esc(fig.title)}" width="${fig.w}" height="${fig.h}"/>${overlay(fig)}</div>
    </figure>
    <div class="detail">
      <div class="legend">
        <h3>מה כל דבר עושה</h3>
        <ol class="lg">${legend}</ol>
      </div>
      <aside class="say">
        <h3>מה לומר</h3>
        <p>${esc(fig.say)}</p>
      </aside>
    </div>
  </section>`;
}

const toc = FIGS.map((f, i) =>
  `<li><a href="#${f.id}"><span class="tn">${String(i + 1).padStart(2, "0")}</span><span>${esc(f.title)}</span></a></li>`).join("");

const chapters = FIGS.map(chapter).join("\n");

const mobileFigs = MOBILE.map((m) =>
  `<figure class="mfig"><img src="${b64(m.file)}" alt="${esc(m.cap)}" width="${m.w}" height="${m.h}"/><figcaption>${esc(m.cap)}</figcaption></figure>`).join("");

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>TERAGON · חוברת הדרכה</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800;900&family=Assistant:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap"/>
<style>
:root{
  --paper:#f4f7fc; --ground:#eef2f9; --surface:#ffffff; --ink:#0f1a2e; --muted:#54637d;
  --line:#dce3ef; --accent:#2f6df6; --accent-soft:#e7f0ff; --navy:#0b1220;
  --good:#2f9e6b; --warn:#b9781a; --crit:#d1495b;
  --shadow:0 10px 30px rgba(16,30,60,.10), 0 2px 8px rgba(16,30,60,.06);
}
:root:not([data-theme="light"]){}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --paper:#0b1220; --ground:#0e1626; --surface:#131d30; --ink:#e8eef8; --muted:#93a4c0;
    --line:#243349; --accent:#5b8bff; --accent-soft:#16243f; --navy:#060a12;
    --shadow:0 12px 34px rgba(0,0,0,.5), 0 2px 8px rgba(0,0,0,.4);
  }
}
:root[data-theme="dark"]{
  --paper:#0b1220; --ground:#0e1626; --surface:#131d30; --ink:#e8eef8; --muted:#93a4c0;
  --line:#243349; --accent:#5b8bff; --accent-soft:#16243f; --navy:#060a12;
  --shadow:0 12px 34px rgba(0,0,0,.5), 0 2px 8px rgba(0,0,0,.4);
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);
  font-family:Assistant,"Segoe UI",system-ui,sans-serif;font-size:17px;line-height:1.65;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.wrap{max-width:960px;margin:0 auto;padding:0 22px}
h1,h2,h3{font-family:Heebo,sans-serif;line-height:1.15;text-wrap:balance;margin:0}
a{color:var(--accent);text-decoration:none}
.mono{font-family:"IBM Plex Mono",monospace;font-size:.9em}

/* Cover */
.cover{background:linear-gradient(160deg,var(--navy),#12213c 70%);color:#eaf1ff;padding:64px 0 54px;border-bottom:3px solid var(--accent)}
.cover .wrap{display:flex;flex-direction:column;gap:20px}
.brand{font-family:Heebo;font-weight:900;letter-spacing:.12em;font-size:15px;color:#9db8ff}
.cover h1{font-size:clamp(34px,6vw,58px);font-weight:900;color:#fff}
.cover .sub{font-size:20px;color:#c3d4f5;max-width:60ch}
.meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}
.tag{font-size:13px;font-weight:600;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.16);color:#dbe7ff}
.tag b{color:#fff}

/* TOC */
.toc{padding:40px 0 8px}
.toc h2{font-size:14px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:16px}
.toc ol{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:8px 26px}
.toc a{display:flex;gap:12px;align-items:baseline;color:var(--ink);padding:9px 12px;border-radius:10px;border:1px solid transparent}
.toc a:hover{background:var(--surface);border-color:var(--line)}
.toc .tn{font-family:Heebo;font-weight:800;color:var(--accent);font-variant-numeric:tabular-nums;min-width:26px}

/* Chapter */
.chapter{padding:38px 0;border-top:1px solid var(--line)}
.kicker{font-family:Heebo;font-weight:700;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
.chead h2{font-size:clamp(24px,3.4vw,32px);font-weight:800;margin:8px 0 10px}
.lede{color:var(--muted);font-size:18px;max-width:70ch;margin:0}

.shot{margin:22px 0 0}
.frame{position:relative;border-radius:14px;overflow:hidden;border:1px solid var(--line);box-shadow:var(--shadow);background:var(--surface)}
.frame img{display:block;width:100%;height:auto}
.ov{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}

.detail{display:grid;grid-template-columns:1.55fr 1fr;gap:22px;margin-top:22px}
.legend h3,.say h3{font-family:Heebo;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
ol.lg{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:11px}
ol.lg li{display:flex;gap:12px;align-items:flex-start}
ol.lg .num{flex:0 0 auto;width:26px;height:26px;border-radius:50%;background:var(--accent);color:#fff;
  font-family:Heebo;font-weight:800;font-size:14px;display:grid;place-items:center;margin-top:2px}
ol.lg .lt{flex:1}
.say{background:var(--accent-soft);border:1px solid var(--line);border-radius:12px;padding:18px 20px;align-self:start}
.say p{margin:0;font-size:16.5px;color:var(--ink)}

/* Summary */
.summary{padding:44px 0;border-top:3px solid var(--accent);background:var(--ground)}
.summary h2{font-size:clamp(26px,4vw,38px);font-weight:900}
.summary .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:24px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:18px 20px;box-shadow:var(--shadow)}
.card h3{font-size:18px;font-weight:800;margin-bottom:6px}
.card p{margin:0;color:var(--muted);font-size:16px}
.card .ic{font-family:Heebo;font-weight:800;color:var(--accent);font-size:13px;letter-spacing:.08em}
.flow{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:22px 0 0;font-family:Heebo;font-weight:700}
.flow span{background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:8px 15px}
.flow .arw{color:var(--accent);font-weight:900}
.mobile{display:flex;gap:20px;flex-wrap:wrap;margin-top:26px;justify-content:center}
.mfig{margin:0;text-align:center;max-width:230px}
.mfig img{width:100%;height:auto;border-radius:16px;border:1px solid var(--line);box-shadow:var(--shadow)}
.mfig figcaption{color:var(--muted);font-size:14px;margin-top:10px}
.note{margin-top:26px;padding:16px 18px;border-inline-start:4px solid var(--warn);background:var(--surface);border-radius:8px;color:var(--ink);font-size:15.5px}
footer{padding:30px 0 60px;color:var(--muted);font-size:14px;text-align:center}

@media (max-width:760px){
  .toc ol{grid-template-columns:1fr}
  .detail,.summary .grid{grid-template-columns:1fr}
}
@media print{
  :root{--paper:#fff;--ground:#fff;--surface:#fff;--ink:#0f1a2e;--muted:#3f4c62;--line:#c9d3e2;--accent:#1f5fe0;--accent-soft:#eef4ff;--shadow:none}
  body{font-size:12pt}
  .wrap{max-width:none;padding:0 8mm}
  .chapter{break-inside:avoid;break-before:page;border-top:none;padding:8mm 0}
  .cover{break-after:page}
  .toc{break-after:page}
  .summary{break-before:page}
  .frame{box-shadow:none}
  a{color:var(--ink)}
}
</style>
</head>
<body>
<div class="cover">
  <div class="wrap">
    <div class="brand">TERAGON · AI BUSINESS OS</div>
    <h1>חוברת הדרכה למערכת</h1>
    <p class="sub">סיור מודרך במסכי המערכת — עם חצים על כל צילום מסך והסבר מפורט מה כל אלמנט עושה. מיועד להצגת הפרויקט.</p>
    <div class="meta">
      <span class="tag">מערכת הפעלה עסקית מבוססת-<b>AI</b></span>
      <span class="tag"><b>3</b> פורטלים לפי תפקיד</span>
      <span class="tag"><b>7</b> סוכנים דטרמיניסטיים</span>
      <span class="tag">כספת <b>Obsidian</b> חיה</span>
      <span class="tag">נתוני דמו סינתטיים</span>
    </div>
  </div>
</div>

<nav class="toc"><div class="wrap">
  <h2>תוכן עניינים</h2>
  <ol>${toc}</ol>
</div></nav>

<main class="wrap">
${chapters}
</main>

<section class="summary"><div class="wrap">
  <div class="kicker" style="color:var(--accent)">סיכום</div>
  <h2>התמונה המלאה — מה בעצם ראינו</h2>
  <p class="lede" style="max-width:74ch">מערכת הפעלה עסקית אחת ומבוקרת. הזהות קובעת תפקיד, התפקיד נגזר לפורטל, והפורטל מרכיב חוויה ומסכים אחרים לכל משתמש. ה-AI מקומי ודטרמיניסטי, שואב ידע מכספת אמיתית, ותמיד ממליץ — בעוד האדם מחליט ומאשר.</p>

  <div class="flow">
    <span>זהות</span><span class="arw">←</span><span>תפקיד</span><span class="arw">←</span><span>יכולת</span><span class="arw">←</span><span>פורטל</span><span class="arw">←</span><span>רשומה</span>
  </div>

  <div class="grid">
    <div class="card"><div class="ic">פורטלים לפי תפקיד</div><h3>מערכת אחת, שלוש חוויות</h3><p>מנהל (החלטות ומדדים), תלמיד (למידה והתקדמות), טכנאי (הקריאה הנוכחית והתור). בחירת פורטל לעולם לא מעלה הרשאות.</p></div>
    <div class="card"><div class="ic">מנוע ה-AI</div><h3>7 סוכנים · תוצאה מנומקת</h3><p>מקומי ודטרמיניסטי, ללא מודל מרוחק. Orchestrator מתזמר; כל ממצא מגיע עם חומרה, מקור והצעת פעולה — וכל כתיבה מחייבת אישור.</p></div>
    <div class="card"><div class="ic">ידע ומשילות</div><h3>כספת Obsidian חיה</h3><p>הסוכנים קוראים מכספת אמיתית (קריאה בלבד). תהליך מבוקר מכין המלצה — ונעצר לאישור אנושי. אפס כתיבה אוטומטית.</p></div>
    <div class="card"><div class="ic">אבטחה</div><h3>deny-by-default</h3><p>תפקיד ללא הרשאה נחסם — גם בגישה ישירה בכתובת. השרשרת זהות→תפקיד→יכולת→פורטל→רשומה נאכפת בכל מסך.</p></div>
  </div>

  <div class="mobile">${mobileFigs}</div>

  <div class="note"><b>כנות על הגבולות (חשוב לומר):</b> זהו מצב הדגמה עם נתונים סינתטיים וסימולציית הרשאות (לא אימות ייצור). היקוף רשומות מקומי הוא הצגה בצד-לקוח, לא גבול שרת; RLS ב-Supabase הוא ברמת-ארגון; RLS ברמת-משתמש הוא צעד הקשחה עתידי. המערכת אף פעם לא מזייפת הצלחה — אם חיבור מנותק, היא אומרת זאת.</div>
</div></section>

<footer>TERAGON AI BUSINESS OS · חוברת הדרכה · נוצרה מצילומי המסך של המערכת הרצה · להדפסה: Ctrl/⌘-P → שמירה כ-PDF</footer>
</body>
</html>`;

writeFileSync(OUT, html);
console.log("Wrote " + OUT + "  (" + (html.length / 1024 / 1024).toFixed(2) + " MB, " + FIGS.length + " annotated chapters)");
