# WAVE 7 — CONTENT DONOR MATRIX

> W7 Content-Inventory agent · 23.07.2026 · READ-ONLY inventory (no code changed, nothing committed)
>
> Source keys:
>
> - **V4** = `Desktop/CRM -TERAGON/CRM/מערכת_טרגון_מקצועית_V4.html` — submission-gate screen; ALL tables live in the inline `<script>` arrays (`deliverables`, `quality`, `stages`, `personas`, `metrics`, `tasks`), not in the HTML body.
> - **SNAP** = `Desktop/teragon-final/docs/donor-snapshot/מערכת_טרגון_SNAPSHOT_20260722.html` — operational CRM demo. **Correction to WAVE_7_BASELINE:** the snapshot does NOT contain the 12-deliverables / G1-G6 / persona-matrix / rubric tables — those are only in **V4** and the training docx. SNAP contributes the metrics/ROI/NSM screen (lines ~2141–2275 of its script), the login proof-bar, and the 3-tier monitor table.
> - **PKG** = `teragon-final/docs/training/חבילת_הטמעה_מערכת_טרגון.docx` (12 chapters, main adoption package)
> - **SUP** = `teragon-final/docs/training/השלמת_חבילת_הטמעה_טרגון.docx` (supplement: 12-deliverable coverage table, 7-persona map, 6-step plan w/ owners, usage policy)
> - **SCR** = `teragon-final/docs/training/חומרי_הדרכה_ותסריטים_טרגון.docx` (README + full 10-min training script + full 90-sec microlearning script)
> - **PDF** = `teragon-final/docs/training/תכנית_הטמעה_וחומרי_הדרכה.pdf` — 13 MB, compressed streams with embedded fonts; text layer not trivially extractable. **Existence noted; not extracted.** Treat as print/export duplicate of PKG/SUP — do not mine independently.
> - **PPTX** = `teragon-final/docs/presentations/*.pptx` (4 decks, slide titles extracted; structure reference only)
> - **SPEC** = `docs/SCREEN_SPECS_HE.md` chapters 12–19 (binding screen specs)
> - **SEED** = `src/repositories/seed/seedData.ts` (PERSONAS ln 3397, TRAINING_MATERIALS ln 3470, IMPLEMENTATION_STAGES ln 3603, STAGE_GATES ln 3672, SUPPORT_REQUESTS ln 3746, METRIC_DEFINITIONS ln 3187, USERS ln 97)
>
> Verdicts: **REWRITE** = rewrite into typed records (content reusable, never copy code) · **REF** = reference-only (structure/inspiration) · **REJECT** = do not import.
>
> Global rule (from WAVE_7_BASELINE honesty rules): every donor numeric claim (ROI, WAU, NPS, ₪3,840, −50%, 20min→<1min…) is **DO-NOT-IMPORT-AS-MEASURED**. Allowed only as `יעד פיילוט` records with an explicit source note; measured value = "טרם נמדד".

---

## 1. The 12 deliverables (→ `submissionDeliverables`, route `/submission`)

