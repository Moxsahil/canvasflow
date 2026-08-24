# @canvasflow/web

Next.js 15 application — marketing site, authentication, and the hand-off into the
editor. Boards themselves are browsed inside the editor's board switcher; this app has
no board list page.

## Run locally

Two terminals:

```bash
# Terminal 1 — start the api-gateway (must be running)
cd services/api-gateway
pnpm dev

# Terminal 2 — start the web app
cd apps/web
pnpm dev
```

Then visit:

- `http://localhost:3000/` — landing page
- `http://localhost:3000/open` — resolves your most recent board (creating a first one
  if you have none) and redirects into the editor with a short-lived token
- `http://localhost:3000/api/healthz` — frontend health check

## Stack

- **Next.js 15** with App Router and Server Components
- **TanStack Query** for client-side data fetching with caching
- **Tailwind v4** via `@canvasflow/ui`'s shared design tokens
- **Zod-validated environment** via `lib/env.ts`

## Architecture

- `src/app/` — App Router pages and route handlers
  - `open/` — the way into the app: picks a board, mints an editor token, redirects
  - `invite/[token]/` — share-link landing page, public by design
  - `api/` — route handlers. `editor-token`, `boards/*` and `workspaces/*` are called
    by the editor cross-origin with the session cookie, so they carry CORS headers and
    authenticate in the handler rather than in the middleware
- `src/lib/` — app-level utilities (env, auth, board access, CORS)

## What's next

- Board rename / delete
- Workspace member management
