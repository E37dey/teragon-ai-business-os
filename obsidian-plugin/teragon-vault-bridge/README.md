# TERAGON Vault Bridge (Phase 3) — development-only loopback bridge

An isolated Obsidian community-style plugin (`manifest.json` v0.3.0, `isDesktopOnly`) that starts a
**loopback (127.0.0.1) only** HTTP bridge for TERAGON. It exposes **bounded read/search/open** access
to Vault metadata and notes, **Trusted Device Pairing** (auto re-auth after restart), and **three
human-confirmed governed write endpoints** (create / update / append) — each hash-guarded, idempotent,
and read-back-verified. **No delete/rename/move, no sync, no external network.** Trusted-device auth
authenticates the **bridge session only — it is not write authority**; the bridge is loopback HTTP
(`HTTPS_TO_LOOPBACK = UNVALIDATED`). Architecture:
`docs/product-v2/OBSIDIAN_LIVE_CONNECTION_ARCHITECTURE.md`.

## Files
- `bridgeServer.mjs` — the loopback HTTP bridge (single source; also used by the local spike runner + tests).
- `mockVault.mjs` — deterministic mock provider (spike/tests only; the plugin uses `app.vault`).
- `main.ts` — the Obsidian plugin wrapper (uses `app.vault`).
- `manifest.json` — Obsidian plugin manifest (`isDesktopOnly`).

## Endpoints
**Read (GET, authenticated except `/health`):**
- `GET /health` — generic health, **no auth, no vault content**.
- `GET /connection` — `{ connected, vaultName, version, … }`.
- `GET /notes` — bounded list of `{ path, basename, mtime }` (markdown metadata only).
- `GET /graph` — bounded knowledge-graph metadata (no note bodies).
- `GET /note/<path>` · `GET /search/<query>` — bounded single-note read / search.

**Trusted Device auth (POST):** `/auth/register` · `/auth/challenge` · `/auth/verify` — signed
challenge-response; the plugin persists only **public** keys.

**Governed write (POST, human-confirmed):** `/write/create` · `/write/update` · `/write/append` —
enabled only when the write capability is configured; each requires a `mutationId`, a
`contentHash` (and `expectedHash` for update/append), passes a native Obsidian confirmation, and is
read-back-verified. **No delete/rename/move.** Binds `127.0.0.1` only.

## Pairing (dev)
1. Enable the plugin in Obsidian; it starts the bridge on `127.0.0.1:5200`.
2. Run the command **"Copy TERAGON pairing token (once)"** — the token is copied to your clipboard.
3. Paste the token into TERAGON's diagnostic connect field. TERAGON sends it as `Authorization: Bearer <token>`.

**Never** put the token in a URL/query string, never commit it, never log it. It rotates on every plugin load.

## Trusted Device Pairing (auto re-auth after restart)
The pairing code is now a **one-time bootstrap** for device trust, not a recurring login. The
browser holds a **non-exportable** ECDSA P-256 key; the plugin persists only the **public** key
(`loadData/saveData`, per-vault). After a restart the browser proves possession via a signed
challenge (`/auth/challenge` → `/auth/verify`) and gets a fresh short-lived session — **no new
pairing code**. Manage/revoke via the command **"Manage TERAGON trusted devices"**. See
`docs/product-v2/OBSIDIAN_TRUSTED_DEVICE_PAIRING_EVIDENCE.md`.

## Build (produces `main.js` for install)
`main.js` is the esbuild bundle of `main.ts` (+ `bridgeServer.mjs`) that Obsidian loads:
```
npx esbuild main.ts --bundle --format=cjs --platform=node --target=es2020 \
  --external:obsidian --external:electron --outfile=main.js
```
Install by copying `main.js` + `manifest.json` into
`<vault>/.obsidian/plugins/teragon-vault-bridge/`, then toggle the plugin off/on (or restart
Obsidian) to load it.

## Security
127.0.0.1-only bind · Bearer session token (constant-time compare) · explicit Origin allowlist (no `*`) ·
reads are GET with bounded path params only · governed writes are POST behind a separate write
capability + native Obsidian confirmation + read-back (no delete/rename/move) · bounded response/body
sizes · sanitized errors (no stack, no token) · correlation ids · fail-closed. See the evidence docs
for the automated + live browser test results.
