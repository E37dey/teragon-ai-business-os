# Supabase Preview Provenance (S7.3B-PREP)

Safe provenance for the deterministic local Preview-context build the acceptance
harness drove. No credentials, keys, tokens, or publishable-key value.

## Build mechanism
`npm run build:preview` (`scripts/preview-build.mjs`) reads the SINGLE SOURCE of
the public Preview contract — `netlify.toml [context.deploy-preview.environment]`
— and builds with exactly those `VITE_*` values baked in (the same public
contract Netlify's Deploy Preview resolves). It does NOT duplicate public values
into other files, and it asserts `VITE_PERSISTENCE_PROVIDER=SUPABASE` +
`VITE_SUPABASE_ORG=org-teragon` before building. The built `dist` is then served
locally (`vite preview`) and inspected — never rebuilt between checksum and run.

## Build record (`ci-artifacts/preview-build.json`, gitignored)
| field | value |
| --- | --- |
| commit | `4844a55e24fa` |
| node | `v25.8.1` |
| npm | `11.11.0` |
| buildCmd | `npm run build` (tsc -b && vite build) |
| provider | `SUPABASE` |
| org | `org-teragon` |
| masked ref | `bjvi…azjj` |
| project ref (public) | `bjvirkmagwpqroakazjj` |
| dist sha256 | `e96c6dc68047e38126166b8947c4c640aa99ecbcdcf1c97296a5ea3cb9ec282f` |

## Runtime provenance surface
`src/runtime/provenance.ts` publishes SAFE metadata on `window.__TERAGON_RUNTIME__`
and `data-teragon-*` attributes on `<html>`, installed first at boot:
- `provider` = `SUPABASE`
- `supabaseRefMasked` = `bjvi…azjj` (never the full host/url/key)
- `commit` = the build commit
- `graphFacadeEnabled` = `false`, `graphOperatorAuthEnabled` = `false`, `aiRemoteEnabled` = `false`
- `authImpl` = `supabase-auth-boundary`

It NEVER exposes a key, token, session, service_role, db/admin credential, or the
publishable-key value.

## Verified at run time (before login)
- `observedCommit` = `expectedCommit` = `4844a55e24fa`
- `provider` = `SUPABASE`, `authImpl` = `supabase-auth-boundary`
- masked ref = `bjvi…azjj`; only the expected staging project was contacted
- Business-Graph facade + operator-auth + AI-remote flags all OFF
