# RC2 evidence — v0.9.0-rc.2 (`68e229e`)

Screenshots captured against the running RC2 build (`http://localhost:4173`).

## Reproducible (deterministic seed, fresh browser)
| File | Screen | Notes |
|---|---|---|
| `command-center-1440.png` | Command Center `/` @ 1440 | executive operations view |
| `analytics-1440.png` | Analytics `/analytics` @ 1440 | reworked executive-BI trend chart (framed axis, readable gutter, distributed dates, area depth, "now" anchor) |
| `analytics-390.png` | Analytics @ 390 | mobile — 0 horizontal overflow, chart usable |
| `agent-coordination-1440.png` | `/agents/collaboration` @ 1440 | restored conflict rail + ApprovalPanel; directional-arrowhead run graph, run node selected |

All four verified at **0 horizontal overflow**.

## Connected-state proof (requires the paired browser profile)
The **Memory-connected**, **Knowledge Map (63 documents)** and **successful governed AI Workspace workflow** states depend on the browser-profile-bound Trusted Device (a non-exportable P-256 key in the paired Chrome). They cannot be reproduced in a fresh CI browser context, so they are **not** committed here as static images. They are authoritatively validated by the live Obsidian smoke against the real `TERAGON OS` vault:

- **Memory / bridge:** connected · Vault `TERAGON OS` · bridge `http://127.0.0.1:5200` (v0.3.0-phase3) · write = human-approval-only
- **Knowledge Map:** 63 documents / 147 links, source `Obsidian · TERAGON OS`
- **Governed workflow:** `WAITING_FOR_USER` → source `Obsidian · TERAGON OS · AI Operations.md` → accept → `WORKFLOW_COMPLETED`
- **Trusted Device:** existing device reconnected, **no new pairing**, **0 automatic Vault writes**
