# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue or pull request:

- On GitHub, open the repository's **Security** tab and choose **Report a vulnerability** (a private advisory only the maintainers see), or
- send the maintainer (`Habibeyilmazz` on GitHub) a private message asking for a private channel.

Include what an attacker can do, the steps to reproduce (a request, a test or a short script), and the version or commit. You will get an answer within a week. Please give us a reasonable time to fix the problem before you tell anyone else.

The most serious class of bug in pano is one company reading or changing another company's data. Reports of that kind are especially welcome.

## Supported versions

Only the latest commit on `main` (currently 0.1.x) gets security fixes.

## What pano protects, and how

| Area | Protection | Where it is tested |
| --- | --- | --- |
| Tenant isolation | Every row has `workspace_id`; every service query is scoped to the caller's workspace and visible projects. Another company's IDs answer "not found". | `tests/tenant-isolation.test.ts` covers every server action; a meta-test fails when a new action has no case |
| Permissions | Checked in the services (`src/server/*`), never only in the UI. No one can grant permissions they lack. | `tests/permissions.test.ts`, `tests/sprints.test.ts` |
| Passwords | scrypt N=2^17, r=8, p=1; at least 10 characters with letters and digits | `tests/logic.test.ts` (sign-in protection) |
| Sessions | 256-bit random token, only its SHA-256 stored; HttpOnly, Secure, SameSite=Lax cookie; ended on sign-out, deactivation, role or permission change, password reset or change | `tests/permissions.test.ts`, `e2e/journey.spec.ts` |
| Guessing | 5 wrong passwords lock the account for 15 minutes; per-IP limits on sign-in and sign-up; limited guesses of the current password | `tests/logic.test.ts` (sign-in protection) |
| CSRF | Mutations are Next.js Server Actions (foreign `Origin` refused); SameSite cookies | checked by hand by replaying an action from another origin |
| XSS | React escaping; Markdown without raw HTML and with unsafe URLs stripped; Content-Security-Policy | `e2e/journey.spec.ts` (fails on any CSP violation) |
| Links | Invite and reset links are single-use (atomic) and expire | `tests/permissions.test.ts` |

## Known trade-offs

- Anyone who knows an email address can lock that account for 15 minutes by entering wrong passwords.
- The per-IP limiters live in process memory: run one app instance, behind a reverse proxy that appends to `X-Forwarded-For`, with `PROXY_HOPS` set to the number of proxies. Exposed directly, a client can choose its own `X-Forwarded-For` and only the per-account lockout applies.
- The Content-Security-Policy still allows inline scripts, because Next.js inlines its bootstrap (nonces are on the Roadmap).
- Invite URLs are built from the request's `Host` header. They are shown only to the admin who created them; use a fixed base URL once email delivery exists.
- A sign-in that has already checked the password while an admin resets it can still create a session (a narrow race).

## Deployment checklist

- Serve over HTTPS and keep `COOKIE_SECURE=true` (the default).
- Set a strong `POSTGRES_PASSWORD`; do not expose Postgres to the internet.
- Put a reverse proxy in front and set `PROXY_HOPS` to match.
- Never set `SCRYPT_LOG_N` in production (it exists to make tests fast).
- Back up the database regularly and keep copies elsewhere (see README, "Backups").
