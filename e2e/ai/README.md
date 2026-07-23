# e2e/ai — W5-E stage 2 (real UI specs)

Stage-1 note: this directory shipped as an honest skeleton (README only)
because W5-E ran in parallel with W5-D and the AI screens did not exist yet.
Stage 2 (this state) replaced it with real Playwright specs, now that the
integrated app (W5-D UI + app-wide OsShell Copilot) is on main.

Run: `npx playwright test -c e2e/w5e.config.ts` (vite preview, port 4673).

| Spec | Covers |
|---|---|
| `w5e-copilot.spec.ts` | shell-card open from /crm (app-wide mount), local command → envelope + local badge, in-flight cancel button (deterministic IDB write-lock), unmapped refusal, keyboard Tab+Enter open / ESC close |
| `w5e-provider-state.spec.ts` | Mode A provider honesty on /agents + copilot: local badge + local health detail; no fabricated "ספק AI מרוחק מחובר"; no invented fallback notice |
| `w5e-screens.spec.ts` | Phase 5.17 screenshots (suffix `-e2`, 1920/2560/3840) — copilot-open, approval-drawer edit mode, provider-state, collaboration selected conflict |

Honest scoping: a remote-connected / remote-outage UI state is not e2e-testable
without a real provider; the TestAdapter covers it headlessly in
`tests/ai/integration/fallbackFlow.test.ts`. The fallback-notice screenshot is
therefore N/A in Mode A (see docs/WAVE_5_VISUAL_QA.md).
