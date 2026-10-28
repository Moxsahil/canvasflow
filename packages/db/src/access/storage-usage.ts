import { sql } from 'drizzle-orm';
import { PLAN_ALLOWANCES, isWorkspacePlan } from '@canvasflow/types';
import type { Database } from '../client.js';

/**
 * What an account takes up, for the Storage used row.
 *
 * Counted over the boards it owns in every workspace, which is what Export and
 * Delete account act on too. Boards in the trash are left out, as the deletion
 * preview leaves them out.
 *
 * A board counts once, at the size of its newest saved snapshot. The store
 * keeps a few older snapshots beside it as a safety net, but each is a whole
 * copy of the same board, so adding them up would report the board several
 * times over.
 *
 * Image sizes are the ones recorded when the upload was authorized, which is
 * the size the browser said it would send.
 */
export interface StorageUsage {
  /** Boards the account owns that are not in the trash. */
  boards: number;
  /** Images placed on those boards. */
  images: number;
  boardBytes: number;
  imageBytes: number;
  /** Shapes saved to the account's own library. */
  libraryBytes: number;
  totalBytes: number;
}

interface StorageUsageRow extends Record<string, unknown> {
  boards: string | number;
  images: string | number;
  board_bytes: string | number;
  image_bytes: string | number;
  library_bytes: string | number;
}

/** Postgres returns counts and sums as bigint, which the driver hands over as text. */
export function storageUsageFromRow(row: StorageUsageRow | undefined): StorageUsage {
  const boards = Number(row?.boards ?? 0);
  const images = Number(row?.images ?? 0);
  const boardBytes = Number(row?.board_bytes ?? 0);
  const imageBytes = Number(row?.image_bytes ?? 0);
  const libraryBytes = Number(row?.library_bytes ?? 0);
  return {
    boards,
    images,
    boardBytes,
    imageBytes,
    libraryBytes,
    totalBytes: boardBytes + imageBytes + libraryBytes,
  };
}

export async function storageUsage(db: Database, userId: string): Promise<StorageUsage> {
  // One round trip. The newest snapshot is found per board through the
  // (board_id, created_at) index, the same way the sync-server reads it.
  const result = await db.execute<StorageUsageRow>(sql`
    WITH owned AS (
      SELECT id FROM boards WHERE owner_id = ${userId} AND deleted_at IS NULL
    )
    SELECT
      (SELECT count(*) FROM owned) AS boards,
      (
        SELECT coalesce(sum(latest.size_bytes), 0)
        FROM owned
        CROSS JOIN LATERAL (
          SELECT size_bytes FROM board_updates
          WHERE board_updates.board_id = owned.id
          ORDER BY created_at DESC
          LIMIT 1
        ) AS latest
      ) AS board_bytes,
      (SELECT count(*) FROM board_images WHERE board_id IN (SELECT id FROM owned)) AS images,
      (
        SELECT coalesce(sum(size_bytes), 0) FROM board_images
        WHERE board_id IN (SELECT id FROM owned)
      ) AS image_bytes,
      (
        SELECT coalesce(sum(size_bytes), 0) FROM library_items WHERE owner_id = ${userId}
      ) AS library_bytes
  `);
  return storageUsageFromRow(result.rows[0]);
}

/**
 * How much an account may keep, in gigabytes: the largest allowance among the
 * workspaces it belongs to, so a member of a Team workspace has Team's room.
 * Free's when it belongs to none.
 */
export async function storageAllowanceGb(db: Database, userId: string): Promise<number> {
  const result = await db.execute<{ plan: string }>(sql`
    SELECT DISTINCT workspace.plan FROM memberships
    INNER JOIN workspace ON workspace.id = memberships.workspace_id
    WHERE memberships.user_id = ${userId} AND workspace.deleted_at IS NULL
  `);
  return result.rows.reduce(
    (most, row) =>
      Math.max(most, isWorkspacePlan(row.plan) ? PLAN_ALLOWANCES[row.plan].storageGb : 0),
    PLAN_ALLOWANCES.free.storageGb,
  );
}

/** Who owns a board, whose storage its pictures count against; null for none. */
export async function boardOwnerId(db: Database, boardId: string): Promise<string | null> {
  const result = await db.execute<{ owner_id: string }>(sql`
    SELECT owner_id FROM boards WHERE id = ${boardId} AND deleted_at IS NULL
  `);
  return result.rows[0]?.owner_id ?? null;
}
