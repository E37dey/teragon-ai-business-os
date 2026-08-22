// TERAGON — hands-free GUIDED auto-demo (presenter aid), SCREEN-SHARE SAFE.
// The DEMO WINDOW stays 100% CLEAN (nothing overlaid) so it's safe to share.
// Your narration cues go ONLY to places the audience does NOT see:
//   - the terminal (always), and
//   - an optional separate "presenter notes" window (NOTES=1) you keep to yourself.
// Drives the REAL app on localhost:4173. Changes NO product code.
//
// Run:  node demo/auto-demo.mjs           (clean demo, cues in this terminal)
//       NOTES=1 node demo/auto-demo.mjs   (also opens a separate presenter-notes window)
//       FAST=1  node demo/auto-demo.mjs   (quicker)
//       LOOP=1  node demo/auto-demo.mjs   (repeat forever)
// Requires the local preview on http://localhost:4173 (START-TERAGON-DEMO.bat).
import { chromium } from "@playwright/test";

const BASE = process.env.BASE || "http://localhost:4173";
const PACE = process.env.FAST ? 0.6 : 1.35;          // slow by default
const LOOP = !!process.env.LOOP;
const NOTES = !!process.env.NOTES;
const sec = (s) => new Promise((r) => setTimeout(r, s * 1000 * PACE));

let notesPage = null;

// ---------- helpers ----------
async function login(p, portal) {
  await p.goto(`${BASE}/welcome`);
  await p.getByTestId(`demo-prefill-${portal}`).click();
  await p.getByTestId("demo-login-submit").click();
  await p.waitForURL(`${BASE}/home`, { timeout: 15000 }).catch(() => {});
}
async function logout(p) {
  const x = p.getByTestId("portal-exit");
  if (await x.count().catch(() => 0)) {
    await x.click().catch(() => {});
    await p.waitForURL(`${BASE}/welcome`, { timeout: 8000 }).catch(() => {});
  }
}
async function scrollTour(p, ms = 6000) {
  const steps = 6, dt = ms / (steps * 2);
  for (let i = 1; i <= steps; i++) { await p.mouse.wheel(0, 320).catch(()=>{}); await new Promise(r=>setTimeout(r, dt*PACE)); }
  for (let i = 1; i <= steps; i++) { await p.mouse.wheel(0, -320).catch(()=>{}); await new Promise(r=>setTimeout(r, dt*PACE)); }
}

// cue goes to the TERMINAL (and optional notes window) — NEVER onto the shared demo window
function termCue(i, total, title, does, cue, hold) {
  const line = "─".repeat(64);
  console.log(`\n${line}\n▶ [${i}/${total}]  ${title}   (~${Math.round(hold*PACE)}s)\n  📄 מה העמוד עושה: ${does}\n  🎤 מה לומר:      ${cue}\n${line}`);
}
async function notesCue(i, total, title, does, cue, hold) {
  if (!notesPage) return;
  await notesPage.evaluate(({ i, total, title, does, cue, hold }) => {
    document.body.style.cssText = "margin:0;background:#0b1220;color:#eaf2ff;font-family:system-ui,'Segoe UI',Arial";
    document.body.dir = "rtl";
    document.body.innerHTML =
      `<div style="padding:26px 30px">` +
      `<div style="display:flex;justify-content:space-between;opacity:.6;font-size:14px"><span>TERAGON · הערות מרצה (לא לשיתוף)</span><span>${i}/${total}</span></div>` +
      `<div style="font-size:34px;font-weight:800;margin-top:10px">${title}</div>` +
      `<div style="font-size:19px;margin-top:16px"><b style="color:#8fd18f">מה העמוד עושה:</b><br>${does}</div>` +
      `<div style="font-size:23px;line-height:1.55;margin-top:18px"><b style="color:#7fb0ff">מה לומר:</b><br>${cue}</div>` +
      `<div style="height:5px;background:#1e2a44;border-radius:3px;margin-top:26px"><div id="pb" style="height:5px;background:#2f6df6;border-radius:3px;width:0%;transition:width ${hold}s linear"></div></div>` +
      `</div>`;
    requestAnimationFrame(()=>{const b=document.getElementById("pb"); if(b) b.style.width="100%";});
  }, { i, total, title, does, cue, hold }).catch(()=>{});
}

