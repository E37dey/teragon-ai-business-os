# Theme v3 → Green Baseline — Reconciliation Plan

**Branch:** `integration/theme-v3-green-baseline` (created from `main` @ `e5ff8d9`)
**Source of approved work:** `post-release/theme-system-v3` @ `4369831`
**Method:** fast-forward (ancestry permits) — see §3.

---

## 1. Ancestry finding (decisive)

```
git merge-base main post-release/theme-system-v3  →  e5ff8d9   (== main HEAD)
git log main..post-release/theme-system-v3        →  51 commits
git log post-release/theme-system-v3..main        →  0 commits
```

`post-release/theme-system-v3` is a **linear descendant of `main`** — it is exactly
`main + 51 commits`, and `main` holds nothing the theme branch lacks. Therefore the theme
branch already contains all of `main` (including the courses-v3 redesign), and a
**fast-forward is valid and safe** — no merge, no conflict, full provenance preserved.

## 2. Inventory of the 51 commits (grouped; dependency order = git order, preserved by fast-forward)

| Commit | Purpose | Kind | src | e2e/tests | docs |
|--------|---------|------|----:|----------:|-----:|
| `c51150f` | VC-A quiet-enterprise calm tokens + primitives | product | 6 | 0 | 9 |
| `00ae09f` | VC-B calm application shell + navigation | product | 2 | 0 | 4 |
| `9ee934f`…`2ff548e` (17 commits) | VC-C/D/E/F per-module density (governance, courses, service, crm, analytics, agents, command-center, customers, sales, tasks, printers, organizations, learning, memory, knowledge, agents-collab, automations) + shared AA fixes | product (+ real a11y/contrast in `0ffdce9`, `6bd3ac0`) | ~40 | 0 | some |
| `bbea8d8` / `23f6150` | VC-F administration density | product | 3 | 0 | 0 |
| `269f9e0` | apply quiet-enterprise visual language | product | 0 | 0 | 25 (screenshots) |
| `5d74997` | **Light Enterprise Hybrid theme** (tokens, theme-init, contract) | product | 16 | 1 | 24 |
| `40079a8` | **system-wide Light + Dark rollout** | product | 43 | 0 | 36 |
| `5fa328e` | **repair E2E suite for Visual-Calm + light rollout** | **test-only** | 2 | 10 | 109 (screenshots) |
| `21f2344` | fix live-route gate (off-nav customer routes, VC-collapsed nav) | test-only | 0 | 2 | 0 |
| `01bc525`, `5b534e8` | refresh e2e-captured screenshots (light theme) | docs/screenshots | 0 | 0 | many |
| `5bb8879` | final e2e-run artifacts + control tally | test-infra + docs | 0 | 1 | 2 |
| `322e59d` | Draft-Preview report + 60 preview screenshots | docs | 0 | 0 | 9 |
| `e0f5f35`, `4d5d4f6` | Visual-Calm pilot report + scorecard + screenshots | docs | 0 | 0 | many |
| `4369831` | **text theme selector + Command Center density round-2** | product + test | 6 | 7 | 1 |

**Aggregate file footprint across the range:** 78 `src`, 17 `e2e`, 1 `tests`, 6 `scripts`,
1 `public` (theme-init.js), 1 `index.html`, 30 `docs`, 717 screenshots.

## 3. Approved vs excluded

**Verified NO unapproved deployment metadata or stale experiments in the range:**
`git diff --name-only main..theme` matched **zero** `netlify*`, `.github`, `deploy*`,
`*.toml`, `Dockerfile`, `package.json`, `vite.config`, `tsconfig`, or `.env` files. Every
commit is part of the approved VC → theme → density progression or its test-repair / docs /
screenshot provenance.

**Excluded commits: none.** Because ancestry permits a fast-forward and nothing in the range
is stale/unapproved, cherry-picking a subset would only *rewrite provenance* (which step 5
forbids "before validation") without benefit. The screenshots/reports are the committed
provenance of the approved work, not artifacts to strip. → **Fast-forward, keep all 51.**

