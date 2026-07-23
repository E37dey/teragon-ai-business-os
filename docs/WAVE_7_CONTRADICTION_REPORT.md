# WAVE 7 — CONTRADICTION REPORT (human-review resolution queue)

> W7 Content-Inventory agent · 23.07.2026 · Compares donors (V4 / SNAP / PKG / SUP / SCR / PPTX) vs SEED (`src/repositories/seed/seedData.ts`) vs SPEC (`docs/SCREEN_SPECS_HE.md` ch.12–19).
> Conservative default everywhere: **the Wave-7 SPEC value wins; any measured claim → "טרם נמדד"; any unresolved owner → "לא הוקצה אחראי".**
> Source keys as in `WAVE_7_CONTENT_DONOR_MATRIX.md`.

## Severity legend
🔴 blocks record-writing until resolved · 🟠 resolve during build · 🟡 note-and-proceed with conservative default

---

## C1 🔴 Two different "7 personas"

- **SEED** (per-1…per-7): המנכ"ל המתזמר, אשת המכירות, המדריך, איש התמיכה, מנהלת המערכת, התלמידה, השותף החיצוני — role-based product personas mapped to system roles.
- **SPEC ch.13 ≡ V4 ≡ SUP**: משתמש קצה (צחי), מנהל צוות, הנהלה, IT/אבטחת מידע, Legal/Compliance, Champion · השגריר, המתנגד — adoption/change-management personas.
- **PKG ch.4** has only **4** deep personas (צחי, מכירות, תמיכה, מדריך) — pre-supplement draft.
- Both sets count 7, so "7 פרסונות" passes numerically either way — but they are different taxonomies.
- **Resolution (recommended):** SPEC ch.13 set is canonical for `/personas` and for deliverable #2 ("מפת 7 פרסונות"). Do NOT delete/overwrite seeded per-1…per-7 blindly — decide: (a) migrate seed personas to the SPEC set (breaking any existing screens referencing per-*), or (b) keep seeded records and re-purpose fields. Requires Lead sign-off because `personas` is a shared seeded collection. PKG's 4-persona texts backfill barrier/value fields for 4 of the 7 lanes.

## C2 🔴 CEO surname spelling

- SEED `CEO_NAME` = **"צחי זוסטייהם"** (canonical identity per baseline honesty rules).
- SNAP quote-closing signature = **"צחי זוסטהיים"** (+ phone 04-6577111 not present in seed; seed has 050-2000001 / tzachi@teragon.co.il).
- **Resolution:** SEED spelling everywhere; never import the SNAP signature line verbatim. Phone/email: use seeded values only.

## C3 🔴 Owner names — "מטמיע" is not a person

- SUP part C assigns stage owners: "צחי", "מטמיע", "צחי + מטמיע". PKG Tier-3 = "פנייה לאיש ההטמעה". No named implementer exists in SEED USERS (צחי זוסטייהם, מאיה ברק, אורן שגב, רן אלמוג, נעה פרידמן).
- Baseline rule: owners must be named seeded users.
- **Scan result for suspicious names:** searched all donors + extracted docx/pptx text for **איליה / אלי / דניאל / בניימן / בנימין / טוגלמן** — **no occurrences found** in any Wave-7 donor source. Non-seeded person-like names that DO appear in SNAP are the demo students/customers (דנה כהן, יואב לוי, מיכל ישראלי, רועי מזרחי, תמר אברהם, plus customer/lead names) — these match SEED students/leads lineage and are synthetic; fine in their own collections, but none of them may be imported as an implementation OWNER.
- **Resolution:** map "מטמיע" → a seeded user chosen by the operator (likely נעה פרידמן as מנהלת מערכת, or צחי), else store "לא הוקצה אחראי". Never invent a name.

## C4 🔴 Three competing 6-stage implementation models

