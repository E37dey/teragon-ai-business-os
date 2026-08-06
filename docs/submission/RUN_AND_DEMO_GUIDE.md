# Run & Demo Guide (S12.1)

How to install, run, test and demo TERAGON locally. **Local run needs no secrets and no
Supabase** — it defaults to Demo Mode over IndexedDB. **Never include a real Supabase key.**

## Prerequisites

- **Node 22** (CI floor; the Supabase SDK requires `>=22`).
- npm (bundled with Node).
- A modern browser (Chromium/Firefox/WebKit all pass the cross-browser matrix).

## Installation

```bash
npm install
```

## Environment setup

Local demo requires **no environment file**. Client defaults: Demo Mode on
(`VITE_DEMO_MODE`), local persistence (`VITE_PERSISTENCE_PROVIDER=LOCAL_INDEXEDDB`),
`AI_REMOTE_ENABLED=false`. Only the **live Supabase mode** needs
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (a publishable anon key, never a service
key). Server-side AI-provider variables (no `VITE_` prefix) are read only by server
functions. A no-secrets template lives at `.env.example`.

## Development run

```bash
npm run dev      # Vite dev server (HMR) — local Demo Mode
```

Expected local URL: **http://localhost:5173** (Vite default; the terminal prints the
exact port).

## Build & preview

```bash
npm run build    # tsc -b && vite build
npm run preview  # serves the build — expected at http://localhost:4173
```

## Test & quality commands

```bash
npm test                # vitest run — full unit/integration suite
npm run typecheck       # tsc -b --noEmit
npm run typecheck:tests # tsc --noEmit -p tsconfig.tests.json
npm run lint            # oxlint
npm run scan:secrets    # bundle secret scan
# End-to-end gates (need the preview server on :4173):
npx playwright test --config e2e/a11y.config.ts            # accessibility (18/18)
npx playwright test --config e2e/network.config.ts         # network resilience (6/6)
npx playwright test --config e2e/cross-browser.config.ts   # cross-browser (144)
npx playwright test --config e2e/audit-screens.config.ts   # full-route responsive sweep
```

## Demo-mode entry

Demo Mode is **on by default** — synthetic data only, a persistent "מצב הדגמה" banner on
every route, and no external side effects. Just `npm run dev` and open the printed URL.
The live Customers/Contacts (Supabase) require a configured Supabase project + sign-in;
for the demo, stay in local mode.

## Expected local URLs

- Dev: `http://localhost:5173`
- Preview (built): `http://localhost:4173`

## Troubleshooting

- **Port busy:** stop the process on 5173/4173, or pass `--port`.
- **Blank page:** ensure `npm install` completed and Node is 22.
- **Supabase routes show a demo notice:** expected in local mode — only `/customers` and
  `/contacts` connect to Supabase, and only when configured + signed in.

## Known local Rolldown limitation

On some local machines, **12 `tests/platform/*` files** fail to load with a Rolldown
parse error **before their assertions run**. These are **not application-logic failures** —
all **2569/2569 executable logic tests pass**. Reproduce the isolation with
`npx vitest run tests/agents tests/router.test.tsx tests/navGroups.test.ts` (all green).

## Authoritative result = GitHub CI

**GitHub CI is the authoritative source** for the platform test files (it runs Node 22
and executes them green). PR checks that must be green before merge: Static application
gate, Accessibility gate, Network-resilience gate, Detect persistence changes. (The Live
Supabase job intentionally skips for non-persistence changes.)
