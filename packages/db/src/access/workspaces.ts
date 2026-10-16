import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { can } from '@canvasflow/types';
import type { Database } from '../client.js';
import { boardMembers, type BoardRole } from '../schema/board-access.js';
import { boards, type BoardRow } from '../schema/boards.js';
import { boardPins } from '../schema/board-pins.js';
import { users } from '../schema/users.js';
import {
  memberships,
  workspaces,
  type MembershipRow,
  type WorkspaceRow,
} from '../schema/workspaces.js';
import type { AvatarSource } from './users.js';

/**
 * The workspace tree behind the editor's board switcher: which workspaces a
 * person belongs to, which boards live in each, and how to add either.
 *
 * Every function here takes the caller's id and answers only for workspaces
 * they are a member of — the editor reaches these through the web app and
 * the gateway with nothing but a session cookie, so membership is the whole
 * authorization story. A non-member gets `null`, never an empty list, so callers can answer
 * 404 and keep workspace ids unprobeable.
 */

/** Where someone stands in a workspace. The gate on renaming and deleting it. */
export type WorkspaceRole = MembershipRow['role'];

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  plan: WorkspaceRow['plan'];
  logoUrl: string | null;
  /** The caller's role in this workspace, not the board role. */
  role: WorkspaceRole;
  /** Boards not soft-deleted. Shown next to the name so an empty one reads as empty. */
  boardCount: number;
}

/**
 * What each role may do: the one table, kept in `@canvasflow/types` so the
 * editor reads the same rules the routes enforce.
 */
export { can, canManageMember, type WorkspaceCapability } from '@canvasflow/types';

export interface BoardSummary {
  id: string;
  workspaceId: string;
  title: string;
  visibility: BoardRow['visibility'];
  /** The tag colour beside the title in the switcher. `gray` is untagged. */
  color: BoardRow['color'];
  updatedAt: Date;
  /** Who made it — with the workspace's admins, who may archive or delete it. */
  ownerId: string;
  /** Set while the board is archived: out of the lists, read-only for everyone. */
  archivedAt: Date | null;
}

/** A board as the sidebar lists it: the board, and the caller's own pin on it. */
export interface ListedBoard extends BoardSummary {
  /** The caller's pin order key, or null when they have not pinned it. */
  pin: string | null;
}

export const DEFAULT_BOARD_TITLE = 'Untitled board';

/** The one shape the board switcher reads, shared with the board mutations. */
export function toBoardSummary(row: BoardRow): BoardSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    visibility: row.visibility,
    color: row.color,
    updatedAt: row.updatedAt,
    ownerId: row.ownerId,
    archivedAt: row.archivedAt,
  };
}

/**
 * Every workspace the user belongs to, oldest membership first.
 *
 * Ordered by when they joined rather than by name so the list a person sees
 * doesn't reshuffle when someone renames a workspace, and so their original
 * (usually personal) workspace stays at the top where they expect it.
 */
export async function listWorkspacesForUser(
  db: Database,
  userId: string,
): Promise<WorkspaceSummary[]> {
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      plan: workspaces.plan,
      logoUrl: workspaces.logoUrl,
      role: memberships.role,
      boardCount: sql<number>`count(${boards.id})`.mapWith(Number),
    })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    // Joined rather than counted in a subquery so one round trip fills the
    // whole switcher; the null-check keeps soft-deleted boards out of the count.
    .leftJoin(
      boards,
      and(
        eq(boards.workspaceId, workspaces.id),
        isNull(boards.deletedAt),
        isNull(boards.archivedAt),
      ),
    )
    // Membership rows outlive a deleted workspace — the row is kept so the
    // delete can be undone — so the workspace's own tombstone is what hides it.
    .where(and(eq(memberships.userId, userId), isNull(workspaces.deletedAt)))
    .groupBy(workspaces.id, memberships.role, memberships.joinedAt)
    .orderBy(asc(memberships.joinedAt));

  return rows;
}

