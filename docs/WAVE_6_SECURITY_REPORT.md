# WAVE 6 — SECURITY REPORT (W6-F, Phase 6.21)

תאריך: 23.07.2026 · Agent: W6-F · Scope: memory / knowledge / learning governance surfaces + Obsidian import/export.

Method: **gap analysis first.** The W6-A…E suites (357 domain tests) already covered most of the checklist; W6-F wrote ONLY the missing tests — `tests/wave6-security/**` (4 files, 11 tests, all green). Nothing was duplicated; existing coverage is referenced by file + test name.

## 1. The 27-item checklist — item → covering test → status

| # | Item | Covering test (file → name) | Status |
|---|---|---|---|
| 1 | Unauthorized memory access — sensitivity gate | `tests/modules-w6-wiring/customer360Tab.test.tsx` → "sensitive record body stays hidden; reveal requires a reason"; `tests/modules-w6-wiring/copilotCommands.test.ts` → "with a chip: … sensitive bodies never in the answer", "without a customer chip the command refuses (no guessing)". **GAP-FILLED** for the last derived surface: `tests/wave6-security/derivedSurfaceLeakage.security.test.ts` → command-center band is a `{id,title,updatedAt}`-only projection — a sensitive body structurally cannot reach it. Honest caveat: /memory itself is a single-operator (CEO) demo surface with no per-user ACL — there is no identity provider yet (same Wave-5 caveat) | PASS + GAP-FILLED (single-user caveat) |
| 2 | Sensitive-memory export attempt (no includeSensitive) | `tests/memory-import/export.test.ts` → "selectExportRecords — the sensitivity gate"; **GAP-FILLED on the real artifact**: `tests/wave6-security/exportLeakage.security.test.ts` → "sensitive record NEVER reaches the artifact without includeSensitive — and the exclusion is disclosed" (byte-level scan of the actual ZIP) | PASS + GAP-FILLED |
| 3 | Draft knowledge as evidence | `tests/knowledge/evidenceEligibility.test.ts` → "draft ⇒ NOT eligible, with a Hebrew reason"; `isAuthoritative.test.ts` (7-state matrix); `wikiAgent.test.ts` → "NEVER retrieves a draft article" | PASS (existing) |
| 4 | Rejected knowledge as evidence | same files → "rejected is NEVER authoritative", "rejected/draft/pending knowledge NEVER surfaces — only approved articles" | PASS (existing) |
| 5 | Expired knowledge as evidence | `isAuthoritative.test.ts` matrix (expired variants); `evidenceEligibility.test.ts` expired case | PASS (existing) |
| 6 | Disputed / archived knowledge as evidence | `contradictions.test.ts` → "creates a conflict record and moves BOTH articles to שנוי במחלוקת"; `evidenceEligibility.test.ts` → archived ⇒ not eligible; `wikiAgent.test.ts` → "disputed articles surface in answers as unresolved conflicts only via still-approved sources" | PASS (existing) |
| 7 | Source deletion after AI use — usage survives + marked | Existing: `evidenceEligibility.test.ts` supersede tests. **GAP-FILLED** for removal: `tests/wave6-security/usageSurvival.security.test.ts` → "archive after AI use: usage record survives + article marked; future use refused" (archive is the only removal — hard delete does not exist by design; new usage of the removed source throws) | GAP-FILLED |
| 8 | Malicious instructions inside imported notes | Existing mechanics: `sanitizer.test.tsx` (raw HTML → literal text, URL neutralization, no `<img>`). **GAP-FILLED end-to-end**: `tests/wave6-security/importInjection.security.test.ts` → "injection text survives as LITERAL body data; HTML/URL surfaces are neutralized; nothing auto-approves" — prompt-injection text (EN+HE) flows prepare→commit verbatim as a **pending** proposal body; zero records written | PASS + GAP-FILLED |
| 9 | Memory proposal attempting to change permissions (frontmatter) | `tests/memory-import/frontmatter.test.ts` → "parseFrontmatter — denylist (fail closed)" (permission/role/ACL/system-prompt/credential/tool/org/exec key classes), "never denylists the 14 supported fields". **GAP-FILLED at pipeline level**: `importInjection.security.test.ts` → "frontmatter granting permissions / roles is rejected FAIL-CLOSED for the whole file", "approval-bypass keys (approved_by / auto_approve / system_prompt) are all denylisted" | PASS + GAP-FILLED |
| 10 | Imported note attempting self-approval | **GAP-FILLED**: `importInjection.security.test.ts` → "imported `status: מאושר` (supported field) carries ZERO approval power" — the draft shape has no approvalState field at all; proposal stays "ממתין לאישור"; job records "0 פריטים נכתבו ישירות" | GAP-FILLED |
| 11 | Learning rule attempting to bypass approval | `tests/learning/ruleGuard.test.ts` → "bypass attempts fail", "attempting to pass off an auto-approved draft FAILS the guard", "requires an injected governance service"; `approvalGate.test.ts` → "BYPASS ATTEMPT: execute without a decision throws and writes nothing", "controls refuse a proposal that never entered the queue" | PASS (existing) |
| 12 | Single case → rule blocked | `tests/learning/schemaHonesty.test.ts` → "a rule can never exist with sampleSize < MIN_RULE_SAMPLE_SIZE (single case blocked at schema level)"; `approvalGate.test.ts` → "a single-case proposal can NEVER become a rule"; e2e: marker blocks the approve button (`w6-learning.spec.ts`) | PASS (existing) |
| 13 | Rule bounded-effect escape | `tests/learning/ruleGuard.test.ts` → "RuleEffect closed union — bounded by construction", "smuggling forbidden powers through extra keys on an allowed kind is rejected (strict)" | PASS (existing) |
| 14 | ZIP path traversal | `tests/memory-import/zip.test.ts` → "path traversal — 4 forms" (dotdot / absolute / drive-letter / backslash); e2e forged-ZIP rejection in Hebrew (`w6-memory.spec.ts`) | PASS (existing + e2e) |
| 15 | ZIP bomb | `zip.test.ts` → "rejects a declared ratio over 100× without inflating", "aborts mid-stream when actual output exceeds the declared size (runtime bomb guard)" | PASS (existing) |
| 16 | Nested archives | `zip.test.ts` → "rejects nested archives" | PASS (existing) |
| 17 | Encrypted entries | `zip.test.ts` → "rejects encrypted entries" | PASS (existing) |
| 18 | Symlink entries | `zip.test.ts` → "rejects symlink entries (unix mode in external attrs)" | PASS (existing) |
| 19 | CRC tamper | `zip.test.ts` → "rejects CRC mismatch (tampered content)" | PASS (existing) |
| 20 | Size/count/depth limits (file 2MB · markdown 500K · total 20MB · 200 files · depth 8 · frontmatter 16KB) | `tests/memory-import/limits.test.ts` → "pins the mandated limits" + per-limit rejections; `frontmatter.test.ts` oversized rejection | PASS (existing) |
| 21 | Hidden executables / disallowed extensions / non-image binaries | `limits.test.ts` → "rejects hidden executables (.exe/.js/.sh/.ps1/.svg…)", "rejects disallowed extensions per-file"; `importPipeline.test.ts` → "rejects non-image binary inside a zip with a clear message (no silent skip)" | PASS (existing) |
| 22 | Raw HTML / script injection in markdown | `sanitizer.test.tsx` → "raw HTML renders as escaped literal text (React text node)", "never interprets HTML — raw tags stay literal text", "sanitizeRawHtml neutralizes tags in the STORED body" | PASS (existing) |
| 23 | Dangerous URL schemes + tracking images | `sanitizer.test.tsx` → "neutralizes javascript:, data:, vbscript:, file: — ALL data: included", "never renders <img> — tracking images become text placeholders", "neutralized links render as inert text, never as an anchor" | PASS (existing) |
| 24 | YAML alias/anchor recursion bomb | `frontmatter.test.ts` → "rejects YAML anchors, aliases and merge keys (recursive-alias guard)" | PASS (existing) |
| 25 | Export secret leakage — scan a REAL generated export | **GAP-FILLED**: `exportLeakage.security.test.ts` → "vault ZIP bytes contain ZERO secret shapes; every planted secret was redacted" (runExport → real ZIP bytes → scan with the bundle-scanner pattern classes: sk-/AKIA/gh*/xox*/private-key/JWT + password/api_key values; redaction marker present, manifest count honest) and "governance internals + system-prompt sentinel are NEVER serialized" (no approvalId/approvedBy/auditEvents/confidence, no "מדיניות מערכת (בלתי ניתנת לשינוי)") | GAP-FILLED |
| 26 | Memory-proposal approval bypass | `tests/memory/proposalWorkflow.test.ts` → "direct approve-bypass fails: execute without a decision throws", "bypassing the engine is impossible: a decided approval cannot be re-decided", "approve without submit (no pending approval) throws"; `versioning.test.ts` append-only stores | PASS (existing) |
| 27 | PII redaction where required | **LIMITATION (honest)** — no PII-redaction layer exists anywhere in Wave 6. Export redacts SECRET shapes only. Pinned so the behavior is deliberate and visible: `exportLeakage.security.test.ts` → "HONEST LIMITATION (pinned): PII (email / phone) is NOT redacted by export — only secret shapes are". Sensitive-PII protection today = the sensitivity gate (items 1-2): mark the record רגיש/מוגבל and it never leaves without explicit permission. A real PII redactor is an open integration request for the lead | LIMITATION (documented + pinned) |

