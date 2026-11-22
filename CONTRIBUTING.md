# Contributing to pano

Thanks for helping. This page is the short list of how the code is organised and what every change must keep true.

## Set up

```bash
npm install && npm run dev     # http://localhost:4500, demo company seeded on first run
```

No database server is needed: development and tests use PGlite (Postgres in WebAssembly). Demo logins are in the README.

## Before you open a pull request

Run what CI runs:

```bash
npm run typecheck
npm run lint -- --max-warnings 0
npm test                        # vitest, in-memory PGlite, a few seconds
npm run build && npm run e2e    # Playwright against a production build on :4501
```

CI also seeds a real PostgreSQL and builds the Docker image. Keep commits small, with a message that says what changed for the user ("Search pages through every match, 50 at a time"), and add a line to `CHANGELOG.md` under `[Unreleased]`.

## Where things go

| Change | Where |
| --- | --- |
| A business rule, a permission check, a query | `src/server/*` (services). Every query is scoped to `ctx.workspaceId` and the caller's visible projects. |
| A new mutation | A service function plus a thin Server Action in `src/app/actions.ts` (session → service, nothing else) |
| A page | `src/app/` (pages read through the same services) |
| UI | `src/components/` |
| Text | `src/lib/i18n/tr.ts` first, then `en.ts` |
| The schema | `src/db/schema.ts`, then `npm run db:generate` to create the migration in `drizzle/` |

## Rules that keep the app safe and correct

- **Tenant isolation is tested for every server action.** Adding an action means adding a case to `tests/tenant-isolation.test.ts` that calls it as another company's admin with this company's IDs; a meta-test fails until you do. Answer cross-company IDs with `not_found`, never `forbidden`.
- **Permissions are enforced in the services** with `need(ctx, "…")` or `can(ctx, "…")`. Hiding a button is only for comfort. A non-trivial rule gets a test.
- **Validate input with zod** at the service boundary (`parse(schema, input)`).
- **Task writes carry a version**; a stale write fails with `conflict` instead of overwriting.
- **Transactions**: use `transaction()` from `src/db`, never `db.transaction()`. PGlite has a single connection, so a query outside an open transaction would wait forever; inside `transaction()` every `getDb()` returns the transaction.
- **Correlated subqueries** in `sql\`\`` must name the outer table as `${s.table}.column`, not `${s.table.column}`: Drizzle drops the table name in single-table selects, which silently points at the inner table.
- **Turkish text**: compare and search with `fold()` from `src/lib/fold.ts` (Turkish-aware case, Turkish letters optional: "İstanbul" and "ILIK" fold to "istanbul" and "ilik"), sort names with `byName`, and never lower-case labels or names for display.
- **i18n**: no user-visible string in code. `en.ts` is typed as `typeof tr`, so a missing English key is a type error, and a test checks no value is empty.
- **Demo and test data are fictional.** No real names, emails, keys or passwords anywhere in the repository.

## Screenshots

With a seeded production build running on :4500 (`npm run build && npm start`):

```bash
npx tsx scripts/screenshots.ts docs/screenshots
```

## Security issues

Do not open a public issue; see [SECURITY.md](SECURITY.md).
