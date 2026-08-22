# TERAGON — Presenter Tools (demo-day helpers)

External helpers only — **no product code is changed**. They drive the real app on `localhost:4173`.

## On your Desktop (double-click)
- **`START-TERAGON-DEMO.bat`** — brings the demo up: starts Obsidian (bridge) if closed, starts the preview server on `http://localhost:4173` (skips if already running — no more "port in use" error), and opens the browser at `/welcome`.
- **`START-TERAGON-AUTODEMO.bat`** — runs the **hands-free auto-demo**: opens a browser that tours the app by itself with a big on-screen banner showing the scene title and **"what to say"**, so you can talk while it runs.

## The auto-demo (`demo/auto-demo.mjs`)
A standalone Playwright script (uses the app's real demo logins; changes nothing in the product). It walks through:
1. Welcome — the pitch
2. Manager portal — decisions first
3. Analytics
4. Student portal — learning
5. Technician portal — current job
6. AI Workspace — the 7 agents
7. AccessDenied — real RBAC
8. **Pause** → switch to the live Obsidian window yourself (`localhost:4173/memory`)

Each scene holds ~11–22s with a progress bar so you can narrate. Options:
```bash
node demo/auto-demo.mjs          # default pace
SLOW=1 node demo/auto-demo.mjs   # ~1.5x slower
LOOP=1 node demo/auto-demo.mjs   # repeat forever
```
Close the browser window to stop.

## Important — two surfaces
- **Portals / agents / navigation:** works anywhere — public URL `https://teragon-final-project-demo.netlify.app` **or** `localhost:4173`.
- **Live Obsidian (vault, Knowledge Map, governed workflow):** **`http://localhost:4173/memory`** only — the paired browser on your machine (a public site cannot and must not reach your local `127.0.0.1:5200` bridge; that is by design). The auto-demo deliberately does **not** touch the local vault; do the Obsidian part live in your paired window.

## Verified live (this machine, connected)
- Obsidian connected · Vault **TERAGON OS** · Knowledge Map **62 documents** (live current count).
- Governed workflow ran end-to-end to the human gate: Orchestrator → **Wiki live-searched Obsidian for "AI Operations"** → **found 1** → **read `AI Operations.md`** → produced a knowledge-based recommendation (topics: AI, Automation, Operations) → **WAITING_FOR_USER**; source **`Obsidian · TERAGON OS · AI Operations.md`**; **0 automatic vault writes**. → The agents genuinely reach conclusions from the vault.

## Keeping Obsidian connected
Obsidian was added to **Windows startup**, so the bridge is up after login. Keep Obsidian open during the demo; don't click **נתק** / "forget device". If the Knowledge Map looks empty, click **"טען מפה"** once (that's the map widget loading, not a disconnection).
