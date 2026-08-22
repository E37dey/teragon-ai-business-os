// TERAGON — builds the Hebrew end-user Adoption & Training Kit (ערכת הדרכה והטמעה),
// following the BlueTech "AI Implementers" methodology (6 stage-gates · 7 personas ·
// 13-material minimum kit · Quick-Start anatomy · ADKAR · adoption measurement).
// Presenter/submission tool only — changes NO product code.
// Output: docs/submission/he/TRAINING_KIT_HE.html (self-contained; embeds screenshots).
// Run:  node demo/build-training-kit.mjs   → open the HTML / print to PDF.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs", "submission", "screenshots");
const OUT = join(ROOT, "docs", "submission", "he", "TRAINING_KIT_HE.html");
const img = (f) => "data:image/png;base64," + readFileSync(join(SHOTS, f)).toString("base64");

const IMG_LOGIN = img("01-login.png");
const IMG_MANAGER = img("02-manager-home.png");
const IMG_AI = img("05-ai-workspace.png");
const IMG_WF = img("08-governed-workflow.png");
const IMG_ANALYTICS = img("10-analytics.png");

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>TERAGON · ערכת הדרכה והטמעה</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800;900&family=Assistant:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap"/>
<style>
:root{
  --paper:#f4f7fc; --ground:#eef2f9; --surface:#ffffff; --ink:#0f1a2e; --muted:#54637d;
  --line:#dce3ef; --accent:#2f6df6; --accent-soft:#e7f0ff; --navy:#0b1220;
  --good:#2f9e6b; --good-soft:#e6f5ee; --warn:#b9781a; --warn-soft:#fbf1de; --crit:#d1495b; --crit-soft:#fbe9ec;
  --shadow:0 10px 30px rgba(16,30,60,.10), 0 2px 8px rgba(16,30,60,.06);
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --paper:#0b1220; --ground:#0e1626; --surface:#131d30; --ink:#e8eef8; --muted:#93a4c0;
  --line:#243349; --accent:#5b8bff; --accent-soft:#16243f; --navy:#060a12;
  --good:#49c088; --good-soft:#12271d; --warn:#d79a3a; --warn-soft:#2a2213; --crit:#e2687a; --crit-soft:#2a1519;
  --shadow:0 12px 34px rgba(0,0,0,.5), 0 2px 8px rgba(0,0,0,.4);
}}
:root[data-theme="dark"]{
  --paper:#0b1220; --ground:#0e1626; --surface:#131d30; --ink:#e8eef8; --muted:#93a4c0;
  --line:#243349; --accent:#5b8bff; --accent-soft:#16243f; --navy:#060a12;
  --good:#49c088; --good-soft:#12271d; --warn:#d79a3a; --warn-soft:#2a2213; --crit:#e2687a; --crit-soft:#2a1519;
  --shadow:0 12px 34px rgba(0,0,0,.5), 0 2px 8px rgba(0,0,0,.4);
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);
  font-family:Assistant,"Segoe UI",system-ui,sans-serif;font-size:16.5px;line-height:1.62;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.wrap{max-width:1000px;margin:0 auto;padding:0 22px}
h1,h2,h3,h4{font-family:Heebo,sans-serif;line-height:1.16;text-wrap:balance;margin:0}
a{color:var(--accent);text-decoration:none}
.mono{font-family:"IBM Plex Mono",monospace;font-size:.88em;direction:ltr;unicode-bidi:isolate}

