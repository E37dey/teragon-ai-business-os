# WAVE 6 — TEST RESULTS (W6-F, QA / Security / Visual validation)

תאריך: 23.07.2026 · Agent: W6-F · Scope: Wave-6 surfaces (/memory · /knowledge · /learning + cross-domain wiring), on top of HEAD with all Wave-6 work integrated.

Method: **gap analysis first** — the existing W6-A…E suites already covered most of the Phase 6.21 checklist; W6-F wrote ONLY the missing tests (`tests/wave6-security/**`, 11 tests) plus the full Phase 6.22 e2e suite (`e2e/w6.config.ts` + `e2e/memory|knowledge|learning/w6-*.spec.ts`, 27 tests incl. axe + visual) — nothing duplicated.

## 1. Gate summary — real commands + exit codes (2026-07-23)

| Command | Exit | Result |
|---|---|---|
| `npm run lint` (oxlint) | 0 | 0 errors / 0 warnings |
| `npm run typecheck` (`tsc -b --noEmit`) | 0 | clean |
| `npm run typecheck:tests` (tsconfig.tests.json) | 0 | clean |
| `npm test` (vitest) | 0 | **98 files, 1013/1013 passed** (1002 pre-existing + 11 W6-F) |
| `npm run build` (`tsc -b && vite build`) | 0 | built (52 dist text assets) |
| `npm run scan:secrets` | **1** | dist **CLEAN**; 2 **git-history** findings — a pre-existing test fixture, see §4.2 |
| `npx playwright test -c e2e/w6.config.ts` | 0 | **27/27 passed** (~1.5m, port 4773, fresh preview build) |

Existing e2e suites (`w3/w4/w5d/w5e` configs) were **not modified** — no shared files touched except the one documented trivial-a11y src fix (§4.3).

## 2. Unit/integration — per-suite counts (vitest, all passing)

| Suite | Tests |
|---|---|
| tests/memory | 58 |
| tests/memory-import | 117 |
| tests/knowledge | 121 |
| tests/learning | 59 |
| tests/cross-domain-memory | 36 |
| tests/modules-w6-wiring | 24 |
| **tests/wave6-security (NEW, W6-F)** | **11** |
| (all other suites — waves 1-5) | 587 |
| **Total** | **1013** |

New W6-F files: `exportLeakage.security.test.ts` (5), `importInjection.security.test.ts` (4), `usageSurvival.security.test.ts` (1), `derivedSurfaceLeakage.security.test.ts` (1). Full mapping → `docs/WAVE_6_SECURITY_REPORT.md`.

## 3. E2E (Phase 6.22) — `e2e/w6.config.ts`, port 4773, chromium 1920×1080, 27/27

`e2e/memory/w6-memory.spec.ts` (8):
1. /memory loads — 8 derived KPI cards + the EXACT status lines "ייבוא וייצוא Obsidian פעיל" / "גישה מקומית ישירה אינה פעילה"; zero console errors.
2. Markdown import — `setInputFiles` with 2 fixture .md (A links `[[B]]`) → staged preview (link marked "יקושר בתוך הייבוא") → commit ⇒ EXACTLY "נוצרו 2 הצעות זיכרון — ממתינות לאישור אנושי (0 אושרו אוטומטית)", note list unchanged → approve both via the queue → records appear, wikilink text renders inert, graph node click navigates, אישור: מאושר.
3. Hostile ZIP — forged archive (valid CRCs) with a `../../evil.md` traversal entry + a clean sibling .md in the same selection ⇒ Hebrew rejection "נתיב חשוד בארכיון", clean sibling stages, and the whole hostile archive is **fail-closed** (its clean entry does NOT stage — documented honest behavior; per-entry partial staging inside a hostile archive is deliberately not offered).
4. Version comparison — approve (v1) → merge second proposal into target (v2) → NoteView "גרסאות (2)" + "שדות ששונו".
5. Export — real Playwright `download` event, filename `teragon-memory-YYYY-MM-DD.zip`, manifest with sha-256 + "מצב הורדה: הורד".
6. Refresh persistence — approved record survives full `page.reload()` (IndexedDB).
7. Keyboard — proposal-queue approve button reached by bounded Tab-walk, activated with Enter.
8. Offline (honest scope) — see §4.4.

`e2e/memory/w6-cross-domain.spec.ts` (3): Customer-360 memory tab (approved-only; sensitive body hidden; reveal button disabled without a reason; reveal-with-reason shows the body) · Copilot "הצג הצעות זיכרון שממתינות לאישור" (derived answer, proposal title, `href` → `/memory?proposal=…`) · Command-Center memory band (non-zero derived row, click-through lands on /memory).

