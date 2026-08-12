# TERAGON — Known Limitations (Release Candidate, Phase 10)

A truthful limitation is preferable to a fake feature. These are the honest boundaries of the
current release candidate. None is hidden in the product.

## AI / autonomy
- **`AI_REMOTE_ENABLED=false`** — remote LLM execution is disabled (server default
  `src/server/config.ts:100`; browser mirror `src/app/demoMode.ts`). The product runs on the
  local deterministic rules engine (Mode A).
- **No autonomous remote LLM execution.** Agents plan/read/draft/recommend only; every mutating
  or outbound action requires explicit human approval.
- **No automatic synchronization** anywhere (no background sync of CRM, memory, or Obsidian).

## Obsidian bridge / trusted device
- **`HTTPS_TO_LOOPBACK = UNVALIDATED`** — the bridge is loopback HTTP (`127.0.0.1:5200`),
  Origin-allowlisted, not validated TLS. Trusted-device cryptography improves
  authentication/replay resistance but does not turn loopback HTTP into HTTPS.
- **Browser XSS caveat** — a non-exportable device `CryptoKey` prevents raw private-key export
  through the WebCrypto API, but an active XSS on the trusted TERAGON origin could still ask
  WebCrypto to *sign*. Non-exportable ≠ XSS-proof.
- **Trusted-device authentication does not grant write authority.** It re-establishes only the
  bridge session; writes still require the separate `writeKey` → HMAC capability → native
  Obsidian confirmation → read-back verification (Phase-3 boundary unchanged).
- The Obsidian bridge is **desktop-only** and **development-scoped** (community-style plugin).

## Phase-9 Governed Follow-up Task
- **Single-tenant pilot only.** The `Task` schema has **no `organizationId`**; the follow-up Task
  is bound to the trusted session actor. **This implementation does not claim multi-organization
  isolation.** Multi-org rollout requires an explicit organization binding in the Task/domain
  model first.
- **CREATE-only.** It creates a follow-up Task; it does **not** repair the failed workflow or
  mutate any CRM record. A created follow-up Task ≠ a resolved failure.
- The reused `external-automation` approval category is an **internal authorization bucket only**;
  the user-visible/audit mutation truth is **CREATE ONE TASK** ("יצירת משימה").

## Persistence
- **No production backup/restore guarantee.** Local data lives in the browser (IndexedDB); the
  trusted-device registry lives in the Obsidian plugin's `data.json`.
- **BusinessSignals and the workflow timeline are runtime-only** (in-memory, bounded, wiped on
  reload) — not a historical report.
- **No remote/server durability is claimed** for the demo-pilot local data.

## Data / environment
- **Demo Mode is ON by default (fail-closed)** — all data is synthetic (`example.com`); external
  side effects (email/SMS/webhook/push/third-party) are blocked.
- **Production is untouched** — `origin/main` unchanged; no Phase-10 migration; no Supabase schema
  change; migrations top out at `014`.

## CRM scope
- Only **two governed mutation capabilities** exist: the Obsidian governed write
  (create/update/append, human-confirmed) and the Phase-9 Governed Follow-up Task (create).
  Lead status/owner, Quotation status, Ticket closure, Task update, and Customer/Contact update
  remain **out of scope** (roadmap).
