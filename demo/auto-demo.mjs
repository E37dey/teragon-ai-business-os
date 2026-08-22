// TERAGON — hands-free GUIDED auto-demo (presenter aid).
// Opens a VISIBLE browser and performs real actions that SHOW RESULTS, slowly,
// with a big on-screen banner (page title + what the page does + what to say),
// so you can narrate while it runs. Drives the REAL app on localhost:4173.
// It does NOT change any product code.
//
// Run:  node demo/auto-demo.mjs          (slow, presentation pace — default)
//       FAST=1 node demo/auto-demo.mjs   (quicker)
//       LOOP=1 node demo/auto-demo.mjs   (repeat forever)
// Requires the local preview on http://localhost:4173 (START-TERAGON-DEMO.bat).
import { chromium } from "@playwright/test";

const BASE = process.env.BASE || "http://localhost:4173";
const PACE = process.env.FAST ? 0.6 : 1.35;          // slow by default
const LOOP = !!process.env.LOOP;
const sec = (s) => new Promise((r) => setTimeout(r, s * 1000 * PACE));

let PAGE; // set in main

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
// slow scroll top→bottom→top so viewers actually see the page content
async function scrollTour(p, ms = 6000) {
  const steps = 6, dt = ms / (steps * 2);
  for (let i = 1; i <= steps; i++) { await p.mouse.wheel(0, 320).catch(()=>{}); await new Promise(r=>setTimeout(r, dt*PACE)); }
  for (let i = 1; i <= steps; i++) { await p.mouse.wheel(0, -320).catch(()=>{}); await new Promise(r=>setTimeout(r, dt*PACE)); }
}
async function banner(p, i, total, title, does, cue, hold) {
  await p.evaluate(({ i, total, title, does, cue, hold }) => {
    let b = document.getElementById("__tg_banner__");
    if (!b) {
      b = document.createElement("div"); b.id = "__tg_banner__"; b.dir = "rtl";
      b.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;pointer-events:none;" +
        "background:linear-gradient(180deg,rgba(8,13,24,.97),rgba(8,13,24,.85));color:#eaf2ff;" +
        "font-family:system-ui,'Segoe UI',Arial;padding:14px 26px 16px;border-bottom:2px solid #2f6df6;box-shadow:0 8px 28px rgba(0,0,0,.45)";
      document.body.appendChild(b);
    }
    b.innerHTML =
      `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px">` +
        `<div style="font-size:25px;font-weight:800">${title}</div>` +
        `<div style="font-size:13px;opacity:.65;white-space:nowrap">TERAGON · הדגמה מודרכת · ${i}/${total}</div></div>` +
      `<div style="font-size:15px;opacity:.9;margin-top:6px"><b style="color:#8fd18f">מה העמוד עושה:</b> ${does}</div>` +
      `<div style="font-size:16px;opacity:.95;margin-top:4px;line-height:1.5"><b style="color:#7fb0ff">מה לומר:</b> ${cue}</div>` +
      `<div id="__tg_bar__" style="height:3px;background:#2f6df6;margin-top:10px;width:0%;transition:width ${hold}s linear"></div>`;
    requestAnimationFrame(() => { const bar = document.getElementById("__tg_bar__"); if (bar) bar.style.width = "100%"; });
  }, { i, total, title, does, cue, hold }).catch(() => {});
}

// ---------- scenes (each may DO something, then hold while you talk) ----------
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
    cue: "מקלידים שם לקוח — והמערכת מוצאת אותו על-פני כל המודולים. שימו לב: תוצאות אמיתיות, לא תפריט קבוע.",
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
    cue: "עכשיו רואים פעולה→תוצאה אמיתית: אני מריץ סוכן שסוקר את המצב ומכין תוכנית — והתוצאה מופיעה ב'פעילות אחרונה' עם ראיות. ה-Orchestrator מתזמר; אף סוכן לא פועל לבד.",
    run: async (p) => {
      await p.goto(`${BASE}/ai-workspace`); await p.waitForTimeout(1500);
      const run = p.getByRole("button", { name: "הרצה" }).first();
      if (await run.count().catch(()=>0)) { await run.scrollIntoViewIfNeeded().catch(()=>{}); await run.click().catch(()=>{}); }
      await p.waitForTimeout(3500);            // let the deterministic result appear
      await scrollTour(p, 8000);               // scroll so the result / agent network are seen
    } },

  { hold: 14, title: "אבטחה — חסימת גישה אמיתית",
    does: "ניתוב מבוקר: מסך שאין לתפקיד הרשאה אליו מחזיר 'גישה חסומה'.",
    cue: "טכנאי מנסה להיכנס לניהול-מערכת — נחסם. זהות → תפקיד → יכולת → פורטל → רשומה. deny-by-default.",
    run: async (p) => { await p.goto(`${BASE}/administration`); await p.waitForTimeout(1400); } },

  { hold: 22, title: "★ עכשיו לחלון Obsidian החי ★",
    does: "הדמו האוטומטי לא נוגע בכספת המקומית (אבטחה). את Obsidian מציגים ידנית בחלון המחובר.",
    cue: "כאן עוברים ל: localhost:4173/memory (הדפדפן המשויך) — כספת TERAGON OS אמיתית, מפת ידע חיה, ו-workflow מבוקר: הסוכן קורא מהכספת, ממליץ, ואתם מאשרים ידנית. שם לוחצים 'אשר קבלה' → הושלם.",
    run: async (p) => { await logout(p).catch(()=>{}); await p.goto(`${BASE}/welcome`); } },
];

async function runOnce(p) {
  for (let i = 0; i < SCENES.length; i++) {
    const s = SCENES[i];
    try { await s.run(p); } catch {}
    await banner(p, i + 1, SCENES.length, s.title, s.does, s.cue, s.hold);
    await sec(s.hold);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ["--start-maximized"] });
  const context = await browser.newContext({ viewport: null, locale: "he-IL" });
  PAGE = await context.newPage();
  console.log("TERAGON guided auto-demo running against " + BASE + " (slow pace). Narrate along with the banner. Close the window to stop.");
  do { await runOnce(PAGE); } while (LOOP);
  await banner(PAGE, SCENES.length, SCENES.length, "סוף — תודה!",
    "ארכיטקטורה: React 19 + RBAC (route+record) + AI מבוקר + Obsidian.",
    "בכנות על הגבולות (record-scope מקומי הוא הצגה; RLS ברמת-משתמש בהמשך), עם Roadmap ברור. תודה!", 4);
})();
