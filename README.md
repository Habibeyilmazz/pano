# pano

**pano** (Turkish for "board") is a web app a company uses to run its work on a board: a focused, friendly subset of Jira. Each company gets its own isolated workspace; the admin adds people, gives them roles and permissions, and everyone can see who is working on what, what is next and what got done.

> **TR:** pano, şirketlerin işlerini tek panoda yürütmesi için yapılmış bir web uygulamasıdır. Şirket hesabını açan kişi yönetici olur, ekibi ekler, rolleri ve yetkileri belirler. Herkes kimin neyle uğraştığını, sırada ne olduğunu ve neyin bittiğini görür. Arayüz varsayılan olarak Türkçedir; İngilizce de tam olarak desteklenir.

![Board](docs/screenshots/board.png)

| Team: now / next / done this week | Task detail |
| --- | --- |
| ![Team](docs/screenshots/team.png) | ![Task](docs/screenshots/task.png) |
| **My work** | **Overview dashboard** |
| ![My work](docs/screenshots/my-work.png) | ![Dashboard](docs/screenshots/dashboard.png) |
| **Sprint planning (Planlama)** | **Users and roles** |
| ![Sprint planning](docs/screenshots/backlog.png) | ![Users](docs/screenshots/users.png) |
| **English, dark mode (a read-only viewer)** | **Team, English, dark** |
| ![Board in English, dark](docs/screenshots/board-dark-en.png) | ![Team in English, dark](docs/screenshots/team-dark-en.png) |

<p>
  <img src="docs/screenshots/mobile-board.png" width="240" alt="Board on a phone">
  <img src="docs/screenshots/mobile-task.png" width="240" alt="Task on a phone">
  <img src="docs/screenshots/mobile-team.png" width="240" alt="Team on a phone">
  <img src="docs/screenshots/mobile-backlog.png" width="240" alt="Sprint planning on a phone">
</p>

All screenshots come from the running app with the demo data (`scripts/screenshots.ts`).

## Quickstart

Requirements: Node.js 22 and npm. No database server or Docker needed for development.

```bash
npm install
npm run dev        # seeds the demo company on first run, then serves http://localhost:4500
```

