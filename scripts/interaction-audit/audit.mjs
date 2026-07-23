#!/usr/bin/env node
// TERAGON AI BUSINESS OS — STATIC CONTROL AUDITOR (Phase 9.2 · W9-A).
//
// Portable, dependency-free static/AST-ish scan over every src/**/*.tsx. It
// enumerates interactive controls and flags dead / dishonest / inaccessible
// ones. This is the STATIC half of the Final Interaction Audit; the runtime
// half lives in e2e/final-interactions/**.
//
// It never builds and never touches the app. It reads source, tokenizes JSX
// opening tags + paired <button>/<a> bodies with a small hand-rolled scanner
// (no TS/Babel dependency — must run anywhere Node runs), and applies the
// rule set below. Findings carry file/line/control/severity/reason.
//
// Rules (severity):
//   R01 button without accessible name .............. high
//   R02 native button without handler ............... high
//   R03 link with empty / "#" / "javascript:" href .. high
//   R04 onClick={()=>{}} / onClick={undefined} ...... high
//   R05 console.log-only handler .................... high
//   R06 alert()/confirm()/prompt() placeholder ...... high
//   R07 visible TODO/FIXME action ................... medium
//   R08 clickable div/span without keyboard handler . medium (overlay dismiss=info)
//   R09 disabled control without a visible reason ... high
//   R10 icon-only control without aria-label ........ high
//   R11 destructive action without a confirm gate ... medium (heuristic)
//   R12 approval action not via Approval records .... low (heuristic)
//   R13 form without validation ..................... medium (heuristic)
//   R14 submit button outside a <form> .............. medium
//   R15 duplicate id="…" literal in one file ........ medium
//   R16 <Modal> without a title prop ................ high
//   R17 <Drawer> without a title prop (no a11y close) high
//
// Output: docs/FINAL_STATIC_CONTROL_INVENTORY.md (unless --no-write).
// Exit codes: 0 = no high-severity findings · 1 = >=1 high-severity finding ·
//             2 = usage / IO error. --selftest proves detection on fixtures.
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const OUT = join(ROOT, "docs", "FINAL_STATIC_CONTROL_INVENTORY.md");

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2, info: 3 };

// --------------------------------------------------------------------------
// tiny helpers
// --------------------------------------------------------------------------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

// Replace // line comments and /* … */ block comments (incl. JSX {/* … */})
// with spaces, preserving every newline so line numbers stay identical to the
// source. String/template literals are respected so `://` in a URL and `/*`
// inside a string are never treated as comments.
function stripComments(text) {
  const out = text.split("");
  let quote = null; // '"' | "'" | '`'
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      for (let j = i; j < text.length && text[j] !== "\n"; j++) out[j] = " ";
      // resume scan after the blanked run
      while (i < text.length && text[i] !== "\n") i++;
      i--;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      let j = i + 2;
      while (j < text.length && !(text[j] === "*" && text[j + 1] === "/")) j++;
      const endBlock = Math.min(j + 2, text.length);
      for (let k = i; k < endBlock; k++) if (out[k] !== "\n") out[k] = " ";
      i = endBlock - 1;
      continue;
    }
  }
  return out.join("");
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === "\n") line++;
  return line;
}

// Scan forward from the "<" of a tag to the matching ">" that closes the
// opening tag, honoring quotes and {…} brace nesting so that `>` inside a
// JSX expression or string never ends the tag prematurely. Returns the index
// just AFTER the closing ">" and whether the element self-closes.
function scanOpeningTag(text, start) {
  let i = start;
  let depth = 0; // {…} depth
  let quote = null;
  for (; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) {
      const selfClose = text[i - 1] === "/";
      return { end: i + 1, selfClose };
    }
  }
  return { end: text.length, selfClose: false };
}

// Extract the inner body of a paired element <tag …> … </tag> (no same-tag
// nesting expected for button/a). Returns "" if no close is found.
function innerBody(text, openEnd, tag) {
  const close = text.indexOf(`</${tag}`, openEnd);
  return close === -1 ? "" : text.slice(openEnd, close);
}

