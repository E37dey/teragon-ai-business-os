# TERAGON — Quick Start

Get TERAGON running and demonstrable in **under 5 minutes** from a clean checkout.

## 1. Prerequisites

- **Node.js ≥ 20** and **npm** (the project uses Vite 8 / React 19 / TypeScript).
- A modern **Chromium-based browser** (Chrome/Edge) for the demo.
- *(Optional — only for the Obsidian demo)* **Obsidian Desktop** with the `teragon-vault-bridge` plugin and the **TERAGON OS** vault.

No database, cloud account, API key, or remote model is required for the demo — it runs fully local on synthetic data.

## 2. Install

```bash
npm install
```

## 3. Environment

None required for the demo. TERAGON defaults to **`LOCAL_INDEXEDDB`** persistence (in-browser) and a **local deterministic AI engine** (`AI_REMOTE_ENABLED=false`). No `.env` is needed to run the portals.

## 4. Run TERAGON

Development server (hot reload):

```bash
npm run dev
```

Or a production-like build + preview:

```bash
npm run build
npm run preview
```

## 5. Open it

- `npm run dev` → **http://localhost:5173**
- `npm run preview` → **http://localhost:4173**

Go to **`/welcome`** for the demo login page (e.g. `http://localhost:4173/welcome`).

## 6. Demo login accounts

Click a card on `/welcome` to prefill, then submit. *(Demo-only credentials.)*

| Portal | Email | Password |
|---|---|---|
| **Manager** | `manager@teragon.demo` | `TeragonManager2026!` |
| **Student** | `student@teragon.demo` | `TeragonStudent2026!` |
| **Technician** | `technician@teragon.demo` | `TeragonTech2026!` |

Each account lands on its own role home (`/home`). Use the **"יציאה"** chip in the header to exit a portal and switch accounts.

## 7. (Optional) Start the Obsidian bridge

Only needed to demonstrate the live knowledge/governed-workflow features:

1. Open **Obsidian Desktop** with the **TERAGON OS** vault.
2. Ensure the **`teragon-vault-bridge`** plugin is enabled (it listens on `http://127.0.0.1:5200`).
3. In TERAGON, open **`/memory`** — it auto-reconnects via the existing **Trusted Device** (no pairing code on reconnect).

## 8. Expected Vault

Vault name **"TERAGON OS"** (~63 notes). The Knowledge Map renders a live force-directed graph (verified: **63 nodes / 147 links / 6 clusters**).

## 9. Verify the connection

On **`/memory`** you should see:

- badge **מחובר** ("connected"),
- **Vault: TERAGON OS**, **Bridge: `http://127.0.0.1:5200`**, version **0.3.0-phase3**,
- **Write: human-approval only**.

Quick bridge health check (no auth needed):

```bash
curl http://127.0.0.1:5200/health
```

Expected: `{"ok":true,"service":"teragon-vault-bridge","version":"0.3.0-phase3",...}`.

## 10. Stop everything

- Stop the dev/preview server with **Ctrl+C** in its terminal.
- The Obsidian bridge stops when you close Obsidian (or disable the plugin). In TERAGON you can also click **נתק** ("disconnect") on `/memory`.

---

### One-command demo

The simplest single command for a reviewer is:

```bash
npm install && npm run build && npm run preview
```

then open **http://localhost:4173/welcome**. No new infrastructure is introduced.