Canonical list = V4 `deliverables` array (12 rows: #, name, status, package location). SUP part A carries the same 12 with the strategy/execution split (6+6). Per-deliverable content donors:

| # | Deliverable (V4)               | Content donor(s)                                              | Target entity / route                                | Verdict | Notes                                                                                                                              |
| - | ------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1 | One-Pager לפתרון               | PKG ch.1 (solution name, problem-with-number, why-not-generic) | submissionDeliverables + evidence doc                | REWRITE | The "1,000 customers / 500+ graduates / 8h manual per week" numbers are donor claims → import as הצהרת רקע, not measured metrics.  |
| 2 | מפת 7 פרסונות                  | SUP part B (7-persona table) + V4 `personas` array            | `personas` records / `/personas`                     | REWRITE | ⚠ Conflicts with existing SEED personas — see CONTRADICTION C1 before writing.                                                     |
| 3 | Training Matrix                | PKG §5.1 (5-row role matrix) + SUP part B (7-persona matrix)  | personas.trainingTrack + trainingMaterials links      | REWRITE | Two donor matrices disagree on durations (C7).                                                                                     |
| 4 | תכנית הטמעה ב-6 שלבים          | SUP part C (owners+weeks) + V4 `stages` array                 | `implementationStages`/`implementationProgrammes`     | REWRITE | ⚠ Three competing 6-stage models (C4). Adoption-plan stages are a NEW programme, not a rewrite of the seeded build-plan stages.    |
| 5 | Stage Gates + ראיות            | PKG ch.9 (G1–G6 + exit criteria + NIST function per gate)     | `stageGates` (adoption set) + `implementationEvidence`| REWRITE | Gate criteria contain donor numeric thresholds (WAU≥70%, NPS≥7…) → store as criterion text tagged יעד פיילוט; evidence starts empty.|
| 6 | מדדי הצלחה ב-3 רמות            | PKG ch.7 (L1/L2/L3 tables) + SNAP monitor table + V4 `metrics`| `metricDefinitions` + baseline table on `/analytics` & `/submission` | REWRITE | All values → target-only. SNAP's מחושב/יעד פיילוט/מבני source-tagging is the pattern to keep.                                     |
| 7 | Quick Start                    | PKG §6.1 ("3 הפעולות הראשונות של צחי") + SPEC ch.16 3 actions | `/quick-start` content records                        | REWRITE | SPEC ch.16 actions differ from PKG's (C9) — SPEC wins; PKG text reusable for the "expected result/common mistake" fields.          |
| 8 | נוהל שימוש נכון                | SUP part D (מותר/דורש אישור/אסור + always-check table)        | `/quick-start` usage-policy records                   | REWRITE | Best single donor block in the corpus; aligns with SPEC ch.16 מותר/חובה לבדוק/אסור lists (minor wording merge needed).             |
| 9 | FAQ והתנגדויות                 | PKG ch.8 (5 objections × LACE, full Hebrew sentences)         | `objections` / `/faq`                                 | REWRITE | ⚠ LACE letter mismatch (C8) and objection-count mismatch 5 vs 7 (C6).                                                              |
| 10 | תסריט הדרכה 10 דקות           | SCR part B (complete timestamped script)                      | `trainingMaterials` record (תסריט הדרכה) + evidence   | REWRITE | Fully written, production-ready; import verbatim as material content.                                                              |
| 11 | Microlearning 90 שניות        | SCR part C (VO + on-screen table)                             | `trainingMaterials` record (סרטון Microlearning)      | REWRITE | Fully written; the video itself does not exist — status must say טיוטת תסריט, not "סרטון קיים".                                    |
| 12 | תמיכה לאחר השקה               | PKG §10.1 (Champions/SLA/Cadence) + SPEC ch.18 3-tier model   | `supportRequests` config + `/support`                 | REWRITE | ⚠ Tier definitions and SLAs conflict (C10) — SPEC ch.18 wins.                                                                      |

## 2. The 8-item quality rubric (→ `qualityValidations`, `/submission`)

| Block | Source | Target | Verdict | Notes |
| ----- | ------ | ------ | ------- | ----- |
| 8 criteria names | SPEC ch.19 (בהירות, רלוונטיות, פרסונליזציה, בטיחות, אחריות, תרגול, מדידה, תחזוקה) | qualityValidations | REWRITE | Identical order in V4 `quality`. |
| Per-criterion test sentence | V4 `quality` (e.g. "משתמש מבין מה לעשות תוך 3 דקות") | qualityValidations.description | REWRITE | Good operational phrasing; validation evidence itself starts empty ("חסרה ראיה") per honesty rules — no 8/8 hardcode. |

## 3. Seven personas (→ `personas`, `/personas`)

| Block | Source | Target | Verdict | Notes |
| ----- | ------ | ------ | ------- | ----- |
| Adoption persona set (משתמש קצה/צחי, מנהל צוות, הנהלה, IT/Security, Legal/Compliance, Champion, המתנגד) | SUP part B table (interest + duration + material + success metric per persona) ≡ V4 `personas` ≡ SPEC ch.13 lanes | personas (adoption fields) | REWRITE | This is the canonical Wave-7 set per SPEC ch.13. See C1: it is NOT the seeded persona set. |
| 4-persona deep profiles (role, goal, adoption barrier, dedicated track, first-AI-capability) | PKG ch.4 (צחי, מכירות, תמיכה, מדריך) | personas detail fields (key concern / adoption barrier / desired value per SPEC ch.13 card) | REWRITE | Richest barrier/value text; maps onto 4 of the 7 lanes. הנהלה/IT/Legal/Champion/מתנגד barrier text comes from SUP only (thinner) — gap G2. |
| Champion + המתנגד rationale paragraphs | SUP part B closing notes | personas.description | REWRITE | "ההתנגדות היא מידע" framing — good copy. |
| SEED personas per-1…per-7 (role-based product personas) | SEED ln 3397–3468 | keep as-is for existing screens | REF | Do not overwrite; resolution in C1 decides whether Wave 7 adds a second collection view or migrates. |

## 4. Six stages + six gates (→ `implementationStages`, `stageGates`, `rolloutWaves`, `/implementation`, `/stage-gates`)

| Block | Source | Target | Verdict | Notes |
| ----- | ------ | ------ | ------- | ----- |
| Adoption stages 1–6 (Readiness→Operationalized) w/ Owner + week ranges + תכולה | SUP part C table | implementationStages (adoption programme) | REWRITE | Owners are "צחי" and "מטמיע" (unnamed AI-implementer) → C3: every owner must resolve to a seeded named user or "לא הוקצה אחראי". Dates are week-relative → convert to explicit planned dates with source note. |
| SPEC ch.12 stage names (בעיה ותוצאה עסקית … שגרה ובקרה ושיפור מתמשך) | SPEC ch.12 | implementationStages display names | REWRITE | SPEC is binding for the screen; SUP/V4 English names (Readiness…) become secondary labels. See C4. |
| G1–G6 exit criteria + NIST function column | PKG ch.9 table | stageGates.criteria + governance link | REWRITE | Numeric thresholds inside criteria → tag יעד פיילוט. "שאלת הסיום" (בשגרה או בקופסה) → gate-6 description. |
| V4 `stages` compact rows (G-label per stage, e.g. "G4: WAU≥70%, NPS≥7") | V4 script | stageGates summary line | REWRITE | Same numbers — same DO-NOT-IMPORT-AS-MEASURED handling. |
| Rollout waves (Champions → הפעלה שגרתית, 5 waves) + "בטרגון" mapping column | SUP part C wave model + SPEC ch.12 wave list | rolloutWaves | REWRITE | Import ONLY the "בטרגון" column (צחי לבד → צוות ראשון → …). The generic sizes (5–10 / 20–40 / ~100 / ~500 / 5,000+) are course-template scale, absurd for a ~5-person business → **REJECT** the size numbers (C11). |
| "חוק התאריך" (fixed decision date per stage; end of week 7 = decision point) | SUP part C | implementationDecisions seed rule + `/implementation` intelligence panel | REWRITE | Direct match to SPEC ch.12 "next decision date". |
| SEED IMPLEMENTATION_STAGES (תשתית ונתונים … הטמעה והשקה, build plan) + SEED STAGE_GATES (שער תשתית … שער השקה) | SEED ln 3603–3744 | keep — this is the *build* programme | REF | Two programmes must coexist or be renamed distinctly; see C4 resolution. |
| Risk Register (6 adoption risks × probability/impact/mitigation) | PKG ch.11 | implementationRisks | REWRITE | Fully reusable; ties to SPEC ch.12 "risks" card field. |
| Kirkpatrick-L4 framing + NIST AI RMF mapping (Govern/Map/Measure/Manage) | PKG ch.7, §10.2 | governance link text on `/implementation` + `/stage-gates` | REWRITE | Governance narrative — no numbers involved. |

## 5. Thirteen training materials (→ `trainingMaterials`, `/training-materials`)

| Block | Source | Target | Verdict | Notes |
| ----- | ------ | ------ | ------- | ----- |
| Canonical 13-material list (Section A 1–7 reading, Section B 8–13 practice) | SPEC ch.15 | trainingMaterials canonical titles | REWRITE | Binding list. See C5: the 13 seeded materials are DIFFERENT items. |
| 6 immediately-usable materials w/ persona/format/production tool (Canva/Synthesia/Gamma/NotebookLM) | PKG ch.6 table | trainingMaterials records for SPEC items 3,5,6,10,11 + metadata | REWRITE | Production-tool column → notes field. Only 6 of 13 exist as authored content — the other 7 are gaps (G3). |
| Quick Start card content ("3 הפעולות הראשונות של צחי") | PKG §6.1 | material #3 (Quick Start) content | REWRITE | Cross-check with SPEC ch.16 actions (C9). |
| 10-min training script (full text) | SCR part B | material #8 (תסריט הדרכה) content | REWRITE | Complete; also feeds `/submission` deliverable #10. |
| 90-sec microlearning script (VO + visuals table + production tip) | SCR part C | material #10 (סרטוני Microlearning) content | REWRITE | Script exists; video does not → status חלקי. |
| FAQ/objections content | PKG ch.8 | material #6 (FAQ והתנגדויות) | REWRITE | Same source as `/faq`. |
| Usage-policy content | SUP part D | material #4 (נוהל שימוש נכון) | REWRITE | |
| Support procedure | PKG §10.1 | material #12 (מסמך תמיכה ותקלות) | REWRITE | |
| SEED TRAINING_MATERIALS tm-1…tm-13 (system-screen tutorials: סיור במרכז הפיקוד, ניהול לידים…) | SEED ln 3470–3601 | keep as product-tutorial materials | REF | These are usage tutorials for the OS screens, not the assignment's 13-material canon. Resolution in C5. |
| Card metadata requirements (preview, persona, owner, version, approval, linked stage…) | SPEC ch.15 | trainingMaterials schema fields | REF | Spec-driven; donor has no versions/approvals → those fields start "ממתין לאישור". |

## 6. Metrics & baselines (→ `metricDefinitions`, `pilotDefinitions`, `/analytics`, `/submission`)

| Block | Source | Target | Verdict | Notes |
| ----- | ------ | ------ | ------- | ----- |
| 3-level metric frame: L1 הדרכה (confidence +1.5, practice 80%, completion 85%) / L2 אימוץ (WAU≥70%, usage≥3/wk, −50% how-do-I, Human-Review 25%→12%, ≥5 ideas/mo) / L3 ערך עסקי (ROI 3X/12mo, ₪3,840/mo, lost leads ≈0, quote 20min→<1min, NPS +10..+20) | PKG ch.7 | metricDefinitions (new adoption-level defs) + pilot targets | REWRITE — **targets only** | Every number = יעד פיילוט with source note "PKG ch.7"; observed value = "טרם נמדד". NPS conflict with V4 (C12). |
| Baseline 5-row table (זמן הצעה, לידים אבודים, WAU, NPS פיילוט, פניות איך-עושים × Baseline/יעד/איך מודדים) | V4 `metrics` array | the "5" in counts 7/6/6/13/12/**5** → baseline table on `/submission` + `/analytics` | REWRITE — targets only | Baselines are "לא ידוע/אין מדידה/לא קיים" in the donor itself — import those honest baseline states verbatim. |
| ROI derivation (8h/wk × ₪120 × 4 = ₪3,840/mo, sourced "אפיון §1.2", labeled editable pilot target) | SNAP metrics fn + PKG §7.3 | ROI card, `/analytics` | REWRITE — target only | The derivation formula + its explicit sourcing is the reusable asset, not the number. |
| מחושב / יעד פיילוט / מבני source tagging + pass-count counts only measurable rows | SNAP monitor table | metric display contract everywhere | REWRITE (as pattern/spec) | The single most important honesty pattern in the donors — matches SEED's "טרם נמדד" discipline. |
| NSM (לקוחות פעילים ומרוצים, derived not hardcoded) + cohort-based conversion comment | SNAP | `/analytics` (Wave 9 concern, referenced by submission) | REF | Already catalogued in LEGACY_DONOR_MATRIX Wave 9. |
| V4 dashboard KPIs ("3,840" shown as achieved saving, "יעד אימוץ WAU 70%+", "0 לידים אבודים") | V4 dashboard page | — | **REJECT as measured** | These are the "fake metrics" — presented KPI-style as if real. Only re-importable via the targets path above. |
| SNAP TRENDS (revenue 12,400→38,400) / FUNNEL (120→19) / "21 מסכי מערכת · 8 יכולות AI" proof bar | SNAP | — | REJECT for Wave 7 | Demo BI series & marketing proof numbers; not adoption evidence. (38,400 = the "3.8K"-family number — never present as measured.) |
| SEED METRIC_DEFINITIONS md-1…md-9 + observations (agent_precision/response_time = טרם נמדד) | SEED ln 3187–3305 | keep; extend, don't contradict | REF | Seed already models honest non-measurement — new adoption metrics must follow the same shape. |

## 7. FAQ / LACE objections (→ `objections`, `/faq`)

| Block | Source | Target | Verdict | Notes |
| ----- | ------ | ------ | ------- | ----- |
| 5 objections, each with persona + full 4-step LACE response in Hebrew | PKG ch.8 | objections records | REWRITE | Ready sentences for the SPEC ch.17 "suggested Hebrew sentence" per LACE step. |
| 7-objection list ("זה יחליף אותי" … "כבר ניסינו AI") | SPEC ch.17 | objections canonical list | REWRITE | 2 objections have no donor response content (gap G4). |
| LACE step definitions | SPEC ch.17 (Listen/Acknowledge/**Confirm**/Explore) vs PKG (Listen/Acknowledge/**Clarify**/Explore) | objections schema | REWRITE after C8 resolution | |
| Objection-handling principle ("התנגדות היא מידע") + ADKAR-vs-LACE methodological note | PKG ch.8 intro, SCR part A note | `/faq` page intro copy | REWRITE | |
| Conversation-simulator spec | SPEC ch.17 left panel | `/faq` AI panel | REF | No donor content; fresh authoring + AI wiring. |

