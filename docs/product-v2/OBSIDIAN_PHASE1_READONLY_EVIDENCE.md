# S14.2 — Obsidian Phase 1 · Real READ-ONLY Vault Connection (evidence)

Turns the proven Phase-0 loopback bridge into a small, real, **read-only** product capability in
`/memory`. **No writes, no sync, no memory import, no agent access, no background automation.**

> **VERDICT: OBSIDIAN PHASE 1 — REAL READ-ONLY VAULT CONNECTION VALIDATED** against the actual installed
> Obsidian Desktop 1.13.4 + a synthetic vault, from the real TERAGON browser. **HTTPS → loopback: UNVALIDATED.**

## Environment (sanitized)

- **OS:** Windows 11 Home 10.0.26200.
- **Obsidian Desktop:** 1.13.4. **Bridge plugin:** TERAGON Vault Bridge 0.2.0 (`version:"0.2.0-phase1"`).
- **Browser:** in-app Chromium.
- **Synthetic vault:** `TERAGON OS` — synthetic notes only (`Welcome.md`, `Alpha Note.md`, `Beta Note.md`).
- **TERAGON origin:** `http://127.0.0.1:4173` (Vite dev of this branch; allowlisted). **Bridge:** `http://127.0.0.1:5200`.

## Architecture

```
/memory · ObsidianVaultPanel (compact, read-only)
   │  useObsidianVault (explicit actions only — no polling, no retry)
   ▼
src/integration/obsidian/vaultBridgeClient.ts  (fixed 127.0.0.1:5200, GET-only, bearer, timeout, bounded, fail-closed)
   ▼  cross-origin fetch (HTTP loopback), Origin enforced PLUGIN-SIDE
TERAGON Vault Bridge (Phase 1) inside Obsidian Desktop  →  app.vault (READ-ONLY)
```

New adapter (`src/integration/obsidian/`): `vaultBridgeClient.ts` (`getConnectionInfo`, `listNotes`,
`searchNotes`, `readNote`, `openInObsidian`, `probeHealth`), `obsidianCredential.ts` (token store),
`useObsidianVault.ts` (hook). UI: `src/modules/memory/obsidian/ObsidianVaultPanel.tsx`, wired once into
`src/modules/memory/MemoryPage.tsx`. Plugin: `bridgeServer.mjs` gains bounded `GET /note/<path>` and
`GET /search/<query>`.

## Pairing model + credential storage

- **Normal in-product interaction** (no terminal): "חבר Obsidian" opens a modal; the user runs the Obsidian
  command **“Copy TERAGON pairing token (once)”** and pastes the token into a password field. TERAGON verifies
  it with a single `GET /connection`; only on success is it stored.
- **Where the token lives:** browser **`sessionStorage`**, key `teragon.obsidian.pairingToken`, on the TERAGON
  origin only. The token is **never** in a URL/query, IndexedDB, localStorage, the repository, docs, logs,
  screenshots, or the PR.
- **When it is cleared:** on tab/session close (sessionStorage), and explicitly on **"נתק"** (disconnect) via
  `clearObsidianToken()`. The bridge token also rotates on each plugin load, so a stale token fails closed (401).
- Autonomous validation used a **local-only** dev build (esbuild `--define`, reverted before commit; **absent
  from the committed plugin**) to hand the ephemeral token to a local validator in memory — no token was ever
  printed or persisted.

## Real Vault proof (from the actual TERAGON browser + adapter)

| Step | Result |
|------|--------|
| **connect** | `GET /connection` 200 → `vaultName:"TERAGON OS"`, `readonly:true`; UI shows "מחובר", vault name, bridge `127.0.0.1:5200`, version `0.2.0-phase1`, readonly=כן, last-check time; credential stored |
| **list** | `GET /notes` → real `getMarkdownFiles()`: `Welcome.md`, `Alpha Note.md`, `Beta Note.md` (bounded metadata) |
| **search** | browser search `"Alpha"` → 1 hit `Alpha Note.md` (title/path/snippet/mtime) |
| **read** | opening the hit → note viewer with **real** Markdown (`# Alpha Note …`, 70 chars), bounded, no binary |
| **open in Obsidian** | official URIs `obsidian://open?vault=TERAGON%20OS&file=Alpha%20Note.md` and `…?vault=TERAGON%20OS` — **no token** |
| **disconnect** | UI returns to "לא מחובר"; `sessionStorage` credential **cleared** |

