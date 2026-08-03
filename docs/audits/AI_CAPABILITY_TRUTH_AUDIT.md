# TERAGON AI BUSINESS OS — AI Capability Truth Audit (S11.0)

**Documentation-only.** No flags, providers, or prompts changed. Date 2026-08-04.

## Classification legend

`REAL_OPERATIONAL` (calls a live model, real effect) · `DETERMINISTIC_DEMO` (deterministic
local-rules output, honest) · `PARTIALLY_CONNECTED` (real seam, gated capability) ·
`UI_ONLY` (renders, no logic) · `PLACEHOLDER` · `INACTIVE_BY_FLAG` (built, off by flag).

## The governing truth

`src/ai/providers/LocalRulesProvider.ts` header, verbatim: it is a *"Fully
deterministic rules engine"* that **"NEVER pretends to be an LLM"** —
`provider="local-rules"`, `model=null`, no token usage. The remote path
(`RemoteAIProvider.ts`) exists behind `ProviderRegistry` but is gated by
`AI_REMOTE_ENABLED`, which **defaults to `false`** (`src/server/config.ts`). So every
"AI" surface in this build is deterministic and **spends nothing** — and it is honest
about that, not disguised as a model.

## Per-surface audit

| AI surface | Route | Backing | Classification |
|------------|-------|---------|----------------|
| 7 agents (Orchestrator, Hunter, Fixer, Mentor, Nexa, Wiki, Flow) | `/agents` | local-rules via registry | **DETERMINISTIC_DEMO** |
| Agent coordination room | `/agents/collaboration` | deterministic orchestrator | **DETERMINISTIC_DEMO** |
| Automations | `/automations` | deterministic rules engine | **DETERMINISTIC_DEMO** |
| Learning / improvement signals | `/learning` | local-rules over seed | **DETERMINISTIC_DEMO** |
| Organizational memory (Obsidian-style) | `/memory` | IndexedDB records + local links | **DETERMINISTIC_DEMO** (data), no model |
| Knowledge base | `/knowledge` | IndexedDB notes/articles | **DETERMINISTIC_DEMO** (data), no model |
| Remote model provider | registry | `RemoteAIProvider` | **INACTIVE_BY_FLAG** (`AI_REMOTE_ENABLED=false`) |
| AI governance / controls | `/governance` | governance records (IDB) | **DETERMINISTIC_DEMO** |

## Honesty flags (the things this audit was asked to catch)

- **Fake counters?** No. The Agents page comment states counters are computed *"from
  real records (queue sizes, success/failure counts, last run/failure)"* — i.e. from
  the deterministic seed collections, not fabricated constants.
- **Static "active" statuses?** No hard-coded "active" — agents expose a real
  `AGENT_DISABLED_STATUS` / `ProviderStateBadge` reflecting the actual provider state.
- **Simulated approvals presented as real?** No. Deterministic runs carry
  `demo`/`run-<n>` ids by contract; the Demo-Mode banner is always visible.
- **No-op buttons?** None found in the AI surfaces audited.
- **Overstated AI?** **Not overstated — arguably understated.** The provider refuses to
  claim it is an LLM; UI does not brand deterministic output as a live model.

## The one honest caveat

These surfaces are **deterministic demos, not live intelligence**. That is
appropriate and sufficient for the academic scope (synthetic data, no paid services,
`AI_REMOTE` may stay false). Turning on real intelligence is a **flag + key** change
(`AI_REMOTE_ENABLED=true` + provider credentials) — the seam is already built and
type-safe (`PARTIALLY_CONNECTED` at the architecture level), deliberately left OFF.

**Verdict: AI CAPABILITY HONESTLY REPRESENTED.** No fake-AI, no misleading counters,
no simulated-as-real approvals. All AI is deterministic-by-design and clearly labelled.
