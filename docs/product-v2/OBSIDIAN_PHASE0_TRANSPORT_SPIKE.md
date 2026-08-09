# S14.1 — Obsidian Phase 0 · Local Transport + Security Spike (evidence)

Technical spike only. **No product integration, no memory import/export, no agents, no writes, no Vault
mutation, no sync.**

> **STATUS (S14.1B — real runtime validated):** the bridge has now been validated **running inside actual
> Obsidian Desktop** on this Windows machine, against a **synthetic** vault, with a **real browser**.
> - **PHASE 0A — LOOPBACK TRANSPORT: GO** (standalone `bridgeServer.mjs` + automated security tests).
> - **PHASE 0B — OBSIDIAN DESKTOP RUNTIME: GO** — the plugin loaded in Obsidian Desktop 1.13.4, `onload()`
>   bound `127.0.0.1:5200`, and served **real `app.vault`** metadata (B), proven from a **real browser** (C),
>   across a **real enable/disable/restart lifecycle** (D).
> - **HTTPS→loopback: UNVALIDATED** (only the localhost-HTTP path was exercised; browser security was NOT
>   weakened to test it).
>
> Phase 1 is **NOT** started by this document.

## Architecture validated

```
TERAGON (real Chromium, Windows, allowed origin http://127.0.0.1:4173)
    │  cross-origin fetch (HTTP → HTTP loopback), Bearer token in Authorization header only
    ▼
TERAGON Vault Bridge — Phase 0  (READ-ONLY loopback HTTP, GET-only)
    ▼  bound 127.0.0.1:5200, INSIDE the Obsidian Desktop plugin (onload)
shared bridgeServer.mjs  ←→  this.app.vault.getMarkdownFiles()  (REAL vault, read-only)
```

The plugin was built with esbuild (`obsidian` kept **external**), installed into
`<vault>/.obsidian/plugins/teragon-vault-bridge/` (`manifest.json` + `main.js`), and enabled via
`community-plugins.json`. Obsidian then ran the **byte-identical** `bridgeServer.mjs` the automated tests
cover.

## Environment (recorded, sanitized)

- **OS:** Windows 11 Home 10.0.26200.
- **Obsidian Desktop:** 1.13.4 (`C:\Program Files\Obsidian\Obsidian.exe`).
- **Browser:** in-app Chromium pane.
- **Synthetic vault name:** `TERAGON OS` (synthetic notes only — `Welcome.md`, `Alpha Note.md`, `Beta Note.md`;
  **no** real/personal/company data).
- **TERAGON dev origin:** `http://127.0.0.1:4173` (allowlisted; the live TERAGON app was also served on
  `http://localhost:4173` via IPv6 — the diag origin used IPv4). Disallowed test origin: `http://127.0.0.1:4199`.
- **Bridge address:** `http://127.0.0.1:5200`. **Transport:** HTTP loopback.

## Bridge API (GET only)

`GET /health` (no auth, no vault content) · `GET /connection` (auth → `{connected, vaultName, version,
readonly:true}`) · `GET /notes` (auth → bounded `{path, basename, mtime}` list). No POST/PUT/PATCH/DELETE.
No `?path=`/`?file=`.

## Authentication model

Strong random pairing token (`crypto.randomBytes(32)`, rotates per plugin load), sent **only** as
`Authorization: Bearer <token>`, compared in constant time (`timingSafeEqual`). Missing / wrong / malformed
Bearer → **401**. Token never in a URL/query, never logged, never committed. During autonomous validation the
ephemeral token was handled **only in local process memory** and never printed, persisted to the repo, or
included in any evidence.

> **On the dev pairing used for autonomous validation:** the committed plugin reveals the token **only** via the
> manual command "Copy TERAGON pairing token (once)". For hands-off local validation, a **local-only** build
> (esbuild `--define:__TERAGON_DEV_AUTOPAIR__=true`, **not** part of the committed source) wrote the ephemeral
> token to a short-lived OS-temp handoff file, which the validator read into memory and then deleted. This dev
> hook touches **none** of the validated security properties (bind, auth, `app.vault` exposure, CORS,
> lifecycle) and is absent from shipped builds.

## Validation matrix (A–E) — exact PASS / FAIL / UNVALIDATED

| # | Scope | Status | Basis |
|---|-------|--------|-------|
| **A** | **Standalone transport + security** | **PASS** | `bridgeServer.mjs` in Node; **10/10** automated security tests; live Chromium (Windows) → loopback |
| **B** | **Actual Obsidian Desktop runtime** (`onload` binds, real `app.vault`, no Node fs) | **PASS** | Obsidian 1.13.4 loaded the plugin; `/connection` → real `vaultName:"TERAGON OS"`, `readonly:true`; `/notes` → real `getMarkdownFiles()` metadata; **no** `.obsidian`, **no** bodies |
| **C** | **Browser → actual Obsidian plugin** (auth/CORS against the in-Obsidian server) | **PASS** | Real Chromium from allowed origin read live JSON with a valid token; missing/wrong → 401; disallowed origin → browser fails closed; no wildcard |
| **D** | **Plugin lifecycle** (enable→open, disable→closed+fail-closed, re-enable→no EADDRINUSE, exit→closed) | **PASS** | Driven via `community-plugins.json` + real Obsidian restarts; port state verified with `netstat` at each step |
| **E** | **HTTPS → loopback transport** | **UNVALIDATED** | only localhost-HTTP exercised; mixed-content case not tested; **not** labelled supported/failed; browser security **not** weakened |

