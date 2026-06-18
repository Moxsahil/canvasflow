# CanvasFlow

[![CI](https://github.com/Moxsahil/canvasflow/actions/workflows/ci.yml/badge.svg)](https://github.com/Moxsahil/canvasflow/actions/workflows/ci.yml)

Enterprise-grade collaborative whiteboard platform.
Excalidraw warmth meets Figma collaboration meets Notion workspace primitives.

## Stack

- **Frontend:** Next.js 15 (App Router), TanStack Query, Tailwind v4
- **Backend:** NestJS 10, Drizzle ORM, OpenTelemetry
- **Database:** PostgreSQL (Neon dev, RDS prod target)
- **Auth:** Auth.js v5 (credentials + Google + GitHub)
- **Email:** Resend
- **Realtime:** Yjs + Hocuspocus (Sprint 3)
- **Monorepo:** Turborepo + pnpm workspaces

## Repository

```
apps/
└── web/                # Next.js dashboard

services/
└── api-gateway/        # NestJS HTTP API

packages/
├── config/             # Shared ESLint, TypeScript, Prettier
├── types/              # Branded IDs, shape unions, audit actions
├── ui/                 # Design system (Button, Input, Card, etc.)
└── db/                 # Drizzle schema, migrations, client
```

Planned (not yet scaffolded):

- `apps/editor/` — Vite + React canvas editor (Sprint 2)
- `services/collab-service/` — Hocuspocus WebSocket server (Sprint 3)
- `services/worker/` — BullMQ jobs: exports, snapshots (Sprint 4)
- `services/ai-service/` — FastAPI text-to-diagram (Sprint 5)

## Local development

```bash
# Install dependencies (once)
pnpm install

# Start everything
pnpm dev

# Or per-service:
pnpm --filter @canvasflow/web dev          # localhost:3000
pnpm --filter @canvasflow/api-gateway dev  # localhost:3001
```

## Quality gates

```bash
pnpm verify           # what CI runs: typecheck + lint + build
pnpm format:check     # Prettier in check mode
pnpm format           # Prettier in write mode
```

## Sprint plan

12-week, 6-sprint engineering plan to ship an Excalidraw-class product.
See docs/sprint-plan.pdf for the full roadmap.

| Sprint              | Theme                                | Status      |
| ------------------- | ------------------------------------ | ----------- |
| 1. Foundation       | Rails: monorepo, auth, dashboard, CI | in progress |
| 2. Canvas Engine    | 60fps drawing, undo, persistence     | upcoming    |
| 3. Real-time Collab | Yjs + Hocuspocus                     | upcoming    |
| 4. Enterprise       | Sharing, versions, audit, exports    | upcoming    |
| 5. AI               | Text-to-diagram, smart cleanup       | upcoming    |
| 6. Infra + Launch   | SSO, prod hardening, design partners | upcoming    |

## License

UNLICENSED — proprietary work in progress.
