# Visual Calm — Component Rules

Binding rules for VC-B…VC-G. "One accent color + one semantic status color, maximum, per component."

## Color semantics (strict)
- **Steel accent** (`--accent-primary`): primary action · selected nav item · selected tab · selected record · keyboard focus · active progress. Nothing else.
- **AI violet** (`--accent-ai`): Copilot · agent activity · AI recommendation · AI evidence · AI approval. Nothing else.
- **Green**: verified success / completed / confirmed only.
- **Amber**: pending review / attention / degraded / nearing deadline only.
- **Red**: failure / blocked / destructive / critical risk only.
- Never status-by-color-alone — always text or icon too. Use `-text` variants for colored text.

## Glow
Removed from normal cards, KPIs, nav, tabs, tables, rows, forms, buttons, panels, charts, progress. Subtle glow (≤0.12) only for: active Copilot, live agent op, critical alert, pending AI approval, exceptional focus. No neon outlines, no animated/breathing glow.

## Borders
Full border only for: forms, drawers, selected records, interactive cards, evidence panels, warnings, modals. Everywhere else use surface change + spacing + dividers + typography. Max structural depth: **page → workspace surface → interactive item**. No bordered-card-in-bordered-panel-in-bordered-section.

## KPI cards
Operational pages: **≤4 primary KPIs**. A KPI stays only if it drives the current workflow, helps prioritize, has an owner, or opens records. Passive totals → "מדדים נוספים" / תובנות. Default KPI: quiet surface, no glow, subtle-or-no border, one concise label, one large value (`--os-text-kpi`), optional one supporting line, neutral icon, semantic color only when action is required. Do not color each KPI differently.

## Progressive disclosure
`summary → details → full action`. Never show evidence + recommendation + audit + meetings + long descriptions + all records + full history simultaneously. Use drawer / accordion / drill-down / detail page. Main workflow stays the visual focus.

## Tables
Dense but calm: subtle row separators (no per-cell borders), quiet hover, one selected-row steel accent, chip only when scanned, Hebrew right-aligned, numbers/IDs LTR. No colorful row backgrounds, no multi-chip cells, no permanent per-row action buttons — secondary row actions go in an actions menu.

## Forms
Visible labels, calm input surfaces, subtle focus (steel ring), clear error state, one primary submit, secondary actions as text/quiet buttons. No glowing inputs. Don't pre-highlight required fields before error. Section long forms; advanced fields behind disclosure.

## Status chips
Use only when status must be scanned. Soft fill + `-text` color + optional small icon, no glow, no saturated border. Plain text (not chips) for dates, owners, record IDs, secondary categories, neutral states.

## Icons
Support recognition, don't restate text. Neutral (`--text-muted`) by default; `--accent-primary` when active; `--accent-ai` for AI; semantic only when status requires. Inactive icons lower contrast. No colored container per icon.

## Motion
Allowed: drawers, accordions, modals, selected-state, progress. 120–180ms. Forbidden: pulsing borders, animated gradients, breathing lights, floating decoration, continuous graph motion, shimmer outside loading. Honor `prefers-reduced-motion` (globally zeroed in tokens).

## Shell
- **Right nav**: only active group expanded; unrelated collapsed; no glow; lower-contrast inactive icons; hide zero badges; fewer separators; single subtle steel active-state; no large bright selected background.
- **Left rail**: only where it adds immediate value; collapsible on narrow; not permanent on every route; no center duplication; evidence/audit still reachable.
- **Copilot**: compact button when inactive; expand on open; violet only when active; no constant orb glow / animation.
- **Header**: compact; one primary action + search + notifications + profile; no duplicate page actions.
