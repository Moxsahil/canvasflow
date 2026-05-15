# CanvasFlow

Enterprise-grade collaborative whiteboard platform — Excalidraw's hand-drawn warmth
meeting Figma's real-time collaboration and Miro's workspace primitives.

## Quick start

```bash
pnpm install
pnpm dev
```

## Stack

- **Frontend:** Next.js 14, Vite + React, TypeScript, Tailwind v4
- **Backend:** NestJS, FastAPI, Hocuspocus, BullMQ
- **Data:** PostgreSQL (Drizzle), Redis, Cloudflare R2
- **Real-time:** Yjs CRDT over WebSockets
- **Infra:** AWS ECS Fargate, Terraform, Cloudflare

## Structure

See `docs/architecture/overview.md` for the full system overview.
