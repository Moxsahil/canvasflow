import { DatabaseService } from '../../infra/database/database.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { boardImages, canEdit, resolveBoardAccess } from '@canvasflow/db';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  MAX_STORED_IMAGE_BYTES,
  isAllowedImageMimeType,
  type AllowedImageMimeType,
} from './image-formats.js';

export interface PresignedUpload {
  fileId: string;
  /** Where to PUT the bytes. Signed, short-lived, and single-purpose. */
  url: string;
  expiresIn: number;
  /** Headers the PUT must send verbatim, or the signature will not match. */
  headers: Record<string, string>;
}

export interface PresignedDownload {
  url: string;
  expiresIn: number;
}

/**
 * The object key for one image.
 *
 * Board first, so a board's images are a prefix that can be listed and deleted
 * as a unit. The file id is a hash of the content, which is what makes an
 * upload idempotent: the same bytes always land on the same key, and writing
 * them twice is a no-op rather than a duplicate.
 */
export function imageObjectKey(boardId: string, fileId: string): string {
  return `boards/${boardId}/${fileId}`;
}

@Injectable()
export class ImagesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
  ) {}

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
    // add to it. Not a 404 — the board is not hidden from them, the write is
    // simply not theirs to make.
    if (forWrite && !canEdit(access.role)) {
      throw new ForbiddenException('You do not have permission to edit this board');
    }
    return access;
  }

  /**
   * Authorize one upload and hand back a URL to send the bytes to.
   *
   * The gateway never sees the image. That is the point — a board full of
   * photographs costs this process no bandwidth and no memory — but the checks
   * that used to run over the bytes have to be expressed in the signature
   * instead, and not all of them survive the move.
   *
   * What is still enforced, by storage rather than by us: the object key, which
   * is derived here from the board and the file id; the exact byte length; and
   * the content type, which is also what gets served back.
   *
   * What is not: that the bytes hash to the id they are filed under, and that
   * they are really the format they claim. Neither can be checked without
   * reading the body. The first is unavailable on this storage specifically —
   * see `presignUpload` — and the second was always a client-supplied claim
   * once we stopped handling the upload. Both are contained by the same thing:
   * the key names one board, so only somebody who may already edit that board
   * can write to it, and the download URL pins the type and disposition so
   * whatever lands there stays inert in the `<img>` that is the only thing
   * ever pointed at it.
   */
  async createUpload(
    boardId: string,
    userId: string,
    request: { fileId: string; mimeType: string; sizeBytes: number },
  ): Promise<PresignedUpload> {
    await this.requireAccess(boardId, userId, true);

    if (!isAllowedImageMimeType(request.mimeType)) {
      throw new BadRequestException(`Unsupported image type: ${request.mimeType}`);
    }
    if (!Number.isInteger(request.sizeBytes) || request.sizeBytes <= 0) {
      throw new BadRequestException('Missing image size');
    }
    if (request.sizeBytes > MAX_STORED_IMAGE_BYTES) {
      throw new BadRequestException(
        `Image too large (${request.sizeBytes} bytes, max ${MAX_STORED_IMAGE_BYTES})`,
      );
    }

    const presigned = await this.storage.presignUpload({
      key: imageObjectKey(boardId, request.fileId),
      contentType: request.mimeType,
      contentLength: request.sizeBytes,
    });

    // Written now rather than after the upload lands. A row describing an
    // object that never arrived is harmless — nothing reads this table to
    // decide whether bytes exist, because the shape's own status already says
    // so — whereas a confirmation round trip would add a step that can be lost
    // between the PUT and the report.
    await this.database.db
      .insert(boardImages)
      .values({
        boardId,
        fileId: request.fileId,
        mimeType: request.mimeType,
        sizeBytes: request.sizeBytes,
        uploadedBy: userId,
      })
      .onConflictDoNothing();

    return {
      fileId: request.fileId,
      url: presigned.url,
      expiresIn: presigned.expiresIn,
      // Sent verbatim: this is inside the signature, so a PUT that omits or
      // changes it is refused. The length is signed too, but the browser sets
      // that itself from the body and refuses to let script touch it.
      headers: { 'Content-Type': request.mimeType },
    };
  }

  /**
   * A URL to read one image from, or 404.
   *
   * Issued per request so that this — not the URL's lifetime — is where board
   * access is decided. A collaborator whose access is revoked stops being able
   * to mint new URLs immediately; the one they already hold outlives that by
   * at most its own expiry.
   */
  async createDownload(
    boardId: string,
    userId: string,
    fileId: string,
  ): Promise<PresignedDownload> {
    await this.requireAccess(boardId, userId, false);

    const [row] = await this.database.db
      .select({ mimeType: boardImages.mimeType })
      .from(boardImages)
      .where(and(eq(boardImages.boardId, boardId), eq(boardImages.fileId, fileId)))
      .limit(1);

    if (!row) throw new NotFoundException('Image not found');

    return this.storage.presignDownload({
      key: imageObjectKey(boardId, fileId),
      contentType: row.mimeType as AllowedImageMimeType,
    });
  }
}
