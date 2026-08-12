# TERAGON — Final Demo Script (8–12 minutes)

One coherent, **real** product story: operational signal → governed intelligence → human
decision → verified governed action — with **no hidden autonomous authority**. All data is
synthetic (Demo Mode banner is always visible). **No developer-console step is required.**

Setup: `npm run dev` (Vite on `:4173`, the Obsidian-bridge Origin allowlist). For the Obsidian
steps, Obsidian Desktop with the **TERAGON Vault Bridge** plugin (vault **TERAGON OS**). If
Obsidian is unavailable, the knowledge steps degrade to a truthful "לא זמין" state and the demo
continues with the CRM/Command-Center/Task steps.

| # | Step | Route | Exact action | Expected visible result | Fallback if fixture absent |
|---|---|---|---|---|---|
| 1 | **Overview** | `/` | Land on the app | Header shows **צחי זוסטייהם · מנכ"ל · טרגון טכנולוגיות**; persistent **"סביבת הדגמה — הנתונים סינתטיים"** banner | — |
| 2 | **Command Center** | `/` | Read the "מרכז תפעול" brief + counts | Real actionable signals (or honest empty state); counts derive from the same records shown | If empty: run step 4 first, then return |
| 3 | **7-Agent AI Workspace** | `/ai-workspace` | Switch modes: Agent Network / Knowledge Map / Split | Exactly **7 agents**; restrained "Visual Intelligence" canvas; graph is bounded Obsidian **metadata only** (no note bodies) | Knowledge Map shows "לא מחובר / טען מפה" if Obsidian not paired |
| 4 | **Governed knowledge workflow** | `/ai-workspace?pack=governed-knowledge-capture` | Pack **prefills** intent (does NOT auto-start) → **Start** → Orchestrator → **Wiki** reads one real Obsidian note → deterministic synthesis → recommendation | Real Agent→Note trace + timeline; recommendation is a business artifact (not auto-approved) | Without Obsidian: workflow ends in a truthful failed/unavailable state → produces a Command-Center actionable signal (use it in step 9) |
| 5 | **Human decision** | (same) | Click **"הפוך להצעה"** to turn the recommendation into a proposal | Proposal preview + diff; nothing written yet | — |
| 6 | **Governed Obsidian write** | (same) | **Approve** in TERAGON → **native Obsidian confirmation** → one bounded **append** to `Decisions Log.md` → read-back | "תועד ואומת"; on-disk one append; `AI Operations.md` untouched | Skip if Obsidian absent; describe the two-gate boundary instead |
| 7 | **Verified activity** | `/` | Return to Command Center | The verified knowledge action appears in **Recent Activity** (info) | — |
| 8 | **Trusted Device story** | `/memory` | Show **מחובר · TERAGON OS**; explain: pair once → restart Obsidian/plugin → **automatic** challenge-response re-auth, **no new pairing code**; "שכח את המכשיר הזה" is the manual fallback | Panel notes "לאחר הפעלה מחדש … ללא קוד נוסף" | If not paired: show the one-time pairing modal copy |
| 9 | **`workflow_failed` → Governed Follow-up Task** | `/` | On a real **actionable** Action-Inbox signal (a failed/waiting workflow from step 4, or a `workflow_failed` produced by running a workflow while Obsidian is disconnected), click **"צור משימת מעקב"** | Proposal modal: exact Task preview, **CREATE ONE TASK**, source signal, owner = trusted actor; **no Task yet** | If no actionable signal: run step 4 to the proposal stage (a `proposal_pending` actionable signal), whose inbox item also shows the CTA |
| 10 | **Approve the follow-up Task** | (modal) | **"צור הצעה למשימת מעקב"** → **"אשר וצור משימה"** | Exactly one persistent Task, read-back **verified**; **"פתח משימה"** offered; Recent Activity shows "פעולה בוצעה ואומתה" | To show reject: **"דחה"** → no Task created |
| 11 | **Tasks verification** | `/tasks` | Click **"פתח משימה"** (or open Tasks) | The new follow-up Task is listed with owner **צחי זוסטייהם**, status **פתוחה** | — |
| 12 | **Governance / security summary** | any | Narrate the boundaries | recommendation ≠ proposal ≠ approval ≠ native confirmation; CREATE-only; deterministic idempotency; `AI_REMOTE_ENABLED=false`; `HTTPS_TO_LOOPBACK=UNVALIDATED`; single-tenant pilot | — |

### One-sentence claim to close on
> TERAGON moves from an operational signal → governed multi-agent intelligence → an explicit human
> decision → a verified governed action — **with no hidden autonomous authority**.

### Notes
- Every actionable Action-Inbox signal carries the **"צור משימת מעקב"** CTA — so step 9 does not
  depend on one specific signal type; `workflow_failed` is the canonical trigger, but any
  actionable signal demonstrates the governed-task flow.
- Nothing in this script requires a developer console. The `workflow_failed` scenario is produced
  by a **real** workflow outcome (a failed/unavailable run), not by injecting events.
