# TERAGON — Presenter Tools (demo-day helpers)

External helpers only — **no product code is changed**. They drive the real app on `localhost:4173`.

## On your Desktop (double-click)
- **`START-TERAGON-DEMO.bat`** — brings the demo up: starts Obsidian (bridge) if closed, starts the preview server on `http://localhost:4173` (skips if already running — no more "port in use" error), and opens the browser at `/welcome`.
- **`START-TERAGON-AUTODEMO.bat`** — runs the **hands-free auto-demo**: opens a browser that tours the app by itself, **slowly**, performing real actions and showing their results, so you can narrate while it runs.

## The auto-demo (`demo/auto-demo.mjs`)
A standalone Playwright script (uses the app's real demo logins; changes nothing in the product).

**Screen-share safe:** the demo window stays **100% clean — no captions overlaid** (so it's safe to share with the audience). Your narration cues appear **only where the audience does NOT see them**: in the terminal you launched it from, and (with `NOTES=1`) in a **separate "presenter notes" window** you keep to yourself. Tip: in your meeting tool, **share only the demo browser window**, not the whole screen.

Slow by default. It **performs actions and shows results**, not just navigation:
1. Welcome — the pitch
2. Manager portal — decisions first (slow scroll through the home)
3. **Global search** — types a real customer name → **live results appear**
4. Analytics — trends/metrics
5. Student portal — learning experience
6. Technician portal — current job
7. **AI Workspace** — **runs an agent → its deterministic result appears** (action → result)
8. AccessDenied — real RBAC block
9. **Pause** → switch to the live Obsidian window yourself (`localhost:4173/memory`)

Each scene holds ~14–28s (slow) so you can narrate. Options:
```bash
node demo/auto-demo.mjs           # slow, clean; cues in the terminal
NOTES=1 node demo/auto-demo.mjs   # also opens a separate presenter-notes window (don't share it)
FAST=1  node demo/auto-demo.mjs   # quicker
LOOP=1  node demo/auto-demo.mjs   # repeat forever
```
Close the browser window to stop.

## Training booklet (`docs/submission/he/GUIDE_HE.html`)
A Hebrew, print-ready **guide with annotated screenshots** — 10 chapters, each with **numbered arrow callouts** over a real screenshot, a **"what each element does"** legend, and a **"what to say"** narration line, plus a role→portal **summary**, mobile figures, and an honest-boundaries note. Open it in a browser and present from it, or **Ctrl/⌘-P → Save as PDF**. Regenerate after re-capturing screenshots with:
```bash
node demo/build-guide.mjs
```

## User adoption & training kit (`docs/submission/he/TRAINING_KIT_HE.html`)
A Hebrew, print-ready **end-user training kit** built on the AI-implementation methodology (personas → tracks, stage-gates, minimum-adoption-kit, ADKAR, adoption measurement): solution purpose, 7 personas + training matrix, **per-portal Quick-Starts** (5-block anatomy), usage policy + human boundaries, interaction library, FAQ/objections (ADKAR), risk & governance sheet, 5×90s microlearning, adoption dashboard, and the 6 stage-gates. Regenerate with:
```bash
node demo/build-training-kit.mjs
```

## Important — two surfaces
- **Portals / agents / navigation:** works anywhere — public URL `https://teragon-final-project-demo.netlify.app` **or** `localhost:4173`.
- **Live Obsidian (vault, Knowledge Map, governed workflow):** **`http://localhost:4173/memory`** only — the paired browser on your machine (a public site cannot and must not reach your local `127.0.0.1:5200` bridge; that is by design). The auto-demo deliberately does **not** touch the local vault; do the Obsidian part live in your paired window.

## Verified live (this machine, connected)
- Obsidian connected · Vault **TERAGON OS** · Knowledge Map **62 documents** (live current count).
- Governed workflow ran end-to-end to the human gate: Orchestrator → **Wiki live-searched Obsidian for "AI Operations"** → **found 1** → **read `AI Operations.md`** → produced a knowledge-based recommendation (topics: AI, Automation, Operations) → **WAITING_FOR_USER**; source **`Obsidian · TERAGON OS · AI Operations.md`**; **0 automatic vault writes**. → The agents genuinely reach conclusions from the vault.

## Keeping Obsidian connected
Obsidian was added to **Windows startup**, so the bridge is up after login. Keep Obsidian open during the demo; don't click **נתק** / "forget device". If the Knowledge Map looks empty, click **"טען מפה"** once (that's the map widget loading, not a disconnection).