// Does an opening-tag string carry attribute `name` (any value form)?
function hasAttr(openTag, name) {
  return new RegExp(`(?:^|\\s)${name}(?=[=\\s/>])`).test(openTag);
}

// Raw text of `name={…}` (brace-aware, honors nested {} and quotes) or
// name="…" / name='…' attribute. Returns the value INCLUDING its delimiters.
function attrRaw(openTag, name) {
  const re = new RegExp(`(?:^|\\s)${name}=`);
  const m = re.exec(openTag);
  if (!m) return null;
  let i = m.index + m[0].length;
  const c = openTag[i];
  if (c === '"' || c === "'") {
    const close = openTag.indexOf(c, i + 1);
    return close === -1 ? openTag.slice(i) : openTag.slice(i, close + 1);
  }
  if (c === "{") {
    let depth = 0;
    let quote = null;
    for (let j = i; j < openTag.length; j++) {
      const ch = openTag[j];
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return openTag.slice(i, j + 1);
      }
    }
    return openTag.slice(i);
  }
  return null;
}

// Strip child JSX tags + expressions; is there human-visible text left?
function hasVisibleText(body) {
  const noTags = body.replace(/<[^>]*>/g, " ");
  // keep {expr} — an expression child may render a label, so treat as text
  const hasExpr = /\{[^}]*\}/.test(noTags.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ""));
  const literal = noTags.replace(/\{[^}]*\}/g, " ");
  const hasLiteral = /[\p{L}\p{N}]/u.test(literal);
  return hasExpr || hasLiteral;
}

// --------------------------------------------------------------------------
// rule engine — runs over one file's text, pushes findings
// --------------------------------------------------------------------------
const OVERLAY_RE = /overlay|backdrop|scrim/i;

