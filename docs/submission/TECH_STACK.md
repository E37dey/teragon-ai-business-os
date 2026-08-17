# TERAGON — Technology Stack

Only technologies actually present in the repository (`package.json`), and what TERAGON uses each for.

## Frontend
- **React 19** (`react`, `react-dom`) — the SPA UI and role-composed portals.
- **TypeScript** — the entire codebase; strict typing across domain, authorization, and AI layers.
- **Vite 8** (`vite`, `@vitejs/plugin-react`) — dev server, build, and preview.
- **React Router** (`react-router-dom`) — client-side routing; `RouteAccessGuard` and SPA navigation that preserves runtime state.
- **TanStack Query** (`@tanstack/react-query`) — data fetching/caching for repositories and hooks.
- **TanStack Table** (`@tanstack/react-table`) — data tables (customers, tasks, etc.).
- **D3** (`d3-force`, `d3-drag`, `d3-zoom`, `d3-selection`, `d3-transition`) — the live Knowledge Map and agent-network force-directed graphs.

## Data / Persistence
- **IndexedDB via `idb`** — the default local-first store (`LOCAL_INDEXEDDB`); all demo data lives in the browser.
- **Supabase** (`@supabase/supabase-js`) — the RLS-backed provider for the org-scoped customer surfaces (Customers/Contacts/Detail); org-level RLS.
- **Zod** — runtime schema validation across domain contracts and AI DTOs.

## AI
- **Deterministic local rules engine** (`src/ai`, `src/agents`) — no remote model (`AI_REMOTE_ENABLED=false`); an Orchestrator + 6 specialist agents, an approval engine, and governed workflows. Explainable, evidence-backed recommendations.

## Integrations
- **Obsidian Trusted-Device bridge** (`src/integration/obsidian`) — device-bound auth, credential store (sessionStorage token), and a vault bridge client to the local `teragon-vault-bridge` plugin (`127.0.0.1:5200`).

## Testing
- **Vitest** (`vitest`) + **jsdom** + **fake-indexeddb** — unit/integration tests (3041 tests).
- **Playwright** (`@playwright/test`) — deterministic E2E and portal E2E.
- **Axe** (`@axe-core/playwright`) — accessibility gates (0 serious/critical on new surfaces).
- **Testing Library** (`@testing-library/react`, `@testing-library/jest-dom`) — component/hook tests.

## Security
- **Centralized RBAC** (`src/authorization`) — 9 roles, 24 capabilities, `can(role, permission)`, route scope, record scope.
- **Supabase RLS** — organization-level row security for customer surfaces.
- **Secret scan** (`scan:secrets` script) — guards against committed secrets.

## Developer tooling
- **oxlint** — fast linting.
- **Prettier** (`prettier`, `eslint-config-prettier`) — formatting.
- **Supabase CLI** (`supabase`) — migrations/local platform scripts.
- **@types/** packages — type definitions for node/react/d3.

---
*Not used / intentionally excluded:* no remote LLM/API, no custom backend server for the demo, no new infrastructure stack.
