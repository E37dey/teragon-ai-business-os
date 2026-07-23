# WAVE 7 — REQUIREMENT TRACEABILITY

> W7 Content-Inventory agent · 23.07.2026 · 12 deliverables + 8 quality checks + counts (7/6/6/13/12/5) → route/entity/workstream → donor availability → fresh-authoring gaps.
> Routes verified against `src/app/routes.ts` (wave:7 = /implementation, /personas, /stage-gates, /training-materials, /quick-start, /faq, /support, /submission, /submission/presentation). Collections verified against `src/repositories/collections.ts` (Wave-7 additions lines 80–99).
> **Workstream letters A–F are this agent's inferred grouping by route/domain** (no A–F definition found in-repo; INTEGRATION_QUEUE_W7 is empty). Lead may re-letter — the route/entity mapping is the stable part.

## Inferred workstreams

| WS | Domain | Routes | Primary entities |
| -- | ------ | ------ | ---------------- |
| A | תכנית ההטמעה | /implementation | implementationProgrammes/Stages/Milestones/Risks/Evidence/Decisions, rolloutWaves, pilotDefinitions/Results |
| B | פרסונות והדרכה | /personas, /training-materials | personas, trainingMaterials |
| C | שערי מעבר | /stage-gates | stageGates, implementationEvidence |
| D | שימוש נכון ו-FAQ | /quick-start, /faq | quick-start content records, objections |
| E | תמיכה | /support | supportRequests + tier config |
| F | הגשה ומצגת | /submission, /submission/presentation | submissionPackages/Deliverables/Evidence/Validations/Blockers/Snapshots, presentationSections, qualityValidations |

## The 12 deliverables

