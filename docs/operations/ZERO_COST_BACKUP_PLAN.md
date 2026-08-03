# Zero-Cost Logical Backup — implementation plan

> **PLAN ONLY. Nothing here has been built.** No workflow was created, no
> staging credential was accessed, no dump was produced or downloaded, no
> package installed, no Supabase change, no billing action.

**Constraint:** the operator authorizes **no payment, upgrade, paid backup, paid
PITR or paid storage**. Supabase native backups/PITR are therefore unavailable
(`pitr_enabled: false`, `backups: []`, plan `free`) and **no paid upgrade is
planned**. This design must fit entirely inside free tooling the repository
already uses: GitHub Actions.

---

## 1. What this does and does not solve

| | Status |
|---|---|
| Schema reconstruction (migrations 001–014) | **TESTED** — drill 2026-08-03, RTO 4 m 17 s |
| Native backup / PITR | **Unavailable on the free plan; no upgrade planned** |
| Data restore | **Not yet tested** — this plan is what will make it testable |

---

## 2. Architecture

```
GitHub Actions (schedule + workflow_dispatch)
  └─ install postgresql-client (apt, free, runner-local)
  └─ pg_dump  ── read-only ──▶ staging          [connection via env, never argv]
  └─ gpg --symmetric --cipher-algo AES256       [client-side, key from secret]
  └─ upload-artifact  (encrypted .sql.gpg only)
  └─ verify artifact exists + size > 0          [no row contents printed]
```

**Free-tooling choice.** Encrypted **GitHub Actions artifacts** are the store:
already available, no new vendor, no storage bill. Encryption happens
**client-side on the runner before upload**, so the artifact is unreadable to
anyone who can download it — including GitHub.

### Non-negotiable rules

1. **Read-only against staging.** `pg_dump` only. No DDL, no writes, never Production.
2. **Credentials only via GitHub secrets → environment variables.** Never a
   command argument, never echoed, never in a log. Use `PGPASSWORD`/`PGHOST`/
   `PGUSER`/`PGDATABASE` (libpq env), *not* a `--dbname=postgres://…` argv URL,
   which would appear in the process table and in `set -x` output.
3. **Encrypt before it touches storage.** `gpg --batch --passphrase-fd 0` with the
   passphrase piped on **stdin** from a secret — not `--passphrase` in argv.
4. **The dump never enters Git.** Write to a runner temp path outside the
   checkout, and never `git add` in the job. If a `.gitignore` guard is added, it
   must be **scoped** — e.g. `/backups/`, `*.sql.gpg`, `*.dump`. A blanket
   `*.sql` would ignore `supabase/migrations/*.sql`, which **must stay tracked**.
5. **Verification prints metadata only** — artifact present, byte size > 0, and
   that the first bytes are OpenPGP-encrypted. **Never row contents, never counts
   of business rows.**
6. **Retention is configurable** via `actions/upload-artifact` `retention-days`.

### Proposed inputs

| Input | Default | Purpose |
|---|---|---|
| `retention_days` | `30` | artifact lifetime |
| `schema_only` | `false` | cheap smoke run that dumps no data |
| schedule | daily, off-peak UTC | the RPO driver |
| `workflow_dispatch` | always enabled | on-demand backup before risky work |

### Required secrets (names only — no values here, none created)

`BACKUP_DB_HOST` · `BACKUP_DB_USER` · `BACKUP_DB_NAME` · `BACKUP_DB_PASSWORD` ·
`BACKUP_GPG_PASSPHRASE`

The DB principal should be a **read-only** role, not the service-role/superuser.

---

## 3. Objectives and risks

| Metric | Target |
|---|---|
| **RPO** | **≤ 24 h** (daily schedule). Anything since the last run is lost |
| **RTO** | **≤ 60 min** to a disposable project: ~5 min schema + download/decrypt/`psql` restore + verification. Slower than PITR, and *unproven until drilled* |
| **Retention** | **30 days** artifacts; keep one monthly copy downloaded to operator-controlled offline storage, since artifacts expire |
| **Restore-test cadence** | **Quarterly**, and after any migration that changes the schema. An untested backup is still an assumption |

### Risks accepted deliberately

- **Key loss = total loss.** If `BACKUP_GPG_PASSPHRASE` is lost, every artifact is
  permanently unreadable. The passphrase must be escrowed **outside** GitHub
  (e.g. the operator's password manager). This is the single largest risk.
- **Artifact expiration.** GitHub artifacts are deleted at `retention-days`.
  Without a periodic manual download there is **no long-term backup** — the
  monthly offline copy above is what prevents a silent 30-day-only horizon.
- **Long-lived DB credential in CI.** A read-only role limits blast radius; it is
  still a standing credential and must be rotatable.
- **A leaked artifact is a full data breach** if the passphrase ever leaks with
  it. Never store the passphrase in the same system as the artifact.
- **Free-runner limits.** Large dumps may exceed practical runner time/size;
  revisit if the database grows.

---

## 4. Boundary condition (unchanged)

> **No real business or customer data may be entered until this backup runs on a
> schedule AND a restore has been drilled from a real artifact.**

Verify with `GET /v1/projects/{ref}/database/backups` (still expected to show
`backups: []` — that is why this plan exists).

---

## 5. Next implementation checkpoint (not started)

**S10.1-D — implement `.github/workflows/staging-logical-backup.yml`:**
schedule + `workflow_dispatch`, install `postgresql-client`, `pg_dump` with libpq
env vars, `gpg` symmetric encryption via stdin, `upload-artifact` with
`retention-days`, and a metadata-only verification step. Then **S10.1-E**: drill a
restore *from a real artifact* into a disposable project and record a measured
RTO — only then may data restore be called TESTED.