Score: 20 PASS (existing) · 7 involving W6-F gap-fill · 1 honest LIMITATION (item 27, pinned).

## 2. Bundle + artifact scans — real outputs

- `npm run build` → exit 0, then `npm run scan:secrets` → exit **1**: **dist/ CLEAN (0 bundle findings, 52 files)**; 2 git-history findings, both the same pre-existing W6-B test-fixture line (`sk-abc123def456ghij`, commit `8416433`, no FAKE marker) — full output + suggested fix in `docs/WAVE_6_TEST_RESULTS.md` §4.2. No real key shape was ever committed.
- **Export-artifact scan (new, W6-F)**: `tests/wave6-security/exportLeakage.security.test.ts` generates a real vault ZIP through `runExport` with planted sk-/AKIA/ghp_/xoxb-/private-key/password/api_key payloads and scans the artifact bytes — 0 secret shapes survive; `redactionCount ≥ 7` reported honestly in the manifest; the `includeSensitive: true` path still redacts secrets.

## 3. Injection posture (imported notes) — structural, not heuristic

Imported markdown is UNTRUSTED DATA end-to-end; there is no interpretation surface:
1. frontmatter capability classes are denylisted fail-closed (item 9) and unknown keys land in metadata-only `extensions`;
2. the body is stored literally (HTML neutralized to `‹tag›`, dangerous URLs inert) and rendered exclusively as React text nodes;
3. NOTHING an imported file says can approve itself — import produces proposals only, and the ONLY write path is a named human decision through the canonical ApprovalEngine (items 8/10/26).

## 4. Reported defects & residual risks

1. Knowledge seed race (console errors + stale first render) — src defect, details + fix suggestion in `WAVE_6_TEST_RESULTS.md` §4.1. Not a security hole (data correct, no bypass).
2. Scanner git-history fixture finding — §2 above.
3. Single-user demo caveat — sensitivity gating is UI/selector-level honesty, not an ACL; real multi-user authorization awaits the identity provider (unchanged Wave-5 open item).
4. No PII redaction — item 27.