/* Cover */
.cover{background:linear-gradient(160deg,var(--navy),#12213c 72%);color:#eaf1ff;padding:60px 0 48px;border-bottom:3px solid var(--accent)}
.cover .wrap{display:flex;flex-direction:column;gap:16px}
.brand{font-family:Heebo;font-weight:900;letter-spacing:.12em;font-size:14px;color:#9db8ff}
.cover h1{font-size:clamp(32px,5.6vw,54px);font-weight:900;color:#fff}
.cover .sub{font-size:19px;color:#c3d4f5;max-width:64ch}
.meta{display:flex;flex-wrap:wrap;gap:9px;margin-top:6px}
.tag{font-size:12.5px;font-weight:600;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.16);color:#dbe7ff}
.tag b{color:#fff}

/* Sections */
section{padding:34px 0;border-top:1px solid var(--line)}
.eyebrow{font-family:Heebo;font-weight:700;font-size:12.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
h2.st{font-size:clamp(23px,3.2vw,30px);font-weight:800;margin:8px 0 6px}
.lead{color:var(--muted);font-size:17.5px;max-width:74ch;margin:0 0 18px}
h3.sub3{font-size:19px;font-weight:800;margin:22px 0 10px}

/* TOC */
.toc ol{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:7px 24px}
.toc a{display:flex;gap:11px;align-items:baseline;color:var(--ink);padding:8px 11px;border-radius:9px;border:1px solid transparent}
.toc a:hover{background:var(--surface);border-color:var(--line)}
.toc .tn{font-family:Heebo;font-weight:800;color:var(--accent);min-width:22px}

/* Cards / grids */
.grid{display:grid;gap:14px}
.g2{grid-template-columns:1fr 1fr}.g3{grid-template-columns:1fr 1fr 1fr}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px;box-shadow:var(--shadow)}
.card h4{font-size:17px;font-weight:800;margin-bottom:4px;display:flex;gap:8px;align-items:center}
.card .ic{font-size:20px}
.card p{margin:6px 0 0;color:var(--muted);font-size:15px}
.card .tagm{display:inline-block;margin-top:10px;font-size:12.5px;font-weight:700;color:var(--accent);background:var(--accent-soft);padding:3px 9px;border-radius:6px}

/* Figure */
figure.shot{margin:16px 0 0}
figure.shot img{display:block;width:100%;height:auto;border-radius:12px;border:1px solid var(--line);box-shadow:var(--shadow)}
figure.shot figcaption{color:var(--muted);font-size:13.5px;margin-top:8px;text-align:center}

/* Table */
.tbl{width:100%;border-collapse:collapse;font-size:14.5px;overflow:hidden;border-radius:12px;box-shadow:var(--shadow);background:var(--surface)}
.tbl thead th{background:var(--navy);color:#eaf1ff;font-family:Heebo;font-weight:700;padding:11px 12px;text-align:right;font-size:13.5px}
.tbl td{padding:10px 12px;border-top:1px solid var(--line);vertical-align:top}
.tbl tbody tr:nth-child(even){background:var(--ground)}
.tbl .p{font-weight:800;white-space:nowrap}
.scroll{overflow-x:auto}

/* Quick start block */
.qs{background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);overflow:hidden;margin-top:16px}
.qs .qhead{background:var(--accent);color:#fff;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px}
.qs .qhead h4{font-size:19px;font-weight:800;color:#fff;margin:0}
.qs .qhead .v{font-size:12.5px;opacity:.9;font-family:"IBM Plex Mono",monospace;direction:ltr}
.qs .qbody{display:grid;grid-template-columns:repeat(5,1fr);gap:0}
.qs .blk{padding:14px 16px;border-inline-start:1px solid var(--line)}
.qs .blk:first-child{border-inline-start:none}
.qs .blk .n{font-family:Heebo;font-weight:800;color:var(--accent);font-size:12.5px;letter-spacing:.04em}
.qs .blk h5{font-family:Heebo;font-size:15px;font-weight:800;margin:3px 0 6px}
.qs .blk p{margin:0;font-size:13.5px;color:var(--ink)}
.qs .blk.warn{background:var(--crit-soft)}
.qs .blk.warn .n{color:var(--crit)}

/* Do / Dont / Check */
.ddc{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.col{border-radius:12px;padding:16px 18px;border:1px solid var(--line)}
.col.ok{background:var(--good-soft)} .col.no{background:var(--crit-soft)} .col.ck{background:var(--warn-soft)}
.col h4{font-size:16px;font-weight:800;margin-bottom:8px}
.col ul{margin:0;padding-inline-start:18px;font-size:14.5px}
.col li{margin:5px 0}
.col.ok h4{color:var(--good)} .col.no h4{color:var(--crit)} .col.ck h4{color:var(--warn)}

/* Interaction library */
.pat{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;box-shadow:var(--shadow);margin-top:12px}
.pat h4{font-size:16px;font-weight:800;margin-bottom:4px}
.pat .flow{font-size:14.5px;color:var(--ink)}
.pat .flow b{color:var(--accent)}
.pat .goal{color:var(--muted);font-size:13.5px;margin-top:6px}

/* FAQ / ADKAR */
.faq{margin-top:12px}
.faq details{background:var(--surface);border:1px solid var(--line);border-radius:10px;margin-bottom:10px;box-shadow:var(--shadow);overflow:hidden}
.faq summary{cursor:pointer;padding:13px 16px;font-family:Heebo;font-weight:700;font-size:16px;display:flex;justify-content:space-between;gap:10px;align-items:center;list-style:none}
.faq summary::-webkit-details-marker{display:none}
.faq summary .badge{font-size:11.5px;font-weight:700;color:var(--accent);background:var(--accent-soft);padding:2px 8px;border-radius:6px;white-space:nowrap}
.faq .a{padding:0 16px 14px;color:var(--muted);font-size:15px}

/* Stage gates */
.gates{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-top:14px}
.gate{background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:13px;box-shadow:var(--shadow);position:relative}
.gate .num{font-family:Heebo;font-weight:900;font-size:26px;color:var(--accent-soft);line-height:1;-webkit-text-stroke:1px var(--accent)}
.gate h4{font-size:14.5px;font-weight:800;margin:2px 0 5px}
.gate p{margin:0;font-size:12.5px;color:var(--muted)}
.gate .g{display:inline-block;margin-top:8px;font-size:11px;font-weight:700;color:var(--good);background:var(--good-soft);padding:2px 7px;border-radius:5px}

/* Metrics */
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:12px}
.metric{background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:14px 16px;box-shadow:var(--shadow)}
.metric .k{font-family:Heebo;font-weight:900;font-size:15px;color:var(--accent)}
.metric .d{font-size:13.5px;color:var(--muted);margin-top:3px}
.metric .t{font-size:12px;color:var(--ink);margin-top:8px;font-weight:600}

.note{margin-top:18px;padding:15px 18px;border-inline-start:4px solid var(--warn);background:var(--surface);border-radius:8px;font-size:15px;box-shadow:var(--shadow)}
.note.good{border-color:var(--good)}
footer{padding:28px 0 56px;color:var(--muted);font-size:13.5px;text-align:center}

@media (max-width:860px){
  .toc ol,.g2,.g3,.ddc,.metrics{grid-template-columns:1fr}
  .qs .qbody{grid-template-columns:1fr}
  .qs .blk{border-inline-start:none;border-top:1px solid var(--line)}
  .qs .blk:first-child{border-top:none}
  .gates{grid-template-columns:1fr 1fr}
}
@media print{
  :root{--paper:#fff;--ground:#fff;--surface:#fff;--ink:#0f1a2e;--muted:#3f4c62;--line:#c9d3e2;--accent:#1f5fe0;--shadow:none}
  body{font-size:11.5pt}
  section{break-inside:avoid;border-top:none;padding:6mm 0}
  .cover{break-after:page}
  .qs,.card,.gate,.metric,.pat,.faq details,.tbl{box-shadow:none}
  .faq details{break-inside:avoid}
  h2.st{break-after:avoid}
  a{color:var(--ink)}
}
</style>
</head>
<body>

<div class="cover"><div class="wrap">
  <div class="brand">TERAGON · AI BUSINESS OS</div>
  <h1>ערכת הדרכה והטמעה למשתמשים</h1>
  <p class="sub">חומרי הדרכה מוכנים למשתמשי המערכת — בנויים לפי מתודולוגיית הטמעת ה-AI: מטרת פתרון, מסלול לכל פרסונה, Quick-Start מעשי, גבולות אנוש, טיפול בהתנגדויות (ADKAR) ומדידת אימוץ.</p>
  <div class="meta">
    <span class="tag"><b>3</b> פורטלים · <b>7</b> פרסונות</span>
    <span class="tag">מסלול הדרכה לכל תפקיד</span>
    <span class="tag">Quick-Start · נוהל · FAQ</span>
    <span class="tag">6 שלבי Stage-Gate</span>
    <span class="tag">מדידת אימוץ</span>
  </div>
</div></div>

<section id="how"><div class="wrap">
  <div class="eyebrow">איך להשתמש בחוברת</div>
  <h2 class="st">מדריך אחד — לכל תפקיד המסלול שלו</h2>
  <p class="lead">"הדרכה אחת לכולם" לא עובדת (ומול שוק אירופי אף כבר לא חוקית לפי EU AI Act, סעיף 4). לכן החומר מחולק לפי <b>פרסונות</b>: כל משתמש קורא את <b>מטרת הפתרון</b> (חלק א'), מוצא את עצמו ב<b>מפת הפרסונות</b> (חלק ב'), ולומד מה-<b>Quick-Start</b> של התפקיד שלו (חלק ד'). מנהלים ומטמיעים ממשיכים גם לתכנית ההטמעה (חלק י"א) ולמדידה (חלק י').</p>
  <div class="toc"><ol>
    <li><a href="#purpose"><span class="tn">א</span><span>מטרת הפתרון — מה זה ומה לא</span></a></li>
    <li><a href="#personas"><span class="tn">ב</span><span>7 פרסונות → מסלולי הדרכה</span></a></li>
    <li><a href="#matrix"><span class="tn">ג</span><span>מטריצת ההדרכה (החוזה)</span></a></li>
    <li><a href="#quickstart"><span class="tn">ד</span><span>Quick-Start לכל פורטל</span></a></li>
    <li><a href="#policy"><span class="tn">ה</span><span>נוהל שימוש נכון + גבולות אנוש</span></a></li>
    <li><a href="#library"><span class="tn">ו</span><span>ספריית אינטראקציות</span></a></li>
    <li><a href="#faq"><span class="tn">ז</span><span>FAQ + התנגדויות (ADKAR)</span></a></li>
    <li><a href="#risk"><span class="tn">ח</span><span>גיליון סיכונים וממשל</span></a></li>
    <li><a href="#micro"><span class="tn">ט</span><span>5 סרטוני Microlearning</span></a></li>
    <li><a href="#adoption"><span class="tn">י</span><span>דשבורד אימוץ</span></a></li>
    <li><a href="#plan"><span class="tn">יא</span><span>תכנית הטמעה — 6 שלבים</span></a></li>
  </ol></div>
</div></section>

<section id="purpose"><div class="wrap">
  <div class="eyebrow">חלק א' · חומר 1</div>
  <h2 class="st">מטרת הפתרון — מה זה, ומה זה לא</h2>
  <p class="lead">TERAGON היא מערכת הפעלה עסקית מבוססת-AI: מערכת אחת מבוקרת שמרכיבה חוויה שונה לכל תפקיד. שבעה סוכנים דטרמיניסטיים בודקים את המצב, מסמנים מה דורש טיפול ומציעים פעולה — <b>ה-AI ממליץ, האדם מחליט ומאשר</b>.</p>
  <div class="grid g2">
    <div class="card"><h4><span class="ic">🎯</span>הבעיה שנפתרת</h4><p>ריבוי מסכים וכלים, החלטות שמתפזרות, וידע ארגוני שלא נגיש בזמן אמת. במקום "לחפש מה קורה" — המערכת מציגה סדר-יום ממוקד-תפקיד.</p></div>
    <div class="card"><h4><span class="ic">👥</span>למי זה מיועד</h4><p>שלושה קהלי-קצה: <b>מנהל</b> (החלטות ומדדים), <b>תלמיד</b> (למידה והתקדמות), <b>טכנאי</b> (הקריאה הנוכחית והתור) — ועוד פרסונות תומכות (הנהלה, IT, ממשל, שגריר).</p></div>
    <div class="card"><h4><span class="ic">💎</span>הערך</h4><p>פחות זמן חיפוש, החלטות מהירות ומבוססות-ראיות, וידע ארגוני חי (כספת Obsidian) שהסוכנים שואבים ממנו — עם שקיפות מלאה ואישור אנושי.</p></div>
    <div class="card"><h4><span class="ic">🚫</span>מה <u>לא</u> נכלל</h4><p>לא כלי שמחליט לבד; לא מודל ענן מרוחק (המנוע מקומי ודטרמיניסטי); לא כותב לכספת לבד; ובמצב ההדגמה — <b>נתונים סינתטיים</b>, לא נתוני לקוח אמיתיים.</p></div>
  </div>
  <figure class="shot"><img src="${IMG_LOGIN}" alt="מסך הכניסה"/><figcaption>מסך הכניסה — כל תפקיד נכנס לפורטל אחר. בחירת פורטל לעולם לא מעלה הרשאות.</figcaption></figure>
</div></section>

<section id="personas"><div class="wrap">
  <div class="eyebrow">חלק ב' · שלב 3 בתכנית</div>
  <h2 class="st">7 פרסונות → לכל אחת מסלול הדרכה משלה</h2>
  <p class="lead">התאמת ההדרכה לתפקיד ולרמת-הסיכון היא דרישת EU AI Act — וגם פשוט עובדת טוב יותר. לכל פרסונה: מה מעניין אותה, איזה חומר היא מקבלת, וכמה זמן.</p>
  <div class="scroll"><table class="tbl">
    <thead><tr><th>פרסונה</th><th>בתוך TERAGON</th><th>מה מעניין</th><th>החומר שהיא מקבלת</th><th>משך</th></tr></thead>
    <tbody>
      <tr><td class="p">👤 משתמש קצה</td><td>תלמיד · טכנאי</td><td>פשטות, חיסכון זמן</td><td>Quick-Start · סרטון 90ש' · 3 דוגמאות</td><td>60 ד'</td></tr>
      <tr><td class="p">👔 מנהל צוות</td><td>פורטל מנהל</td><td>שימוש נכון בצוות, מעקב</td><td>דשבורד · KPI · תסריטי שיחה</td><td>45 ד'</td></tr>
      <tr><td class="p">💼 הנהלה</td><td>ספונסר / מנהל בכיר</td><td>ערך + סיכון</td><td>One-Pager · ROI · דוח רבעוני</td><td>20 ד'</td></tr>
      <tr><td class="p">💻 IT / אבטחה</td><td>ניהול מערכת</td><td>הרשאות, API, גשר Obsidian</td><td>Tech Doc · ארכיטקטורה · Runbook</td><td>60 ד'</td></tr>
      <tr><td class="p">⚖ Legal / ממשל</td><td>אחראי ממשל</td><td>סיכון משפטי, אחריות</td><td>מדיניות · Risk Register · Audit Trail</td><td>60 ד'</td></tr>
      <tr><td class="p">⭐ Champion</td><td>משתמש-על בכל פורטל</td><td>עזרה לאחרים</td><td>Playbook · FAQ · תסריטי תמיכה</td><td>90 ד'</td></tr>
      <tr><td class="p">🙅 מתנגד</td><td>כל מי שחושש</td><td>"מה הסיכון שלי?"</td><td>FAQ התנגדויות · גבולות · ערוץ פתוח</td><td>30 ד'</td></tr>
    </tbody>
  </table></div>
  <p class="note">לכל פרסונה שני סוגי חומר: מה שהיא <b>קוראת</b> (Quick-Start, נוהל, FAQ) ומה שהיא <b>מתרגלת</b> (סימולציה על מסך אמיתי). בלי תרגול — אין אימוץ.</p>
</div></section>

<section id="matrix"><div class="wrap">
  <div class="eyebrow">חלק ג' · שלב 3</div>
  <h2 class="st">מטריצת ההדרכה — "חוזה" ההדרכה</h2>
  <p class="lead">המסמך האחד שמסכם את כל תכנית ההדרכה: לכל פרסונה — מטרה, פורמט, משך, תרגול, ומדד הצלחה מדיד. אם אין מטריצה — יש כוונות, לא תכנית.</p>
  <div class="scroll"><table class="tbl">
    <thead><tr><th>פרסונה</th><th>מטרת ההדרכה</th><th>פורמט</th><th>משך</th><th>תרגול</th><th>מדד הצלחה</th></tr></thead>
    <tbody>
      <tr><td class="p">משתמש קצה</td><td>3 פעולות מרכזיות בפורטל</td><td>סרטון + סדנה</td><td>60 ד'</td><td>סימולציה חיה</td><td>80% הצלחה במשימה</td></tr>
      <tr><td class="p">מנהל צוות</td><td>לזהות מה דורש טיפול + לעקוב</td><td>הדרכת מנהלים</td><td>45 ד'</td><td>ניתוח דשבורד</td><td>דוח שבועי נקרא</td></tr>
      <tr><td class="p">Champion</td><td>תמיכה ראשונית בעמיתים</td><td>סדנה מתקדמת</td><td>90 ד'</td><td>פתרון תקלות</td><td>−40% פניות חוזרות</td></tr>
      <tr><td class="p">IT / אבטחה</td><td>הרשאות + גשר Obsidian</td><td>הדרכה טכנית</td><td>60 ד'</td><td>תרחיש תקלה</td><td>SLA מוגדר</td></tr>
      <tr><td class="p">ממשל</td><td>גבולות + סיכונים</td><td>סשן בקרה</td><td>60 ד'</td><td>ניתוח מקרי-קצה</td><td>אישור מדיניות</td></tr>
      <tr><td class="p">הנהלה</td><td>ערך + סיכון</td><td>בריפינג קצר</td><td>20 ד'</td><td>החלטת הרחבה</td><td>Go / No-Go</td></tr>
    </tbody>
  </table></div>
</div></section>

<section id="quickstart"><div class="wrap">
  <div class="eyebrow">חלק ד' · חומר 3</div>
  <h2 class="st">Quick-Start לכל פורטל — דף אחד, פעולה תוך 3 דקות</h2>
  <p class="lead">הפורמט קבוע: <b>5 בלוקים בדף אחד</b> — מה זה · איך מתחילים · 3 הפעולות החשובות · מתי <u>לא</u> להשתמש · תמיכה. סורקים, לא קוראים; רק 3 פעולות יומיומיות, לא כל הפיצ'רים.</p>

  <div class="qs">
    <div class="qhead"><h4>👔 פורטל מנהל</h4><span class="v">Quick Start · v1.0 · קריאה 5 ד'</span></div>
    <div class="qbody">
      <div class="blk"><div class="n">1 · מה זה</div><h5>מרכז ההחלטות שלך</h5><p>המערכת מרכזת מה דורש את תשומת ליבך — אישורים, אותות, ומדדים — במקום אחד.</p></div>
      <div class="blk"><div class="n">2 · איך מתחילים</div><h5>כניסה ← בית</h5><p>כרטיס "מנהל" ← כניסה כדמו. נוחתים ב"מרכז תפעול".</p></div>
      <div class="blk"><div class="n">3 · 3 פעולות</div><h5>לאשר · לקרוא · לפתוח</h5><p>✓ מאשר/דוחה פריט ממתין · ✓ קורא את רצועת ה-KPI · ✓ פותח ממצא "מה דורש טיפול".</p></div>
      <div class="blk warn"><div class="n">4 · מתי לא</div><h5>החלטה סופית = אדם</h5><p>החלטות כספיות, משאבי-אנוש או חריגות — לא מאשרים בהסתמך על ה-AI בלבד. קוראים לפני שמאשרים.</p></div>
      <div class="blk"><div class="n">5 · תמיכה</div><h5>מי לשאול</h5><p>ה-Champion של הצוות · ערוץ #teragon-help · מענה תוך שעה.</p></div>
    </div>
  </div>

  <div class="qs">
    <div class="qhead"><h4>🎓 פורטל תלמיד</h4><span class="v">Quick Start · v1.0 · קריאה 5 ד'</span></div>
    <div class="qbody">
      <div class="blk"><div class="n">1 · מה זה</div><h5>סביבת הלמידה שלך</h5><p>הצעד הבא בקורס, ההתקדמות שלך, והמנטור — בלי רעש ניהולי.</p></div>
      <div class="blk"><div class="n">2 · איך מתחילים</div><h5>כניסה ← בית</h5><p>כרטיס "תלמיד" ← כניסה כדמו. רואים "להמשיך ללמוד".</p></div>
      <div class="blk"><div class="n">3 · 3 פעולות</div><h5>ללמוד · לשאול · לבדוק</h5><p>✓ "המשך ללמידה" · ✓ "שיחה עם המנטור" · ✓ בדיקת סטטוס משימה בשלבים.</p></div>
      <div class="blk warn"><div class="n">4 · מתי לא</div><h5>המנטור מסייע, לא מחליף</h5><p>תשובת המנטור היא עזרה ללמידה — לא תחליף להגשה/בחינה. מאמתים מול החומר.</p></div>
      <div class="blk"><div class="n">5 · תמיכה</div><h5>מי לשאול</h5><p>מאגר הידע בפורטל · ה-Champion · ערוץ #teragon-help.</p></div>
    </div>
  </div>

  <div class="qs">
    <div class="qhead"><h4>🔧 פורטל טכנאי</h4><span class="v">Quick Start · v1.0 · קריאה 5 ד'</span></div>
    <div class="qbody">
      <div class="blk"><div class="n">1 · מה זה</div><h5>העבודה שלך עכשיו</h5><p>הקריאה הדחופה, התור המוקצה לך, וידע טכני — ורק העבודה שלך.</p></div>
      <div class="blk"><div class="n">2 · איך מתחילים</div><h5>כניסה ← בית</h5><p>כרטיס "טכנאי" ← כניסה כדמו. רואים "העבודה הנוכחית".</p></div>
      <div class="blk"><div class="n">3 · 3 פעולות</div><h5>לפתוח · Fixer · ידע</h5><p>✓ "פתח את הקריאה" · ✓ "עוזר טכני (Fixer)" להצעת תיקון · ✓ "ידע טכני" לפתרון.</p></div>
      <div class="blk warn"><div class="n">4 · מתי לא</div><h5>בטיחות ועלות = אדם</h5><p>קריאה עם סיכון בטיחותי או החלטה יקרה — הצעת Fixer היא נקודת פתיחה, לא ביצוע אוטומטי.</p></div>
      <div class="blk"><div class="n">5 · תמיכה</div><h5>מי לשאול</h5><p>מוביל צוות השירות · ה-Champion · ערוץ #teragon-help.</p></div>
    </div>
  </div>
  <figure class="shot"><img src="${IMG_AI}" alt="מרחב AI"/><figcaption>מרחב ה-AI — "מה דורש טיפול עכשיו?" עם חומרה, מקור והצעת פעולה לכל ממצא.</figcaption></figure>
</div></section>

<section id="policy"><div class="wrap">
  <div class="eyebrow">חלק ה' · חומר 4</div>
  <h2 class="st">נוהל שימוש נכון + גבולות אנוש</h2>
  <p class="lead">TERAGON בנויה על העיקרון "ה-AI ממליץ, האדם מחליט". הנוהל הזה הופך את זה למעשי: מה מותר, מה אסור, ומתי חייבים לעצור ולבדוק.</p>
  <div class="ddc">
    <div class="col ok"><h4>✓ מותר ומומלץ</h4><ul>
      <li>להריץ סוכנים ולקבל המלצות מנומקות</li>
      <li>לפתוח ממצא "מה דורש טיפול" ולבדוק במסך הרלוונטי</li>
      <li>להעביר ל-Fixer לקבלת הצעת תיקון</li>
      <li>להריץ תהליך ידע מבוקר (הסוכן קורא מהכספת)</li>
      <li>לייצא דוחות ולעיין ב-KPI</li>
    </ul></div>
    <div class="col no"><h4>✗ אסור / זהירות</h4><ul>
      <li>לאשר כתיבה בלי לקרוא את התוכן</li>
      <li>להסתמך על ממצא בלי לפתוח את המסך</li>
      <li>להתייחס לנתוני הדמו כאל אמת עסקית</li>
      <li>לצפות שהמערכת תכתוב לכספת לבד (לא תעשה)</li>
      <li>להזין מידע רגיש/סודי אמיתי במצב הדגמה</li>
    </ul></div>
    <div class="col ck"><h4>⚠ מתי לעצור ולבדוק</h4><ul>
      <li>כל החלטה כספית / מול לקוח / בטיחותית</li>
      <li>חריגה, הסלמה או פגיעה אפשרית באדם</li>
      <li>ממצא בחומרה גבוהה לפני פעולה</li>
      <li>נושא רגיש או חוסר-ודאות של הסוכן</li>
      <li>לפני אישור סופי — תמיד קריאה אנושית</li>
    </ul></div>
  </div>
  <p class="note good"><b>הגבול הקשיח:</b> כל <em>כתיבה</em> — במיוחד לכספת Obsidian — עוברת דרך אישור אנושי. המערכת מבצעת <b>0 כתיבות אוטומטיות</b>, וכשחיבור מנותק היא אומרת זאת בכנות ולא מזייפת הצלחה.</p>
</div></section>

<section id="library"><div class="wrap">
  <div class="eyebrow">חלק ו' · חומר 5</div>
  <h2 class="st">ספריית אינטראקציות — תרחישים מוכנים</h2>
  <p class="lead">המנוע דטרמיניסטי, לכן במקום "להמציא פרומפט" המשתמש מקבל <b>אינטראקציות מוכנות</b> — כל אחת תרחיש אמיתי מהעבודה, עם הזרימה והתוצאה הצפויה.</p>
  <div class="pat"><h4>1 · לטפל בממצא שהסוכן העלה</h4><div class="flow">מרחב AI ← <b>"מה דורש טיפול עכשיו?"</b> ← בחר ממצא ← <b>"לפתוח את המסך הרלוונטי לבדיקה"</b></div><p class="goal">התוצאה: נחיתה במסך המדויק (למשל לקוח ללא איש-קשר) לתיקון אנושי.</p></div>
  <div class="pat"><h4>2 · לקבל הצעת תיקון מ-Fixer</h4><div class="flow">ממצא בחומרה בינונית ← <b>"העבר ל-Fixer להצעת תיקון"</b> ← קרא ← אשר / ערוך / דחה</div><p class="goal">התוצאה: הצעת תיקון מנומקת — נקודת פתיחה, לא ביצוע אוטומטי.</p></div>
  <div class="pat"><h4>3 · להריץ סוכן ולקבל תוצאה</h4><div class="flow">מרחב AI ← בחר סוכן ← <b>"הרצה"</b> ← התוצאה מופיעה ב"פעילות אחרונה" עם ראיות</div><p class="goal">התוצאה: פלט דטרמיניסטי הניתן להסבר — בלי מודל מרוחק.</p></div>
  <div class="pat"><h4>4 · להריץ תהליך ידע מבוקר</h4><div class="flow">מרחב AI ← "תהליך חי" ← <b>"בדוק את הידע על AI Operations והכן עדכון מבוקר"</b> ← <b>"התחל תהליך"</b> ← המערכת עוצרת ← <b>אישור אנושי</b></div><p class="goal">התוצאה: הסוכן קורא מהכספת, מסכם וממליץ — הכתיבה רק אחרי אישורך.</p></div>
  <p class="note">כלל הזהב לספריית אינטראקציות: לפי <b>תרחיש</b> ולא לפי טכנולוגיה, עם צעד-פתיחה אחד ברור, ומתעדכנת רבעונית — מורידים מה שלא בשימוש.</p>
</div></section>

<section id="faq"><div class="wrap">
  <div class="eyebrow">חלק ז' · חומר 6</div>
  <h2 class="st">FAQ + התנגדויות — לפי ADKAR</h2>
  <p class="lead">התנגדות היא מידע, לא בעיה. לכל חשש נבנתה תשובה, ומסומן איזה שלב ב-ADKAR היא נוגעת בו: מודעות · רצון · ידע · יכולת · חיזוק.</p>
  <div class="faq">
    <details><summary>"למה בכלל צריך את זה? עבדתי מצוין בלי." <span class="badge">Awareness</span></summary><div class="a">TERAGON לא מוסיף עבודה — הוא מרכז את מה שכבר עשית בכמה מסכים למקום אחד, עם סדר-יום ממוקד-תפקיד. המטרה: פחות זמן חיפוש, לא עוד כלי.</div></details>
    <details><summary>"אני חושש שה-AI יחליט במקומי." <span class="badge">Desire</span></summary><div class="a">הוא לא. TERAGON תמיד <b>ממליץ</b> — כל כתיבה או פעולה מהותית עוצרת לאישור שלך. אתה בשליטה מלאה; ה-AI רק חוסך לך את שלב האיסוף.</div></details>
    <details><summary>"אני לא יודע איך להתחיל." <span class="badge">Knowledge</span></summary><div class="a">מספיק ה-Quick-Start של הפורטל שלך (דף אחד, 5 בלוקים) + סרטון 90 שניות. פעולה ראשונה תוך 3 דקות מהכניסה.</div></details>
    <details><summary>"מה אם אטעה ואשבור משהו?" <span class="badge">Ability</span></summary><div class="a">קשה לשבור: זה מצב הדגמה עם נתונים סינתטיים, שום פעולה לא כותבת בלי אישורך, וכל מסך אסור פשוט נחסם. אפשר להתנסות בביטחון.</div></details>
    <details><summary>"מה הסיכון שלי אם אשתמש בזה?" <span class="badge">Awareness</span></summary><div class="a">מינימלי: אין מודל ענן מרוחק, אין נתוני לקוח אמיתיים, וכל פעולה מתועדת. הגבולות מפורטים בגיליון הסיכונים (חלק ח').</div></details>
    <details><summary>"למדתי — איך אזכור לאורך זמן?" <span class="badge">Reinforcement</span></summary><div class="a">חמישה סרטוני 90 שניות שאפשר לחזור אליהם, FAQ חי שמתעדכן, וה-Champion של הצוות. השימוש עצמו הוא החיזוק.</div></details>
  </div>
</div></section>

<section id="risk"><div class="wrap">
  <div class="eyebrow">חלק ח' · חומר 7</div>
  <h2 class="st">גיליון סיכונים וממשל</h2>
  <p class="lead">מה הסיכונים, איך הם מבוקרים, ומי אחראי — בשפה כנה. זהו החומר של פרסונות ה-Legal/Compliance וה-IT, אך שקיפותו חשובה לכולם.</p>
  <div class="scroll"><table class="tbl">
    <thead><tr><th>תחום</th><th>מצב במערכת</th><th>בקרה</th></tr></thead>
    <tbody>
      <tr><td class="p">נתונים</td><td>סינתטיים בלבד · מצב הדגמה</td><td>אין PII אמיתי; אסור להזין מידע סודי</td></tr>
      <tr><td class="p">מנוע ה-AI</td><td>מקומי ודטרמיניסטי · ללא מודל מרוחק</td><td><span class="mono">AI_REMOTE_ENABLED=false</span> · הפלט ניתן להסבר</td></tr>
      <tr><td class="p">כתיבה</td><td>אישור אנושי בלבד</td><td>0 כתיבות אוטומטיות לכספת</td></tr>
      <tr><td class="p">הרשאות</td><td>deny-by-default</td><td>תפקיד ללא הרשאה נחסם — גם בגישה ישירה</td></tr>
      <tr><td class="p">גבולות נתונים</td><td>היקוף מקומי (IndexedDB) · RLS ברמת-ארגון</td><td>היקוף-לקוח הוא הצגה; RLS ברמת-משתמש = הקשחה עתידית</td></tr>
      <tr><td class="p">Obsidian</td><td>קריאה בלבד · גשר מקומי <span class="mono">127.0.0.1:5200</span></td><td>fail-closed; אין חשיפה ציבורית של הגשר</td></tr>
      <tr><td class="p">שקיפות</td><td>Audit trail + redaction</td><td>אין "זיוף הצלחה" — ניתוק מדווח ככזה</td></tr>
    </tbody>
  </table></div>
  <figure class="shot"><img src="${IMG_WF}" alt="תהליך מבוקר"/><figcaption>תהליך ידע מבוקר — תג "חסום · בשליטת אנוש": התהליך עוצר לאישור לפני כל כתיבה.</figcaption></figure>
</div></section>

<section id="micro"><div class="wrap">
  <div class="eyebrow">חלק ט' · חומר 10</div>
  <h2 class="st">5 סרטוני Microlearning — 90 שניות כל אחד</h2>
  <p class="lead">לפי מחקרי MIT, סרטון מעל 3 דקות — שיעורי ההשלמה צונחים. חמישה סרטונים קצרים מנצחים סרטון ארוך אחד: פעולה אחת לכל סרטון.</p>
  <div class="grid g2">
    <div class="card"><h4><span class="ic">▶</span>1 · כניסה ובחירת פורטל</h4><p>איך נכנסים, מה ההבדל בין שלושת הפורטלים, ולמה בחירת פורטל לא מעלה הרשאות. <span class="tagm">90 שניות</span></p></div>
    <div class="card"><h4><span class="ic">▶</span>2 · "מה דורש טיפול" + פתיחת ממצא</h4><p>לקרוא חומרה ומקור, ולפתוח את המסך הרלוונטי לבדיקה אנושית. <span class="tagm">90 שניות</span></p></div>
    <div class="card"><h4><span class="ic">▶</span>3 · להריץ סוכן ולקרוא תוצאה</h4><p>"הרצה" ← איפה מופיעה התוצאה ← איך מזהים את הראיות. <span class="tagm">90 שניות</span></p></div>
    <div class="card"><h4><span class="ic">▶</span>4 · מתי לאשר / לדחות</h4><p>הגבול בין המלצה לביצוע — ומתי חייבים החלטה אנושית. <span class="tagm">90 שניות</span></p></div>
    <div class="card"><h4><span class="ic">▶</span>5 · תהליך ידע מבוקר + אישור</h4><p>להריץ תהליך, לראות את הסוכן קורא מהכספת, ולאשר ידנית. <span class="tagm">90 שניות</span></p></div>
    <div class="card" style="background:var(--accent-soft)"><h4><span class="ic">🎬</span>הפקה</h4><p>כלים מומלצים לפי הקורס: <b>Synthesia/HeyGen</b> (אווטר+קריינות מטקסט) לסרטונים, <b>Canva</b> ל-Thumbnails אחידים. תסריט = פעולה אחת, מסך אמיתי, קריאה-לפעולה בסוף.</p></div>
  </div>
</div></section>

<section id="adoption"><div class="wrap">
  <div class="eyebrow">חלק י' · חומר 13</div>
  <h2 class="st">דשבורד אימוץ — איך יודעים שזה עובד</h2>
  <p class="lead">לא מסתפקים ב"אהבנו את ההדרכה". מודדים שימוש אמיתי ותוצאה עסקית. ארבעת מדדי-הליבה, וכיצד TERAGON עצמה מספקת אותם.</p>
  <div class="metrics">
    <div class="metric"><div class="k">WAU · שימוש שבועי</div><div class="d">כמה משתמשים פעילים בפועל בכל פורטל.</div><div class="t">מקור: מסך הדוחות והניתוחים</div></div>
    <div class="metric"><div class="k">Retention · התמדה</div><div class="d">האם ממשיכים להשתמש אחרי שבועיים.</div><div class="t">יעד: לעבור משלב "השקה" ל"אימוץ"</div></div>
    <div class="metric"><div class="k">Override · שיעור דחייה</div><div class="d">כמה מהמלצות ה-AI נדחו/תוקנו — מדד אמון ואיכות.</div><div class="t">מקור: מוני מרחב ה-AI (אישורים/דחיות)</div></div>
    <div class="metric"><div class="k">NPS · שביעות רצון</div><div class="d">האם היו ממליצים לעמית — סקר חודשי + 👍/👎 בכלי.</div><div class="t">יעד: מגמת עלייה רבעונית</div></div>
  </div>
  <figure class="shot"><img src="${IMG_ANALYTICS}" alt="דוחות וניתוחים"/><figcaption>מסך הדוחות — מגמות מול תקופה קודמת. אותה תשתית מזינה את מדידת האימוץ.</figcaption></figure>
</div></section>

<section id="plan"><div class="wrap">
  <div class="eyebrow">חלק יא' · למטמיע/מנהל</div>
  <h2 class="st">תכנית הטמעה — 6 שלבים עם Stage-Gates</h2>
  <p class="lead">לא משיקים כלי — מטמיעים תהליך. כל שלב נסגר ב-Stage-Gate: אם לא עברנו — לא ממשיכים. מתחילים מהתוצאה העסקית, לא מהכלי.</p>
  <div class="gates">
    <div class="gate"><div class="num">1</div><h4>תוצאה עסקית</h4><p>בעיה+קהל+מדד+תאריך. לא "נטמיע AI".</p><span class="g">Gate: Outcome מוגדר</span></div>
    <div class="gate"><div class="num">2</div><h4>מפת תהליך</h4><p>AS-IS→TO-BE + גבולות אנוש: מה נשאר באחריות אדם.</p><span class="g">Gate: גבולות ברורים</span></div>
    <div class="gate"><div class="num">3</div><h4>פרסונות</h4><p>7 קהלים → 7 מסלולים + מטריצת הדרכה.</p><span class="g">Gate: מטריצה מאושרת</span></div>
    <div class="gate"><div class="num">4</div><h4>פיילוט מבוקר</h4><p>15–30 משתמשים · Baseline · תאריך החלטה · ערוץ תמיכה.</p><span class="g">Gate: Go/No-Go</span></div>
    <div class="gate"><div class="num">5</div><h4>הרחבה בגלים</h4><p>Champions ← מחלקה ← ארגון. גל כל 4 שבועות.</p><span class="g">Gate: ערך חוזר בכל גל</span></div>
    <div class="gate"><div class="num">6</div><h4>שגרה ושיפור</h4><p>KB חי · FAQ מתעדכן · Version Log · סקירת ממשל.</p><span class="g">Gate: Governance Review</span></div>
  </div>
  <figure class="shot"><img src="${IMG_MANAGER}" alt="בית המנהל"/><figcaption>בית המנהל — נקודת הפתיחה של הפיילוט: מרכז תפעול, KPI, וגישה מהירה.</figcaption></figure>
  <p class="note">משך טיפוסי מהרעיון עד שגרה: <b>3–6 חודשים</b>, תלוי בגודל הארגון. הכלל: לא Big Bang. גל אחרי גל, כל אחד עם ה-learnings של קודמו.</p>
</div></section>

<footer>TERAGON AI BUSINESS OS · ערכת הדרכה והטמעה למשתמשים · בנוי לפי מתודולוגיית הטמעת AI (Change · Learning · Governance · Measurement) · להדפסה: Ctrl/⌘-P → שמירה כ-PDF</footer>
</body>
</html>`;

writeFileSync(OUT, html);
console.log("Wrote " + OUT + "  (" + (html.length / 1024 / 1024).toFixed(2) + " MB)");