function auditFile(rel, raw, push) {
  // Structural rules run on comment-stripped code (same line numbers) so that
  // prose in comments (e.g. "a real <button> in an SVG") never mis-fires.
  const text = stripComments(raw);
  // ---- duplicate id (R15) --------------------------------------------------
  const idCounts = new Map();
  for (const m of text.matchAll(/\bid="([^"]+)"/g)) {
    const arr = idCounts.get(m[1]) ?? [];
    arr.push(m.index);
    idCounts.set(m[1], arr);
  }
  for (const [id, positions] of idCounts) {
    if (positions.length > 1) {
      push({
        rel,
        line: lineOf(text, positions[1]),
        control: `id="${id}"`,
        severity: "medium",
        rule: "R15",
        reason: `מזהה כפול id="${id}" מופיע ${positions.length} פעמים בקובץ`,
      });
    }
  }

  // ---- <a href> checks (R03) ----------------------------------------------
  for (const m of text.matchAll(/<a\s([^>]*?)>/g)) {
    const openTag = m[0];
    const href = attrRaw(openTag, "href");
    const line = lineOf(text, m.index);
    if (!href || /^("#"|'#'|""|''|"javascript:|'javascript:)/.test(href)) {
      push({
        rel,
        line,
        control: "<a>",
        severity: "high",
        rule: "R03",
        reason: `קישור ללא יעד אמיתי (href=${href ?? "חסר"})`,
      });
    }
  }

  // ---- clickable div/span without keyboard (R08) --------------------------
  for (const tag of ["div", "span"]) {
    for (const m of matchAllTag(text, tag)) {
      const { openTag, index } = m;
      if (!hasAttr(openTag, "onClick")) continue;
      // Skip pure event-guard handlers (e.stopPropagation()/preventDefault):
      // these keep a click on a dialog CONTAINER from bubbling to the overlay —
      // they are not an activation affordance, so no keyboard handler is owed.
      const clickRaw = attrRaw(openTag, "onClick");
      if (clickRaw) {
        const guardOnly = clickRaw
          .slice(1, -1)
          .replace(/\(\s*e\s*\)\s*=>/g, "")
          .replace(/e\.(stopPropagation|preventDefault)\(\)\s*;?/g, "")
          .replace(/[\s{}()]/g, "");
        if (guardOnly === "") continue;
      }
      const line = lineOf(text, index);
      const isOverlay = OVERLAY_RE.test(openTag);
      // role may be static (role="button") or conditional
      // (role={clickable ? "button" : "listitem"}) — both are genuine button
      // emulation when a keyboard handler is present. Detection improvement,
      // NOT a suppression: an element with no "button" role at all still fails.
      const roleButton =
        /role=("|')button\1/.test(openTag) || /role=\{[^}]*["']button["'][^}]*\}/.test(openTag);
      const hasKey = /onKeyDown|onKeyUp|onKeyPress/.test(openTag);
      const ariaHidden = /aria-hidden=("|')true\1/.test(openTag);
      if (isOverlay || ariaHidden) {
        // click-to-dismiss backdrop; keyboard dismissal is handled by the
        // dialog's own ESC listener — informational, not a defect.
        push({
          rel,
          line,
          control: `<${tag} onClick> (overlay)`,
          severity: "info",
          rule: "R08",
          reason: "רקע לסגירה בלחיצה — סגירה במקלדת מטופלת ע\"י ESC של הדיאלוג",
        });
        continue;
      }
      if (roleButton && hasKey) continue; // proper button emulation
      push({
        rel,
        line,
        control: `<${tag} onClick>`,
        severity: "medium",
        rule: "R08",
        reason: roleButton
          ? "role=button ללא מטפל מקלדת (onKeyDown)"
          : "אלמנט לחיץ ללא role=button + מטפל מקלדת",
      });
    }
  }

  // ---- <Modal> / <Drawer> title (R16/R17) ---------------------------------
  for (const [tag, rule] of [["Modal", "R16"], ["Drawer", "R17"]]) {
    for (const m of matchAllTag(text, tag)) {
      if (!hasAttr(m.openTag, "title")) {
        push({
          rel,
          line: lineOf(text, m.index),
          control: `<${tag}>`,
          severity: "high",
          rule,
          reason: `<${tag}> ללא prop title — כותרת נגישה / כפתור סגירה נגיש חסרים`,
        });
      }
    }
  }

  // ---- <form> without validation (R13) ------------------------------------
  for (const m of matchAllTag(text, "form")) {
    const onSubmit = attrRaw(m.openTag, "onSubmit");
    if (!onSubmit) continue;
    // look at a window after the tag for validation signals
    const body = text.slice(m.index, m.index + 1200) + onSubmit;
    if (!/parse|safeParse|validate|errors?|schema|zod|required|preventDefault/.test(body)) {
      push({
        rel,
        line: lineOf(text, m.index),
        control: "<form onSubmit>",
        severity: "medium",
        rule: "R13",
        reason: "טופס ללא סימני ולידציה (zod/parse/validate/errors)",
      });
    }
  }

  // ---- buttons (native + OsButton): R01/R02/R04/R05/R06/R09/R10/R11/R12/R14
  auditButtons(rel, text, raw, push, "button", true);
  auditButtons(rel, text, raw, push, "OsButton", false);
}

// generic tag matcher returning {openTag, index, end, selfClose}
function matchAllTag(text, tag) {
  const out = [];
  const re = new RegExp(`<${tag}(?=[\\s/>])`, "g");
  let m;
  while ((m = re.exec(text)) !== null) {
    const { end, selfClose } = scanOpeningTag(text, m.index);
    out.push({ openTag: text.slice(m.index, end), index: m.index, end, selfClose });
    re.lastIndex = end;
  }
  return out;
}

// Strong destructive intent only — "reset/איפוס/הסר" alone are excluded because
// they overwhelmingly mean "reset filters", which needs no confirm gate.
const DESTRUCTIVE_RE = /מחיק|מחק|מוחק|delete|purge|drop\b/i;
const APPROVAL_RE = /אישור|אשר|לאישור|approve|approval/i;

