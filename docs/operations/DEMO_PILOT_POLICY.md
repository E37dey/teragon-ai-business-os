# Internal Demo Pilot — operating policy

**Status: Internal Demo Pilot ALLOWED. Real business data PROHIBITED.
Production BLOCKED.**

The application is **not** connected to the company's real business database. The
pilot runs on synthetic demo data only.

---

## 1. What is allowed

| | |
|---|---|
| **Internal Demo Pilot** | ✅ **Allowed** — synthetic data, internal audience |
| **Real business / customer data** | ❌ **Prohibited** — see §4 |
| **Production** | ❌ **Blocked** — see the traceability audit blockers |

---

## 2. Demo mode is fail-closed

`src/app/demoMode.ts` is the single source of truth.

Demo mode is **ON unless** the build sets `VITE_DEMO_MODE="false"` exactly.
Missing, empty, `"0"`, `"no"`, a typo — all keep it **ON**. A misconfigured flag
must never silently produce a system that looks real.

**Banner.** `DemoModeBanner` renders the persistent Hebrew notice

> סביבת הדגמה — הנתונים במערכת סינתטיים ואינם נתוני העסק

It is mounted **above the router** in `src/main.tsx`, so it appears on **every**
route including `/login`, and it is deliberately **not dismissible** — a close
button would defeat the purpose.

---

## 3. External side effects are blocked

`externalSideEffectDecision(channel)` is the one gate for anything a third party
could observe: `email`, `sms`, `webhook`, `push`, `third-party-api`.

- In demo mode **every** channel is refused (`demo_mode_blocked`).
- Outside demo mode, `third-party-api` still requires remote AI, and
  **`AI_REMOTE_ENABLED` remains `false`**.
- It returns a **decision, not an exception**, so a caller must consciously
  handle refusal rather than have an error swallowed up the stack.

**Current capability audit:** the application today has **no** email, SMS, push
or webhook sender at all. The only outbound seams are the remote-AI adapters
(server-side, disabled) and Supabase calls to our own backend, which are not
third-party side effects. The gate exists so any future outbound path has an
obvious, tested place to pass through.

---

## 4. Demo data safeguards

- **All 54 seeded email addresses use `@example.com`** (RFC 2606 reserved,
  cannot receive mail). Previously the seed contained **11 `@gmail.com`**
  addresses plus real-looking business domains (`teragon.co.il`, `dagesh.co`,
  `arch.co.il`, `college.ac.il`, …) — routable addresses that could belong to
  real people. Those were normalised; a test now fails the build if any non-
  `example.com` domain reappears.
- **Phone numbers** are synthetic ranges (`050-200000x`, `03-555xxxx`).
- **Names** are generic Hebrew first names, not employees or customers.
- **Organizations/customers/contacts** are fictional.
- **Staging SQL seed** (`014_staging_seed.sql`) uses `@staging.local` —
  non-routable by design. Kept as-is: editing an applied migration would break
  the lineage lock, and `.local` cannot receive mail. **No migration 015.**

**Reviewed and intentionally kept:** `printView.ts` prints the vendor's own
letterhead (`office@teragon.co.il`). That is Teragon's own contact detail, not
third-party personal data, and removing it would misrepresent the document's
origin.

---

## 5. Before real business data may be entered

**Blocking — must be closed first:**

1. **Backup / data restore (B1).** Staging has `pitr_enabled: false` and
   `backups: []`. There is no recovery point; **RPO is unbounded**. Schema
   reconstruction is tested (4 m 17 s); **data restore is not**. See
   `docs/operations/ZERO_COST_BACKUP_PLAN.md`.
2. A restore must be **drilled from a real artifact**, not just planned.

Entering real data before both are done means accepting **irreversible total
loss**, and that decision belongs to a named human — not to this document.

---

## 6. Remaining Production blockers

Beyond B1: `react-router` HIGH advisory (ships to prod), missing HSTS header,
cross-browser/responsive unverified (chromium-only), a11y not enforced in CI,
and 12 of 14 domains still `NOT_CONNECTED`. See the requirements traceability
audit.
