import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { boards, type BoardRow } from '../schema/boards.js';
import {
  memberships,
  workspaces,
  type MembershipRow,
  type WorkspaceRow,
} from '../schema/workspaces.js';

/**
 * The workspace tree behind the editor's board switcher: which workspaces a
 * person belongs to, which boards live in each, and how to add either.
 *
 * Every function here takes the caller's id and answers only for workspaces
 * they are a member of — the editor reaches these through the web app with
 * nothing but a session cookie, so membership is the whole authorization
 * story. A non-member gets `null`, never an empty list, so callers can answer
 * 404 and keep workspace ids unprobeable.
 */

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  plan: WorkspaceRow['plan'];
  logoUrl: string | null;
  /** The caller's role in this workspace, not the board role. */
  role: MembershipRow['role'];
  /** Boards not soft-deleted. Shown next to the name so an empty one reads as empty. */
  boardCount: number;
}

export interface BoardSummary {
  id: string;
  workspaceId: string;
  title: string;
  visibility: BoardRow['visibility'];
  /** The tag colour beside the title in the switcher. `gray` is untagged. */
  color: BoardRow['color'];
  updatedAt: Date;
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
    .leftJoin(boards, and(eq(boards.workspaceId, workspaces.id), isNull(boards.deletedAt)))
    .where(eq(memberships.userId, userId))
    .groupBy(workspaces.id, memberships.role, memberships.joinedAt)
    .orderBy(asc(memberships.joinedAt));

  return rows;
}

/** Whether the user is a member of this workspace. The gate on everything below. */
export async function isWorkspaceMember(
  db: Database,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)))
    .limit(1);

  return rows.length > 0;
}

/**
 * Boards in one workspace, most recently touched first.
 *
 * Returns null when the caller isn't a member — the same answer a missing
 * workspace gives, so callers surface 404 for both.
 */
export async function listWorkspaceBoards(
  db: Database,
  userId: string,
  workspaceId: string,
): Promise<BoardSummary[] | null> {
  if (!(await isWorkspaceMember(db, userId, workspaceId))) return null;

  const rows = await db
    .select()
    .from(boards)
    .where(and(eq(boards.workspaceId, workspaceId), isNull(boards.deletedAt)))
    .orderBy(desc(boards.updatedAt));

  return rows.map(toBoardSummary);
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
 */
export async function createBoardInWorkspace(
  db: Database,
  input: CreateBoardInput,
): Promise<BoardSummary | null> {
  if (!(await isWorkspaceMember(db, input.userId, input.workspaceId))) return null;

  const [board] = await db
    .insert(boards)
    .values({
      workspaceId: input.workspaceId,
      ownerId: input.userId,
      title: input.title?.trim() || DEFAULT_BOARD_TITLE,
      visibility: 'workspace',
    })
    .returning();

  if (!board) throw new Error('Failed to create board');
  return toBoardSummary(board);
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
  const workspaceIds = (
    await db
      .select({ workspaceId: memberships.workspaceId })
      .from(memberships)
      .where(eq(memberships.userId, userId))
  ).map((row) => row.workspaceId);

  if (workspaceIds.length === 0) return null;

  const rows = await db
    .select()
    .from(boards)
    .where(and(inArray(boards.workspaceId, workspaceIds), isNull(boards.deletedAt)))
    .orderBy(desc(boards.updatedAt))
    .limit(1);

  return rows[0] ? toBoardSummary(rows[0]) : null;
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
    .where(eq(memberships.userId, input.userId))
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
