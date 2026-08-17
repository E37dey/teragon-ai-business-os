# TERAGON — Final Facts (single source of truth)

Facts only. All presentation/submission material must agree with this file.

## Git
- **Reviewed product baseline SHA:** `4a6aed7`
- **Submission branch:** `chore/teragon-submission-package` (based on `4a6aed7`, zero source changes)
- **Submission branch HEAD:** `0b84520` (advances per doc commit; verify with `git rev-parse chore/teragon-submission-package`). Content commits: `28884b0` (English package + screenshots) · `fcdb882` (Hebrew pack + FINAL_FACTS).
- **RC2:** `release/v0.9.0-rc.2` = `68e229e` (commit); annotated tag `v0.9.0-rc.2` object = `3e89eab`, dereferences (`^{}`) to commit `68e229e`. **Untouched.**
- **main:** local `main` = `38cfbaa` (stale local ref) — **not authoritative**; **`origin/main` = `4d4c9dc`** (authoritative remote). Both **untouched** by this submission branch.
- **No merge.** RC1 / release tags untouched.

## Product
- **Name:** TERAGON AI BUSINESS OS
- **Portals (3):** Manager · Student · Technician (derived from role, non-escalating)
- **Canonical RBAC roles:** 9
- **Agents (7):** Teragon Orchestrator · Wiki · Mentor · Hunter · Flow · Fixer · Nexa
- **Workflow packs (2):** `governed-knowledge-capture` · `operational-recovery`
- **Routes:** 34 canonical (`APP_ROUTES`)

## Public lecturer demo
- **Public URL:** **https://teragon-final-project-demo.netlify.app** (Netlify site `teragon-final-project-demo`, id `e2d9ec9a-b7b2-471c-9f7a-784ebbd91b62` — new & separate; `teragon-os-demo`/`teragon` untouched).
- Verified live as an external visitor: 3 accounts authenticate, role denials enforced, SPA direct routes (no 404), no fatal console errors. Obsidian is local-only (CSP blocks the bridge → safe disconnected state). Synthetic data only; no secrets in bundle; static SPA (no server functions). See `docs/submission/PUBLIC_DEMO.md`.

## Demo credentials (demo-only)
- Manager: `manager@teragon.demo` / `TeragonManager2026!`
- Student: `student@teragon.demo` / `TeragonStudent2026!`
- Technician: `technician@teragon.demo` / `TeragonTech2026!`
- Run: `npm install && npm run build && npm run preview` → `http://localhost:4173/welcome`

## Test baseline (SHA `4a6aed7`)
- Vitest: **3041 / 3041** (per-file green; full-suite flakes only under this machine's RAM starvation — environmental)
- Deterministic E2E: **611 passed / 7 skipped / 0 failed**
- Portal E2E: 10/10 · RBAC/IDOR: 93 · Axe: **0 serious / 0 critical** · responsive 390px clean
- typecheck / typecheck:tests / lint / build / secret-scan: clean

## Obsidian (live-verified)
- Status: **connected** (`מחובר`) · Vault: **TERAGON OS** · Bridge: `http://127.0.0.1:5200` v0.3.0-phase3
- Knowledge Map: **63 nodes / 147 links / 6 clusters** (use the real current values if the vault changed)
- Write policy: **human-approval only** · **0 automatic vault writes**

## Automated vs manual live verification
- **Automated:** Obsidian connection; Knowledge Map load; bridge fail-closed; governed-knowledge-capture up to `WAITING_FOR_USER`; failure path (`VAULT_UNAVAILABLE → WORKFLOW_FAILED`); reconnect (existing Trusted Device, no pairing); SPA navigation preserves the runtime event log; operational-recovery targeting + `retryOf` linkage.
- **Manual (human):** the final `אשר קבלה → WORKFLOW_COMPLETED` accept clicks (governed-knowledge-capture and operational-recovery) — the browser automation reached `WAITING_FOR_USER` connected but could not land the final click (the live map's re-render freezes/revokes automation access). **Do not claim these final accepts were automated.**

## Security boundaries (state exactly)
- `LOCAL_INDEXEDDB` record scoping = **client-side least-privilege presentation, NOT a server boundary**.
- Supabase RLS = **organization-level** (not per-user yet).
- **Per-user / assignment-level RLS = NOT YET (future production hardening).**
- AI: `AI_REMOTE_ENABLED=false` — **deterministic local rules engine, no remote model**.
- Data: **synthetic demo only**; demo-mode authentication (credential prefills; trusted role decides access).

## Known limitations
See `docs/submission/KNOWN_LIMITATIONS.md` (7 items, each with current state → why → production next step).

## Future roadmap
Per-user/assignment-level Supabase RLS · enterprise identity (SSO/OIDC) · deployment hardening · broader Supabase-backed surfaces.
