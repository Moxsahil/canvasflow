# CanvasFlow — Authentication System Design

```mermaid
flowchart TD

    subgraph CLIENT["🖥️ Client Layer (apps/web)"]
        BROWSER["Browser"]
        MW["middleware.ts\nRoute guard · redirects\nunauthenticated users to /login"]
        LOGIN["/login\nCredentials form +\n'Continue with Google/GitHub'"]
        SIGNUP["/signup\nName · Email · Password"]
        VERIFY["/verify\n?token & email"]
    end

    subgraph AUTHCORE["🔐 Auth.js Core (lib/auth)"]
        CONFIG["authConfig\nJWT session · 30d maxAge\ncallbacks: jwt / session"]
        PROV_CRED["Credentials Provider\nbcrypt.compare(password, hash)"]
        PROV_GOOGLE["Google OAuth Provider"]
        PROV_GITHUB["GitHub OAuth Provider"]
        ADAPTER["DrizzleAdapter\nauthAdapterUsers/Accounts/\nSessions/VerificationTokens"]
    end

    subgraph ACTIONS["⚙️ Server Actions & Email"]
        SIGNUP_ACTION["signup() server action\nzod validate · bcrypt.hash(12)\ninsert users + verification token"]
        RESEND["Resend\nsendVerificationEmail()"]
    end

    subgraph DB["🗄️ Postgres (Drizzle ORM)"]
        T_USERS[("users\nid · email · passwordHash\nemailVerifiedAt · preferences")]
        T_ACCOUNTS[("accounts\nOAuth provider links")]
        T_SESSIONS[("sessions")]
        T_VTOKENS[("verifications_token\nidentifier · token · expires")]
    end

    subgraph GATEWAY["🛡️ API Gateway (NestJS)"]
        JWTGUARD["JwtAuthGuard\njose.jwtVerify · AUTH_SECRET (HS256)"]
        CURRENTUSER["@CurrentUser() decorator"]
        BOARDSCTRL["BoardsController\n/boards"]
    end

    %% --- Browser entry points ---
    BROWSER --> MW
    MW -- "unauthenticated" --> LOGIN
    MW -- "authenticated" --> BOARDS_PAGE["/boards (BoardGrid)"]
    BROWSER --> SIGNUP
    BROWSER --> VERIFY

    %% --- Signup flow ---
    SIGNUP --> SIGNUP_ACTION
    SIGNUP_ACTION --> T_USERS
    SIGNUP_ACTION --> T_VTOKENS
    SIGNUP_ACTION --> RESEND
    RESEND -- "verification link" --> BROWSER
    VERIFY --> T_VTOKENS
    VERIFY -- "set emailVerifiedAt" --> T_USERS

    %% --- Login flow ---
    LOGIN -- "signIn('credentials')" --> PROV_CRED
    LOGIN -- "signIn('google')" --> PROV_GOOGLE
    LOGIN -- "signIn('github')" --> PROV_GITHUB

    PROV_CRED --> T_USERS
    PROV_GOOGLE --> ADAPTER
    PROV_GITHUB --> ADAPTER
    ADAPTER --> T_USERS
    ADAPTER --> T_ACCOUNTS
    ADAPTER --> T_SESSIONS

    PROV_CRED --> CONFIG
    PROV_GOOGLE --> CONFIG
    PROV_GITHUB --> CONFIG
    CONFIG -- "JWT cookie (session)" --> BROWSER

    %% --- Authenticated API calls ---
    BOARDS_PAGE -- "auth() session" --> CONFIG
    BOARDS_PAGE -- "sign short-lived JWT\n(AUTH_SECRET)" --> JWTGUARD
    JWTGUARD --> CURRENTUSER --> BOARDSCTRL
    BOARDSCTRL -- "memberships + boards" --> DB
```

## Flow summary

- **Credentials signup** → `signup()` server action validates input, hashes the
  password with bcrypt, inserts a `users` row (`emailVerifiedAt = null`), creates a
  `verifications_token` row, and emails a verify link via Resend.
- **Email verification** → `/verify` checks the token against `verifications_token`,
  sets `users.emailVerifiedAt`, and deletes the token.
- **Credentials login** → `Credentials` provider looks up the user by email and
  compares the bcrypt hash directly against `users.passwordHash`.
- **OAuth login (Google / GitHub)** → handled entirely by `DrizzleAdapter`, which maps
  Auth.js's expected `user`/`account`/`session`/`verificationToken` shapes onto this
  project's `users`/`accounts`/`sessions`/`verifications_token` tables via
  `authAdapterUsers`, `authAdapterAccounts`, `authAdapterSessions`,
  `authAdapterVerificationTokens`.
- **Session strategy** → JWT (no DB session lookups on each request); `jwt`/`session`
  callbacks copy `user.id` onto `token.id` / `session.user.id`.
- **Route protection** → `middleware.ts` allows `/`, `/login`, `/signup`, `/verify`,
  and `/api/auth/*`; everything else requires `req.auth` or redirects to `/login`.
- **Cross-service auth** → `boards.client.ts` signs a short-lived HS256 JWT with
  `AUTH_SECRET` containing `{ id, email, name }`; `api-gateway`'s `JwtAuthGuard`
  verifies it with the same secret and attaches `request.user`.