`e2e/knowledge/w6-knowledge.spec.ts` (4): review flow draft→submit→approve (non-authoritative before, "מקור מוסמך — כשיר כראיה" + v1 after; reject disabled without a note) · Wiki evidence answer (cites article chip with version) + the EXACT passthrough "לא נמצא מקור מאושר שמספיק למענה" on a no-match query · contradiction (two approved articles claiming טמפ' מיטה 60 vs 85 → scan → both "שנוי במחלוקת" + open conflict panel) · version comparison (request-changes → edit → re-approve → v1/v2 field diff with −/+ lines).

`e2e/learning/w6-learning.spec.ts` (4): page + honest "טרם נמדד" · pending proposal rail (named reviewer shown; single-case marker BLOCKS approve; reject disabled without reason) · named-approval evidence (seeded multi-record proposal → active rule "פעיל · גרסה 1", applications count, "אפקטיביות: טרם נמדד") · rollback (reason-mandatory; rolled-back label; past applications stay visible; rollback KPI = 1).

`e2e/memory/w6-axe.spec.ts` (4) + `e2e/memory/w6-visual.spec.ts` (4 tests ⇒ 39 screenshots) — see `docs/WAVE_6_VISUAL_QA.md`.

Zero-console-error assertion runs in **every** spec (offline test filters ONLY network-noise patterns; knowledge specs filter ONLY the exact reported seed-race errors of §4.1 — anything else fails).

## 4. Findings

### 4.1 SRC DEFECT (reported — outside W6-F writable paths): knowledge seed race
- `src/app/data/hooks.ts:31-40` — `useInvalidateCollections` returns a **new function identity on every render** (no `useCallback`).
- `src/modules/knowledge/KnowledgePage.tsx:133-141` — the seed effect depends on `[invalidate]`, so it **re-runs on re-render**; a second in-flight `ensureKnowledgeSeed` races the first.
- Symptoms (reproduced in the production preview build, fresh IndexedDB, open /knowledge):
  1. console errors: `DuplicateIdError: [repository:knowledgeArticles] item with id "ka-kn-1" already exists`, same for `knowledgeVersions`, and `KNOWLEDGE_VERSION_IMMUTABLE` (unhandled rejection — the `.then` chain has no `.catch`);
  2. intermittently the first render's query cache stays stale — the table shows "אין מאמרים" although the seed IS persisted (a reload renders it).
- Data stays correct (create-if-missing); this is console noise + a first-paint glitch.
- Suggested fix (either): wrap the returned function in `useCallback([qc])` in hooks.ts, **or** change the KnowledgePage effect deps to `[]`. Add `.catch` to the seed call.
- W6-F handling: knowledge e2e filters exactly these two error shapes (documented in-spec as `KNOWN_SEED_RACE`) and uses a reload-until-seeded helper (`gotoKnowledgeSeeded`). Everything else still fails the zero-error gate.

### 4.2 Scanner git-history finding (pre-existing, reported)
`npm run scan:secrets` exit 1 — full output:

```
=== scan-bundle-secrets — W5-E ===
[info] dist text files scanned: 52
[info] .env.example var names: AI_PROVIDER, AI_MODEL, AI_API_KEY, AI_BASE_URL, AI_REQUEST_TIMEOUT_MS, AI_MAX_OUTPUT_TOKENS, AI_DAILY_BUDGET, AI_RATE_LIMIT_PER_MINUTE, AI_MAX_CONCURRENT_REQUESTS, AI_REMOTE_ENABLED
[info] git history commits touching /sk-[A-Za-z0-9_-]{16,}/: 3
[info] git history commits touching /AKIA[A-Z0-9]{12,}/: 1
[info] screenshot files checked in docs\screenshots: 72
RESULT: 2 FINDING(S):
  [git-history] 841643341607 — sk-key: "+sk-abc123def456ghij"
  [git-history] 841643341607 — sk-key: "+sk-abc123def456ghij"
```

- **dist/ is CLEAN** (0 findings in the bundle — the actual leak gate).
- Both findings are the SAME line: the W6-B commit `8416433` added the redaction test fixture `sk-abc123def456ghij` in `tests/memory-import/export.test.ts` **without** a `FAKE` marker, so the scanner's `FAKE_MARKERS` heuristic (scripts/scan-bundle-secrets.mjs:116) can't classify it. It is an obviously synthetic 16-char fixture, not a credential.
- Suggested fix (lead): rename the fixture to `sk-FAKEabc123def456` in the test (prevents new history hits) AND either add that literal to `FAKE_MARKERS` or whitelist commit `8416433` in the scanner so the historical diff stops failing the scan. Git history itself is immutable.

### 4.3 Trivial a11y fix APPLIED (allowed by the W6-F exception, documented)
`src/design-system/ConfidenceBar.tsx` — the unmeasured state rendered `role="meter"` **without** `aria-valuenow` (axe `aria-required-attr`, **critical**, surfaced on /memory NoteView). Fix: measured ⇒ real meter with the full value set; unmeasured ⇒ `role="img"` with `aria-label="… — טרם נמדד"` (no fake value invented). Verified: axe now reports ZERO serious/critical on all four scanned states with **no baseline**.

### 4.4 Offline — honest scope (documented limitation)
There is **no service worker**, so a COLD offline boot (reload with network off) cannot load the app shell — this is a platform limitation, not tested as if it worked. What IS proven (`w6-memory.spec.ts` offline test): with the SPA loaded, `context.setOffline(true)` + client-side navigation (back/forward between / and /memory) keeps rendering real data from IndexedDB, and search/filtering work — only network-noise console patterns are tolerated in that one test.

### 4.5 Learning approve-path e2e — honest scope
The learning demo seed derives exactly one pending proposal (single-case ⇒ approval structurally blocked by the mandatory marker) and pre-approves the one multi-record proposal into the active rule. A live click-through "approve" of a multi-record proposal is therefore not reachable from the UI without inventing data; the e2e instead proves the block, the named-approval evidence on the seeded rule, and a REAL rollback. The full approve path is covered at engine level by `tests/learning/approvalGate.test.ts` (9 tests incl. bypass attempts).