### B — real `app.vault` (sanitized)

- `GET /health` → **200**, generic (`{ok, service, version, cid}`), **no** vault content.
- `GET /connection` (Bearer) → **200** `{connected:true, vaultName:"TERAGON OS", readonly:true, version:"0.1.0-phase0"}`.
- `GET /notes` (Bearer) → **200**, `count:3`, `truncated:false`, notes `Welcome.md` · `Alpha Note.md` ·
  `Beta Note.md`, each with keys **exactly** `{basename, mtime, path}`. `.obsidian` entries: **0**. No
  `content`/`body` field. Paths are inside the active vault only.

### C — real browser (sanitized)

- Allowed origin `http://127.0.0.1:4173`: `/health` **200**, no-token **401**, wrong-token **401**,
  valid-token **200** (browser read `vaultName:"TERAGON OS"`), `/notes` **200** (browser read the 3 note
  paths). All responses `type:"cors"` — CORS genuinely passed end-to-end.
- Disallowed origin `http://127.0.0.1:4199`: **every** call (even `/health`, even with a valid token) →
  **"Failed to fetch"** (browser blocked; fails closed).
- Server-level: allowed origin echoes its exact value in `Access-Control-Allow-Origin`; bad origin → **403**
  with no ACAO; **no** `Access-Control-Allow-Origin: *`.

### D — lifecycle (real Obsidian, sanitized)

- **Enable** → `127.0.0.1:5200` LISTENING; `/health` 200.
- **Disable** (`community-plugins.json=[]` + restart) → Obsidian running, **5200 closed**, TERAGON `/health`
  connection-refused (fail closed), no handoff.
- **Re-enable** (+ restart) → 5200 reopens, **single** listener (no EADDRINUSE), authed `/connection` → real
  vault name again.
- **Obsidian close** → 5200 closed, **no orphan** bridge process/listener.
- **Obsidian restart** → clean single listener; bridge serves again.

### Read-only / confinement (sanitized)

`POST` / `PUT` / `PATCH` / `DELETE` → **405**. `?path=../secret` → **400**. `?file=x` → **400**. Unknown route
→ **404** sanitized (no stack, no token). No write endpoint, no filesystem endpoint, no shell/command endpoint;
GET-only. Phase 0 is **physically incapable** of mutating the vault (no code path writes).

## HTTP / HTTPS

**HTTP-origin → HTTP-loopback: SUCCESS** (Chromium read the JSON bodies → CORS passed). **HTTPS-served-TERAGON
→ HTTP-loopback: NOT TESTED** — the demo runs on localhost HTTP. If TERAGON is ever hosted over **HTTPS**,
browsers block HTTPS→`http://127.0.0.1` (mixed content); this must be resolved **without weakening browser
security** (localhost-HTTP build, or the plugin serving locally-trusted HTTPS). No browser flag/protection was
disabled. **`HTTPS_TO_LOOPBACK = UNVALIDATED`.**

## Automated validation (this run)

- Bridge security tests `tests/obsidian-bridge/bridgeServer.test.ts` — **10/10 PASS**.
- `typecheck` (tsc -b) — **PASS**. `typecheck:tests` — **PASS**.
- `scan:secrets` — **CLEAN, 0 findings** (no token in bundles/history/screenshots).
- Full `vitest run` — **2623 tests PASS**. 12 `tests/platform/*` **files fail to load locally** on Node
  v25.8.1 (vite/rolldown cannot parse the `#!` shebang in `scripts/platform/*.mjs`); this reproduces on the
  **pristine** PR head, is unrelated to the spike, and is gated by CI on Node 22.
- Diff scope: **10 spike files** only; **no** Supabase / migrations / Customers-Contacts persistence / AI
  engine / memory stores / production / CI / `main` touched.

## Files

- Plugin (isolated): `obsidian-plugin/teragon-vault-bridge/` — `manifest.json`, `bridgeServer.mjs` (single
  source), `mockVault.mjs`, `main.ts` (app.vault-backed, read-only), `README.md`.
- Spike runner: `scripts/obsidian-bridge-spike/run-spike.mjs` + `diag.html`.
- TERAGON dev client: `src/integration/obsidian/spikeClient.ts` (read-only, fail-closed; not wired to product).
- Tests: `tests/obsidian-bridge/bridgeServer.test.ts` (10 security tests).

## Final verdict

**OBSIDIAN PHASE 0 — GO.** Transport (0A) and real Obsidian Desktop runtime (0B: B+C+D) are validated against a
synthetic vault with a real browser. **HTTPS→loopback: UNVALIDATED.** **Phase 1 is NOT started.**
