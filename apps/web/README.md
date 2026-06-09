# @canvasflow/web

Next.js 15 application — marketing site and dashboard.

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
- `http://localhost:3000/boards` — board list (live data from api-gateway)
- `http://localhost:3000/api/healthz` — frontend health check

## Stack

- **Next.js 15** with App Router and Server Components
- **TanStack Query** for client-side data fetching with caching
- **Tailwind v4** via `@canvasflow/ui`'s shared design tokens
- **Zod-validated environment** via `lib/env.ts`

## Architecture

- `src/app/` — App Router pages and route groups
  - `(dashboard)/` — authenticated dashboard layout (no auth yet)
  - `api/` — Next.js route handlers (healthz only for now)
- `src/features/<feature>/` — feature-first organization
  - `api/` — API client wrappers
  - `hooks/` — TanStack Query hooks
  - `components/` — feature-specific components
- `src/components/` — cross-cutting UI (layout shells)
- `src/lib/` — app-level utilities (env, query client)

## What's next

- Auth.js for sign-in / sign-up (PR #8)
- Board create / rename / delete (PR #9)
- Workspace switcher
