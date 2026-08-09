# S14.1 — Obsidian Phase 0 · Local Transport + Security Spike (evidence)

Technical spike only. Proves whether TERAGON in the target Windows browser can **securely** talk to a local
Obsidian plugin bridge on `127.0.0.1`. **No product integration, no memory import/export, no agents, no
writes, no Vault mutation, no sync.**

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

## GO / NO-GO

**PHASE 0 — GO** for TERAGON's actual (localhost-HTTP) deployment: a real Chromium on Windows communicated
**securely** with the loopback bridge — 127.0.0.1-only, Bearer-authenticated, Origin-allowlisted, read-only,
bounded, sanitized, fail-closed — **without weakening any browser security**. All 10 automated security tests
pass and the live browser flow matches expectations.

**Conditions carried into Phase 1** (not blockers for the localhost demo, but required before a hosted
build): (a) if TERAGON is served over HTTPS, resolve HTTPS→loopback via a localhost-HTTP build or plugin
HTTPS cert (no bypass); (b) verify the plugin loads and serves `app.vault` inside Obsidian Desktop on Windows.

**Verdict: OBSIDIAN PHASE 0 — GO.**