## 8. Support tiers (→ `supportRequests` + tier config, `/support`)

| Block | Source | Target | Verdict | Notes |
| ----- | ------ | ------ | ------- | ----- |
| 3-tier model w/ SLAs (Tier1 שירות עצמי/מיידי · Tier2 Champions/שעתיים · Tier3 Implementer+IT+Compliance/יום עבודה) | SPEC ch.18 | support tier config | REWRITE | Binding. |
| Donor tier/SLA variant (Tier1 FAQ-in-system · Tier2 Cheat-Sheet+videos · Tier3 מטמיע; SLA 4h blocking / 24h how-to; weekly cadence + monthly review) | PKG §10.1 | tier descriptions + cadence records | REWRITE after C10 | Cadence (בדיקה שבועית/סקירה חודשית) is complementary, import it. |
| Champion definition ("צחי הוא ה-Champion הראשון…") | PKG §10.1 | `/support` + persona Champion card | REWRITE | |
| SEED SUPPORT_REQUESTS sr-1…sr-3 | SEED ln 3746 | keep as demo queue | REF | Add tier/SLA fields per SPEC ch.18 request card. |
| "75% מהאימוץ קורה אחרי ההדרכה" principle | PKG ch.0/§10 | `/support` intro copy | REWRITE | Framing claim from the course, not a Teragon measurement — attribute to the course material. |

