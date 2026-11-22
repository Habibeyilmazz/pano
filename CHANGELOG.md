# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Handoff notes for the next agent

- **Where things live**: business rules, permission checks and workspace scoping are all in `src/server/*`. `src/app/actions.ts` only turns the session cookie into a `Ctx` and calls a service. Pages read through the same services.
- **Adding a server action** means adding a case to `tests/tenant-isolation.test.ts`; a meta-test fails until you do.
- **Transactions**: use `transaction()` from `src/db`, never `db.transaction()`. Inside it every `getDb()` returns the transaction, because PGlite has a single connection and a query outside an open transaction would wait forever.
- **Correlated subqueries** in `sql\`\`` must reference the outer table as `${s.table}.column`, not `${s.table.column}`: Drizzle drops the table name in single-table selects, which silently points at the inner table (this bug once made role and checklist counts zero; `tests/logic.test.ts` covers it).
- **i18n**: add strings to `src/lib/i18n/tr.ts` first; `en.ts` is typed as `typeof tr`, so a missing English key is a type error, and a test checks no value is empty.
- **Names sort with `byName`** (Turkish collation); the database collation would put "İ" after "Z".
- `next dev` writes `AGENTS.md` (Next.js agent notes); it is committed on purpose.
- Screenshots: run a seeded production build on :4500 (`npm run build && npm start`) and `npx tsx scripts/screenshots.ts docs/screenshots`.
- Not verified on a real phone: the touch long-press drag (dnd-kit TouchSensor) and the mobile layout were checked only in Chromium's mobile emulation.
- The GitHub repository was not created or pushed from this session (the action was not permitted); CI (`.github/workflows/ci.yml`) has therefore not run yet, including the Docker build and the seed against real Postgres.

## [0.1.0] - 2026-11-22

### Added

- Company sign-up with an isolated workspace per company; the first user becomes its admin.
- Users: admins add people with a role and language and share a one-time invite link (7 days) or set a temporary password that must be changed at first sign-in; deactivate/reactivate; password reset; email hook in `src/server/mail.ts` (no sending yet).
- Roles: built-in Admin, Manager, Member, Viewer; custom roles from ten permissions; no granting of permissions you lack; the last active admin is protected.
- Projects with optional restriction to selected people; default columns in Turkish and English; column rename, reorder, type, WIP limit (amber when exceeded) and deletion of empty columns.
- Board with drag and drop (mouse, touch long press, keyboard), optimistic moves with rollback, "Assign to me", quick filters, text filter and a list view.
- Tasks: keys like `WEB-42`, Markdown description, multiple assignees, reporter, priority icons, labels, due date, estimate, checklist with progress, comments with @mention suggestions, history; copy task; delete with audit entry.
- Optimistic concurrency: task edits and moves carry a version; stale writes are rejected and the latest version is loaded.
- My work, Team (now / next / done this week per person, filter by project), person profile with recent activity, Overview dashboard (status, done per week, overdue, workload).
- Notifications (assigned, mentioned, due tomorrow) with an unread badge; keyboard shortcuts `c`, `/`, `?`; Turkish-aware search; CSV export; dark mode; mobile layout.
- Turkish (default) and English catalogs with locale-aware dates, numbers and plurals; per-user language and a switch on the sign-in page.
- Auth: scrypt password hashes, server-side sessions in HttpOnly Secure SameSite cookies, account lockout after 5 failed sign-ins, per-IP limiter, password policy, session invalidation on deactivation, role change, password change and reset.
- Audit log for users, roles, permissions and deleted tasks.
- Demo seed: "Örnek Yazılım A.Ş." with 8 fictional people, 2 projects and 40 tasks.
- Tests: 67 vitest tests (tenant isolation for every server action and page read, permissions, business rules, i18n) and a Playwright journey (sign-up, custom role, user, project, mouse and keyboard drag, assignment, mention, Team, first sign-in password change, 404 for admin pages, English, cross-company 404s).
- Dockerfile (Next.js standalone), docker-compose with Postgres 17, GitHub Actions CI (typecheck, lint, tests, seed on real Postgres, build, Playwright, Docker build).