/**
 * The user's role in this workspace, or null if they aren't in it — or if it
 * has been deleted, which callers must treat identically so a deleted
 * workspace stops answering the moment it goes.
 *
 * The gate on everything below, and what the routes authorize against.
 */
export async function workspaceRoleOf(
  db: Database,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceRole | null> {
  const rows = await db
    .select({ role: memberships.role })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.userId, userId),
        isNull(workspaces.deletedAt),
      ),
    )
    .limit(1);

  return rows[0]?.role ?? null;
}

/** Whether the user is a member of this workspace. The gate on everything below. */
export async function isWorkspaceMember(
  db: Database,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  return (await workspaceRoleOf(db, userId, workspaceId)) !== null;
}

/**
 * Everyone to tell when a workspace changes: its members' ids.
 *
 * Deleted workspaces answer too — their membership rows are kept — so the
 * people in one hear that it has gone.
 */
export async function workspaceMemberIds(db: Database, workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.workspaceId, workspaceId));
  return rows.map((row) => row.userId);
}

/** One person in a workspace, as its member list shows them. */
export interface WorkspaceMember {
  userId: string;
  name: string;
  /** Null until they choose one. */
  username: string | null;
  email: string;
  role: WorkspaceRole;
  joinedAt: Date;
  /** What their photo is drawn from; turning it into a URL is the caller's job. */
  avatar: AvatarSource;
}

const ROLE_RANK: Record<WorkspaceRole, number> = { owner: 0, admin: 1, member: 2 };

/**
 * The order a member list reads in: the owner, then admins, then everyone
 * else, each by when they joined — so the list doesn't reshuffle when somebody
 * changes their name.
 */
export function compareWorkspaceMembers(
  a: Pick<WorkspaceMember, 'role' | 'joinedAt'>,
  b: Pick<WorkspaceMember, 'role' | 'joinedAt'>,
): number {
  return ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.joinedAt.getTime() - b.joinedAt.getTime();
}

/**
 * Everyone in a workspace, in `compareWorkspaceMembers` order.
 *
 * Answers for any workspace id, deleted or not: whether the caller may see the
 * list is the route's question, answered with `workspaceRoleOf` first, which is
 * also what refuses a deleted workspace.
 */
export async function listWorkspaceMembers(
  db: Database,
  workspaceId: string,
): Promise<WorkspaceMember[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      role: memberships.role,
      joinedAt: memberships.joinedAt,
      fileId: users.avatarFileId,
      mimeType: users.avatarMimeType,
      externalUrl: users.avatarUrl,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.workspaceId, workspaceId));

  return rows
    .map(({ fileId, mimeType, externalUrl, ...member }) => ({
      ...member,
      avatar: { fileId, mimeType, externalUrl },
    }))
    .sort(compareWorkspaceMembers);
}

/** One board a guest was let onto, and what they may do there. */
export interface GuestBoard {
  boardId: string;
  title: string;
  role: BoardRole;
}

/**
 * Somebody on one or more of a workspace's boards without being in the
 * workspace — let in by a share link, so their access is to those boards only.
 */
export interface WorkspaceGuest {
  userId: string;
  name: string;
  username: string | null;
  email: string;
  /** Joined by link without an account; their address is a placeholder. */
  isGuest: boolean;
  avatar: AvatarSource;
  /** In the order they were let onto them. */
  boards: GuestBoard[];
}

/**
 * Everyone with access to a board in this workspace who is not a member of it.
 *
 * Only standing access counts: a revoked grant, or a board that has been
 * deleted, gives nothing and so lists nobody. Members are left out even when
 * they also hold a grant of their own — they are already in the member list,
 * and the workspace reaches further than any one board.
 */