## 9. Presentation sections (→ `presentationSections`, `/submission/presentation`)

| Block | Source | Target | Verdict | Notes |
| ----- | ------ | ------ | ------- | ----- |
| 5-slide assignment deck (הבעיה והקהל / פרסונות / תכנית הטמעה / דמו חומר / מדדים+סיכון) | PPTX `הצגת_מטלה_5_שקופיות_טרגון.pptx` | presentationSections (5 sections) — matches SPEC ch.19 "5 שקפים · 10 דקות" | REWRITE (titles/structure), REF (visuals) | Canonical presentation = HTML per WAVE_7_BASELINE; pptx is structure donor only. |
| 15-slide adoption deck (GUIDING PRINCIPLE → CHECKLIST → "ADOPTION SYSTEM · NOT A TOOL") | PPTX `מצגת_הטמעה_מערכת_טרגון.pptx` | narrative order for `/implementation` + presentation notes | REF | |
| 8-slide training deck (WHY/PROCESS/YOU/HOW/SAFETY/EXPECTED/NOT-A-TOOL) | PPTX `מצגת_הדרכה_טרגון.pptx` | trainingMaterials #9 (מצגת הדרכה) structure | REF | The authored "מצגת הדרכה" deliverable — counts as material #9 per SUP part A note. |
| 14-slide business deck (בעיה → דמו חי → מדדים → תכנית → סיכונים → תנאי מעבר) | PPTX `מצגת_טרגון.pptx` | presentation readiness / דמו מסלול reference | REF | |
| Presentation-readiness checklist (5 slides, 10 min, presenter notes, demo path, backup shots, deploy URL, build/QA/security status) | SPEC ch.19 | presentationSections + submissionSnapshots fields | REF | Spec-driven; statuses must come from real gate runs. |

