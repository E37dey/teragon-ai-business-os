# Visual Calm — Integration Queue

Shared design-system files are owned by the **Integration Lead**. Route workstreams (VC-C…VC-G) must NOT edit these directly — request changes here; the Lead applies them sequentially. No concurrent commits.

## Lead-owned shared files
- `src/styles/tokens.css` — canonical tokens (VC-A, DONE)
- `src/styles/components.css` — shared primitives (chips, buttons, nav, tables)
- `src/styles/base.css`, `src/index.css`
- `src/design-system/*`, `src/layout/*`, `src/app/OsShell.tsx`, `src/app/rail.tsx`

## Workstream ownership
| Stream | Owns | Status |
|--------|------|--------|
| VC-A | tokens + primitives recolor | ✅ done (branch `post-release/visual-calm-v2`) |
| VC-B | shell + nav (`src/layout`, OsShell, Copilot orb) | pending |
| VC-C | `/`, `/crm`, `/customers/:id`, `/sales`, `/documents`, `/tasks` | pending |
| VC-D | `/courses`, `/service`, `/printers`, `/organizations`, `/support` | pending |
| VC-E | `/agents`, `/agents/collaboration`, `/automations`, `/memory`, `/knowledge`, `/learning`, `/governance` | pending |
| VC-F | `/analytics`, `/implementation`, `/personas`, `/stage-gates`, `/training-materials`, `/quick-start`, `/faq`, `/submission`, `/administration`, `/system-health`, `/settings` | pending |
| VC-G | QA + visual validation | pending |

## Requests to Lead
_(none yet)_