export async function listWorkspaceGuests(
  db: Database,
  workspaceId: string,
): Promise<WorkspaceGuest[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      isGuest: users.isGuest,
      fileId: users.avatarFileId,
      mimeType: users.avatarMimeType,
      externalUrl: users.avatarUrl,
      boardId: boards.id,
      title: boards.title,
      role: boardMembers.role,
    })
    .from(boardMembers)
    .innerJoin(boards, eq(boards.id, boardMembers.boardId))
    .innerJoin(users, eq(users.id, boardMembers.userId))
    .leftJoin(
      memberships,
      and(
        eq(memberships.workspaceId, boards.workspaceId),
        eq(memberships.userId, boardMembers.userId),
      ),
    )
    .where(
      and(
        eq(boards.workspaceId, workspaceId),
        isNull(boards.deletedAt),
        eq(boardMembers.status, 'active'),
        isNull(memberships.id),
        // A board's owner needs no grant, and one left over would list them
        // as a guest on their own board.
        ne(boardMembers.userId, boards.ownerId),
      ),
    )
    .orderBy(asc(boardMembers.createdAt));

  const guests = new Map<string, WorkspaceGuest>();
  for (const { boardId, title, role, fileId, mimeType, externalUrl, ...person } of rows) {
    const guest = guests.get(person.userId) ?? {
      ...person,
      avatar: { fileId, mimeType, externalUrl },
      boards: [],
    };
    guest.boards.push({ boardId, title, role });
    guests.set(person.userId, guest);
  }
  return [...guests.values()];
}

/**
 * Boards in one workspace, most recently touched first, archived ones
 * included — the sidebar sorts them into Pinned, Boards and Archived — each
 * with the caller's own pin on it.
 *
 * Returns null when the caller isn't a member — the same answer a missing
 * workspace gives, so callers surface 404 for both.
 *
 * One round trip: the caller's membership is the row the boards are joined
 * onto, so no row at all means not a member, and a single row with no board
 * means an empty workspace. Their pins join on the (user, board) key. Only the
 * columns the sidebar reads are fetched.
 */
export async function listWorkspaceBoards(
  db: Database,
  userId: string,
  workspaceId: string,
): Promise<ListedBoard[] | null> {
  const rows = await db
    .select({
      id: boards.id,
      workspaceId: boards.workspaceId,
      title: boards.title,
      visibility: boards.visibility,
      color: boards.color,
      updatedAt: boards.updatedAt,
      ownerId: boards.ownerId,
      archivedAt: boards.archivedAt,
      pin: boardPins.position,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .leftJoin(
      boards,
      and(eq(boards.workspaceId, memberships.workspaceId), isNull(boards.deletedAt)),
    )
    .leftJoin(boardPins, and(eq(boardPins.boardId, boards.id), eq(boardPins.userId, userId)))
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.userId, userId),
        isNull(workspaces.deletedAt),
      ),
    )
    .orderBy(desc(boards.updatedAt));

  if (rows.length === 0) return null;

  const list: ListedBoard[] = [];
  for (const row of rows) {
    // The empty workspace's lone row, every board column null.
    if (row.id === null || row.workspaceId === null || row.title === null) continue;
    if (row.visibility === null || row.color === null || row.updatedAt === null) continue;
    if (row.ownerId === null) continue;
    list.push({
      id: row.id,
      workspaceId: row.workspaceId,
      title: row.title,
      visibility: row.visibility,
      color: row.color,
      updatedAt: row.updatedAt,
      ownerId: row.ownerId,
      archivedAt: row.archivedAt,
      pin: row.pin,
    });
  }
  return list;
}

/**
 * A url-safe stem for a workspace name.
 *
 * Not unique on its own — `createWorkspaceForUser` is what resolves
 * collisions. Falls back to a constant for a name made entirely of characters
 * that don't survive the transform (an emoji, a non-latin script).
 */
export function workspaceSlugStem(name: string): string {
  const stem = name
    .normalize('NFKD')
    // Drop the combining marks NFKD just split off, so an accented letter
    // becomes its plain form rather than being replaced by a dash.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    // A trailing dash left behind by the slice reads as a typo.
    .replace(/-+$/, '');

  return stem || 'workspace';
}

export interface CreateWorkspaceInput {
  userId: string;
  name: string;
}