## 10. Cross-cutting / rejected blocks

| Block | Source | Verdict | Notes |
| ----- | ------ | ------- | ----- |
| V4 intake classifier (else-if precedence) & `tasks` demo queue | V4 script | REF / REJECT for W7 | Already catalogued for Wave 5/6 in LEGACY_DONOR_MATRIX; not Wave-7 content. |
| SNAP students/courses/CRM seed (דנה כהן, יואב לוי…) | SNAP | REF | Already imported in earlier waves; identical names in SEED confirm lineage. |
| "צחי זוסטהיים · 04-6577111" signature in SNAP quote-closing | SNAP ln ~2388 | REJECT spelling | See CONTRADICTION C2 — canonical spelling is the SEED's. |
| EU AI Act §4 claim ("הדרכה לפי פרסונה היא חובה") | SUP part B | REWRITE w/ caution | Keep as course-material citation, not our legal claim. |
| PDF תכנית_הטמעה_וחומרי_הדרכה.pdf | training dir | REF (existence only) | Listed as evidence artifact; content assumed = PKG/SUP. |

---

Companion docs: `WAVE_7_CONTRADICTION_REPORT.md` (C1–C13 resolution queue) · `WAVE_7_REQUIREMENT_TRACEABILITY.md` (12+8+counts → routes/workstreams → gaps).
