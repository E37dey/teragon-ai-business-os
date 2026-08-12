# Obsidian Trusted Device Pairing — evidence

Replaces "copy a new pairing code on every Obsidian restart" with a secure, automatic
challenge-response re-authentication — **without** a permanent bearer token.

> **The persistent trusted-device credential is an asymmetric device identity, not a persistent bearer token.**
> **The browser private key is non-exportable and never leaves the TERAGON origin.**
> **The Obsidian plugin persists only trusted public-device information.**
> **Short-lived bridge session credentials are reissued only after successful trusted-device challenge-response.**
> **Trusted-device authentication does not grant Obsidian write authority.**
> **Device revocation prevents future trusted-device re-authentication.**
> **Vault content cannot modify authentication authority.**
> **No automatic synchronization is implemented.**
> **HTTPS_TO_LOOPBACK = UNVALIDATED**

## The old problem
The plugin minted a fresh random bearer per load (`onload → generateToken()`), held only in
memory. After an Obsidian/plugin restart the browser's `sessionStorage` bearer no longer
matched → `401` → the user had to copy a new pairing code. Making the bearer permanent was
rejected: token rotation is a security property.

## Threat model (honest)
Loopback HTTP (`127.0.0.1:5200`), Origin-allowlisted (`localhost:4173`/`127.0.0.1:4173`), not
validated TLS — **`HTTPS_TO_LOOPBACK = UNVALIDATED`**. Trusted-device cryptography improves
authentication and replay resistance; it does **not** turn loopback HTTP into HTTPS, and a
non-exportable key does **not** make an actively XSS-compromised page safe (an in-origin XSS
could still ask WebCrypto to sign). Existing XSS/CSP protections remain necessary.

## Architecture

### Asymmetric device identity (browser) — `src/integration/obsidian/deviceIdentity.ts`
- ECDSA **P-256** key pair generated `extractable:false` → the **private key is non-exportable**
  (the public key of an asymmetric pair stays exportable per WebCrypto, so we can register it).
- Persisted in **IndexedDB** as a structured-clone `CryptoKey` (DB `teragon-obsidian-trust`),
  alongside the public JWK and a random `deviceId`. The private key is **never** serialized to
  raw/JWK, logged, or sent to the plugin. This is a different primitive from "store the pairing
  token in IndexedDB" — no secret bearer is persisted, only a key the browser can *use* but not
  *export*.
- `forgetDevice()` irreversibly deletes it.

### Plugin trust registry — `obsidian-plugin/.../main.ts`
- `loadData()`/`saveData()` persist an array of **public** `TrustedDevice` records
  `{ deviceId, publicKey(JWK), fingerprint, label, origin, vaultName, createdAt, lastSeenAt,
  revoked }`. Obsidian stores plugin data in **this vault's** `data.json`, so trust is
  inherently **vault-scoped**; `vaultName` is stamped for audit. **Never** persisted: private
  key, session bearer, writeKey, HMAC capability, or the raw pairing code. Bounded to 10 devices.
- Command **"Manage TERAGON trusted devices"** → modal with non-secret metadata + revoke
  one / revoke all.

### First-pair bootstrap — `trustedAuth.registerDevice()` + `POST /auth/register`
One-time pairing token → `register` (bootstrap-gated) stores the device public key and issues a
short-lived session bearer. The pairing token is used once and **not persisted**; it is
**one-time per plugin load** for enrolling a *new* device (a used code cannot enrol a second
device; same-device re-pair is idempotent).

### Challenge-response — `POST /auth/challenge` + `POST /auth/verify`
`challenge` returns `{ challengeId, nonce, expiresAt, bridgeInstanceId }` (60 s TTL, one-time,
Origin-bound). The browser signs the **canonical payload**
`["tdp-1", deviceId, challengeId, nonce, bridgeInstanceId, origin, expiresAt].join("\n")`
with the non-exportable key; `verify` checks device/Origin/TTL/one-time-use, verifies the
ECDSA signature against the stored public key, consumes the challenge, and issues a new session.

