# Phase 6 pre-push readiness — 2026-11-24

## Completed locally

- Integrated the backend, updated API-connected frontend, Supabase assets/scripts and frozen documentation into the existing Git repository history.
- Added a single-project Vercel Services configuration for same-origin `/api/v1` routing and SPA fallback.
- Added root and package-level ignore rules for environment files, dependencies, build output, coverage and Vercel local metadata.
- Added a backend CI job alongside the existing frontend and OpenAPI/contract jobs.
- Recorded the required Vercel environment variables and first-deployment runbook in `DEPLOYMENT.md`.
- Confirmed that no real `.env`, SMTP key, MongoDB password or Supabase service-role JWT is present in the Git candidate.

## Verification evidence

| Check | Result |
|---|---|
| Frontend tests | 8 passed, 0 failed |
| Frontend production build | Passed with Vite 7.3.8 |
| Backend TypeScript typecheck | Passed |
| Backend unit/security tests | 13 passed, 0 failed |
| Contract operation check | 36 operations on 32 paths |
| OpenAPI validation | Passed with `openapi-spec-validator` 0.7.2 |
| Dependency audit during clean install | 0 known vulnerabilities in frontend and backend installs |

## Intentionally not performed

- No Git commit or push.
- No Vercel project link, preview deployment or production deployment.
- No destructive database migration rerun against the live application database.
- No complete PAC-01–PAC-62 live acceptance run.

## Live checks still required after the first Vercel preview

- Verify Vercel Services routing, SPA direct reload and `/api/v1/health` on the real preview URL.
- Set the final `APP_BASE_URL` and `ALLOWED_ORIGINS`, then verify Secure/HttpOnly/SameSite cookies plus Origin and CSRF enforcement.
- Verify one registration email, one reset email and one signed Supabase staging photo upload end to end.
- Run Atlas migration verification and the transaction/race integration suite against a dedicated test database.
- Configure and prove the protected orphan-photo cleanup schedule.
- Configure encrypted daily backups with 30-day retention and complete an isolated restore proof.

The repository is ready for review and push, but production readiness is not claimed until the live checks pass.
