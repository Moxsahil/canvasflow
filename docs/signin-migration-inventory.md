# Sign-in migration, stage 1: inventory

What authenticates a request today, and where each piece lives. Nothing here
is a proposal. It exists so the later stages can be planned against what is
actually in the code rather than against what the architecture diagram says.

Written before any of the migration, so it can be diffed against later.

## The headline: there is no single session to move

The migration plan describes replacing "a single long-lived JWT". There are
three token systems in the product, with different owners, lifetimes and jobs.
Any change to "the session" has to say which of these it means.

| Token           | Cookie or transport | Lifetime  | Issued by                   | Answers                         |
| --------------- | ------------------- | --------- | --------------------------- | ------------------------------- |
| Auth.js session | Auth.js cookie      | 30 days   | `lib/auth/index.ts`         | who is this account             |
| Guest session   | `cf.guest` cookie   | 7 days    | `lib/auth/guest-session.ts` | which anonymous visitor is this |
| Editor token    | URL fragment        | 5 minutes | `lib/auth/editor-token.ts`  | may this person edit this board |

The editor token is deliberately short and board-scoped, and it is minted from
a valid Auth.js session or guest session. It is not a login credential and
should not be folded into the session work.

The guest session exists because share links admit people who have no account.
It is a genuine second identity path and the plan does not mention it.

## Credential checking

One place only.

- `apps/web/src/lib/auth/index.ts`, the Credentials provider's `authorize()`.
- Line 113 onward: schema parse, case-insensitive lookup, then `bcrypt.compare`
  at line 135 against every candidate row that has a password hash.
- The multi-candidate loop exists because addresses differing only in case were
  allowed to register twice before normalisation.

Nothing else in the product compares a password.

## Session creation

- **Auth.js session:** `lib/auth/config.ts` sets `strategy: 'jwt'` with a
  30-day `maxAge`. The `jwt` callback puts only `token.id` on it; the `session`
  callback copies that to `session.user.id`. No verification state is carried,
  which is deliberate and is why `/users/me` is authoritative.
- **Guest session:** `lib/auth/guest-session.ts`, signed with jose, HttpOnly,
  SameSite lax, Secure in production, 7 days.
- **Editor token:** `lib/auth/editor-token.ts`, signed with jose, 5 minutes,
  carrying `boardId` and the caller's role on that board.

## Who reads the session

Fourteen `await auth()` call sites, plus the middleware.

```
api/me                                  api/editor-token
api/workspaces                          api/workspaces/[workspaceId]
api/workspaces/[workspaceId]/boards     api/boards/[boardId]
api/boards/[boardId]/members            api/boards/[boardId]/members/[userId]
api/boards/[boardId]/share-links        api/boards/[boardId]/share-links/[linkId]
open/route.ts                           invite/[token]/page.tsx
invite/[token]/actions.ts
```

Six of those wrap it in a local `authorize()` helper that also resolves board
or workspace access. Those helpers are the real integration surface: they are
where "who is this" meets "what may they do", and every one of them would need
to understand a new session format.

## Guards and redirects

- `apps/web/src/middleware.ts` runs Auth.js on every request not excluded by
  its matcher, and redirects anonymous callers to `/login`.
- `PUBLIC_PATHS` is `/`, `/login`, `/logout`, `/signup`, `/verify-email`, plus
  anything under `/invite/`.
- `EDITOR_API_PREFIXES` marks the routes the editor calls cross-origin, which
  answer 401 as JSON themselves rather than being redirected, because a
  redirected CORS preflight fails the whole request.
- `lib/auth/config.ts` sets `pages.signIn` and `pages.error`, both `/login`.

## Sign-out

`apps/web/src/app/logout/route.ts`, POST only. Calls Auth.js `signOut` with
`redirect: false`, then answers 303 to `/login`. There is no server-side
session record, so this clears a cookie and nothing more. Nothing is revoked,
because there is nothing to revoke.

## OAuth

Google and GitHub, configured in `lib/auth/index.ts`, both with
`allowDangerousEmailAccountLinking` on. The Drizzle adapter links provider
accounts to user rows through the `accounts` table. A `signIn` event stamps
`email_verified_at` when the provider reports the address as verified;
GitHub's reader is overridden because the stock one discards that flag.

The OAuth callback flow, its state handling and its CSRF protection are all
Auth.js internals. Nothing in this repository implements them.

## What has no implementation today

- No server-side session record, so no revocation and no device list.
- No refresh token. The 30-day JWT is the whole session.
- No account state column. `users` has no suspended, disabled or banned field,
  so a "may this account sign in" check has nothing to read.
- No rate limiting anywhere in the web app, on sign-in or any other route.
- No forgot-password or password-reset flow.

## Consequences for the later stages

**Whoever issues the session must issue it for every sign-in path.** Around
half of sign-ins are Google or GitHub, and at least one account in production
has no password at all. Moving only the password path leaves two systems both
meaning "signed in", and the fourteen call sites above would each have to
understand both.

**The guest path is a second identity system** and needs an explicit decision:
leave it in the web app, or move it too.

**The editor token should stay where it is.** It is minted from a session
rather than being one, and it is the one piece with a clear boundary already.