Notes read directly against the live plugin (server-verified, sanitized): `Welcome.md` (204), `Alpha Note.md`
(70), `Beta Note.md` (58) — `truncated:false`, no note body leaked beyond bounded content, `.obsidian` never
listed or readable.

## Read-only + confinement proof (405 / path security)

Against the real Phase-1 plugin: `POST`/`PUT`/`PATCH`/`DELETE` on **both** `/note` and `/search` → **405**.
Path security on `/note`: traversal `../` → **400**, absolute (`/…`, `C:/…`) → **400**, `.obsidian/…` → **400**,
non-Markdown (`.json`/`.png`) → **400**, missing note → **404** (no false success), no token → **401**. Query
over-length on `/search` → **400**. There is **no write endpoint, no filesystem endpoint, no shell/command
endpoint**; the adapter exposes no write method. Phase 1 is physically incapable of modifying the vault.

## Failure states (honest, fail-closed)

- **Obsidian closed / plugin disabled** (indistinguishable over loopback — both connection-refused): browser
  "בדוק חיבור" → error **“Obsidian אינו זמין או שהתוסף TERAGON Vault Bridge אינו פעיל.”** (verified live by
  closing Obsidian). **Restart Obsidian → reconnect works** (verified: re-pair → `vaultName:"TERAGON OS"`).
- **Unauthorized / expired token** → 401 → **“נדרש חיבור מחדש.”** · **Origin rejection** → generic safe error ·
  **Missing note** → “הפריט לא נמצא בכספת.” (no false success) · **Timeout** → fail closed (4s AbortController).
- No raw stack traces are ever displayed.

## Memory relationship + agents

`memoryEntries` (IndexedDB CRUD) and `memoryRecords` (governed) are untouched. The Obsidian Vault is a
**connected external local read-only knowledge source** — notes are **not** auto-copied into either store;
the existing manual governed import remains the separate capability. **No agents** (Wiki/Nexa/Mentor/
Orchestrator/Agent-Loop) are wired to the live vault in Phase 1.

## Responsive / accessibility

- **Axe (wcag2a+wcag2aa)** on the connected `/memory` incl. the open search modal: **0 violations** (0
  critical/serious).
- **Horizontal overflow: 0px** at **1440 / 1024 / 768 / 390**. RTL confirmed (`dir="rtl"`). Dark mode verified
  (tokens only; panel renders on `data-theme="dark"`).
- Keyboard operable (Modal focus-trap + native buttons); accessible Hebrew names on all controls; loading /
  empty / error states present; **zero NO_OP controls** (every button performs a real action, disabled
  buttons carry an honest reason).
- **Console:** zero uncaught JS exceptions. The only console entries are Chromium "Failed to load resource"
  logs from the deliberate fail-closed / wrong-token negative tests — inherent to a fail-closed `fetch`; the
  connect/restore success path adds none.

## Automated tests

- `tests/obsidian-bridge/bridgeServer.test.ts` (Phase-0 contract) + `bridgePhase1.test.ts` (`/note` + `/search`
  + `safeVaultNotePath` + read-only 405s + oversized truncation).
- `tests/obsidian-vault/vaultBridgeClient.test.ts` (adapter vs real bridge: read ops, NOT_FOUND, BAD_REQUEST,
  UNAUTHORIZED, UNAVAILABLE, TIMEOUT mapping, `openInObsidian` URI has no token).
- `tests/obsidian-vault/panel.test.tsx` (disconnected/connected/error states; credential stored on connect and
  **cleared on disconnect**; invalid credential fails closed; accessible names).
- Full suite: **2652 passing**. (12 `tests/platform/*` files fail to *load* locally on Node v25 due to a
  vite/rolldown shebang-parse quirk — pre-existing on the base, unrelated to this phase; CI runs Node 22.)
- `typecheck`, `typecheck:tests`, `oxlint`, `scan:secrets` — all pass / CLEAN.

## HTTPS

Only the localhost-HTTP → loopback path was exercised; browser security was **not** weakened.
**`HTTPS_TO_LOOPBACK = UNVALIDATED`.**

## Limitations (honest)

1. **Obsidian-closed vs plugin-disabled** cannot be distinguished over the loopback (both connection-refused);
   the fail-closed message names both causes.
2. Connected-state Axe was validated **live** (bridge required); the CI accessibility gate covers the
   **disconnected** `/memory` panel (no bridge in CI).
3. Search reads note contents on demand (bounded scan/results); no index, no semantic/vector search, no
   embeddings, no remote model.
4. HTTPS-hosted TERAGON → loopback remains a documented pre-condition for any hosted deployment.
