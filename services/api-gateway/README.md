# @canvasflow/api-gateway

The HTTP API gateway for CanvasFlow. Owns boards, workspaces, sharing,
RBAC, and audit logging.

## Endpoints (current)

| Method | Path        | Purpose                        |
| ------ | ----------- | ------------------------------ |
| GET    | /healthz    | Health check (probes database) |
| GET    | /boards     | List all non-deleted boards    |
| GET    | /boards/:id | Fetch a single board by id     |

## Stack

- **NestJS 10** — DI, module system, lifecycle hooks
- **Express adapter** — battle-tested HTTP layer
- **OpenTelemetry** — auto-instrumented tracing for all HTTP, DB calls
- **Drizzle ORM** via `@canvasflow/db`
- **Global HttpExceptionFilter** — every error is JSON with consistent shape
- **Global LoggingInterceptor** — every request logged with status + latency

## Run locally

```bash
# Ensure .env has DATABASE_URL set
pnpm dev
```

Then:

```bash
curl http://localhost:3001/healthz
curl http://localhost:3001/boards
```

## Architecture

- `modules/` — business domain modules (one per bounded context)
- `infra/` — adapters for infrastructure (DB, telemetry, future: redis, R2)
- `common/` — cross-cutting (filters, interceptors, pipes, decorators)
- `config/` — Zod-validated environment

## What's next

- `modules/workspaces` — workspace CRUD + member management
- `modules/sharing` — invites, role assignments, share links
- `modules/auth` — JWT validation guards (issued by Auth.js in apps/web)
- `modules/audit` — write side of the audit log
