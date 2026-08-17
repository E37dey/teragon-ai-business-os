# TERAGON — Public Lecturer Demo

A **separate, public** deployment for final-project evaluation. Anyone can open it from any computer — no localhost, no dev server, no install.

## URL
**https://teragon-final-project-demo.netlify.app** → opens the Welcome/Login page.

## Demo accounts (demo-only, shareable)
| Portal | Email | Password |
|---|---|---|
| Manager | `manager@teragon.demo` | `TeragonManager2026!` |
| Student | `student@teragon.demo` | `TeragonStudent2026!` |
| Technician | `technician@teragon.demo` | `TeragonTech2026!` |

Click a card on the Welcome page to prefill, then submit. Use the **"יציאה"** chip in the header to log out and switch accounts.

## What was verified on the public site (external visitor, fresh browser, no session)
- ✅ Welcome loads with the three demo cards; assets load over HTTPS.
- ✅ All three accounts **authenticate on the public deployment** (client-side demo auth; no server needed).
- ✅ Role security enforced live: Manager → analytics allowed; Student → `/analytics`, `/governance`, `/administration` **denied**, learning allowed; Technician → admin/analytics/governance **denied**, tasks/service/knowledge allowed. Portal selection never elevates privileges.
- ✅ SPA direct routes work — refreshing/deep-loading `/welcome`, `/home`, `/learning`, `/tasks`, `/ai-workspace`, `/analytics`, `/governance` returns the app (200), **not a 404** (Netlify `/* → /index.html` fallback).
- ✅ Account switching leaves no stale identity/portal state; **no fatal console errors**.

## Obsidian on the public site (by design)
The public deployment **does not** and **must not** reach the local Obsidian bridge (`127.0.0.1:5200`), the Trusted Device, or the vault — the CSP (`connect-src 'self'`) blocks it. On the lecturer's remote browser, Obsidian shows its **safe disconnected/unavailable state**. This is expected. The **real** Obsidian integration is demonstrated separately (local live demo, screenshots, and the verification report). Obsidian security was **not** weakened for the public demo.

## Safety / privacy
- **Synthetic demo data only** — no real customer PII.
- **`AI_REMOTE_ENABLED=false`** — deterministic local engine, no paid API, no remote model.
- **No secrets in the bundle** — verified by the project's `scan:secrets` (CLEAN, 0 findings): no service-role/anon key values, no Obsidian pairing token, no Trusted-Device private key, no writeKey/HMAC values (only field *names* in redaction code).
- **No server functions deployed** — static SPA only; no production mutation possible.
- Security headers applied (CSP, HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff).

## Deployment facts
- Host: Netlify. Site: **`teragon-final-project-demo`** (id `e2d9ec9a-b7b2-471c-9f7a-784ebbd91b62`) — a **new, separate** site.
- Source: submission branch `chore/teragon-submission-package` (product source identical to baseline `4a6aed7`); built with `npm run build`, deployed `dist/` only.
- **Existing deployments untouched:** `teragon-os-demo` (last published 2026-07-24) and `teragon` were not modified. `main` / `origin/main` / RC1 / RC2 / release tags untouched. No merge.
