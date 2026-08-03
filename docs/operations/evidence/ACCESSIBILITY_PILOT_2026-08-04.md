# Accessibility gate — Demo Pilot — 2026-08-04

**Verdict: ACCESSIBILITY CI PASS.** A required CI job now enforces accessibility
on every PR targeting `feature/teragon-supabase-app-auth`.

Config `e2e/a11y.config.ts` · Suite `e2e/pilot/a11y.pilot.ts` · Chromium ×
{1440×900, 390×844}. LOCAL synthetic-data build, Demo Mode ON. No staging, no
Production, no real data, no service-role.

## Coverage

| Route | axe C/S | landmarks | names | keyboard | form |
|---|---|---|---|---|---|
| `/login` (LOCAL → redirects) | ✅ | — | — | — | — |
| shell home `/` | ✅ | ✅ | ✅ | ✅ | — |
| Customers list | ✅ | ✅ | — | — | — |
| Customer detail | ✅ | ✅ | — | — | — |
| Contacts list | ✅ | ✅ | — | — | — |
| System Health | ✅ | ✅ | — | — | — |
| quick-create form | — | — | ✅ | — | ✅ |

**9 tests × 2 viewports = 18, all green.**

- **axe critical + serious = 0** on all six routes at both viewports, with **no
  blanket exclusions and no allowlist** — any new critical/serious violation
  fails the build.
- **Landmarks / RTL:** `dir="rtl"` (visual only), a `main` region, the banner
  `role="status"` live region, and a top `h1`.
- **Accessible names:** quick-add, and — per viewport — the inline `searchbox`
  (≥768px) or the search / hamburger **icon buttons** (<640px), all have names.
- **Keyboard + visible focus:** Tab from the top lands on a real focusable
  interactive control.
- **Form labels + validation:** the quick-create "לקוח חדש" form has
  `<label htmlFor>`-associated inputs; an empty submit raises a `role="alert"`
  message and sets `aria-invalid="true"` on the field.

## Defects found / fixed

**None.** The exploratory scan found zero critical/serious violations across the
Pilot surfaces (the previously-documented `os-header__count` contrast defect was
already fixed to `#c1313d`; the remaining known-baseline items are on AI surfaces
outside the Pilot). No UI change was needed.

## CI integration

New `accessibility-gate` job in `supabase-live-validation.yml`: **no `needs`, no
`if`** — required for every PR (same pattern as `static-gate`). Node 22, installs
chromium only (the cross-browser matrix covers engine parity and is not
duplicated), builds the LOCAL synthetic app, runs `e2e/a11y.config.ts`.

## Honest limitations

- **Login form** a11y is not e2e-exercised: LOCAL mode is always authenticated,
  so `/login` redirects and the form does not render in the demo build. Its
  structure (`role="main"`, `h1`, `<label htmlFor>` inputs, `role="alert"` error)
  is verified by source; form-label/validation coverage uses the reachable
  quick-create form instead.
- **Root error fallback** a11y (`role="alert"` + focusable retry) is covered by
  unit tests (`tests/observability/errorSink.test.tsx`), not e2e — there is no
  practical in-app crash trigger in the built preview.
- Severity floor is **critical + serious**; "moderate"/"minor" axe findings are
  not gated (standard practice), and this is not a manual-audit substitute
  (screen-reader walkthroughs are separate).
