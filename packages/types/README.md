# @canvasflow/types

Shared TypeScript types for CanvasFlow. The "nouns" of the system —
what a Board is, what a User is, what a Shape is.

## Usage

```ts
import type { Board, Shape, User } from '@canvasflow/types';

function renderBoard(board: Board, shapes: Shape[]) {
  // ...
}
```

## Design principles

1. **Branded IDs.** Every entity uses a branded primitive (`UserId`, `BoardId`)
   so the compiler catches type mix-ups that runtime would silently allow.

2. **Discriminated unions for polymorphic data.** `Shape` is a union of
   `RectangleShape | EllipseShape | ...` discriminated by the `kind` field.
   This unlocks exhaustive switch statements and type-narrowing.

3. **String literal unions over enums.** Audit actions, roles, and visibility
   levels are all string literal unions, not TS enums. Smaller runtime,
   better JSON compatibility, friendlier database storage.

4. **No runtime dependencies.** This package exports only types. It compiles
   to almost nothing.

## Exports

| Module       | What's inside                             |
| ------------ | ----------------------------------------- |
| `primitives` | Branded ID types, ISODateString, HexColor |
| `shape`      | Shape union, Point, ShapeStyle            |
| `user`       | User, UserPreferences                     |
| `workspace`  | Workspace, Membership, WorkspaceRole      |
| `board`      | Board, BoardVersion, BoardVisibility      |
| `audit`      | AuditEvent, AuditAction                   |

Everything is re-exported from the package root, so import from
`@canvasflow/types` directly — not from subpaths.
