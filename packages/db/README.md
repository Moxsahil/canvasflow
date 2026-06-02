# @canvasflow/db

Drizzle ORM schema, migrations, and client for CanvasFlow.

## Tables

| Table          | Purpose                                                  |
| -------------- | -------------------------------------------------------- |
| users          | Account identity, profile, preferences                   |
| workspaces     | Tenant container (one org = one workspace)               |
| memberships    | Join table: workspaces ↔ users with role                 |
| boards         | Whiteboards. Soft-deletable (deletedAt)                  |
| board_versions | Named snapshots in time, point to R2-stored Yjs binaries |
| audit_log      | Append-only event log of every write action              |

## Usage

```ts
import { createClient } from '@canvasflow/db';
import { boards } from '@canvasflow/db/schema';
import { eq } from 'drizzle-orm';

const db = createClient(process.env.DATABASE_URL!);
const board = await db.select().from(boards).where(eq(boards.id, boardId));
```

## Scripts

- `pnpm db:generate` — generate migration SQL from schema changes
- `pnpm db:migrate` — apply pending migrations to DATABASE_URL
- `pnpm db:seed` — populate development data (env-guarded)
- `pnpm db:studio` — open Drizzle's web UI to browse data

## Migration workflow

1. Edit a schema file (e.g. `src/schema/users.ts`)
2. `pnpm db:generate` — drizzle-kit writes a new SQL file in `migrations/`
3. Review the SQL — verify it does what you expect
4. `pnpm db:migrate` — apply to your dev database
5. Commit the migration file — they're checked into git

## Design choices

- **Standard `pg` driver, not Neon's serverless driver.** Keeps us
  portable across Postgres hosts (Neon → RDS → anywhere). Switching
  hosts is a connection-string change, zero code changes.
- **Soft delete via `deletedAt`.** Boards stay queryable after delete
  for 30-day recovery. Application queries filter `WHERE deleted_at IS NULL`.
- **Postgres enums for role and plan.** DB-enforced. Invalid values
  are impossible at the database level.
- **Indexes on audit log foreign keys + timestamp.** Audit queries are
  filter-heavy; indexes matter.
- **`onDelete: 'set null'` for audit_log.actor_id.** When a user is
  hard-deleted, their audit trail stays — without a dangling pointer.