### Short-lived session lifecycle
Session bearer TTL **30 min**, **in-memory only** (never persisted plugin-side), held in
`sessionStorage` client-side. It is invalid after a plugin restart (new bridge runtime) or
expiry; the persistent device identity re-mints it automatically. `bridgeInstanceId` (random
per runtime) is bound into every signed payload → a signature captured for one runtime cannot
be replayed against a future one.

### Automatic re-auth (the fix) — chokepoint in `vaultBridgeClient.ts`
Any authenticated `401` → **single-flight** trusted re-auth → **retry the original request
once** with the fresh session. Only if re-auth cannot recover (no device / revoked / bridge
down) do we expire to the **manual reconnect fallback**. This one chokepoint serves every
consumer — Memory, Knowledge Graph, Agent reads, Phase-5 workflows, Phase-8 packs — so there is
no second Obsidian client and behavior is consistent everywhere.

### Concurrent 401s
`trustedAuth.reauthenticate()` is single-flight: N concurrent 401s trigger **one** challenge;
all waiters reuse its session (proven by test — challenge count = 1 for 3 concurrent calls).

### Startup auto-reconnect — `useObsidianVault`
On load: a surviving session is verified (chokepoint silently re-auths if stale); with no
session but a trusted device present, challenge-response runs with **no pairing code**
("מתחבר ל-Obsidian…" → "מחובר · TERAGON OS"). Only a genuinely untrusted browser lands on
first-pair. `forgetDevice()` ("שכח את המכשיר הזה") erases the local key + session → first-pair.

## Phase-3 write boundary preserved
Trusted-device auth re-establishes only the bridge **session**. Writes still require the
**separate `writeKey`** → per-request **HMAC capability** bound to op/path/mutationId/
contentHash/expiry → **native Obsidian confirmation** → **read-back verification**. None of
this changed; a re-authenticated session cannot mutate the Vault.

## Automated tests (23 new, `tests/obsidian-trusted-device/`)
- **bridge protocol (11):** register (bootstrap-gated), **restart re-auth with NO re-pairing**,
  one-time challenge (replay fails), wrong bridge instance, wrong device, revoked, unknown,
  Origin-mismatch, used-pairing-code-can't-enrol-second-device, backward-compat (no trustStore).
- **deviceIdentity (4):** EC P-256 generate+persist, signature verifies against the plugin
  verifier (canonical contract) + tamper fails, **private key non-exportable** (`extractable:false`,
  `exportKey` rejects), forget erases.
- **trustedAuth (5):** first-pair stores session (public key only), challenge-response verifies
  server-side, **single-flight (one challenge for concurrent re-auth)**, no-device → null,
  denied → null (nothing stored).
- **chokepoint (3):** 401 → re-auth → retry once → success; 401 → no recovery → expire; first-try
  success never re-auths.

Backward compatibility: all **153 existing obsidian tests** pass; **full vitest 0 assertion
failures** (the 12 `tests/platform/*` file-load errors are a pre-existing local shebang
transform issue, reproduced on the clean base, green in CI).

## Security negatives (all fail closed)
replay · expired challenge (bounded 60 s TTL) · wrong signature · wrong device · wrong Origin ·
wrong `bridgeInstanceId` · revoked device · unknown device · modified canonical payload ·
key loss → manual pairing. Vault/Agent content cannot influence auth (authority fields come
only from trusted app/session + stored keys, never from note content).

## Cleanup
No dev relay, no temporary tokens/flags/logs, no synthetic trust records committed. `scan:secrets`
CLEAN. Pairing code / session bearer / private key / writeKey / HMAC are never logged.

## Limitations
- `HTTPS_TO_LOOPBACK = UNVALIDATED` (loopback HTTP, not TLS).
- Non-exportable key ≠ XSS-proof (an in-origin XSS could request a signature).
- Revocation prevents **future** re-auth immediately; an already-issued session expires within
  ≤30 min (not force-killed mid-session).
- Live desktop restart proof requires the rebuilt plugin installed in Obsidian (native step).