| Model | Stages | Nature |
| ----- | ------ | ------ |
| SEED IMPLEMENTATION_STAGES | תשתית ונתונים → מסכי ליבה → למידה ושירות → סוכני AI → זיכרון/ידע/דוחות → הטמעה והשקה | software build plan (dates d(-10)…d(+80) from anchor 2026-07-22) |
| SPEC ch.12 | בעיה ותוצאה עסקית → AS-IS/TO-BE → שבע פרסונות ותכנית הדרכה → פיילוט מבוקר → הרחבה בגלים → שגרה ובקרה ושיפור מתמשך | adoption roadmap (binding for `/implementation`) |
| SUP/V4/PKG | Readiness → Training Design → Pilot Ready → Pilot Passed → Scale Ready → Operationalized (weeks 0–9+) | assignment adoption plan |
- SEED STAGE_GATES (שער תשתית…שער השקה, build criteria like "typecheck ירוק") likewise differ from donor G1–G6 (adoption criteria like "WAU≥70%").
- **Resolution:** `/implementation` + `/stage-gates` display the **SPEC ch.12/14 adoption model**; SUP/V4 stage content (owners, week offsets, gate evidence) is rewritten into it (SPEC stage names primary, English donor names as sub-labels — the two adoption models align 1:1 by order). The seeded build-plan stages/gates must be either kept as a separate programme (`implementationProgrammes` supports this) or explicitly renamed so the UI never shows two unrelated "שלב 3" side by side. Lead decision required on coexistence vs migration.

## C5 🟠 Thirteen materials — two different lists

- SPEC ch.15 canon: 7 reading (מסמך מטרת הפתרון, מפת TO-BE, Quick Start, נוהל שימוש נכון, ספריית תרחישים ופרומפטים, FAQ, Risk & Governance Sheet) + 6 practice (תסריט הדרכה, מצגת הדרכה, סרטוני Microlearning, תרגילי Hands-on, מסמך תמיכה ותקלות, דשבורד אימוץ).
- SEED TRAINING_MATERIALS (tm-1…tm-13): system-screen tutorials (סיור במרכז הפיקוד, ניהול לידים מקצה לקצה…) — 13 items but a DIFFERENT list.
- PKG ch.6 has only **6** authored materials.
- **Resolution:** `/training-materials` must show the SPEC 13. Options: replace seed list, or model SPEC-13 as the canonical catalogue with seeded tutorials attached as sub-materials/evidence. Default: SPEC-13 canonical; keep tm-* records but re-link (they satisfy "ספריית תרחישים"/hands-on items partially). Materials with no authored content get status **חסר** — no fake "מכוסה".

## C6 🟠 Objection count: 5 (PKG, "5 התנגדויות + LACE" per assignment) vs 7 (SPEC ch.17 list)

- **Resolution:** SPEC's 7-objection list is the screen content; PKG's 5 authored LACE responses map onto 5 of them; the remaining 2 ("זה מסוכן משפטית" partially covered by Legal persona text, "כבר ניסינו AI" uncovered) need fresh authoring (gap G4). Do not display a response as authored where none exists.

## C7 🟠 Training durations disagree per persona

- PKG §5.1 (4-persona matrix): צחי **90 דק׳ + שבוע ליווי**, מכירות 45, תמיכה 30, מדריך 45, תלמיד 10.
- SUP/V4 (7-persona matrix): משתמש קצה (צחי) **60 דק׳**, מנהל צוות 45, הנהלה 20, IT 60, Legal 60, Champion 90, מתנגד 30.
- SEED trainingTrack strings ("מסלול מנהלים — 3 מפגשים"…) are a third format.
- **Resolution:** SUP/V4 7-persona durations win (they match the SPEC persona set); PKG's "90 דק׳+ליווי שבוע" survives as the description of the צחי 1:1 onboarding session inside the track, not as the matrix number. Durations are plans, not measurements — no conflict with honesty rules.

## C8 🟠 LACE letter "C": Confirm (SPEC ch.17) vs Clarify (PKG ch.8, all 5 responses use "Clarify")

- **Resolution:** conservative default = SPEC wording (**Confirm**) on-screen; PKG's Clarify sentences imported as the Confirm-step content (they function as clarifying/confirming answers). Note the discrepancy in the objection record source note.

## C9 🟡 Quick-Start "3 actions" differ

- SPEC ch.16: פתח לקוח או פנייה · בקש סיכום או המלצה · בדוק ראיות ואשר.
- PKG §6.1: פתח "מה לעשות היום" · קלוט פנייה למוקד ואשר סיווג · צור הצעה בסטודיו ושלח.
- **Resolution:** SPEC actions are the screen's 3 actions (they match teragon-os screens); PKG text reusable for "expected result / common mistake / time required" sub-fields.

## C10 🟡 Support tiers/SLA conflict

