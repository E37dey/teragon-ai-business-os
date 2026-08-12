# TERAGON Vault Bridge — Phase 0 (development-only, READ-ONLY)

An isolated Obsidian community-style plugin that starts a **loopback (127.0.0.1) READ-ONLY** HTTP bridge
exposing bounded Vault metadata to TERAGON. **No writes, no sync, no external network.** This is the Phase 0
transport/security spike from `docs/product-v2/OBSIDIAN_LIVE_CONNECTION_ARCHITECTURE.md`.

## Files
- `bridgeServer.mjs` — the loopback HTTP bridge (single source; also used by the local spike runner + tests).
- `mockVault.mjs` — deterministic mock provider (spike/tests only; the plugin uses `app.vault`).
- `main.ts` — the Obsidian plugin wrapper (uses `app.vault`, read-only).
- `manifest.json` — Obsidian plugin manifest (`isDesktopOnly`).

## Endpoints (GET only)
- `GET /health` — generic health, **no auth, no vault content**.
- `GET /connection` — **authenticated**; `{ connected, vaultName, version, readonly: true }`.
- `GET /notes` — **authenticated**; bounded list of `{ path, basename, mtime }` (markdown metadata only).

No POST/PUT/PATCH/DELETE. No `?path=`/`?file=`. Binds `127.0.0.1` only.

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
127.0.0.1-only bind · Bearer token (constant-time compare) · explicit Origin allowlist (no `*`) · GET-only ·
no arbitrary path params · bounded response/body sizes · sanitized errors (no stack, no token) · correlation
ids · fail-closed. See the spike evidence doc for the automated + live browser test results.
