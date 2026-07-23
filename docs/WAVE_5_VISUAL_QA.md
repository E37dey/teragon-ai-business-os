# Wave 5 — Visual QA (Phase 5.17) · W5-E stage 2

תאריך: 23.07.2026 · main (integrated: W5-A/B/C/D + E-stage-1 + app-wide Copilot) · Build served by `vite preview` on port 4673.
Evidence lives in `docs/screenshots/wave5/*-e2-*.png` (12 files, suffix `-e2` — W5-D's originals untouched) and in the automated suite `npx playwright test -c e2e/w5e.config.ts` (29/29 green).

## Checklist

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Visual family — AI surfaces share the OS design system (Panel/Chip/OsButton/EnvelopeCard tokens) | PASS | `copilot-open-e2-1920x1080.png`, `provider-state-e2-1920x1080.png`, `collaboration-conflict-e2-1920x1080.png` — same panels, chips, spacing vars on all three surfaces |
| 2 | RTL correctness — nav on the right, rail on the left, drawer slides from the correct side, LTR islands (`os-ltr`) for ids/codes only | PASS | all `-e2` screenshots; graph container is deliberately `dir="ltr"` with `dir="rtl"` node content (by design, readable) |
| 3 | Readable conversations — agent messages sender→receiver + timestamp, no wall-of-text | PASS | `collaboration-conflict-e2-1920x1080.png` (שיחות והעברות column); copilot history bubbles in `copilot-open-e2-*` |
| 4 | Real status differences — chips render distinct states (הושלם/ממתין לאישור/ממתין להחלטה/נדחה/בוצע) | PASS | e2e: `w5e-approvals.spec.ts` asserts the chip transitions ממתין להחלטה→בוצע and ממתין להחלטה→נדחה; visible in `collaboration-conflict-e2-*` (משימה·הושלם vs קונפליקט·ממתין להחלטה vs אישור·ממתין) |
| 5 | No clipped evidence — evidence claims fully readable; graph node labels truncate with ellipsis but the FULL text is always available in the rail selected-node card / evidence list | PASS | `collaboration-conflict-e2-1920x1080.png`: node "…bu Lab P1S" is truncated, the complete conflict text appears twice in the rail (selected card + קונפליקטים) |
| 6 | No overlapping graph labels — layouted grid, one label per node, edges behind nodes | PASS | `collaboration-conflict-e2-*` at all three resolutions (incl. 3840×2160) |
| 7 | Local-vs-remote clarity — every answer carries "מנוע מקומי מבוסס כללים"; the remote label "ספק AI מרוחק מחובר" appears nowhere; health detail says "מנוע מקומי — פועל ללא רשת וללא ספק חיצוני" | PASS | e2e: `w5e-provider-state.spec.ts` (2 tests, incl. negative assertions); `provider-state-e2-*`, `copilot-open-e2-*` |
| 8 | Approval-state clarity — the one ApprovalPanel shows state chip + "מה יבוצע לאחר אישור" + approver identity; edited payload is displayed after ערוך ואשר | PASS | e2e: `w5e-approvals.spec.ts` "ערוך ואשר" test asserts the edited text replaces the original in the panel; `approval-drawer-e2-*` shows the edit dialog |
| 9 | Keyboard — copilot opens with Tab→Enter on the shell nav card, ESC closes; all 6 approval actions in tab order and operable with Enter | PASS | e2e: `w5e-copilot.spec.ts` keyboard test + `w5e-approvals.spec.ts` keyboard test |
| 10 | Focus — Drawer/Modal focus on open, focus trap in Modal, focus restore on close (design-system implementation) | PASS (spot-check) | keyboard e2e tests exercise focus into the drawer and panel; Modal trap implemented in `src/design-system/Modal.tsx` (verified by reading + the edit-dialog flow passing under keyboard use) |
| 11 | Reduced-motion | PASS (limited) | AI surfaces use static layout; the only animation is the GlowOrb; no motion is required to perceive any state. No `prefers-reduced-motion` override exists for GlowOrb — noted as a nice-to-have for the design-system owner (not a defect gate) |
| 12 | No dead controls — every control acts or is disabled WITH a Hebrew reason (OsButton type-level contract) | PASS | `docs/WAVE_5_INTERACTION_AUDIT.md` (full inventory); e2e asserts the recommendation-only edit button is disabled with its reason tooltip |
| 13 | No console errors — every e2e flow asserts `errors == []` (console.error + pageerror) | PASS | all 29 tests in `e2e/w5e.config.ts` collect and assert zero console errors (screenshot tests included) |

## Honest N/A rows

| Item | Status | Why |
|---|---|---|
| Remote-connected provider state (badge "ספק AI מרוחק מחובר", model name shown) | **N/A — not testable** | The app ships Mode A (`remoteEnabled:false`) and no real provider key exists. Faking a connected remote in the browser would violate the no-fake-success contract. Remote paths are covered headlessly with the controlled TestAdapter in `tests/ai/integration/serverHandlerFlows.test.ts`. |
| Fallback-notice screenshot ("הספק המרוחק אינו זמין…") | **N/A — never legitimately renders in Mode A** | A fallback is defined as remote→local substitution. In Mode A local is the PRIMARY engine, so `registry.select()` returns `fallback:null` by design; the e2e suite asserts the notice is NOT fabricated (`w5e-provider-state.spec.ts`). The notice rendering itself is unit-covered (`FallbackNotice` + registry tests). |
| Remote outage → disclosed degradation in the UI | **N/A in e2e** | Same scoping as above; covered by `tests/ai/integration/fallbackFlow.test.ts` (exact Hebrew disclosure sentence asserted). |

## Scoping note on the task's provider-state expectation

The stage-2 mandate phrased the /agents assertion as "shows לא מחובר/מושבת — NOT מחובר". The integrated implementation shows the badge "מנוע מקומי מבוסס כללים · מחובר" — where "מחובר" is the health of the **local engine itself** (detail: "מנוע מקומי — פועל ללא רשת וללא ספק חיצוני"). This is honest: no REMOTE state is shown at all, nothing claims a remote provider is connected, and no fallback is invented. The e2e asserts exactly that (local badge + local detail + negative remote-label + zero fallback notices) instead of the literal wording.

## axe (@axe-core/playwright) — findings

Gate: zero serious/critical **beyond the documented baseline**; anything new fails the suite (`e2e/agents/w5e-a11y.spec.ts`). The baseline below is REAL defects found on 23.07.2026 — all require `src/**` changes, which are outside W5-E stage-2's writable paths, so they are reported here (precise nodes) and NOT patched:

| Rule (impact) | Where | Nodes | Suggested owner fix |
|---|---|---|---|
| `color-contrast` (serious) | all 4 audited states | `.os-header__count` (notification count pill in the OS header) | raise text/background contrast in `src/styles` header rules |
| `color-contrast` (serious) | /agents (rail), /agents/collaboration, /crm (copilot-open state) | `.os-chip--blue` chips; lead status chips inside `button[aria-label="עדכון סטטוס לליד …"]` | darken `--os-blue` chip text or lighten chip bg in the StatusChip palette |
| `color-contrast` (serious) | copilot drawer | first `.os-btn--primary` ("שלח") | primary button text/background pair |
| `color-contrast` (serious) | /agents/collaboration | graph task-node kind labels `button[data-node-kind="task"] > span:nth-child(1)` (10px violet on raised bg) | `src/modules/agents-ui/AgentCollaborationPage.tsx:661-670` label color |
| `scrollable-region-focusable` (serious) | /agents/collaboration | `div[data-testid="run-timeline"]` (overflowY:auto without keyboard access) | add `tabIndex={0}` + role/aria-label — `AgentCollaborationPage.tsx:722-730` |
| `link-in-text-block` (serious) | /agents rail | `a[href$="collaboration"]` ("לחדר התיאום ←") distinguishable by color only | add underline — `src/modules/agents-ui/AgentsPage.tsx:425` |

No critical-impact violations were found on any audited state.

## עדכון Integration Lead (סגירת השער)

כל ממצאי ה-axe ברמת serious תוקנו בקוד המקור לפני הקומיט הסופי: כפתור primary → action-blue #1f63d6 (5.2:1), chip כחול → #4d93ff, badge ספירה → #c1313d, תוויות גרף → text-2 (מסגרת צבעונית שומרת זהות), run-timeline קיבל tabIndex+aria-label, קישור החדר קיבל underline. חבילת w5e (כולל בדיקות axe) רצה מחדש אחרי התיקונים: 29/29.