## 4. Preserved (spot-checked post-reconcile)

Light Enterprise default · Quiet Enterprise Dark · System theme · font/CSP fix (no Google
Fonts request; `script-src 'self'`) · Visual-Calm hierarchy · Command Center density
corrections · approved Hebrew copy · all existing business behavior (repositories, approvals,
memory, knowledge, agents, governance untouched).

## 5. Post-reconciliation fixes — ALL stale test expectations, NOT product defects

The running suite surfaced **7 stale tests** across 5 files whose expectations pre-dated a
Visual-Calm tab/drawer/nav restructure they never adopted. Every one failed **identically on
`main`** (pre-existing drift, not regressions from this work), every one is **test-only**
(approved product behavior unchanged), and none needed a regression assertion (the approved
behavior is exactly what the tests now drive). No timeouts raised, no skips, no unrelated UI.

Commit `dc459bc`:
| Test | Root cause | Fix |
|------|-----------|-----|
| `w6-memory` — Markdown import | note-view link graph moved into the "גרף קישורים" center tab (VC-E) | open that tab before clicking a graph node |
| `w6-visual` — knowledge surfaces | contradiction scanner moved into the "סתירות בידע" tab (VC-E) | open that tab before "סריקת סתירות" |

Commit `9f94e93`:
| Test | Root cause | Fix |
|------|-----------|-----|
| `w8f-cross` — offline warm-walk | VC-B collapses non-active nav groups | expand groups before clicking route links |
| `w4-flows` — courses | KPI renamed `→ ממתין לבדיקת מדריך`, tab `→ מטלות והגשות`, button `→ אישור השלמת השלב` | update the three labels |
| `w4-flows` — service | full timeline/history moved into an on-demand drawer (VC-D) | open the "ציר זמן והיסטוריה" drawer first |
| `w4-flows` — tasks | per-card state control moved into the detail drawer (VC-C) | open the task card first |
| `shell` — grouped nav (×2) | VC-B collapses non-active groups by default | assert collapsed default; expand to reveal links/badge; explicit expand persists |

## 6. Release gate (this branch)

| Gate | Result |
|------|--------|
| oxlint | 0 / 0 |
| TypeScript (`tsc -b`) | 0 |
| `typecheck:tests` | 0 |
| Vitest | 1706 / 1706 (187 files) |
| Secret scanner | CLEAN (0 findings) |
| Production build | pass |
| Full Playwright (non-live) | **~587 passed, 0 failed, 0 skipped** |

**Full Playwright note:** this machine is RAM-starved, so a single ~20-min run exhausts memory
and the vite-preview webServer dies mid-run (surfacing as `ERR_CONNECTION_REFUSED`, an
infrastructure artifact — not code failures). The suite was therefore run in **5 chunks**,
each with a fresh server; every chunk passed with **0 real failures**:
admin/adoption/agents/ai/analytics = 136 · final-*/governance = 234 ·
knowledge/learning/memory/presentation = 37 · settings/submission/system-health = 73 (incl.
fixed `w8f-cross`) · top-level (courses-v3/screenshots/shell/w3/w4/w5d) = 107.

> The 68 `e2e/live/*` specs are **post-deploy** (need a deployed URL + Netlify functions) and
> are validated separately after a deploy — out of scope for this no-deploy reconciliation.

**Final commit of this branch:** `9f94e93` (integration/theme-v3-green-baseline).

**Minor test-infra observation (non-blocking):** `e2e/final-interactions/w9a-control-tally.json`
carries a `generatedAt` timestamp that the control-census rewrites on each run (control totals
unchanged). It is restored to a clean state; a future hygiene fix could drop the volatile
timestamp so census runs never dirty the tree.

## 7. Recommendation

Pending the full Playwright result, this branch is the **truthful green baseline**: it is
`main` fast-forwarded to the complete approved theme/VC/density lineage with the last two
stale-test expectations corrected. It is the correct commit to become canonical `main` and the
base for `feature/teragon-business-graph`. **No merge/deploy until reviewed.**