- SPEC ch.18: T1 שירות עצמי (FAQ/KB/סוכן AI, SLA מיידי) · T2 Champions (צ'אט, SLA שעתיים) · T3 AI Implementer+IT+Compliance (SLA יום עבודה).
- PKG §10.1: T1 שו"ת בתוך המערכת · T2 Cheat-Sheet+סרטונים · T3 איש ההטמעה; SLA: חוסם 4 שעות / "איך עושים" 24 שעות.
- **Resolution:** SPEC tier model + SLAs win. PKG's cadence (בדיקת שימוש שבועית, סקירת מדדים חודשית) is complementary — import. PKG SLAs recorded as historical draft in source notes only.

## C11 🟡 Rollout wave sizes are template-scale, not Teragon-scale

- SUP part C: Champions (5–10) → Early Adopters (20–40) → ~100 → ~500 → ארגוני (5,000+). Teragon is a ~1–5-person business with 500+ course graduates.
- **Resolution:** import only the "בטרגון" mapping (צחי לבד → איש מכירות/תמיכה ראשון → כל הצוות → קורסים+מדריכים → הפעלה שגרתית מלאה) + SPEC ch.12 wave names. REJECT the generic size numbers.

## C12 🟡 NPS target inconsistency inside the donors

- V4 gate G4 & baseline table: **NPS ≥ 7** (0–10 single-question scale). PKG §7.3: **NPS +10 עד +20 נקודות** (classic −100..+100 delta). SNAP computes NPS as %pos−%neg (−100..+100).
- **Resolution:** these are different NPS conventions. Pick ONE (recommend the −100..+100 convention already computed in SNAP/Wave-9 analytics; express pilot target as "שיפור +10 נק׳ מה-baseline"), record V4's "≥7" as the survey-question form in the source note. Either way: יעד פיילוט, baseline "טרם נמדד".

## C13 🟡 Baseline "quote takes 20 minutes" told three ways

- V4 metrics: 20 דקות · PKG §3.2 table: 10–20 דק׳ · SCR script: "מה שלקח לך 15 דקות" · SCR video: "עשר דקות".
- Similarly "פניות חוזרות": Champion metric −40% (SUP) vs how-do-I tickets −50% (PKG/V4).
- **Resolution:** none of these was ever measured. Baseline field = "לא נמדד — הערכת בעל העסק 10–20 דק׳" (range, attributed); scripts may keep their rhetorical numbers ONLY inside quoted training-script content, never as metric records. −50% is the canonical pilot target (assignment checklist); −40% noted as the Champion-persona success metric variant.

---

## Blanket rulings (apply regardless of the queue)

1. **All donor numeric claims are DO-NOT-IMPORT-AS-MEASURED**: ₪3,840/מו׳ (=8×120×4), ROI 3X, WAU ≥70%, NPS ≥7/+10..20, −50% פניות, 0 לידים אבודים, 80%/85%/+1.5 (L1), ≥3 שימושים/שבוע, Human-Review 25%→12%, ≥5 הצעות/חודש, "מעל 1,000 לקוחות", "500+ בוגרים", "8 שעות/שבוע", "75% מהאימוץ אחרי ההדרכה", "כ-70% מכישלונות AI הם אנושיים", TRENDS revenue 12.4K–38.4K, FUNNEL 120→19, "21 מסכים/8 יכולות/12/12" proof-bar. Import path: יעד פיילוט / הצהרת מקור with note; measured value = **"טרם נמדד"**. The V4 dashboard KPI presentation of 3,840 & WAU 70%+ as live numbers is the exact anti-pattern Wave 7 exists to avoid.
2. **12/12 "מכוסה" statuses in V4 are self-graded**, not validated — `/submission` statuses must be recomputed from real linked evidence; expect חלקי/חסר initially (e.g., microlearning video not produced, adoption dashboard not built).
3. **Owners**: only צחי זוסטייהם / מאיה ברק / אורן שגב / רן אלמוג / נעה פרידמן or "לא הוקצה אחראי". "מטמיע" is a role, not a person. No איליה/אלי/דניאל/בניימן/טוגלמן appear in any donor — if any such name surfaces later in the PDF or elsewhere, REJECT on sight.
4. **Dates**: donor week-offsets (שבוע 0–9+) are relative to an unstated pilot start; seeded stages are relative to SEED_ANCHOR 2026-07-22. Any concrete date written into Wave-7 records must state its derivation; no invented calendar dates.