// ---------- scenes ----------
const SCENES = [
  { hold: 13, title: "TERAGON AI BUSINESS OS",
    does: "עמוד הכניסה — שלושה כרטיסי תפקיד להדגמה.",
    cue: "מערכת הפעלה עסקית מבוססת-AI. מודול אחד מבוקר, חוויה שונה לכל תפקיד. ה-AI ממליץ — האדם מחליט.",
    run: async (p) => { await p.goto(`${BASE}/welcome`); await p.getByTestId("demo-prefill-manager").waitFor().catch(()=>{}); } },

  { hold: 22, title: "פורטל מנהל — הבית",
    does: "מרכז החלטות (אישורים ואותות), רצועת KPI, וגישה מהירה ליעדים.",
    cue: "השאלה של המנהל: מה דורש את תשומת ליבי? קודם החלטות ואישורים, אחר-כך מדדים, ואז קיצורי-דרך. רוחב אינו אדמין.",
    run: async (p) => { await login(p, "manager"); await p.waitForTimeout(800); await scrollTour(p, 8000); } },

  { hold: 20, title: "חיפוש חכם — פעולה ותוצאה",
    does: "חיפוש גלובלי בכל המערכת עם דירוג רלוונטיות, בכפוף להרשאות התפקיד.",
    cue: "מקלידים שם לקוח — והמערכת מוצאת אותו על-פני כל המודולים. תוצאות אמיתיות, לא תפריט קבוע.",
    run: async (p) => {
      await p.getByRole("searchbox", { name: "חיפוש גלובלי" }).click().catch(()=>{});
      await p.waitForTimeout(700);
      const box = p.getByRole("combobox", { name: "חיפוש בכל המערכת" });
      for (const ch of "מכללת אפיק") { await box.type(ch, { delay: 90 }).catch(()=>{}); }
      await p.waitForTimeout(1500);
    } },

  { hold: 18, title: "אנליטיקה",
    does: "דוחות ומדדים על נתוני הדמו: לידים, שיעור המרה, שווי הצעות, מגמות.",
    cue: "כאן תפעול הופך לאותות החלטה — מגמות והשוואה לתקופה קודמת, עם ייצוא.",
    run: async (p) => { await p.keyboard.press("Escape").catch(()=>{}); await p.goto(`${BASE}/analytics`); await p.waitForTimeout(900); await scrollTour(p, 7000); } },

  { hold: 20, title: "פורטל תלמיד — הבית",
    does: "המשך למידה עם התקדמות, המשימות/שלבים שלי, מנטור, ומאגר ידע.",
    cue: "אותה מערכת — חוויה אחרת לגמרי. סביבת למידה נקייה: הצעד הבא, ההתקדמות, המנטור. אין נתוני ניהול.",
    run: async (p) => { await logout(p); await login(p, "student"); await p.waitForTimeout(800); await scrollTour(p, 7000); } },

  { hold: 18, title: "פורטל טכנאי — הבית",
    does: "הקריאה הנוכחית לפי עדיפות, התור המוקצה, ידע טכני, והעוזר Fixer.",
    cue: "לטכנאי תשובה אחת: איזו עבודה עכשיו. הקריאה הדחופה, התור, וידע לפתרון — ורק העבודה שהוקצתה לו.",
    run: async (p) => { await logout(p); await login(p, "technician"); await p.waitForTimeout(800); await scrollTour(p, 7000); } },

  { hold: 28, title: "מרחב AI — הרצת סוכן (פעולה → תוצאה)",
    does: "שבעה סוכנים דטרמיניסטיים. מריצים סוכן — והוא מפיק תוצאה מנומקת, בלי מודל מרוחק.",
    cue: "פעולה→תוצאה אמיתית: מריצים סוכן שסוקר את המצב ומכין תוכנית — התוצאה מופיעה ב'פעילות אחרונה' עם ראיות. ה-Orchestrator מתזמר; אף סוכן לא פועל לבד.",
    run: async (p) => {
      await p.goto(`${BASE}/ai-workspace`); await p.waitForTimeout(1500);
      const run = p.getByRole("button", { name: "הרצה" }).first();
      if (await run.count().catch(()=>0)) { await run.scrollIntoViewIfNeeded().catch(()=>{}); await run.click().catch(()=>{}); }
      await p.waitForTimeout(3500);
      await scrollTour(p, 8000);
    } },

  { hold: 14, title: "אבטחה — חסימת גישה אמיתית",
    does: "ניתוב מבוקר: מסך שאין לתפקיד הרשאה אליו מחזיר 'גישה חסומה'.",
    cue: "טכנאי מנסה להיכנס לניהול-מערכת — נחסם. זהות → תפקיד → יכולת → פורטל → רשומה. deny-by-default.",
    run: async (p) => { await p.goto(`${BASE}/administration`); await p.waitForTimeout(1400); } },

  { hold: 22, title: "★ עכשיו לחלון Obsidian החי ★",
    does: "הדמו האוטומטי לא נוגע בכספת המקומית (אבטחה). את Obsidian מציגים ידנית בחלון המחובר.",
    cue: "עוברים ל: localhost:4173/memory (הדפדפן המשויך) — כספת TERAGON OS אמיתית, מפת ידע חיה, ו-workflow מבוקר: הסוכן קורא מהכספת, ממליץ, ואתם מאשרים ידנית. שם לוחצים 'אשר קבלה' → הושלם.",
    run: async (p) => { await logout(p).catch(()=>{}); await p.goto(`${BASE}/welcome`); } },
];

async function runOnce(p) {
  for (let i = 0; i < SCENES.length; i++) {
    const s = SCENES[i];
    try { await s.run(p); } catch {}
    termCue(i + 1, SCENES.length, s.title, s.does, s.cue, s.hold);
    await notesCue(i + 1, SCENES.length, s.title, s.does, s.cue, s.hold);
    await sec(s.hold);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ["--start-maximized"] });
  const demoCtx = await browser.newContext({ viewport: null, locale: "he-IL" });
  const page = await demoCtx.newPage();

  if (NOTES) {
    const notesCtx = await browser.newContext({ viewport: { width: 720, height: 560 }, locale: "he-IL" });
    notesPage = await notesCtx.newPage();
    await notesPage.goto("about:blank");
    await notesPage.evaluate(() => { document.title = "TERAGON — הערות מרצה (אל תשתף חלון זה)"; document.body.style.background = "#0b1220"; });
    console.log("\n*** נפתח חלון 'הערות מרצה' נפרד — שים אותו על המסך שלך, ושַתֵּף רק את חלון ההדגמה. ***");
  }

  console.log("\nTERAGON demo — the SHARED window stays clean (no captions). Read cues here" + (NOTES ? " or in the notes window." : "."));
  console.log("Screen-share tip: share ONLY the demo browser window (not the whole screen), and keep this terminal" + (NOTES ? " and the notes window" : "") + " to yourself.");
  do { await runOnce(page); } while (LOOP);
  console.log("\n✔ סוף ההדגמה. החלון נשאר פתוח.");
})();