Development and tests use [PGlite](https://pglite.dev) (Postgres compiled to WebAssembly) stored in `.data/pglite`. Delete that folder to start over; `npm run seed` adds the demo company to an empty database.

Newer npm versions print that install scripts of `esbuild` and `fsevents` were blocked; nothing needs them, you can ignore it.

### Trying it on your phone

`npm run dev` prints a "Network" address, but the dev server does not serve its scripts to other devices, and session cookies are `Secure` (sent only over HTTPS or to `localhost`), so signing in from a phone over plain HTTP cannot work (the sign-in page shows a warning when it detects this). To try pano on a phone on the same Wi-Fi, run a production build without the `Secure` flag, for this local try-out only:

```bash
npm run build
COOKIE_SECURE=false npm start    # then open http://<your computer's IP>:4500 on the phone
```

### Demo logins

All demo accounts are fictional and share the password **`PanoDemo2026`** (demo only).

| Email | Name | Role |
| --- | --- | --- |
| `ayse@ornek.test` | Ayşe Yılmaz | Admin (Yönetici) |
| `mehmet@ornek.test` | Mehmet Kaya | Manager (Proje yöneticisi) |
| `zeynep@ornek.test` | Zeynep Demir | Member (Üye) |
| `emre@ornek.test` | Emre Şahin | Member |
| `elif@ornek.test` | Elif Çelik | Member |
| `burak@ornek.test` | Burak Öztürk | Member |
| `ismail@ornek.test` | İsmail Doğan | Custom role "Stajyer" (intern) |
| `selin@ornek.test` | Selin Arslan | Viewer (İzleyici), interface in English |

The demo company "Örnek Yazılım A.Ş." has two projects (WEB, MOB) and 40 tasks in Turkish at various states. WEB works in sprints (one completed, one running, one planned); MOB is a plain kanban board. You can also create your own company at `/signup`.

## What it does

**Companies and people**
- Company sign-up creates an isolated workspace; the first user is its admin.
- Admins add users (name, email, role, language) and either get a one-time **invite link** (valid 7 days) or set a **temporary password** that must be changed at first sign-in. No email is sent in v0.1; the link is shown once to copy. `src/server/mail.ts` is the hook for SMTP.
- Built-in roles: **Admin**, **Manager**, **Member**, **Viewer** (read-only). Admins create **custom roles** by ticking permissions: manage users, manage roles, manage projects/boards, create tasks, edit any task, delete tasks, assign self, assign others, comment, view reports.
- Projects can be **restricted** to selected people (admins and managers always see every project).
- Deactivating a user ends their sessions immediately and keeps their history. Admins can reset passwords (new link or temporary password). The **audit log** records user created, role changed, access turned off/on, password reset, role created/changed/deleted and task deleted.

**The board**
- One kanban board per project. Default columns: Yapılacak / To do, Devam ediyor / In progress, İncelemede / In review, Tamamlandı / Done. Managers rename, add, reorder and delete (empty) columns, set each column's type (to do / in progress / done) and an optional **WIP limit**: the column turns amber when exceeded.
- Tasks have a key (e.g. `WEB-42`), title, Markdown description (raw HTML is never rendered), one or more assignees, reporter, priority with icons, labels, due date, estimate (points), a checklist with progress, comments with **@mentions** (suggestions while typing) and a full history.
- **Drag and drop** between and within columns with the mouse, a long press on touch screens, or the keyboard (focus a card's handle, Space, arrow keys, Space). The task panel's Status field is another keyboard-friendly way to move a task.
- **Assign to me** on the card and in the task panel; assign others from the panel. Moves are optimistic and roll back with a message if the server refuses.
- **Concurrent edits never silently overwrite each other**: every task change carries the version the user saw; a stale change is rejected and the latest version is loaded.
- Quick filters: my tasks, unassigned, overdue, due this week, assignee avatars, label, priority and text. A **list view** shows the same filtered tasks as a table.

**Sprints (optional)**
- A project can work in **sprints**; a team that does not want them never sees them on the board. People who manage projects create sprints (named "Sprint 1", "Sprint 2"… unless you name them), with optional dates and a **sprint goal**.
- The **Planlama / Backlog** tab lists the running sprint (progress in tasks and points, days left), planned sprints and the **backlog** (open tasks in no sprint). Each task row has a sprint picker, so planning works by keyboard and on a phone; the task panel has the same field, and the change shows in the task's history.
- **Starting** a sprint (one at a time per project, also enforced by the database) makes the board show only that sprint's tasks, with a strip showing the dates, days left, goal and progress. A picker above the board switches to another sprint, the backlog or all tasks. A task created while the board shows a sprint joins it.
- **Completing** a sprint keeps its done tasks as its record and moves the unfinished ones to the backlog or to a planned sprint. Completed sprints are listed with what they delivered (tasks and points), which gives the team its velocity. Only planned sprints can be deleted; their tasks return to the backlog.
- The CSV export has a Sprint column.

**Seeing what everyone is doing**
- **My work (İşlerim)**: my tasks grouped in progress / to do / recently done, overdue first.
- **Team (Ekip)**: one row per person with what they are doing now, what is next and what they finished this week, with open-task and point counts and overdue warnings, filterable by project. Each person has a profile with the same view plus their recent activity.
- **Overview (Özet)** for people with "view reports": tasks by status, done per week (8 weeks), overdue list and workload per person.

**Extras**
- In-app **notifications** with an unread badge: assigned to you, mentioned, due tomorrow.
- **Keyboard shortcuts**: `c` new task, `/` search, `?` help, `Esc` closes dialogs.
- **Search** across all visible tasks, Turkish-aware: `istanbul` finds "İstanbul", `ılık` finds "ILIK", and Turkish letters are optional (`tasinmasi` finds "taşınması").
- **Copy task** (fields and checklist), **CSV export** per project (Excel-friendly, formula-safe).
- **Dark mode** (system, light or dark per user) and a **mobile layout** with a bottom tab bar.
- Turkish is the default language; English is complete. Each user picks a language; the sign-in page has a switch. Dates, numbers and plurals follow tr-TR / en-GB.

## Security model

- **Tenant isolation**: every table row carries `workspace_id`; every service query filters by the caller's workspace and project visibility. Records from another company are answered with "not found", never "forbidden", so IDs leak nothing. `tests/tenant-isolation.test.ts` runs a company-B admin (who holds every permission) against company A's IDs for **every server action** in `src/app/actions.ts`, and a meta-test fails if an action is added without such a case.
- **Permissions are enforced on the server** in `src/server/*`; the UI only hides what you cannot do. Nobody can grant, or act on someone holding, permissions they do not have themselves (no privilege escalation through "manage users"). The company always keeps an active admin.
- **Auth**: email + password, hashed with scrypt (N=2^17, r=8, p=1) from `node:crypto`. Sessions are random 256-bit tokens in an HttpOnly, Secure, SameSite=Lax cookie; only their SHA-256 is stored. Sessions end on sign-out, deactivation, role change, permission change of a custom role, password reset and password change (other devices). A password reset by link also revokes the old password at once; invite/reset links work exactly once.
- **Sign-in protection**: 5 wrong passwords lock the account for 15 minutes; in-memory per-IP limits cap sign-in attempts and company sign-ups, and changing your password allows 10 tries per 15 minutes (see Limits). Password policy: at least 10 characters with letters and digits.
- **CSRF**: all mutations are Next.js Server Actions, which reject requests whose `Origin` does not match the host (checked by replaying a real action from a foreign origin); cookies are SameSite=Lax. The only route handler is a read-only CSV download.
- **Validation** with zod at every server boundary. Markdown is rendered without raw HTML and with unsafe URLs stripped; `//host` links open as external links in a new tab. Headers: a Content-Security-Policy (only same-origin scripts, styles, images, fonts and connections; no plugins, framing or off-site form posts; `'unsafe-inline'` scripts remain because Next.js inlines its bootstrap), HSTS, Permissions-Policy, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`. The e2e journey fails on any CSP violation. CI actions are pinned to commit SHAs with a read-only token.

## Development

```bash
npm run dev         # http://localhost:4500 (PGlite in .data/pglite)
npm test            # vitest: permissions, tenant isolation, sprints, business rules (in-memory PGlite)
npm run typecheck
npm run lint
npm run build && npm run e2e   # Playwright journeys (main + sprints) against a production build on :4501
npx tsx scripts/screenshots.ts docs/screenshots   # with a seeded app running on :4500
```

Stack: Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Drizzle ORM · PostgreSQL (PGlite locally) · Tailwind CSS 4 · dnd-kit · zod · vitest · Playwright.

Layout:

```
src/db/          schema (Drizzle) and the connection (PGlite or Postgres)
src/server/      services: all business rules, permission checks and workspace scoping
src/app/actions.ts  thin Server Actions: session -> service
src/app/         pages (App Router)
src/components/  UI
src/lib/i18n/    tr.ts (source) and en.ts (type-checked to have the same keys)
drizzle/         SQL migrations (applied automatically at startup)
tests/ e2e/      vitest and Playwright
```

After changing `src/db/schema.ts`, run `npm run db:generate` to create a migration.

## Deploying

Production uses a real Postgres via `DATABASE_URL`; migrations run on startup.

```bash
docker compose up --build     # app on http://localhost:4500 + postgres:17
```

Then open `/signup` to create your company (the demo seed is not run in Docker). Configuration (see `.env.example`): `DATABASE_URL`, `APP_TZ` (default `Europe/Istanbul`), `COOKIE_SECURE` (default `true`; put HTTPS in front of the app), `PROXY_HOPS` (default `1`: the number of reverse proxies in front of the app that append to `X-Forwarded-For`). Change `POSTGRES_PASSWORD` for anything beyond a local try-out.

## Limits in v0.1

- The per-IP limiters (sign-in: 30 attempts, sign-up: 10 companies per 15 minutes) live in process memory: fine for one app instance; use a shared store when running several. They read the client IP from the right end of `X-Forwarded-For` (`PROXY_HOPS`), so run the app behind a reverse proxy that appends to that header; exposed directly, a client can pick its own IP and only the per-account lockout applies.
- Account lockout can be triggered by anyone who knows an email address (5 wrong passwords block that account for 15 minutes); this trades availability for brute-force protection.
- One time zone per installation (`APP_TZ`) for due dates and week boundaries.
- No email delivery yet (links are copied by the admin).

## Roadmap

Not built yet, in rough priority order:
- Email delivery for invites, resets and notifications (SMTP behind `src/server/mail.ts`).
- Sprint reports: a burndown chart and sprint progress on the Overview page (today the Planlama tab shows progress and what each completed sprint delivered).
- Task templates (copying a task covers the simplest case today).
- Editing and deleting comments; attachments.
- Realtime board updates (today the board refreshes after your own actions and on navigation; stale edits are caught by versioning).
- Content-Security-Policy with nonces.
- Per-company time zone, SSO, API tokens and webhooks.

## License

[MIT](LICENSE) © Habibeyilmazz
