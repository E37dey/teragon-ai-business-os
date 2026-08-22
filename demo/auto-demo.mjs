// TERAGON — hands-free auto-demo (presenter aid).
// Opens a VISIBLE browser and walks through the demo by itself, with a big
// on-screen banner (title + what to say), so you can talk while it runs.
// It drives the REAL app on localhost:4173 — it does NOT change any product code.
//
// Run:  node demo/auto-demo.mjs         (default pace)
//       SLOW=1 node demo/auto-demo.mjs  (slower pace, ~1.5x)
//       LOOP=1 node demo/auto-demo.mjs  (repeat forever)
//
// Requires the local preview running on http://localhost:4173 (START-TERAGON-DEMO.bat).
import { chromium } from "@playwright/test";

const BASE = process.env.BASE || "http://localhost:4173";
const PACE = process.env.SLOW ? 1.5 : 1;
const LOOP = !!process.env.LOOP;
const sec = (s) => new Promise((r) => setTimeout(r, s * 1000 * PACE));

// ---- the story: each scene has a route action, a title, and a spoken cue ----
const SCENES = [
  { hold: 11, title: "TERAGON AI BUSINESS OS", cue: "מערכת הפעלה עסקית מבוססת-AI. מודול אחד מבוקר — חוויה שונה לכל תפקיד. ה-AI ממליץ, האדם מחליט.",
    run: async (p) => { await p.goto(`${BASE}/welcome`); await p.getByTestId("demo-prefill-manager").waitFor(); } },

  { hold: 15, title: "פורטל מנהל — \"מה דורש את תשומת ליבי?\"", cue: "המנהל רואה קודם החלטות ואישורים, אחר-כך מדדים (KPI), ואז גישה מהירה. רוחב ≠ אדמין: מנהל עסקי אינו מנהל מערכת.",
    run: async (p) => { await login(p, "manager"); await p.getByTestId("manager-kpis").waitFor().catch(()=>{}); } },

  { hold: 11, title: "אנליטיקה", cue: "דוחות ומדדים על נתוני הדמו — לידים, הצעות, הכנסות — שהופכים תפעול לאותות להחלטה.",
    run: async (p) => { await p.goto(`${BASE}/analytics`); } },

  { hold: 15, title: "פורטל תלמיד — \"מה עליי לעשות עכשיו?\"", cue: "אותה מערכת, חוויה אחרת לגמרי: המשך למידה, ההתקדמות, המשימות שלי, והמנטור. סביבת למידה — לא אדמין מוקטן.",
    run: async (p) => { await logout(p); await login(p, "student"); await p.getByTestId("student-continue").waitFor().catch(()=>{}); } },

  { hold: 13, title: "פורטל טכנאי — \"איזו עבודה עכשיו?\"", cue: "לטכנאי: הקריאה הדחופה לפי עדיפות, התור המוקצה, ידע טכני, והעוזר Fixer. הוא רואה רק את הקריאות שהוקצו לו.",
    run: async (p) => { await logout(p); await login(p, "technician"); await p.getByTestId("tech-current-job").waitFor().catch(()=>{}); } },

  { hold: 16, title: "מרחב AI — שבעה סוכנים", cue: "Orchestrator מתכנן ומנתב; Wiki, Mentor, Hunter, Flow, Fixer, Nexa ממליצים עם ראיות ו'למה'. מנוע מקומי — ללא מודל מרוחק. הסוכנים לא פועלים לבד.",
    run: async (p) => { await p.goto(`${BASE}/ai-workspace`); await p.waitForTimeout(1500); } },

  { hold: 12, title: "אבטחה — חסימת גישה אמיתית", cue: "מנסים לגשת למסך שאין לתפקיד הרשאה אליו — נחסם. זהות → תפקיד → יכולת → פורטל → רשומה. deny-by-default.",
    run: async (p) => { await p.goto(`${BASE}/administration`); await p.waitForTimeout(1200); } },

  { hold: 22, title: "★ עכשיו לחלון Obsidian החי ★", cue: "כאן עוברים ידנית לחלון המחובר: http://localhost:4173/memory — כספת TERAGON OS אמיתית, מפת ידע חיה, ו-workflow מבוקר עם אישור אנושי. (הדמו האוטומטי לא נוגע בכספת המקומית מטעמי אבטחה.)",
    run: async (p) => { await logout(p).catch(()=>{}); await p.goto(`${BASE}/welcome`); } },
];

async function login(p, portal) {
  await p.goto(`${BASE}/welcome`);
  await p.getByTestId(`demo-prefill-${portal}`).click();
  await p.getByTestId("demo-login-submit").click();
  await p.waitForURL(`${BASE}/home`, { timeout: 15000 }).catch(()=>{});
}
async function logout(p) {
  const x = p.getByTestId("portal-exit");
  if (await x.count()) { await x.click(); await p.waitForURL(`${BASE}/welcome`, { timeout: 8000 }).catch(()=>{}); }
}

// big fixed banner injected into the page (not product code — overlay only)
async function banner(p, i, total, title, cue, hold) {
  await p.evaluate(({ i, total, title, cue, hold }) => {
    let b = document.getElementById("__teragon_demo_banner__");
    if (!b) {
      b = document.createElement("div");
      b.id = "__teragon_demo_banner__";
      b.dir = "rtl";
      b.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;pointer-events:none;" +
        "background:linear-gradient(180deg,rgba(9,14,25,.96),rgba(9,14,25,.82));color:#eaf2ff;" +
        "font-family:system-ui,'Segoe UI',Arial;padding:14px 26px 16px;border-bottom:2px solid #2f6df6;" +
        "box-shadow:0 6px 24px rgba(0,0,0,.4)";
      document.body.appendChild(b);
    }
    b.innerHTML =
      `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px">` +
        `<div style="font-size:24px;font-weight:800;letter-spacing:.2px">${title}</div>` +
        `<div style="font-size:13px;opacity:.7;white-space:nowrap">TERAGON · הדגמה אוטומטית · ${i}/${total}</div>` +
      `</div>` +
      `<div style="font-size:16px;opacity:.92;margin-top:6px;line-height:1.5"><b style="color:#7fb0ff">מה לומר:</b> ${cue}</div>` +
      `<div id="__teragon_demo_bar__" style="height:3px;background:#2f6df6;margin-top:10px;width:0%;transition:width ${hold}s linear"></div>`;
    requestAnimationFrame(() => { const bar = document.getElementById("__teragon_demo_bar__"); if (bar) bar.style.width = "100%"; });
  }, { i, total, title, cue, hold }).catch(()=>{});
}

async function runOnce(page) {
  for (let i = 0; i < SCENES.length; i++) {
    const s = SCENES[i];
    try { await s.run(page); } catch {}
    await banner(page, i + 1, SCENES.length, s.title, s.cue, s.hold);
    await sec(s.hold);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ["--start-maximized"] });
  const context = await browser.newContext({ viewport: null, locale: "he-IL" });
  const page = await context.newPage();
  console.log("TERAGON auto-demo running against " + BASE + " — talk along with the on-screen cues. Close the window to stop.");
  do { await runOnce(page); } while (LOOP);
  await banner(page, SCENES.length, SCENES.length, "סוף — תודה!", "ארכיטקטורה: React 19 + RBAC + AI מבוקר + Obsidian. גבולות בכנות, ו-Roadmap ברור. (החלון יישאר פתוח.)", 3);
})();
