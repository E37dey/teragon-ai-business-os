# S14.1 — Obsidian Phase 0 · Local Transport + Security Spike (evidence)

Technical spike only. **No product integration, no memory import/export, no agents, no writes, no Vault
mutation, no sync.**

> **VERDICT CORRECTION (S14.1B):** the earlier "OBSIDIAN PHASE 0 — GO" was **premature** — it rested only on
> the **standalone Node** bridge + a real browser, which validates the *transport/security*, **not** the bridge
> running **inside Obsidian Desktop**. Corrected split verdict:
> - **PHASE 0A — LOOPBACK TRANSPORT: GO** (proven).
> - **PHASE 0B — OBSIDIAN DESKTOP RUNTIME VALIDATION: PENDING** — **Obsidian Desktop is not installed on this
>   machine** (verified: not in `AppData/Local/Obsidian`, `Program Files`, PATH; no `obsidian.json`), and this
>   environment cannot autonomously launch Obsidian, create a vault, enable a community plugin, and run
>   `onload()`. The in-Obsidian runtime was therefore **NOT executed** — not failed, **pending**.
> - **HTTPS→loopback: UNVALIDATED.**
>
> **Phase 1 does NOT begin** until Phase 0B is PASS. A precise manual runtime-validation procedure is in §Runtime.

## Architecture tested

```
TERAGON (Chromium, Windows, origin http://localhost:4173)
    │  cross-origin fetch (HTTP → HTTP loopback)
    ▼
Obsidian Vault Bridge — Phase 0  (READ-ONLY loopback HTTP, GET-only)
    ▼  bound 127.0.0.1:5200
shared bridgeServer.mjs  (the exact module the Obsidian plugin loads)
```
For the spike the bridge ran in **standalone Node** with a **mock vault provider** — the *transport +
security contract* is what's under test, and it is byte-identical to what `main.ts` runs inside Obsidian
(Electron/Node). Running the same server inside Obsidian is a packaging step (see Limitations).

## Files

- Plugin (isolated): `obsidian-plugin/teragon-vault-bridge/` — `manifest.json`, `bridgeServer.mjs` (single
  source), `mockVault.mjs`, `main.ts` (app.vault-backed, read-only), `README.md`.
- Spike runner: `scripts/obsidian-bridge-spike/run-spike.mjs` + `diag.html`.
- TERAGON dev client: `src/integration/obsidian/spikeClient.ts` (read-only, fail-closed; not wired to product).
- Tests: `tests/obsidian-bridge/bridgeServer.test.ts` (10 security tests).

## Bridge API (GET only)

`GET /health` (no auth, no vault content) · `GET /connection` (auth → `{connected, vaultName, version,
readonly:true}`) · `GET /notes` (auth → bounded `{path, basename, mtime}` list). No POST/PUT/PATCH/DELETE.
No `?path=`/`?file=`.

## Binding

**`127.0.0.1` only** — never `0.0.0.0`/LAN/public (verified: `server.address().address === "127.0.0.1"`;
`start(port,"127.0.0.1")`). Port **released** on `close()` (verified: `netstat` → PORT CLOSED after shutdown).

## Authentication model

Strong random pairing token (`crypto.randomBytes(32)`, rotates per plugin load), sent **only** as
`Authorization: Bearer <token>`, compared in constant time (`timingSafeEqual`). Missing / wrong / malformed
Bearer → **401**. Token never in a URL/query, never logged, never committed (dev pairing via the plugin's
"Copy pairing token" command).

## Origin / Host policy

**Explicit allowlist; no `Access-Control-Allow-Origin: *`.** Unexpected Origin → **403** (verified in tests).
Allowed origin gets its exact value echoed in ACAO. GET-only (no write-capable GET). Requests with an
arbitrary `path`/`file` param → **400**.

## Windows / browser environment

- OS: **Windows 11**. Browser: **Chromium** (the in-app browser pane). TERAGON origin: `http://localhost:4173`.
  Bridge: `http://127.0.0.1:5200`. Transport: **HTTP** (the TERAGON demo runs on localhost HTTP).

## HTTP / HTTPS result (the critical test)

**HTTP-origin → HTTP-loopback: SUCCESS.** From `http://localhost:4173`, Chromium performed cross-origin
`fetch` to `http://127.0.0.1:5200` and **read the JSON bodies** — which means **CORS passed** (a disallowed
origin would have thrown / returned opaque). Live results:

| Step | Expected | Actual |
|------|:---:|:---:|
| `GET /health` (no auth) | 200 | **200** (generic; no vault content) |
| `GET /connection` (no token) | 401 | **401** |
| `GET /connection` (Bearer) | 200 | **200** `{connected:true, readonly:true, vaultName}` |
| `GET /notes` (Bearer) | 200 bounded | **200**, 3 notes (metadata only) |
| `GET /notes?path=../` | 400 | **400** |
| `POST /health` | 405 | **405** |
| after bridge shutdown, `GET /health` | fail closed | **"Failed to fetch"** (fails closed) |

**HTTPS-served-TERAGON → HTTP-loopback: NOT TESTED** — the demo runs on localhost HTTP, so this case did not
arise. Per the architecture, if TERAGON is ever hosted over **HTTPS**, browsers block HTTPS→`http://127.0.0.1`
(mixed content). This must be resolved **without weakening browser security** — via (a) a localhost-HTTP demo
build, or (b) the plugin serving **HTTPS** with a locally-trusted cert. No browser flag / protection was
disabled in this spike.