/**
 * Create a workspace with the caller as its owner.
 *
 * The slug is derived from the name, with a random suffix only when the plain
 * one is taken — so the common case reads as the name, and two people naming a
 * workspace the same thing still both succeed. The insert is retried once
 * because the check-then-insert is racy by construction.
 */
export async function createWorkspaceForUser(
  db: Database,
  input: CreateWorkspaceInput,
): Promise<WorkspaceSummary> {
  const stem = workspaceSlugStem(input.name);
  const taken = await db
    .select({ slug: workspaces.slug })
    .from(workspaces)
    .where(eq(workspaces.slug, stem))
    .limit(1);

  const slug = taken.length > 0 ? `${stem}-${randomSlugSuffix()}` : stem;

  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .insert(workspaces)
      .values({ name: input.name, slug })
      .onConflictDoNothing({ target: workspaces.slug })
      .returning();

    const created =
      workspace ??
      (
        await tx
          .insert(workspaces)
          .values({ name: input.name, slug: `${stem}-${randomSlugSuffix()}` })
          .returning()
      )[0];

    if (!created) throw new Error('Failed to create workspace');

    const [membership] = await tx
      .insert(memberships)
      .values({ workspaceId: created.id, userId: input.userId, role: 'owner' })
      .returning();
    if (!membership) throw new Error('Failed to join the new workspace');

    return {
      id: created.id,
      name: created.name,
      slug: created.slug,
      plan: created.plan,
      logoUrl: created.logoUrl,
      role: membership.role,
      boardCount: 0,
    };
  });
}

/**
 * Rename a workspace.
 *
 * The slug is deliberately left alone. It is what the workspace is addressed
 * by, and quietly re-deriving it on every rename would break links that are
 * already out there — a name is a label, a slug is an identifier.
 *
 * `role` is the caller's, resolved by the route a moment earlier and carried
 * through only so the answer is the same `WorkspaceSummary` the switcher
 * already holds and can patch in place. Authorization is the route's job, as
 * it is for boards; see access/boards.ts for why it isn't done here.
 */
export async function renameWorkspace(
  db: Database,
  workspaceId: string,
  name: string,
  role: WorkspaceRole,
): Promise<WorkspaceSummary | null> {
  const [workspace] = await db
    .update(workspaces)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt)))
    .returning();

  if (!workspace) return null;

  const [counted] = await db
    .select({ boardCount: sql<number>`count(${boards.id})`.mapWith(Number) })
    .from(boards)
    .where(
      and(eq(boards.workspaceId, workspaceId), isNull(boards.deletedAt), isNull(boards.archivedAt)),
    );

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    plan: workspace.plan,
    logoUrl: workspace.logoUrl,
    role,
    boardCount: counted?.boardCount ?? 0,
  };
}

export interface DeleteWorkspaceResult {
  /** How many boards went with it, for the message shown afterwards. */
  boardsDeleted: number;
}

/**
 * Delete a workspace and every board in it.
 *
 * Both are soft deletes, in one transaction, so the whole act is recoverable
 * and a half-finished one leaves nothing behind. That is also why the
 * workspace row itself is kept rather than deleted outright: the `boards` and
 * `memberships` foreign keys cascade, so a real DELETE here would erase the
 * documents before their own `deletedAt` could ever mean anything.
 *
 * Anyone with one of these boards open loses it at the sync-server's next
 * re-authorization sweep, without needing to be told separately —
 * `resolveBoardAccess` refuses a soft-deleted board.
 *
 * Returns null when the workspace is already gone, so a double-submit reads as
 * "not found" rather than reporting a second successful delete.
 */
export async function deleteWorkspace(
  db: Database,
  workspaceId: string,
): Promise<DeleteWorkspaceResult | null> {
  const deletedAt = new Date();

  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .update(workspaces)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt)))
      .returning({ id: workspaces.id });

    if (!workspace) return null;

    const removed = await tx
      .update(boards)
      .set({ deletedAt })
      .where(and(eq(boards.workspaceId, workspaceId), isNull(boards.deletedAt)))
      .returning({ id: boards.id });

    return { boardsDeleted: removed.length };
  });
}

