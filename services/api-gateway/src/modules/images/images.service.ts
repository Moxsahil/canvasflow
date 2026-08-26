import { createHash } from 'node:crypto';
import { DatabaseService } from '../../infra/database/database.service.js';
import { boardImages, canEdit, resolveBoardAccess } from '@canvasflow/db';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  MAX_STORED_IMAGE_BYTES,
  sniffImageMimeType,
  type AllowedImageMimeType,
} from './image-formats.js';

export interface StoredImage {
  fileId: string;
  mimeType: AllowedImageMimeType;
  bytes: Uint8Array;
}

export interface UploadResult {
  fileId: string;
  mimeType: AllowedImageMimeType;
  /** True when these exact bytes were already stored — the upload was a no-op. */
  deduplicated: boolean;
}

/** Lowercase hex SHA-256, which is what a `fileId` is. */
export function hashImageBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

@Injectable()
export class ImagesService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Read access to a board, or 404.
   *
   * Both "no such board" and "not yours" are 404 on purpose, matching the rule
   * the rest of the API follows: a 403 would confirm the board exists to
   * someone who is only guessing at ids.
   */
  private async requireAccess(boardId: string, userId: string, forWrite: boolean) {
    const access = await resolveBoardAccess(this.database.db, userId, boardId);
    if (!access) throw new NotFoundException(`Board ${boardId} not found`);
    // A viewer can see the images on a board they can see; only an editor can
    // add to it. Failing this as a 404 too would be misleading — the board is
    // not hidden from them, the write is simply not theirs to make.
    if (forWrite && !canEdit(access.role)) {
      throw new BadRequestException('You do not have permission to edit this board');
    }
    return access;
  }

  /**
   * Store the bytes for one image, keyed by their own hash.
   *
   * The id is derived here rather than accepted from the client. A caller
   * claiming a hash that isn't the hash of what it sent would break the one
   * invariant everything else leans on — that a `fileId` names exactly one
   * sequence of bytes forever — so the claim is checked, not trusted.
   */
  async store(
    boardId: string,
    userId: string,
    bytes: Uint8Array,
    claimedFileId: string,
  ): Promise<UploadResult> {
    await this.requireAccess(boardId, userId, true);

    if (bytes.length === 0) {
      throw new BadRequestException('Empty image rejected');
    }
    if (bytes.length > MAX_STORED_IMAGE_BYTES) {
      throw new BadRequestException(
        `Image too large (${bytes.length} bytes, max ${MAX_STORED_IMAGE_BYTES})`,
      );
    }

    const mimeType = sniffImageMimeType(bytes);
    if (!mimeType) {
      throw new BadRequestException('Unsupported image format');
    }

    const fileId = hashImageBytes(bytes);
    if (fileId !== claimedFileId) {
      throw new BadRequestException('Image content does not match the file id it was sent under');
    }

    // Content-addressed, so a row that already exists is already correct. Doing
    // nothing on conflict makes a retry after a dropped response harmless, and
    // makes the same picture placed repeatedly cost one row.
    const inserted = await this.database.db
      .insert(boardImages)
      .values({
        boardId,
        fileId,
        mimeType,
        bytes,
        sizeBytes: bytes.length,
        uploadedBy: userId,
      })
      .onConflictDoNothing({ target: [boardImages.boardId, boardImages.fileId] })
      .returning({ fileId: boardImages.fileId });

    return { fileId, mimeType, deduplicated: inserted.length === 0 };
  }

  /** The bytes for one image, or 404 if this board has no such file. */
  async load(boardId: string, userId: string, fileId: string): Promise<StoredImage> {
    await this.requireAccess(boardId, userId, false);

    const rows = await this.database.db
      .select({
        fileId: boardImages.fileId,
        mimeType: boardImages.mimeType,
        bytes: boardImages.bytes,
      })
      .from(boardImages)
      .where(and(eq(boardImages.boardId, boardId), eq(boardImages.fileId, fileId)))
      .limit(1);

    const row = rows[0];
    if (!row) throw new NotFoundException(`Image ${fileId} not found`);

    return {
      fileId: row.fileId,
      // Written by the sniffer on the way in, so it is always one of ours.
      mimeType: row.mimeType as AllowedImageMimeType,
      bytes: row.bytes,
    };
  }
}
