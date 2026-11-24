# UniCircle backend

Node.js/TypeScript, Express, Mongoose and Zod implementation of the frozen v3.0.1 contract.

## Backend commands

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd test
npm.cmd run migrate
npm.cmd run dev
```

Copy `.env.example` to an untracked `.env` and provide an Atlas **database user** connection string. Do not use an Atlas website, Google or email password as `MONGODB_URI` credentials. `UNIVERSITY_NAME` must be the operator-confirmed real name; the migration intentionally has no inferred default.

`npm run migrate` creates the frozen collections and indexes and idempotently seeds the eight categories, primary university settings and authorized active `seu.edu.bd` domain. The target MongoDB deployment must support transactions. Use a separate replica-set database through `MONGODB_TEST_URI` to run the migration integration test; the test refuses to substitute mocks for transaction evidence.

The Vercel entrypoint is `api/index.ts`; only `src/server.ts` calls `app.listen()` for local development.

Phase 2 implements the frozen authentication/account endpoints, Mongo-backed sessions, Origin/CSRF enforcement,
Argon2id password hashing, verification/reset token hashing and auth rate limits. Run the bounded checks with
`npm.cmd run typecheck` and `npm.cmd run test:auth`. Production also requires a unique `CSRF_SECRET`, the real
`APP_BASE_URL`/`ALLOWED_ORIGINS`, and all SMTP variables in `.env.example`; without a verified sender,
registration may persist safely but reports `emailSent:false`, and real verification/reset delivery is not proven.

Phase 3 adds the nine frozen category/listing/photo operations. Listing lifecycle mutations use MongoDB transactions,
integer poisha and signed filter-bound cursors. Photo bytes upload directly from the browser to Supabase; the API signs
server-generated paths and confirms actual size, MIME and magic bytes with a bounded read. Configure the three
`SUPABASE_*` values from `.env.example` before live upload testing. Use a separate transaction-capable
`MONGODB_TEST_URI` for `npm.cmd run test:listings:integration`; never point it at the application database.
Run `npm.cmd run photos:cleanup` from a protected daily scheduler; it removes only unattached assets older than seven
days, in bounded batches, and is intentionally not an in-process/serverless timer.