export interface CreateBoardInput {
  userId: string;
  workspaceId: string;
  title?: string;
}

/**
 * Create an empty board in a workspace the caller belongs to.
 *
 * Returns null for a workspace they aren't in. The board carries no shapes:
 * the document is created lazily on first open, so an empty update log *is* a
 * blank board.
 *
 * One statement: the insert selects its row only when the caller's membership
 * exists, so checking and writing are a single round trip and cannot be split
 * by a removal landing in between.
 */
export async function createBoardInWorkspace(
  db: Database,
  input: CreateBoardInput,
): Promise<BoardSummary | null> {
  const title = input.title?.trim() || DEFAULT_BOARD_TITLE;

  const result = await db.execute<
    { updatedAt: string; archivedAt: null } & Omit<BoardSummary, 'updatedAt' | 'archivedAt'>
  >(sql`
    INSERT INTO boards (workspace_id, owner_id, title, visibility)
    SELECT ${input.workspaceId}::uuid, ${input.userId}::uuid, ${title}, 'workspace'::board_visibility
    WHERE EXISTS (
      SELECT 1 FROM memberships
      INNER JOIN workspace ON workspace.id = memberships.workspace_id
      WHERE memberships.workspace_id = ${input.workspaceId}::uuid
        AND memberships.user_id = ${input.userId}::uuid
        AND workspace.deleted_at IS NULL
    )
    RETURNING
      id,
      workspace_id AS "workspaceId",
      title,
      visibility,
      color,
      updated_at AS "updatedAt",
      owner_id AS "ownerId",
      archived_at AS "archivedAt"
  `);

  const row = result.rows[0];
  // A raw statement's timestamps arrive as text, read here as the column
  // itself reads them.
  return row ? { ...row, updatedAt: new Date(row.updatedAt) } : null;
}

/**
 * The board to drop someone into when they arrive with no board in mind.
 *
 * Most recently updated across every workspace they belong to, which is the
 * one they were last working in. Null when they have no boards at all.
 */
export async function findMostRecentBoardForUser(
  db: Database,
  userId: string,
): Promise<BoardSummary | null> {
  // One round trip: their memberships pick the workspaces, the boards'
  // (workspace, deleted) index finds the boards, and an archived board is
  // never somewhere to land.
  const rows = await db
    .select({ board: boards })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .innerJoin(boards, eq(boards.workspaceId, memberships.workspaceId))
    .where(
      and(
        eq(memberships.userId, userId),
        isNull(workspaces.deletedAt),
        isNull(boards.deletedAt),
        isNull(boards.archivedAt),
      ),
    )
    .orderBy(desc(boards.updatedAt))
    .limit(1);

  return rows[0] ? toBoardSummary(rows[0].board) : null;
}

/**
 * The board to open on arriving in one particular workspace — just joined it,
 * say: its most recently touched board, or a fresh one when it has none, so
 * there is always a canvas to land on.
 *
 * Null for somebody who is not a member, as `createBoardInWorkspace` answers.
 */
export async function boardToOpenInWorkspace(
  db: Database,
  userId: string,
  workspaceId: string,
): Promise<BoardSummary | null> {
  const boardsHere = await listWorkspaceBoards(db, userId, workspaceId);
  if (!boardsHere) return null;
  const open = boardsHere.find((board) => board.archivedAt === null);
  return open ?? createBoardInWorkspace(db, { userId, workspaceId });
}

export interface EnsureBoardInput {
  userId: string;
  /** Names the personal workspace when one has to be created. */
  userName?: string | null;
}

/**
 * A board for this user, guaranteed — their most recent one, or a fresh one.
 *
 * The editor *is* the app: signing in has to land somewhere on canvas, and a
 * new account has neither a board nor a workspace to land in. Both are created
 * here rather than at signup so an account that never opens the editor never
 * accrues either.
 */
