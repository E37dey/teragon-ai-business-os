# AI Workspace — Route Consolidation Map (S13.3)

The new `/ai-workspace` ("מרחב AI") is a **presentation/orchestration** surface over the existing
deterministic Agent Action Engine. It does not replace the detailed agent screens yet. This map records
the recommended future disposition of each existing AI surface. **No route is removed in this PR.**

| Route | Today | Recommendation | Rationale |
|-------|-------|----------------|-----------|
| `/ai-workspace` | new, first in AI nav | **KEEP (primary)** | The everyday AI entry: attention → agent → approval → activity, over the same engine. |
| `/agents` | agent fleet + per-agent actions panel | **KEEP (secondary / detailed)** | The detailed agent-management screen (fleet status, enable/disable, per-agent deep view). Workspace links to it; do not duplicate. |
| `/agents/collaboration` | orchestration run graph + timeline | **MERGE_INTO_WORKSPACE (later)** | The run graph/timeline is the natural "recent activity → run detail" of the Workspace. Fold into a Workspace run-detail view in a later PR; keep reachable until then. |
| `/automations` | automation rules list | **KEEP (secondary)** | Distinct operational surface (rules/queue). The Workspace surfaces Flow's automation *proposals*; the rules list stays its own screen. |
| `/memory` | local memory (import/export) | **KEEP (secondary)** | Knowledge & Memory concern, not agent-operations; already honestly re-labelled "זיכרון מקומי" (PR A). No merge. |
| `/knowledge` | knowledge base | **KEEP (secondary)** | Source of truth Wiki/Nexa read from; a library, not an agent console. |
| `/learning` | improvement center | **FUTURE_REMOVE / demote** | Reference/training content; already demoted under "מערכת ומתקדם" (PR A). Candidate for later removal or absorption into docs. |

## Summary

- **KEEP primary:** `/ai-workspace`.
- **KEEP secondary (detailed/adjacent):** `/agents`, `/automations`, `/memory`, `/knowledge`.
- **MERGE_INTO_WORKSPACE (later):** `/agents/collaboration` (run graph/timeline → Workspace run-detail).
- **FUTURE_REMOVE / demote:** `/learning`.

No deletions in S13.3. Any future merge/removal will be its own bounded PR with its own tests and evidence,
preserving the deterministic engine and the human-approval gate.
