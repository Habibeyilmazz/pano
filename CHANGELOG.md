# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed (first-run review)

- On a phone, any board with an over-limit (WIP) column off-screen loaded zoomed out (a 412px screen laid out at 648px). A screen-reader label escaped the horizontal scroller because nothing around it was positioned; the scrollers are now its containing block. e2e checks the width in phone emulation.
- Sign-in, sign-up, invite and change-password forms fell back to GET when submitted before the JavaScript loaded (slow phone, blocked script), which put the password in the URL. They now post. e2e submits the sign-in form with JavaScript off.
- An invite link for someone the admin set to English opened in Turkish; it now opens in the invitee's language unless that browser already chose one.
- Checklist ticks waited for the server and the boxes were disabled meanwhile, so quick ticks were lost. Ticks now show at once and roll back if refused.
- `@ayse.` at the end of a sentence did not mention ayse (the dot became part of the handle): no notification, no link.
- README: how to try the app on a phone (production build with `COOKIE_SECURE=false`; dev mode does not work from other devices), and a note that npm's "install scripts blocked" warning is harmless.

### Security

- A password reset by invite link left the old password working until the link was used; it is now revoked at once.
- The per-IP sign-in limiter read the leftmost `X-Forwarded-For` entry, which the client controls, so a fake header bypassed it. It now counts `PROXY_HOPS` (default 1) entries from the right. The limiter map is pruned.
- Company sign-up had no rate limit; now 10 per IP per 15 minutes.
- Changing your password had no limit on guessing the current one; now 10 tries per user per 15 minutes.
- Two simultaneous uses of one invite link both succeeded; the link is now single-use atomically.
- Markdown links to `//host` or `/\host` were rendered as in-app links that navigated to another site in the same tab; they now open as external links.
- Added Content-Security-Policy, HSTS and Permissions-Policy headers. The e2e journey fails on any CSP violation and checks that comment Markdown drops raw HTML and `javascript:` links, and that anonymous visitors are sent to sign-in.
- CI: actions pinned to commit SHAs, checkout no longer persists the token. `playwright` pinned to exactly 1.65.1. `npm audit` is clean (override lifts drizzle-kit's legacy esbuild 0.18 to 0.25).

### Security review notes (for the next agent)

- Reviewed: every server action and page read for cross-company IDs (covered by `tests/tenant-isolation.test.ts`), each built-in role calling actions directly, anonymous access, session cookie flags, CSRF (a real action replayed with a foreign `Origin` is refused by Next.js), XSS through Markdown, comments and names (React escaping, no raw HTML), open redirects (none: no redirect takes user input), mass assignment (zod objects strip unknown keys), secrets in git history (only fictional demo/test passwords).
- Known and accepted: anyone who knows an email can lock that account for 15 minutes; a sign-in that has already checked the password while an admin resets it can still create a session (narrow race); exposed without a reverse proxy, a client can choose its own `X-Forwarded-For` and only the per-account lockout applies; CSP still allows inline scripts (nonces are on the Roadmap); invite URLs are built from the request's Host header (shown only to the admin who asked; use a fixed base URL once SMTP sends them).

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
- The GitHub repository has still not been created or pushed: `gh repo create Habibeyilmazz/pano --private --source . --push` was refused by the permission system again in the security round and in the first-run round. CI (`.github/workflows/ci.yml`) has therefore never run, including the Docker build and the seed against real Postgres. The owner has to create the repo (or allow the command) once.
- First-run round: a local clone was followed from the README (`npm install`, `npm run dev`), a new company signed up and an admin, a manager (invite link), a member (temporary password) and an English viewer (invite link) worked a week in separate browser contexts: tasks, assignment, mentions, checklist, status moves and drag, stale-edit conflict, read-only viewer, Turkish search, Team, Overview, CSV, deactivation and role change (both end the session at once), audit log. The script lived in the scratchpad, not in the repo; `e2e/journey.spec.ts` holds the parts that found bugs.
- Over plain HTTP on a non-localhost address with the default `COOKIE_SECURE=true`, sign-in "succeeds" and lands back on the sign-in page without a message. Documented in the README; not detected in code.
- e2e: press shortcuts only after the page is hydrated (`waitUntil: "networkidle"`), or the key is lost.
- Commits carry no Co-Authored-By line: a system instruction in these sessions forbids attribution lines.

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
