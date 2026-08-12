# TERAGON Visual Intelligence Workspace — evidence

One coherent, interactive **Visual Intelligence Workspace** with two real visual modes: **רשת סוכנים** (Agent
Network, the real 7-agent registry) and **מפת ידע** (live Obsidian Knowledge Graph). Every visual state
corresponds to real product data/state. This is the **premium visual redesign** ("TERAGON Visual Nervous
System") — a full-bleed spatial workspace, not a card-bound SVG diagram.

> **Visual activity reflects real TERAGON runtime state.** · **No fake agent activity is presented as real.** ·
> **The Obsidian graph is live Vault metadata visualization, not synchronization.** · **Visualization grants no
> additional write authority.** · **HTTPS_TO_LOOPBACK = UNVALIDATED.**

## Architecture

```
AI Workspace (/ai-workspace) → VisualIntelligenceWorkspace  [ רשת סוכנים | מפת ידע | מסך מפוצל ]
  ├─ AgentNetworkPanel  ← real AGENT_DEFINITIONS (7) + getActionsForAgent + runAgentAction (reused) + agentHandoffs trace
  └─ KnowledgeGraphPanel ← ForceGraph engine ← GET /graph (bridge) ← Obsidian app.vault + metadataCache.resolvedLinks
ForceGraph (shared d3 engine) · usePrefersReducedMotion · visual.css (depth + motion + token re-scope)
/memory also mounts KnowledgeGraphPanel (same component → same redesign).
```

## What was wrong (previous result) → what the redesign changed

The prior implementation read as an "amateur, static, sparse technical SVG diagram inside a card": a small custom
fixed-iteration layout, controls stacked beneath the graph, a details card below the canvas, tiny nodes, ~70%
dead space, no real drag/zoom/camera, no depth. The redesign replaces the **presentation and interaction** while
keeping all real data/architecture/security/tests:

- **Full-bleed spatial canvas** (`.tvg-canvas`) is the hero — restrained depth (layered radial gradients + faint
  dot-field + inset elevation), not a dead flat rectangle. Controls **float above** the canvas; details live in a
  **contextual inspector**, not a duplicate card beneath.
- **Real physics graph engine** (`ForceGraph`) — see dependency decision below.
- **Agents as recognizable AI entities**: distinctive identity glyph, name, one-word role, live status ring +
  status dot; significantly larger nodes (orchestrator ~112px, agents ~84px).
- **Orchestrator coordination core**: larger mass, radial core glow + double ring + a status ring that pulses
  **only** on real running/waiting/coordinating state (calm when idle).
- **Alive edges**: subtle by default, contrast on selection/hover; the real active-handoff trace animates a
  directional signal (`.tvg-signal`) — no permanent particle motion.
- **Contextual inspector** (right on desktop, bottom-sheet under 768px), **floating toolbar**, **fullscreen**
  ("מסך מלא"), **semantic-zoom labels**, **selected-neighbor emphasis + dim-unrelated**.

## Graph library / dependency decision (ONE focused engine, documented)

The custom SVG layout could not deliver premium interaction (real drag with reheat, kinetic zoom/pan, fit-to-view
and animated camera-to-node) cleanly. Per the explicit allowance ("evaluate ONE focused graph library… quality
is more important than avoiding one justified graph dependency"), the redesign adopts the **d3 force/zoom/drag**
primitives (not a heavyweight all-in-one graph framework), wired into a small shared React `ForceGraph` component
that renders SVG and updates positions **imperatively per tick** (no React re-render per frame).

- **Added (exact):** `d3-force@3.0.0`, `d3-zoom@3.0.0`, `d3-drag@3.0.0`, `d3-selection@3.0.0`, `d3-transition@3.0.1`
  (+ `@types/*`, dev). Reason: force simulation (many-body + link springs + collision + centering), zoom/pan +
  programmatic camera, node drag with reheat, and smooth camera tweens respectively.
- **Bundle impact:** raw source d3-force 124K · d3-zoom 108K · d3-drag 67K · d3-selection 212K · d3-transition
  (+ d3-ease/interpolate/timer/dispatch/color, several already transitively present via d3-force/d3-zoom).
  Tree-shaken + minified + gzipped the *used* surface is a few KB. These are focused single-purpose modules, not
  the full `d3` bundle.
- **Security:** `npm audit` after install → the only advisories are 4 **pre-existing `undici`** ones (a transitive
  dep unrelated to d3). **d3 introduced 0 vulnerabilities.**

## Graph data source (real, bounded, read-only) — unchanged

Bridge `GET /graph` (auth + Origin, **GET-only**, no writeKey): nodes from `app.vault.getMarkdownFiles()` (`id,
path, basename, mtime, tags, linkCount`), edges from `app.metadataCache.resolvedLinks` (real note→note links).
Markdown notes only; **no note bodies**, no `.obsidian`, no binary, no raw fs paths, no secrets. Highest-degree
nodes kept when the vault exceeds the node cap → `truncated:true` (surfaced honestly in the UI). The redesign is
presentation only — the endpoint, client, bounds, and fail-closed behavior are unchanged.

## Knowledge Graph interaction (the `ForceGraph` engine) — browser-validated

Real d3-force simulation (repulsion + link springs + collision + centering, kinetic settling); **node drag** with
`alphaTarget` reheat + pin/release; **zoom/pan** via d3-zoom; **fit-to-view** (computes node bounds → scale +
translate) and **programmatic focus** (animated camera to a node at scale 1.5); **selected-neighbor emphasis**
(selected halo, neighbors bright + edges emphasized, unrelated dimmed); **semantic-zoom labels** (selected /
hovered / neighbor / high-degree, more on zoom-in — not all labels permanent); degree-based node sizing/coloring.

**Engine bring-up (initial, real browser, 20-node fixture) — later superseded by the live paired-Vault proof
below:** the engine rendered 20 force-positioned nodes with hub sizing/coloring + hub labels and 30 edges;
selecting a hub set `selected`, **dimmed 14 unrelated nodes**, kept the 6 neighbors bright with emphasized cyan
edges + revealed labels; `fit()` produced `translate(204,133) scale(0.705)`; `focus("Customers")` produced
`scale(1.5)` centered; all 20 node groups carry `data-node-id` with the d3-drag behavior attached. The **same
production engine** is used by the live Knowledge Graph — where drag, pan, zoom, focus, fit and fullscreen were
subsequently proven **on-screen against the real paired Vault** (see "Live paired Vault validation" below),
including a **manual mouse drag** and **pan**.

## Cluster-aware layout (real communities, colored) — the "brain" look

Nodes are grouped into **real, deterministic communities** via label propagation (each note adopts the most common
label among its neighbors; ties + processing order broken lexicographically → stable across reloads, no
`Math.random`; disconnected notes form their own single-note community). Communities drive: (a) **per-cluster
color** from a glowing palette, (b) **spatial separation** — a weak `forceX/forceY` pulls each community toward its
own deterministic anchor so clusters occupy distinct regions, and (c) a compact **legend** naming each multi-note
community by its highest-degree hub note (click → focus that hub). Orphans (degree 0) stay muted grey; hubs get a
stronger glow. Structure only — a note's cluster/color is derived from real links, never fabricated. On load the
graph **auto-fits** to the canvas (fills the space — no "tiny graph in empty space"). Touch: the SVG sets
`touch-action:none` so pan/zoom/drag work on mobile. **Validated on the live paired Vault:** 62 real notes →
**6 communities** with distinct cluster colors + a named legend, spatially separated hubs/bridges/orphans, degree
sizing, and `autoFit` framing the whole map (see live-validation section).

## Agent Network → Agent Intelligence Graph (exactly the 7 canonical agents, real force engine)

The Agent Network is no longer a curated radial star — it runs on the **same real d3 `ForceGraph` engine** as the
Knowledge Graph. Reads the real `AGENT_DEFINITIONS` (no invented agents, no duplicate registry): `ag-orchestrator`
(מנהל התזמור), `ag-hunter` (סוכן מכירות), `ag-fixer` (סוכן שירות), `ag-mentor` (סוכן הדרכה), `ag-nexa`
(סוכן שיווק וצמיחה), `ag-wiki` (סוכן ידע), `ag-flow` (סוכן אוטומציות).

- **Organic functional regions (not equal-radius spokes):** agents settle into real role-based regions via cluster
  forces — **coordination** (orchestrator, centre), **growth** (Hunter + Nexa), **service** (Fixer + Flow),
  **knowledge** (Wiki + Mentor). Edges still come ONLY from real supported/active relationships; functional
  grouping influences layout, never fabricates links.
- **Large entities:** each agent renders as an intelligent entity (identity glyph + name + role + live status ring
  + status dot), names readable without zoom. Measured on-screen footprint — orchestrator **127px @375 / ~180px
  desktop** (dominant coordination core with layered nucleus + energy ring + real-state pulse), agents **68px @375
  / 99–105px desktop** — within the requested targets.
- **Fills the canvas:** the engine's viewBox tracks the container's pixel size + `autoFit`, so node footprint is
  **84–90%** of canvas width at 375 / 768 / 1024 / 1366 (no "tiny graph in empty space").
- **Full graph interaction:** drag (mouse + touch, `touch-action:none`), pan, zoom, fit, reset, programmatic focus
  on select — same quality as the Knowledge Graph.
- **Edges:** supported handoffs are subtle dashed `<line>` (brighten on select/hover); real **active** traces are
  solid accent with an animated directional signal (`.tvg-signal`) + `data-testid="agent-handoff-active"`.
- Selecting an agent triggers a **camera focus** and opens the **contextual inspector** (right on desktop, bottom
  sheet under 768px) with real `purposeHe`, `allowedOperations` + `allowedDomains`, `prohibitedDomains`, real
  active handoffs involving the agent, the cross-view note-usage line, and the **existing `AgentActionsPanel`**
  (real `runAgentAction` engine + approval gate; no second engine). Unrelated agents dim; related stay visible.
- Per-agent **status is real** (from action results: `ok/applied → SUCCESS`, `awaiting_approval → WAITING`,
  `execution_error → ERROR`; default **IDLE**, never animated as working). The bounded-loop strip tints its
  Hunter/Fixer steps by those **real** statuses.
- **Runtime (browser, seeded local data):** exactly 7 entities; **6** dashed supported edges + **2 real** active
  handoff traces rendered as animated signals (e.g. `סוכן שירות → סוכן ידע`), surfaced honestly in the inspector;
  no fabricated nodes/edges. Validated at **375 / 768 / 1024 / 1366** (0 horizontal overflow at every size),
  selection→focus→inspector, and immersive **fullscreen** (canvas fills the viewport, dashboard framing removed).

## Handoff visualization (real only) — unchanged semantics

- **Supported** handoffs (dashed `<line>`, subtle): orchestrator may dispatch to each of the 6 business agents —
  real capability (`ag-orchestrator` holds `dispatch` + `agentHandoffs`). Runtime: **6** supported edges.
- **Active** handoff traces (solid accent, animated directional signal): read from the real `agentHandoffs`
  collection; when none exist, **no active edges are fabricated** (runtime: 0). The two are visually distinct.

## Bounded loop + cross-view

A **visual flow** renders the real bounded-loop structure (Hunter read → user continue → Fixer proposal → human
approval) as a 4-step stepper with connectors; the live loop runs in the existing `AgentLoopPanel`. **Cross-view
Agent↔Note**: the `AgentNoteUsage` contract exists, but Phase-4 live agent Vault access is not in this checkpoint,
so `deriveAgentNoteUsages()` returns `[]` and selecting an agent shows **"אין שימוש מתועד במסמך זה"** — no
invented Agent↔Note edges.

## Motion (restrained, real-state, reduced-motion respected)

Depth + motion communicate state, never decorate: status-ring pulse only on real RUNNING/WAITING/coordinating;
the active-handoff signal animates only on a real trace; camera focus/fit is a transform tween; selection/hover is
a scale/opacity change. `usePrefersReducedMotion` + `@media (prefers-reduced-motion: reduce)` disable physics
animation (simulation is pre-settled synchronously), camera tweens, ring pulse, and the signal. No neon, no
constant motion, no meaningless particles.

## Theming (dark spatial canvas, both themes)

The canvas is an intentionally dark "spatial surface" in **both** light and dark app themes (a premium graph-view
convention). `.tvg-canvas` **locally re-scopes the `--os-*` design tokens** to on-dark values, so every descendant
— SVG labels, floating toolbar, inspector, the reused action panel — is correctly light-on-dark in both themes
with no per-element overrides. Elements **outside** the canvas (headers, bounded-loop flow, mode toggle, a11y
lists) use the real theme-aware tokens and adapt to the page theme.

## Responsive / accessibility (browser-validated)

- **Axe (wcag2a+wcag2aa)** on `/ai-workspace` with the workspace + a selected agent + inspector + reused action
  panel + loop flow + list: **0 violations** (critical/serious/moderate/minor all 0).
- **0 horizontal overflow** at **1280** (docW 1270), **~547** (tablet, docW ≤ innerW), and **375** (mobile,
  overflowX 0). Desktop docks the inspector on the right; under 768px it becomes a bottom sheet; at 375px the
  canvas fills, the toolbar is compact, and the bottom-sheet inspector remains fully readable with no clipping.
- **Keyboard/AT alternatives** (the canvas is supplemental): Knowledge Graph — search, search-result selection,
  selected-note details, and a **"רשימת קשרים"** relationship list; Agent Network — a **"רשימת סוכנים"** list,
  keyboard selection, and actions in DOM via the reused panel. RTL shell; readable light-on-dark on the canvas.

## Performance bounds

Server caps (300 nodes / 1500 edges); the d3 simulation updates the DOM imperatively per tick (no React re-render
per frame) and settles via `alphaDecay`; under reduced motion it is pre-ticked synchronously and stopped. Zoom/pan
mutate a single `<g transform>`; no whole-vault body loading, no embeddings/indexing, no background polling
(explicit "רענן גרף").

## Security regression (Phase-3 unchanged)

The graph capability is **read-only** and independent of write: `GET /graph` needs the pairing token + Origin,
needs **no** writeKey, contains no writeKey/HMAC, and `POST/PUT/PATCH/DELETE /graph → 405`, bad Origin → 403,
no token → 401. Property **A/B/C/D** from Phase 3 remain intact — no visual feature exposes the pairing token /
writeKey / HMAC, approves a mutation, or bypasses native Obsidian approval. The full Phase-1/2/3 obsidian +
write-security suites stay green. `scan:secrets` → **CLEAN, 0 findings**.

## Live paired Vault validation (real Obsidian, no harness)

Validated the FINAL production UI against the **live** paired Vault (Obsidian Desktop · Vault **TERAGON OS** ·
TERAGON at `http://127.0.0.1:4173` · production React+D3 `ForceGraph` · real `GET /graph`). Pairing used the
proven **dev-only local handoff** (runtime token written to an OS temp file by a temporarily-patched *installed*
plugin copy, relayed to the app over loopback, fetched by the app into its own `sessionStorage`) — the token is
never printed / logged / committed / put in a URL / in evidence, and the `/graph` response was asserted to contain
no token. After validation the handoff was cleared, the **clean plugin restored** (0 autopair refs, temp token
not recreated), Obsidian reloaded, and the repo source (`obsidian-plugin/main.ts`) left **untouched**.

**Real graph (synthetic 62-note test Vault, live):** `vaultName` **TERAGON OS** · **62 nodes** · **147 edges** ·
`truncated:false` · **6 communities** (Development·7, Company·6, Sales·6, Customers·6, AI·6, Product·5) · largest
hub **Company degree 13** (8 out / 5 in) · **3 orphans** (Scratchpad, Ideas, Archive Notes) · **5 bridge notes**
(Growth Strategy, Customer Success, AI Operations, Secure Delivery, Data Platform) linking across clusters. All
counts are real (from `metadataCache.resolvedLinks`), not fabricated.

- **Live refresh (no app reload):** added a real `[[AI]]` wikilink to `Scratchpad.md` on disk → clicked **רענן**
  → edges **147 → 148**, the new real edge `Scratchpad → AI` appeared, Scratchpad `linkCount` 0 → 1; note restored.
- **Selection + emphasis:** selecting `Company` opened the inspector with its **real degree (8 out / 5 in)** and
  **קרא מסמך / פתח ב-Obsidian**; **52 unrelated nodes dimmed** (target 0.3) with the 10-node neighborhood bright,
  **135 / 148 edges dimmed** — selected-neighbor emphasis on real data.
- **Read reuse:** **קרא מסמך** returned the real note body via the reused Phase-1 `readNote` path.
- **Axe (wcag2a+aa)** on the live graph panel: **0 violations**.
- **Interaction parity with the `agentnetwork.html` reference** was ported into the shared production engine:
  hover (no selection) highlights a node's neighborhood and dims the rest, restored on mouse-out, selection taking
  precedence; `fit()` is real-bounds (matches the reference `fit()`); drag-with-reheat, free pan, wheel zoom
  (0.3–3×), +/−/Fit/Reset, and camera focus were already present — these apply to **both** graphs.
- **Real drag + pan (manual, on the live paired Vault — closes the prior gap):** with the graph settled, a human
  dragged a Projects-cluster node (`Milestones`) with the mouse. Verified against a captured baseline: the node
  **displaced ~764px**, its edges followed, the simulation **reheated** and **all 62 nodes reacted and re-settled
  naturally** (no hard snap-back — nodes did not revert to baseline), **147 edges preserved**. Dragging empty
  canvas **panned** the camera (transform `107.7,162.2 → −158.5,30.3`) with node graph-coordinates intact.
- **Fit after manipulation:** pressing **Fit** recomputed bounds to `scale 0.353` with **all 62 nodes inside the
  viewport (0 outside), all 6 clusters visible, 147 edges intact — no layout corruption**.
- **Zoom / focus / fullscreen (observed on screen, live Vault):** wheel + `+`/`−` changed scale (≈0.35 ↔ 1.0);
  selecting a hub (`Company`) moved the camera and opened the inspector with real degree (8/5), brightened its
  neighborhood and **dimmed 52 unrelated nodes**; **fullscreen** filled the viewport with no dashboard framing;
  **mobile 375** rendered the clustered map with a bottom-sheet inspector on tap and **0 horizontal overflow**.

## Tests

`tests/obsidian-graph/bridgeGraph.test.ts` (nodes/edges from metadata, orphan+hub, truncation, no bodies/secrets,
401/403/405, no-writeKey), `tests/obsidian-graph/graphPanel.test.tsx` (disconnected/loaded/error, source
attribution, select→details via the a11y list, readNote reuse, fail-closed), `tests/visual-workspace/visualWorkspace.test.tsx`
(exactly 7 agents, real capabilities + reused engine, 6 supported edges + no fabricated active edges, cross-view
honesty, mode switch), and `tests/cross-domain-memory/commandCenterMemory.test.ts` (regression for the Command
Center `<MemoryBand>` crash — a stale old-schema `memoryRecords` row with no `links` array now contributes 0
edges instead of throwing). Full `vitest` **2710 passing** (12 `tests/platform/*` files fail to *load* on local
Node v25 vite/rolldown `#!` shebang — pre-existing, unrelated; CI Node 22; 0 test failures).
`typecheck`, `typecheck:tests`, `oxlint` all pass/CLEAN; `scan:secrets` CLEAN.

## Limitations (honest — deferred)

The interactive core is real, tested, and **validated on-screen against the live paired TERAGON OS Vault**
(render, real manual drag + pan, zoom, focus, fullscreen, mobile, live refresh — see the live-validation section
above). Still deferred (not fabricated as done): Agent↔Note cross-view edges await Phase-4 real agent Vault access
(contract present, no fabricated data); a dedicated Trace panel and a visual write-back stepper; inlining the
Phase-2 governed "ייבא לידע" import into the graph node inspector (available today from the read-only connection
panel). `HTTPS_TO_LOOPBACK = UNVALIDATED`.
