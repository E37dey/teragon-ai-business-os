# TERAGON — Submission Screenshots

Clean 1440-wide (mobile 390-wide) demo-state captures. RTL Hebrew UI, synthetic data, no debug overlays.

| # | File | Shows |
|---|---|---|
| 01 | `01-login.png` | Welcome / demo login (three role cards) |
| 02 | `02-manager-home.png` | Manager portal home — decisions first, KPIs, quick access |
| 03 | `03-student-home.png` | Student portal home — continue learning, tasks, mentor |
| 04 | `04-technician-home.png` | Technician portal home — current job, queue, Fixer |
| 05 | `05-ai-workspace.png` | AI Workspace — 7-agent ecosystem + "what needs attention" |
| 06 | `06-agent-coordination.png` | Agent coordination / network |
| 07 | `07-knowledge-map.png` | Knowledge & Obsidian integration panel (`/memory`) — bridge `127.0.0.1:5200`, human-approved writes, governed memory |
| 08 | `08-governed-workflow.png` | Governed workflow (live-process, `governed-knowledge-capture` selected) |
| 09 | `09-human-approval.png` | Human approval boundary — governed decision/OperationsBrief |
| 10 | `10-analytics.png` | Analytics dashboard |
| 11 | `11-access-denied.png` | Route-level RBAC deny (`AccessDenied`) |
| 12 | `12-mobile-student.png` | Student home @ 390px (mobile) |
| 13 | `13-mobile-technician.png` | Technician home @ 390px (mobile) |

## ⚠️ 07 (Knowledge Map) — capture on the presenter's machine (30 seconds)

`07-knowledge-map.png` currently shows the Obsidian integration panel from the **automated (unpaired) preview**, so its connection badge reads "disconnected". A **connected** replacement could **not** be exported by the browser automation for two reasons, both harness limitations (not product issues):
1. The claude-in-chrome extension returns screenshots as **server-side IDs** and cannot write the pixels to this repo's filesystem.
2. The live 63-node force-directed map **continuously animates**, which freezes the renderer and times out `Page.captureScreenshot`.

**The connected state was verified live this session** (real paired Chrome, real bridge): `מחובר`, **Vault: TERAGON OS**, bridge `http://127.0.0.1:5200` v0.3.0-phase3, **write: human-approval only**, and the loaded **Knowledge Map = 63 nodes / 147 links / 6 clusters** — see `docs/submission/TEST_REPORT.md`.

**To produce a connected `07-knowledge-map.png` yourself (recommended before the demo):**
1. Open Obsidian Desktop with the **TERAGON OS** vault (bridge on `127.0.0.1:5200`).
2. In the paired Chrome, open `http://localhost:4173/memory` → confirm the green **מחובר** badge.
3. Click **"טען מפה"** (load map) and wait ~3–5 s for the graph to render.
4. Take a full-window screenshot (OS screenshot tool) and save it as `docs/submission/screenshots/07-knowledge-map.png`.

*(An OS-level screenshot avoids the animation-freeze that blocks the browser-automation capture.)*
