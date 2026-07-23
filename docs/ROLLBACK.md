# ROLLBACK — TERAGON AI BUSINESS OS (Phase 10.5, W9-D)

How to revert a bad production deploy on Netlify. **Every step that contacts
Netlify is OPERATOR_ACTION_REQUIRED** — run by the Lead/operator with their own
credentials. Netlify deploys are immutable and atomic: rolling back is
re-publishing a previous, already-built deploy — fast and non-destructive.

## 0. First: is a rollback even needed?

- **App data is browser-local** (IndexedDB). A rollback does NOT touch any
  user's data — each browser keeps its own IndexedDB regardless of which deploy
  is live. There is no server DB migration to reverse.
- **Remote AI stays disabled**: rolling the site back never enables a provider.
  Mode A (`AI_REMOTE_ENABLED=false`) is the default and is unaffected by a
  rollback. If an incident involved AI, the immediate mitigation is the kill
  switch (see "Emergency disable"), independent of any redeploy.

## 1. Identify current vs previous deploy — OPERATOR_ACTION_REQUIRED

```bash
netlify status                     # current site + published deploy
netlify api listSiteDeploys --data '{"site_id":"<SITE_ID>"}' | \
  jq -r '.[] | "\(.id)  \(.state)  \(.created_at)  \(.commit_ref)"' | head
```

Record: the **current (bad)** deploy id + commit, and the **previous good**
deploy id + commit.

## 2. Roll back — choose ONE (all OPERATOR_ACTION_REQUIRED)

### 2a. Netlify UI (fastest, recommended)
Site → **Deploys** → open the last known-good deploy → **Publish deploy**.
This instantly re-points production at that immutable deploy. No rebuild.

### 2b. Netlify CLI — restore a previous deploy
```bash
# Re-publish a specific prior deploy by id (no rebuild — restores that artifact):
netlify api restoreSiteDeploy --data '{"site_id":"<SITE_ID>","deploy_id":"<GOOD_DEPLOY_ID>"}'
```
(`netlify rollback` may also be available in your CLI version to revert to the
prior deploy in one step; verify with `netlify rollback --help`.)

### 2c. Git-based redeploy (when the fix is in code)
When you must ship corrected code rather than restore an old artifact:
```bash
git revert <bad_commit>            # or: git checkout <good_commit> -- .
git push origin main               # if the site auto-builds on push
# OR operator manual build+deploy:
npm ci && npm run build
netlify deploy --build --prod
```
Prefer 2a/2b for an emergency (seconds); use 2c to make the fix durable.

## 3. NON-DESTRUCTIVE dry-run (rehearse before touching prod)

Rollback is inherently non-destructive (it republishes an existing immutable
artifact), but rehearse first:

1. **Local dress rehearsal** — build the target good commit and smoke it without
   Netlify:
   ```bash
   git worktree add ../rollback-check <good_commit>
   cd ../rollback-check && npm ci && node scripts/deployment/preview-smoke.mjs
   ```
   Confirms the good commit builds, every route 200s, headers/CSP serve, and the
   secret scan is clean — all before any operator action.
2. **Netlify Deploy Preview (not prod)** — OPERATOR_ACTION_REQUIRED:
   ```bash
   netlify deploy --build            # draft URL only; production untouched
   ```
   Verify the draft, THEN promote (`--prod`) or publish the old deploy.

## 4. Cache invalidation

- `index.html` is served `Cache-Control: public, max-age=0, must-revalidate`, so
  browsers re-fetch it every load and immediately pick up the rolled-back asset
  hashes. Hashed `/assets/*` are content-addressed, so old and new coexist
  safely — no manual purge needed.
- Netlify serves a fresh CDN copy on publish; if a stale edge copy is suspected,
  re-publish the deploy (UI) or `netlify deploy --prod` to force propagation.

## 5. Emergency disable (fastest mitigation, no redeploy)

If the incident is AI-related or you must neutralize server behavior instantly:
- **AI kill switch** — OPERATOR_ACTION_REQUIRED: Netlify UI → Environment
  variables → set `AI_REMOTE_ENABLED=false` (or delete it). Takes effect on the
  next function invocation; every AI op refuses, no provider is contacted. No
  rebuild required.
- **Full takedown** — Netlify UI → Site → **Stop builds** and/or unpublish the
  site if the whole app must go dark.

## 6. Post-rollback verification checklist

Run against the production URL after rollback (see `docs/DEPLOYMENT.md` "Verify
the live deploy" for exact commands):

- [ ] App loads; a deep-link hard refresh (e.g. `/governance`) renders (200 SPA
      fallback), not a 404.
- [ ] `curl -sI <url>/` shows CSP + `X-Frame-Options: DENY` + nosniff +
      Referrer-Policy + Permissions-Policy.
- [ ] `/assets/*` → `immutable`; `/` → `max-age=0`.
- [ ] `curl -s <url>/.netlify/functions/ai-health` → `מושבת` (Mode A preserved).
- [ ] Bundle secret scan clean.
- [ ] The published deploy id matches the intended good deploy (`netlify status`).

## 7. Comms template

> **Subject:** [TERAGON OS] Production rolled back to <good_commit_short>
>
> **What happened:** <one-line incident summary>.
> **Action taken:** Republished deploy `<GOOD_DEPLOY_ID>` (commit
> `<good_commit_short>`) via <UI / CLI / git revert> at <UTC time>.
> **User impact:** None to stored data — app data is browser-local (IndexedDB),
> untouched by the rollback. Remote AI remained disabled (Mode A) throughout.
> **Verification:** Live URL checks passed (routes, security headers, ai-health
> `מושבת`, secret scan clean).
> **Follow-up:** <root-cause / durable fix ticket>.