export async function ensureBoardForUser(
  db: Database,
  input: EnsureBoardInput,
): Promise<BoardSummary> {
  const existing = await findMostRecentBoardForUser(db, input.userId);
  if (existing) return existing;

  const workspaceId = await ensureDefaultWorkspace(db, input);
  const board = await createBoardInWorkspace(db, { userId: input.userId, workspaceId });
  if (!board) throw new Error('Failed to create the first board');
  return board;
}

/**
 * The workspace new boards land in: the one they joined first, so repeated
 * creations stay together. Creates a personal one when they have none.
 */
async function ensureDefaultWorkspace(db: Database, input: EnsureBoardInput): Promise<string> {
  const [existing] = await db
    .select({ workspaceId: memberships.workspaceId })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    // Skipping the deleted ones is what stops someone who deleted their only
    // workspace from landing back in it; they get a fresh personal one instead.
    .where(and(eq(memberships.userId, input.userId), isNull(workspaces.deletedAt)))
    .orderBy(asc(memberships.joinedAt))
    .limit(1);

  if (existing) return existing.workspaceId;

  const created = await createWorkspaceForUser(db, {
    userId: input.userId,
    name: input.userName ? `${input.userName}'s workspace` : 'My workspace',
  });
  return created.id;
}

function randomSlugSuffix(): string {
  return globalThis.crypto.randomUUID().slice(0, 8);
}

/** A board someone is on by share link, in a workspace they are not part of. */
export interface SharedBoard extends BoardSummary {
  workspaceName: string;
  /** Who owns the board, for the line under its name. */
  ownerName: string;
  /** What the link let them do there. */
  role: BoardRole;
}

/**
 * Every board this person was let onto by share link, outside the workspaces
 * they belong to — the boards the sidebar lists as "Shared with you", so they
 * can get back to them without the link. Most recently changed first.
 *
 * Only standing access: a revoked grant, a deleted or archived board, or a
 * deleted workspace lists nothing. A board in one of their own workspaces is listed
 * there instead, whatever grant they also hold on it.
 */
export async function listBoardsSharedWith(db: Database, userId: string): Promise<SharedBoard[]> {
  const owners = alias(users, 'owners');
  const rows = await db
    .select({
      board: boards,
      workspaceName: workspaces.name,
      ownerName: owners.name,
      role: boardMembers.role,
    })
    .from(boardMembers)
    .innerJoin(boards, eq(boards.id, boardMembers.boardId))
    .innerJoin(workspaces, eq(workspaces.id, boards.workspaceId))
    .innerJoin(owners, eq(owners.id, boards.ownerId))
    .leftJoin(
      memberships,
      and(eq(memberships.workspaceId, boards.workspaceId), eq(memberships.userId, userId)),
    )
    .where(
      and(
        eq(boardMembers.userId, userId),
        eq(boardMembers.status, 'active'),
        isNull(boards.deletedAt),
        isNull(boards.archivedAt),
        isNull(workspaces.deletedAt),
        isNull(memberships.id),
        ne(boards.ownerId, userId),
      ),
    )
    .orderBy(desc(boards.updatedAt));

  return rows.map(({ board, workspaceName, ownerName, role }) => ({
    ...toBoardSummary(board),
    workspaceName,
    ownerName,
    role,
  }));
}

/**
 * Who may run a board's sharing — start and stop its link, change what the
 * people on it may do, take them off: its owner, and whoever runs the
 * workspace it lives in. An admin can then let someone onto a board without
 * waiting on its owner; everyone else on the board, by workspace or by link,
 * sees no link to pass on.
 */
export async function canManageBoardSharing(
  db: Database,
  userId: string,
  access: { role: BoardRole; workspaceId: string },
): Promise<boolean> {
  if (access.role === 'owner') return true;
  const role = await workspaceRoleOf(db, userId, access.workspaceId);
  return role !== null && can(role, 'manage-members');
}
