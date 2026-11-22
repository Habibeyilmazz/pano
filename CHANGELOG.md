# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed (reliability round)

Each bug below was reproduced by a failing test first (`tests/reliability.test.ts`, `e2e/concurrency.spec.ts`), then fixed.

- **Card order broke after ~50 drops into the same slot.** Positions are float midpoints; once the gap ran out of precision a dropped card landed in the wrong place (the test saw it at drop 54). `moveTask` now re-spaces the column (one `UPDATE … row_number()`) when there is no room left, which also untangles equal positions left by two simultaneous moves. The board breaks position ties by task number.
- **Labels were lower-cased the Turkish way**, so `API` became `apı` and `CI/CD` became `cı/cd`, and `API` plus `api` were stored as two labels. Labels are now kept as written and duplicates are folded Turkish-aware (`İzmir` = `izmir`). The board's label chips and filter match by the same fold, so `Ofis` and `ofis` on different tasks are one chip. Existing (lower-case) labels are untouched.
- **Deactivated people kept their open tasks**, which then hid: Team lists only active people, the *Unassigned* filter skipped them, and cards showed "Bilinmeyen kişi". Deactivation now unassigns them from open tasks (an "unassigned" entry in each task's history, by the admin); done tasks keep them. Board and backlog cards name people who left (`getBoard` returns `everyone` for name lookup; `people` stays the assignable list). Reactivating does not give the tasks back.
- **A refused description edit lost the draft.** When two people edited the description, the later save got the conflict message but the editor closed and its text was gone (bad with long descriptions). The editor now stays open with the draft until a save succeeds.
- **Done-per-week chart (Overview) missed tasks finished between 00:00 and 03:00 on the first week's Monday** in Istanbul: the query cut at UTC midnight. It now reads a day earlier and lets the existing per-week bucketing (in the app time zone) drop the extra.
- **Capped lists showed the cap as the count.** Overview's overdue list said "(50)" and search said "50 results" when there were more. Both now show the real total (`count(*) over ()`) and a "showing the first 50" note.

### Tests added (reliability round)

- `tests/reliability.test.ts` (9 tests): the fixes above, plus regression guards that already passed: two simultaneous moves of one card (one wins, one conflict, one history entry), a column with tasks refuses deletion and keeps them, a 20,000-character description with combining marks and emoji is stored intact and found by Turkish-folded search (the zod limit counts code points; the textarea's `maxLength` counts UTF-16 units, so it is the stricter one), and `today()` turns over at Istanbul midnight, not UTC.
- `e2e/concurrency.spec.ts`: two tabs move the same card (the stale one gets the conflict toast and the card's real column), two tabs edit the description (the later one keeps its draft), and a touch long-press drag on an emulated Pixel 7 via CDP touch events, which survives a reload. Checked that the drag test fails without the long press.
- `e2e/journey.spec.ts`: the invited person (now a Viewer) sets a password through the link and lands signed in, the link refuses a second use, and the viewer sees the board read-only (no New task, no drag handles, `c` does nothing, no Edit or Assign to me in the task panel).

### Reliability round notes (for the next agent)

- Looked at and left alone: deleting a column checks for tasks outside a transaction, but the `tasks.column_id` foreign key has no cascade, so a task moved in at that moment makes the delete fail rather than lose the task. Users cannot be deleted, only deactivated. Due dates are calendar dates (`YYYY-MM-DD`) shown with `timeZone: "UTC"`, so they never shift.
- Not changed: someone removed from a restricted project keeps their assignments there (same hiding problem as deactivation, rarer); the board loads every task of a project in one query (fine for hundreds, not tested at tens of thousands); search shows the first 50 matches with no paging.
- Previous round's gaps, rechecked: touch drag is now covered in emulation, still not on a real phone. An existing `.data/pglite` still gets no demo sprints (delete it to reseed). No burndown chart or sprint data on Overview (feature work, not this round). Commits still carry no Co-Authored-By line: a system instruction in these sessions forbids attribution lines.

### Added (feature round: sprints)

- **Sprints**, the most-wanted missing piece for a team lead (on the extras list, first buildable Roadmap item). Optional per project: a board without sprints looks and works exactly as before.
  - New **Planlama / Backlog** tab next to Board and List: the running sprint with progress (tasks and points) and days left, planned sprints, the backlog (open tasks in no sprint) and completed sprints with what they delivered. Each row has a sprint picker (works by keyboard and on a phone; no drag needed).
  - Managers (`projects.manage`) create, edit, start, complete and delete sprints. One active sprint per project (service check plus a partial unique index). Completing keeps done tasks in the sprint and moves unfinished ones to the backlog or a planned sprint. Only planned sprints can be deleted; their tasks return to the backlog.
  - The board starts on the running sprint, with a strip showing dates, days left, goal and progress; a picker switches to another sprint, the backlog or all tasks. Column counts and WIP limits count the shown sprint. New tasks created while a sprint is shown join it; a copied task stays in its original's sprint unless that one is completed.
  - The task panel has a Sprint field (anyone who can edit the task); changes appear in the task history ("sprinti “Sprint 3” yaptı"). CSV export has a Sprint column.
  - Demo seed: WEB has a completed Sprint 1, a running Sprint 2 and a planned Sprint 3; MOB stays plain kanban.
  - Tests: `tests/sprints.test.ts` (permissions per role, one active sprint, complete/move rules, closed sprints refuse tasks, delete rules, cross-project sprint ids, copy, CSV, day countdown), tenant-isolation cases for the five new actions and for sprint ids passed to task actions, and `e2e/sprints.spec.ts` (create, plan, start, board scope, create-in-sprint, complete, velocity line).
- `scripts/screenshots.ts` also captures the planning tab (desktop, phone, English dark); README shows it.

### Feature round notes (for the next agent)

- Data: `sprints` table (`state` planned | active | closed) and `tasks.sprint_id` (null = backlog, `on delete set null`), migration `drizzle/0001_sprints.sql`. Rules live in `src/server/sprints.ts`; `assertSprintFor` guards every task write that sets a sprint. Moving a task between sprints goes through `updateTask` (versioned like any field); completing a sprint does not bump task versions on purpose, so it never makes someone's open edit fail.
- UI: `src/components/backlog.tsx` (planning tab, sprint strip, dialogs, `SprintOptions`), wired into `board.tsx` (scope picker) and `task-panel.tsx`.
- An existing local database gets the new table on start but no demo sprints (the seed only runs on an empty database): delete `.data/pglite` to see them.
- Verified by using the app as a manager (create, plan, start, complete, board scope, task field and history) and as a member and an English viewer (read-only, no pickers), at 1440px and 390px (no horizontal overflow). Not built: burndown chart, sprint data on the Overview page, drag from backlog to sprint (the picker covers it).
- Gaps reported by the previous round, rechecked: touch long-press drag is still unverified on a real phone; commits still carry no Co-Authored-By line because a system instruction in these sessions forbids attribution lines; the one-off 160-shot design script stays out of the repo (`scripts/screenshots.ts` is the maintained one); the first visit to the sign-in page is Turkish by design.

### Fixed (design round)

- Sign-in, sign-up and invite pages over plain HTTP on a non-localhost address (with the default `COOKIE_SECURE=true`) bounced back without a word; they now explain that the browser will not keep the cookie and what to do. Detection is the browser's own `isSecureContext`. Checked by opening the app via the machine's LAN IP.
- 404 pages ignored dark mode (Next renders them on the client, where the inline theme script never runs). e2e checks `data-theme` on a 404 in a dark context.
- Overview overflowed the screen on phones; the weekly chart labels now wrap.
- Board: at 1440px the Done column was cut off; the four default columns now share the width (min 15rem each, still scrolling when there are more). An over-limit (WIP) column keeps its amber border with a softer fill, which was loud in dark mode.
- Automatic hyphenation removed: Turkish task titles were split by English rules in the English UI ("karak-ter").
- Light `ink-3` darkened a little so small grey text keeps 4.5:1 on the brand tint.

### Changed (design round)

- **Team** reads at a glance: each task shows priority, key and due date on one line above the title; *Now* has an accent edge instead of a mint fill, *Next* is outlined, *Done this week* is one line with a check (no strike-through, up to 4 shown). Empty lanes collapse to one line on phones. About a quarter shorter on desktop and phone.
- My work titles wrap to two lines on phones instead of being cut; sign-in form starts at the top on phones; board card avatars are larger and overlap less, filter avatars no longer overlap.
- README screenshots refreshed from the running app.

### Design round notes (for the next agent)

- Every screen was captured in Turkish and English, light and dark, at 1440 and 390 (160 shots, scratch script not committed) with a check for elements running off the right edge of the screen; none remain. `scripts/screenshots.ts` still produces the README set.
- Looked at and left alone: the unauthenticated pages follow the locale cookie, not the browser language, so a first visit is Turkish (the switch is top right); the estimate on a board card is a bare number (its tooltip says what it is); dark-mode stat tags on the Team page are low-key on purpose.
- The GitHub repo exists (private) and CI ran green on `72b4021`; this round pushed the first-run and design commits.

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
- First-run round: a local clone was followed from the README (`npm install`, `npm run dev`), a new company signed up and an admin, a manager (invite link), a member (temporary password) and an English viewer (invite link) worked a week in separate browser contexts: tasks, assignment, mentions, checklist, status moves and drag, stale-edit conflict, read-only viewer, Turkish search, Team, Overview, CSV, deactivation and role change (both end the session at once), audit log. The script lived in the scratchpad, not in the repo; `e2e/journey.spec.ts` holds the parts that found bugs.
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
