# TERAGON Visual Intelligence Workspace — evidence

One coherent, interactive **Visual Intelligence Workspace** with two real visual modes: **רשת סוכנים** (Agent
Network, the real 7-agent registry) and **מפת ידע** (live Obsidian Knowledge Graph). Every visual state
corresponds to real product data/state.

> **Visual activity reflects real TERAGON runtime state.** · **No fake agent activity is presented as real.** ·
> **The Obsidian graph is live Vault metadata visualization, not synchronization.** · **Visualization grants no
> additional write authority.** · **HTTPS_TO_LOOPBACK = UNVALIDATED.**

## Architecture

```
AI Workspace (/ai-workspace) → VisualIntelligenceWorkspace  [ רשת סוכנים | מפת ידע | מסך מפוצל ]
  ├─ AgentNetworkPanel ← real AGENT_DEFINITIONS (7) + getActionsForAgent + runAgentAction (reused) + agentHandoffs trace
  └─ KnowledgeGraphPanel ← GET /graph (bridge) ← Obsidian app.vault + metadataCache.resolvedLinks
/memory also mounts KnowledgeGraphPanel (same component).
```

## Graph library / dependency decision

**No new dependency.** `package.json` has no graph library; for bounded node counts (server cap 300 nodes /
1500 edges) a **small custom deterministic force-directed SVG layout** (repulsion + springs + centering, fixed
iterations, circle init — no `Math.random`) is sufficient and avoids supply-chain/bundle cost. Zoom/pan via an
SVG `<g transform>`; selection/hover via native SVG events. React 19 + inline SVG only.

## Graph data source (real, bounded, read-only)

Bridge `GET /graph` (auth + Origin, **GET-only**, no writeKey): nodes from `app.vault.getMarkdownFiles()` (`id,
path, basename, mtime, tags, linkCount`), edges from `app.metadataCache.resolvedLinks` (real note→note links).
Markdown notes only; **no note bodies**, no `.obsidian`, no binary, no raw fs paths, no secrets. Highest-degree
nodes kept when the vault exceeds the node cap → `truncated:true` (surfaced honestly in the UI).

**Real runtime graph (synthetic vault `TERAGON OS`, Obsidian 1.13.4):** 11 synthetic linked Markdown notes
(Company/Sales/Customers/Projects/AI/Support/Knowledge/Operations/Automation/Product/Security) + 3 base notes →
`GET /graph` returned **14 nodes, 32 edges, truncated:false**; `Customers` hub `linkCount:7`; response contained
**no** content/body/token/writeKey. In the real browser the graph rendered **14 node circles + 32 edge lines**,
source label "מקור: Obsidian · TERAGON OS · מפת קישורים חיה", accessible relationship list (14), and selecting
`Customers` showed real degree (3 out / 4 in) with **קרא מסמך** (reuses Phase-1 `readNote`) + **פתח ב-Obsidian**
(reuses the official `obsidian://` navigation).

## Agent Network (exactly the 7 canonical agents)

Reads the real `AGENT_DEFINITIONS` (no invented agents, no duplicate registry): `ag-orchestrator` (מנהל התזמור),
`ag-hunter` (סוכן מכירות), `ag-fixer` (סוכן שירות), `ag-mentor` (סוכן הדרכה), `ag-nexa` (סוכן שיווק וצמיחה),
`ag-wiki` (סוכן ידע), `ag-flow` (סוכן אוטומציות). Radial layout (orchestrator centre). Selecting an agent opens a
side panel with its real `purposeHe` (role), `allowedOperations` + `allowedDomains` (capabilities),
`prohibitedDomains` (denied) — and embeds the **existing `AgentActionsPanel`** (the real `runAgentAction`
engine + approval gate; no second engine). Per-agent **status is real** — derived from actual action results
(`ok/applied → SUCCESS`, `awaiting_approval → WAITING`, `execution_error → ERROR`); default **IDLE** and never
animated as working. **Runtime:** the browser showed exactly **7 agent nodes**, the accessible agent list (7),
and a selected agent's real capabilities + the reused action panel.

## Handoff visualization (real only)