function auditButtons(rel, text, raw, push, tag, isNative) {
  for (const m of matchAllTag(text, tag)) {
    const { openTag, index, selfClose } = m;
    const line = lineOf(text, index);
    const onClick = attrRaw(openTag, "onClick");
    const isSubmit = /type=("|')submit\1/.test(openTag);
    const isDisabledAttr = hasAttr(openTag, "disabled");
    const disabledRaw = attrRaw(openTag, "disabled");
    // OsButton disabled contract: disabledReason prop. Native: title/aria-label.
    const hasReason =
      hasAttr(openTag, "disabledReason") || hasAttr(openTag, "title") || hasAttr(openTag, "aria-label");
    const body = selfClose ? "" : innerBody(text, m.end, tag);

    // R04 empty / undefined handler
    if (onClick) {
      const v = onClick.slice(1, -1).trim(); // strip { }
      if (/^\(\s*\)\s*=>\s*\{\s*\}$/.test(v) || v === "undefined" || /^\(\s*\)\s*=>\s*undefined$/.test(v)) {
        push({ rel, line, control: `<${tag}>`, severity: "high", rule: "R04",
          reason: `מטפל onClick ריק (${v})` });
      }
      // R05 console.log-only
      if (/^\(\s*\)\s*=>\s*console\.(log|debug|info)\([^)]*\)$/.test(v)) {
        push({ rel, line, control: `<${tag}>`, severity: "high", rule: "R05",
          reason: "מטפל onClick מכיל console.log בלבד — פעולה מדומה" });
      }
      // R06 alert/confirm/prompt placeholder inside inline handler
      if (/(^|[^.\w])(alert|prompt)\s*\(/.test(v)) {
        push({ rel, line, control: `<${tag}>`, severity: "high", rule: "R06",
          reason: "מטפל משתמש ב-alert()/prompt() כמציין מיקום" });
      }
    }

    // R02 native button without handler (not submit, not intentionally reset)
    if (isNative && !onClick && !isSubmit && !/type=("|')reset\1/.test(openTag)) {
      // a button that is ONLY a disabled placeholder with a reason is allowed
      if (!(isDisabledAttr && hasReason)) {
        push({ rel, line, control: "<button>", severity: "high", rule: "R02",
          reason: "כפתור native ללא onClick וללא type=submit — פעולה מתה" });
      }
    }

    // R14 submit outside a <form> (scan enclosing 4000 chars backwards for <form)
    if (isSubmit) {
      const before = text.slice(Math.max(0, index - 6000), index);
      const formOpen = before.lastIndexOf("<form");
      const formClose = before.lastIndexOf("</form>");
      if (formOpen === -1 || formClose > formOpen) {
        push({ rel, line, control: `<${tag} type=submit>`, severity: "medium", rule: "R14",
          reason: "כפתור submit ללא <form> עוטף בקרבת מקום" });
      }
    }

    // R09 disabled without a visible reason
    if (isDisabledAttr && disabledRaw !== "{false}" && !hasReason) {
      push({ rel, line, control: `<${tag}>`, severity: "high", rule: "R09",
        reason: isNative
          ? "כפתור מושבת ללא title/aria-label המסביר מדוע"
          : "OsButton מושבת ללא disabledReason (הפרת חוזה יושרה)" });
    }

    // R01 / R10 accessible name
    const nameFromAttr =
      hasAttr(openTag, "aria-label") || hasAttr(openTag, "aria-labelledby") || hasAttr(openTag, "title");
    const iconOnly =
      hasAttr(openTag, "icon") || /<OsIcon|<svg|<img/.test(body);
    const textPresent = hasVisibleText(body) || hasAttr(openTag, "children");
    if (!nameFromAttr && !textPresent) {
      if (iconOnly) {
        push({ rel, line, control: `<${tag}>`, severity: "high", rule: "R10",
          reason: "בקרת אייקון-בלבד ללא aria-label" });
      } else {
        push({ rel, line, control: `<${tag}>`, severity: "high", rule: "R01",
          reason: "כפתור ללא שם נגיש (טקסט/aria-label)" });
      }
    }

    // R11 destructive action without a confirm gate (heuristic)
    const isDanger = /variant=("|')danger\1/.test(openTag) || DESTRUCTIVE_RE.test(body);
    if (isDanger && onClick) {
      const handler = onClick.slice(1, -1).trim();
      const win = text.slice(Math.max(0, index - 8000), Math.min(text.length, index + 2000));
      // A guard is a confirm/Modal step OR a mandatory-reason gate (the twin
      // disabled button reads "…מחייב נימוק"; the handler passes reason.trim()).
      const guarded =
        /confirm|Confirm|Modal|setConfirm|requestConfirm|guard|window\.confirm/.test(win) ||
        /confirm|Confirm/.test(handler) ||
        /reason(He)?\.trim\(\)|מחייב נימוק|disabledReason=/.test(win) ||
        /[Rr]eason/.test(handler);
      if (!guarded) {
        push({ rel, line, control: `<${tag}>`, severity: "medium", rule: "R11",
          reason: "פעולה הרסנית ללא שער אישור (confirm/Modal) נראה בהקשר" });
      }
    }

    // R12 approval action not routed through Approval records (heuristic)
    if (APPROVAL_RE.test(body) && onClick) {
      const win = text.slice(Math.max(0, index - 10000), Math.min(text.length, index + 2000));
      const routed =
        /[Aa]pproval|approve[A-Z]|decide|ApprovalEngine|approvals\b|requestApproval/.test(win) ||
        /\.approve\(|\.reject\(|\.decide\(|editAndApprove|controls\.(approve|reject)/.test(win);
      if (!routed) {
        push({ rel, line, control: `<${tag}>`, severity: "low", rule: "R12",
          reason: "פעולת אישור ללא התייחסות נראית למנוע/רשומות אישור" });
      }
    }

    // R07 TODO/FIXME inside the control or its handler — scanned on RAW text
    // (comments included) at this control's span, since a TODO is usually a
    // comment marker next to an unfinished action.
    const rawSpan = raw.slice(index, Math.min(raw.length, m.end + body.length + 40));
    if (/TODO|FIXME|לא ממומש|placeholder-action/.test(rawSpan)) {
      push({ rel, line, control: `<${tag}>`, severity: "medium", rule: "R07",
        reason: "פעולה עם סימון TODO/FIXME/לא-ממומש" });
    }
  }
}

// --------------------------------------------------------------------------
// self-test — proves each rule fires on a planted fixture (no real files)
// --------------------------------------------------------------------------
function runSelfTest() {
  const cases = [
    { name: "R03 empty href", src: `<a href="#">x</a>`, rule: "R03" },
    { name: "R03 javascript href", src: `<a href="javascript:void(0)">x</a>`, rule: "R03" },
    { name: "R08 clickable div", src: `<div onClick={go}>x</div>`, rule: "R08" },
    { name: "R16 modal no title", src: `<Modal open={o} onClose={c}>body</Modal>`, rule: "R16" },
    { name: "R04 empty handler", src: `<button onClick={() => {}}>x</button>`, rule: "R04" },
    { name: "R05 console handler", src: `<button onClick={() => console.log("x")}>y</button>`, rule: "R05" },
    { name: "R06 alert handler", src: `<button onClick={() => alert("hi")}>y</button>`, rule: "R06" },
    { name: "R02 no handler", src: `<button className="c">x</button>`, rule: "R02" },
    { name: "R09 disabled no reason", src: `<button disabled={busy} onClick={f}>x</button>`, rule: "R09" },
    { name: "R09 OsButton no reason", src: `<OsButton disabled={busy} onClick={f}>x</OsButton>`, rule: "R09" },
    { name: "R10 icon only", src: `<button onClick={f}><OsIcon name="x" /></button>`, rule: "R10" },
    { name: "R14 submit no form", src: `<button type="submit" onClick={f}>שמור</button>`, rule: "R14" },
    { name: "R15 dup id", src: `<input id="a" /><input id="a" />`, rule: "R15" },
    { name: "R07 todo", src: `<button onClick={f}>{/* TODO wire */}שלח</button>`, rule: "R07" },
  ];
  let ok = 0;
  let failed = 0;
  for (const c of cases) {
    const found = [];
    auditFile("selftest.tsx", c.src, (f) => found.push(f));
    const hit = found.some((f) => f.rule === c.rule);
    if (hit) ok++;
    else {
      failed++;
      console.error(`  ✗ ${c.name}: expected ${c.rule}, got [${found.map((f) => f.rule).join(",")}]`);
    }
  }
  // negative controls — clean patterns must NOT raise high-severity
  const clean = [
    `<button type="button" onClick={f} aria-label="הוספה" disabled={!f} title={f ? "הוספה" : "יחובר"}><OsIcon name="plus"/></button>`,
    `<OsButton disabled={true} disabledReason="עדיין רץ" onClick={f}>הפק</OsButton>`,
    `<a href="/crm" className="x">CRM</a>`,
    `<Modal open={o} onClose={c} title="ליד חדש">b</Modal>`,
    `<div className="os-overlay" onClick={onClose} aria-hidden="true" />`,
  ];
  let fp = 0;
  for (const src of clean) {
    const found = [];
    auditFile("clean.tsx", src, (f) => found.push(f));
    const high = found.filter((f) => f.severity === "high");
    if (high.length) {
      fp++;
      console.error(`  ✗ false-positive HIGH on clean: ${src.slice(0, 60)} → ${high.map((f) => f.rule)}`);
    }
  }
  console.log(`self-test: ${ok}/${cases.length} rules fired · ${failed} missed · ${fp} false-positive(s)`);
  return failed === 0 && fp === 0;
}

// --------------------------------------------------------------------------
// main
// --------------------------------------------------------------------------
const args = new Set(process.argv.slice(2));

if (args.has("--selftest")) {
  const pass = runSelfTest();
  process.exit(pass ? 0 : 1);
}

if (!existsSync(SRC)) {
  console.error("[audit] src/ not found — run from the repo root.");
  process.exit(2);
}

const files = walk(SRC);
const findings = [];
for (const file of files) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  const text = readFileSync(file, "utf8");
  auditFile(rel, text, (f) => findings.push(f));
}

findings.sort(
  (a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
    a.rel.localeCompare(b.rel) ||
    a.line - b.line,
);

const bySev = { high: 0, medium: 0, low: 0, info: 0 };
for (const f of findings) bySev[f.severity]++;

// control tally
let nativeButtons = 0;
let osButtons = 0;
let links = 0;
let modals = 0;
let drawers = 0;
let forms = 0;
for (const file of files) {
  const t = readFileSync(file, "utf8");
  nativeButtons += matchAllTag(t, "button").length;
  osButtons += matchAllTag(t, "OsButton").length;
  links += matchAllTag(t, "a").length;
  modals += matchAllTag(t, "Modal").length;
  drawers += matchAllTag(t, "Drawer").length;
  forms += matchAllTag(t, "form").length;
}

const RULE_TITLES = {
  R01: "כפתור ללא שם נגיש",
  R02: "כפתור native ללא מטפל",
  R03: "קישור ללא href אמיתי",
  R04: "מטפל onClick ריק",
  R05: "מטפל console.log בלבד",
  R06: "alert()/prompt() כמציין מיקום",
  R07: "TODO/FIXME בפעולה",
  R08: "אלמנט לחיץ ללא מקלדת",
  R09: "בקרה מושבתת ללא סיבה נראית",
  R10: "אייקון-בלבד ללא aria-label",
  R11: "פעולה הרסנית ללא confirm",
  R12: "אישור לא דרך רשומות Approval",
  R13: "טופס ללא ולידציה",
  R14: "submit מחוץ ל-form",
  R15: "id כפול בקובץ",
  R16: "Modal ללא title",
  R17: "Drawer ללא title",
};

function ownerFor(rel) {
  // W9-A audits; defects in src/** are fixed by the Lead (integration queue).
  return rel.startsWith("src/") ? "Lead (integration-requests-w9a)" : "W9-A";
}

const lines = [];
lines.push("# FINAL STATIC CONTROL INVENTORY (Phase 9.2 · W9-A)");
lines.push("");
lines.push(
  "מקור: `scripts/interaction-audit/audit.mjs` — סורק סטטי נטול-תלויות על כל " +
    "`src/**/*.tsx`. מריץ טוקנייזר JSX קטן (ללא Babel/TS) ומיישם 17 חוקים. " +
    "יציאה != 0 כאשר יש ולו ממצא **high** אחד.",
);
lines.push("");
lines.push(`תאריך ריצה: ${new Date().toISOString().slice(0, 10)} · קבצים שנסרקו: ${files.length}`);
lines.push("");
lines.push("## מלאי בקרות (ספירה סטטית)");
lines.push("");
lines.push("| בקרה | כמות |");
lines.push("|---|---|");
lines.push(`| \`<OsButton>\` | ${osButtons} |`);
lines.push(`| \`<button>\` native | ${nativeButtons} |`);
lines.push(`| \`<a>\` links | ${links} |`);
lines.push(`| \`<Modal>\` | ${modals} |`);
lines.push(`| \`<Drawer>\` | ${drawers} |`);
lines.push(`| \`<form>\` | ${forms} |`);
lines.push("");
lines.push("## סיכום ממצאים לפי חומרה");
lines.push("");
lines.push("| חומרה | כמות |");
lines.push("|---|---|");
lines.push(`| high | ${bySev.high} |`);
lines.push(`| medium | ${bySev.medium} |`);
lines.push(`| low | ${bySev.low} |`);
lines.push(`| info | ${bySev.info} |`);
lines.push("");

if (findings.length === 0) {
  lines.push("## ממצאים");
  lines.push("");
  lines.push("**אין ממצאים.** כל בקרה אינטראקטיבית ב-`src/**` נושאת שם נגיש, מטפל אמיתי, " +
    "או סיבת-השבתה נראית. אין בקרות מתות.");
} else {
  lines.push("## ממצאים מפורטים");
  lines.push("");
  lines.push("| # | קובץ:שורה | בקרה | חומרה | חוק | סיבה | Owner | פתרון | בדיקת אימות |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  findings.forEach((f, i) => {
    const resolution =
      f.severity === "high"
        ? "לתקן במקור (queue → Lead)"
        : f.severity === "info"
          ? "מקובל — מתועד"
          : "בדיקה ידנית / החלטת Lead";
    const verif =
      "e2e/final-interactions (per-route control walk) + tests/final-interactions";
    lines.push(
      `| ${i + 1} | \`${f.rel}:${f.line}\` | ${f.control} | ${f.severity} | ${f.rule} ${RULE_TITLES[f.rule] ?? ""} | ${f.reason} | ${ownerFor(f.rel)} | ${resolution} | ${verif} |`,
    );
  });
}
lines.push("");
lines.push("## מקרא חוקים");
lines.push("");
lines.push("| חוק | תיאור | חומרה בסיס |");
lines.push("|---|---|---|");
const RULE_SEV = { R01: "high", R02: "high", R03: "high", R04: "high", R05: "high",
  R06: "high", R07: "medium", R08: "medium", R09: "high", R10: "high", R11: "medium",
  R12: "low", R13: "medium", R14: "medium", R15: "medium", R16: "high", R17: "high" };
for (const [rule, title] of Object.entries(RULE_TITLES)) {
  lines.push(`| ${rule} | ${title} | ${RULE_SEV[rule]} |`);
}
lines.push("");

if (!args.has("--no-write")) {
  writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
}

console.log("=== STATIC CONTROL AUDITOR — W9-A ===");
console.log(`files scanned: ${files.length}`);
console.log(
  `controls: OsButton=${osButtons} button=${nativeButtons} a=${links} Modal=${modals} Drawer=${drawers} form=${forms}`,
);
console.log(`findings: high=${bySev.high} medium=${bySev.medium} low=${bySev.low} info=${bySev.info}`);
if (!args.has("--no-write")) console.log(`inventory written: ${relative(ROOT, OUT).replaceAll("\\", "/")}`);
for (const f of findings) {
  console.log(`  [${f.severity}] ${f.rule} ${f.rel}:${f.line} ${f.control} — ${f.reason}`);
}
process.exit(bySev.high > 0 ? 1 : 0);