## Mixed-content / Private-Network-Access observations

- **Mixed content:** none — HTTP page → HTTP loopback (no HTTPS in the demo).
- **PNA:** not triggered here (localhost → loopback are both in the "local" address space, so Chromium did
  not require a PNA preflight). For a **public-origin** hosted TERAGON → loopback, Chromium *would* require
  the preflight — the bridge already returns `Access-Control-Allow-Private-Network: true` on allowed-origin
  preflights, so this is handled proactively (to be re-verified in that deployment).

## Security tests (automated) — `tests/obsidian-bridge/bridgeServer.test.ts` — **10/10 PASS**

loopback-only bind · `/health` unauth + no vault content · auth rejects missing/wrong/malformed token ·
`/connection` read-only · `/notes` bounded (≤ maxNotes, metadata only) · **405** for POST/PUT/PATCH/DELETE ·
Origin allowlist (403 unexpected, no `*`) · `?path=`/`?file=` → 400 · sanitized errors (no stack, no token) ·
**shutdown → fail-closed** (connection refused). No weakened assertions; no skipped security tests.

## Failure tests (verified)

Bridge unavailable → browser `fetch` throws → TERAGON fails closed. Wrong/missing token → 401. Bad Origin →
403 (test). Plugin shutdown → **port closed/released**; restart binds cleanly. Only the current (mock) vault
is exposed; no path outside it (no arbitrary path param; `..` rejected).

## Exact limitations (honest)

1. **Plugin not runtime-verified inside Obsidian Desktop** — no Obsidian install was available to load the
   plugin; the **server it runs (`bridgeServer.mjs`) was executed in standalone Node**. Transport + security
   are proven; the "load into Obsidian and serve `app.vault`" packaging step remains to verify on a machine
   with Obsidian Desktop.
2. **Mock vault** — `mockVault.mjs` stood in for `app.vault` (the spike tests transport/security, not vault
   content). `main.ts` already wires the real read-only `app.vault` provider.
3. **HTTPS-hosted deployment untested** — only the localhost-HTTP case (TERAGON's actual demo deployment) was
   exercised. HTTPS→loopback is a documented Phase-1 pre-condition, to be solved without weakening security.
4. No pairing tokens appear in this document or the repository.

## Validation status (A–E) — exact PASS / FAIL / UNVALIDATED

| # | Scope | Status | Basis |
|---|-------|--------|-------|
| **A** | **Standalone transport + security** | **PASS** | `bridgeServer.mjs` run in Node; 10/10 automated security tests; live Chromium (Windows) → loopback flow all as expected |
| **B** | **Actual Obsidian Desktop plugin runtime** (`onload` starts bridge, `app.vault` name/notes, no Node fs) | **PENDING** | Obsidian Desktop **not installed** on this machine; cannot autonomously enable a plugin / open a vault / run `onload()` — **not executed, not failed** |
| **C** | **Browser → plugin-hosted bridge** (auth/CORS against the in-Obsidian server) | **PENDING** | depends on B |
| **D** | **Plugin lifecycle** (enable→port open, disable→closed+released, re-enable→no EADDRINUSE, exit→closed) | **PENDING** | depends on B |
| **E** | **HTTPS → loopback transport** | **UNVALIDATED** | demo runs on localhost HTTP; HTTPS case not exercised; must not be labelled supported or failed; **do not weaken browser security to test** |

**A is genuine, reusable evidence** (the server the plugin loads is byte-identical), but it is **not**
equivalent to B. B/C/D require a real Obsidian Desktop install + a human (or GUI automation) to load the
plugin — unavailable in this environment.

## Runtime — manual Phase 0B validation procedure (for a machine with Obsidian Desktop)

1. Install Obsidian Desktop (Windows). Create a **synthetic** test vault (no real personal/company content) —
   e.g. add `Note-1.md`, `Note-2.md`.
2. Copy `obsidian-plugin/teragon-vault-bridge/` (with a built `main.js` from `main.ts` + `bridgeServer.mjs` +
   `manifest.json`) into `<vault>/.obsidian/plugins/teragon-vault-bridge/`. Enable it (Community plugins).
3. Confirm the bridge is on `127.0.0.1:5200` (e.g. `netstat -ano | findstr :5200`); run the command
   **"Copy TERAGON pairing token (once)"**.
4. Serve TERAGON on `http://localhost:4173`; from its origin run the same fetch sequence (or reuse the diag
   page) against `http://127.0.0.1:5200`: `/health` (200), `/connection` (401 no token → 200 with token,
   `vaultName` = the **actual** open vault, `readonly:true`), `/notes` (200, metadata from
   `app.vault.getMarkdownFiles()` only), `?path=../` (400), POST (405), wrong Origin (403).
5. Confirm `/notes` shows **only** the open vault's notes, **no** `.obsidian` internals, no note content.
6. Lifecycle: disable plugin → port released + TERAGON fails closed; re-enable → clean start (no EADDRINUSE);
   quit Obsidian → port closed, no orphan process.
7. Record Windows/Obsidian/browser versions, TERAGON origin, bridge address, vault name, scheme — **without
   the token** — and set B/C/D to PASS. Only then does Phase 0 become GO and Phase 1 may be scoped.

## Final verdict

**OBSIDIAN PHASE 0A — TRANSPORT GO.**
**OBSIDIAN PHASE 0B — RUNTIME VALIDATION PENDING** (requires a real Obsidian Desktop install; not available
in this environment). **HTTPS→loopback: UNVALIDATED.** **Phase 1 is NOT started.**