- **Supported** handoffs (dashed, subtle): the orchestrator may dispatch to each of the 6 business agents — a
  real capability (`ag-orchestrator` holds the `dispatch` operation + `agentHandoffs` domain). Runtime showed
  **6** supported edges.
- **Active** handoff traces (solid accent): read from the real `agentHandoffs` collection; when none exist,
  **no active edges are fabricated** (runtime: 0 active edges). The two are visually distinct.

## Bounded loop + cross-view

A compact strip renders the real bounded-loop structure (Hunter read → user continue → Fixer proposal → human
approval); the live loop runs in the existing `AgentLoopPanel`. **Cross-view Agent↔Note**: the `AgentNoteUsage`
contract exists, but Phase-4 live agent Vault access is not in this checkpoint, so `deriveAgentNoteUsages()`
returns `[]` and selecting an agent shows **"אין שימוש מתועד במסמך זה"** — no invented Agent↔Note edges.

## Motion

Restrained, token-based, state-communicating: `agent-status-pulse` (RUNNING/WAITING ring) via CSS keyframe,
disabled under `@media (prefers-reduced-motion: reduce)`; selection/focus is a transform change, not decoration.
No neon, no constant motion, no particles.

## Responsive / accessibility

- **Axe (wcag2a+wcag2aa)** on `/ai-workspace` with the workspace + a selected agent + action panel: **0
  violations** (fixed a `tablist` → toggle-button-group finding). **0 horizontal overflow** at **390** in both
  agents and split modes (split stacks on narrow screens); desktop 0. RTL shell; dark/light via design tokens.
- **Keyboard/AT alternatives** (canvas is supplemental): Knowledge Graph — search, search-result selection,
  selected-note details, and a **"רשימת קשרים"** relationship list; Agent Network — a **"רשימת סוכנים"** list,
  keyboard selection, and actions in DOM via the reused panel. **No uncaught JS errors** (only Chromium
  fail-closed resource logs from discrete 401/409 fetch responses — inherent to fail-closed `fetch`).

## Performance bounds

Server caps (300 nodes / 1500 edges); deterministic layout computed once per graph (memoized), not per frame;
zoom/pan mutate a transform only; no whole-vault body loading, no embeddings/indexing, no background polling
(explicit "רענן גרף").

## Security regression (Phase-3 unchanged)

The graph capability is **read-only** and independent of write: `GET /graph` needs the pairing token + Origin,
needs **no** writeKey, contains no writeKey/HMAC, and `POST/PUT/PATCH/DELETE /graph → 405`, bad Origin → 403,
no token → 401 (bridge tests). Property **A/B/C/D** from Phase 3 remain intact — the full Phase-1/2/3 obsidian +
write-security suites stay green; nothing here creates a bypass or exposes a secret to any agent/visual.

## Tests

`tests/obsidian-graph/bridgeGraph.test.ts` (nodes/edges from metadata, orphan+hub, truncation, no bodies/secrets,
401/403/405, no-writeKey), `tests/obsidian-graph/graphPanel.test.tsx` (disconnected/loaded/error, source
attribution, select→details, readNote reuse, fail-closed), `tests/visual-workspace/visualWorkspace.test.tsx`
(exactly 7 agents, real capabilities + reused engine, supported edges + no fabricated active edges, cross-view
honesty, mode switch). Full `vitest` **2709 passing** (12 `tests/platform/*` files fail to *load* on local Node
v25 vite/rolldown shebang — pre-existing, unrelated; CI Node 22). `typecheck`, `typecheck:tests`, `oxlint`,
`scan:secrets` all pass/CLEAN. Phase-1/2/3 regression suites green.

## Limitations (honest — deferred to a later checkpoint)

The interactive core is real and tested. Deferred visual enhancements (not fabricated as done): live node-drag
physics rebalancing, full-screen immersive graph mode, animated camera-to-node transitions, animated active-
handoff edge pulse, a dedicated Trace panel, and a visual write-back stepper. The **"ייבא לידע"** action from a
graph node (Phase-2 governed import) is available today from the read-only connection panel, not yet inlined in
the graph details. Cross-view Agent↔Note edges await Phase-4 real agent Vault access (contract present, no
fabricated data). `HTTPS_TO_LOOPBACK = UNVALIDATED`.