| # | Deliverable | Route / entity | WS | Donor content available? | Gap → fresh authoring |
| - | ----------- | -------------- | -- | ------------------------ | --------------------- |
| 1 | One-Pager לפתרון | /submission → submissionDeliverables (+evidence doc) | F | ✅ PKG ch.1 full text | Numbers must be re-labeled as claims; render as printable one-pager view |
| 2 | מפת 7 פרסונות | /personas → personas | B | ✅ SUP part B + V4 (matrix); ⚠ C1 persona-set conflict | Barrier/value depth for הנהלה, IT, Legal, Champion, מתנגד (PKG covers only 4 lanes) — **G2** |
| 3 | Training Matrix | /personas (matrix table) → personas×materials | B | ✅ SUP/V4 matrix (7 rows) | Per-persona "תרגול" + "חומר נדרש" links to the SPEC-13 materials — partial |
| 4 | תכנית הטמעה 6 שלבים | /implementation → implementationStages+Programmes | A | ✅ SUP part C (owners+weeks) + V4; ⚠ C3 owners, C4 model | Concrete dates + named owners + progress/evidence fields start honest-empty |
| 5 | Stage Gates + ראיות | /stage-gates → stageGates+implementationEvidence | C | ✅ PKG ch.9 (criteria+NIST) + V4 | **All evidence** — donors have criteria only, zero real evidence → uploads/links to be produced — **G5** |
| 6 | מדדי הצלחה 3 רמות | /analytics + /submission → metricDefinitions + baseline table | F (display), Wave-9 calc | ✅ PKG ch.7 + V4 metrics + SNAP tagging pattern | Baseline observations = "טרם נמדד" records; wiring targets→observations — **G6** |
| 7 | Quick Start | /quick-start → content records | D | ✅ PKG §6.1 + SPEC ch.16; ⚠ C9 | Screenshot-style UI illustrations + expected-result/common-mistake per action for the OS screens — **G7** |
| 8 | נוהל שימוש נכון | /quick-start (usage policy) | D | ✅ SUP part D (excellent, near-complete) | Merge wording with SPEC ch.16 מותר/חובה/אסור lists — minor |
| 9 | FAQ והתנגדויות | /faq → objections | D | ✅ PKG ch.8 (5×LACE); ⚠ C6, C8 | LACE responses for 2 uncovered objections + conversation-simulator content — **G4** |
| 10 | תסריט הדרכה 10 דק׳ | /training-materials (material #8) + /submission | B | ✅ SCR part B — complete verbatim | none (import + typed record) |
| 11 | Microlearning 90 שנ׳ | /training-materials (material #10) + /submission | B | ✅ SCR part C script — complete | The video artifact itself doesn't exist → status חלקי; producing it is out-of-scope authoring — **G8** |
| 12 | תמיכה לאחר השקה | /support → tier config + supportRequests | E | ✅ SPEC ch.18 + PKG §10.1; ⚠ C10 | Escalation-path visualization + queue fields (SLA timer, linked material, KB-article-created) demo data — **G9** |

## The 8 quality checks (→ qualityValidations, /submission, WS F)

| Check | Donor | Gap |
| ----- | ----- | --- |
| בהירות / רלוונטיות / פרסונליזציה / בטיחות / אחריות / תרגול / מדידה / תחזוקה | ✅ names+order SPEC ch.19 ≡ V4; ✅ per-item test sentence V4 `quality` | **Actual validation evidence per item — none exists anywhere** (V4 shows ✓ decoratively). Each check needs a real validation run/linked proof; until then status = "חסרה ראיה" — **G1 (biggest gap of the wave)** |

## The counts (7/6/6/13/12/5)

| Count | Meaning | Entity | Donor status | Gap |
| ----- | ------- | ------ | ------------ | --- |
| 7 | personas | personas | ✅ SUP/V4/SPEC agree on the adoption set; ⚠ C1 vs seed | resolve C1, then author 3 missing card fields per persona (learning objective, practice activity, named owner) |
| 6 | implementation stages | implementationStages | ✅ donors rich; ⚠ C4 (3 models) | per-stage named owner (C3), start/target dates, deliverables/risks/evidence links |
| 6 | stage gates | stageGates | ✅ PKG ch.9 criteria complete | evidence, reviewer, decision dates — all honest-empty (G5) |
| 13 | training materials | trainingMaterials | ⚠ SPEC-13 canon vs seeded-13 (C5); only ~6 have authored donor content | **7 of 13 SPEC materials lack authored content**: מסמך מטרת הפתרון (partial via One-Pager), מפת TO-BE (PKG §3 text exists, no diagram — note תרשים_תהליך SVG/PNG exists in CRM -TERAGON dir as candidate), ספריית תרחישים ופרומפטים, Risk & Governance Sheet (PKG ch.10.2+11 text exists, needs sheet form), תרגילי Hands-on, מסמך תמיכה ותקלות (partial), דשבורד אימוץ (screen, not doc) — **G3** |
| 12 | deliverables | submissionDeliverables | ✅ V4 list canonical | statuses must be recomputed from evidence, not copied "מכוסה" (blanket ruling 2) |
| 5 | baseline metrics | metric baseline table | ✅ V4 `metrics` 5 rows (זמן הצעה, לידים אבודים, WAU, NPS, פניות איך-עושים) | baselines/observations all "טרם נמדד"; ⚠ C12/C13 numeric conventions |

## Presentation readiness (SPEC ch.19 block, WS F)

| Item | Donor | Gap |
| ---- | ----- | --- |
| 5 שקפים · 10 דקות | ✅ הצגת_מטלה_5_שקופיות.pptx structure; canonical deck = HTML (presentationSections) | author HTML sections + presenter notes — **G10** |
| מסלול דמו, צילומי גיבוי, כתובת פריסה, Build/QA/security status | ❌ no donor | derive from real pipeline state at submission time; never hardcode green |

## Consolidated fresh-authoring gap list (priority order)

1. **G1** — real validation evidence for the 8 quality checks (nothing exists; anti-8/8 rule applies).
2. **G5** — Stage-Gate evidence records (criteria exist, evidence 0/6 gates).
3. **G3** — 7 of 13 SPEC training materials unauthored (see table; 2 partially derivable from PKG).
4. **G2** — persona depth for the 5 non-PKG lanes (הנהלה/IT/Legal/Champion/מתנגד beyond the one-line matrix).
5. **G4** — LACE responses for 2 SPEC objections + FAQ simulator content.
6. **G6** — baseline "טרם נמדד" observation records + target/observation wiring.
7. **G7** — Quick-Start per-action illustrations + expected-result/common-mistake for teragon-os screens.
8. **G10** — HTML presentation (5 sections + notes + demo path).
9. **G9** — support queue demo records with tier/SLA/escalation fields per SPEC ch.18.
10. **G8** — microlearning video production (script ready; mark חלקי until produced).
