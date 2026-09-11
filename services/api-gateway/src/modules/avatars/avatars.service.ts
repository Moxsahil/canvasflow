import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { clearAvatar, getAvatarSource, resolveBoardAccess, setAvatar } from '@canvasflow/db';
import { DatabaseService } from '../../infra/database/database.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import {
  AVATAR_FILE_ID_PATTERN,
  MAX_AVATAR_BYTES,
  avatarObjectKey,
  isAllowedAvatarMimeType,
  type AllowedAvatarMimeType,
} from './avatar-formats.js';

export interface PresignedAvatarUpload {
  fileId: string;
  url: string;
  expiresIn: number;
  /** Sent verbatim by the browser: these are inside the signature. */
  headers: Record<string, string>;
}

export interface ResolvedAvatar {
  url: string;
  /** Null for a provider's own URL, which we did not sign and cannot expire. */
  expiresIn: number | null;
}

/**
 * Profile photos.
 *
 * The bytes never pass through this process, exactly as with board images: the
 * gateway signs a URL and the browser talks to storage directly.
 *
 * Reading one is the part worth explaining. The bucket is private, so there is
 * no public link to hand a collaborator, and issuing one is therefore an
 * authorized act rather than a static URL — which is the property that lets a
 * photo stop being visible to someone removed from the board they shared.
 */
@Injectable()
export class AvatarsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Authorize one upload of the caller's own photo.
   *
   * The key names the caller, taken from their verified token rather than from
   * the request, so this URL cannot be pointed at anybody else's photo whatever
   * the body says.
   */
  async createUpload(
    userId: string,
    request: { fileId: string; mimeType: string; sizeBytes: number },
  ): Promise<PresignedAvatarUpload> {
    if (!AVATAR_FILE_ID_PATTERN.test(request.fileId)) {
      throw new BadRequestException('Malformed file id');
    }
    if (!isAllowedAvatarMimeType(request.mimeType)) {
      throw new BadRequestException(`Unsupported photo type: ${request.mimeType}`);
    }
    if (!Number.isInteger(request.sizeBytes) || request.sizeBytes <= 0) {
      throw new BadRequestException('Missing photo size');
    }
    if (request.sizeBytes > MAX_AVATAR_BYTES) {
      throw new BadRequestException(
        `Photo too large (${request.sizeBytes} bytes, max ${MAX_AVATAR_BYTES})`,
      );
    }

    const presigned = await this.storage.presignUpload({
      key: avatarObjectKey(userId, request.fileId),
      contentType: request.mimeType,
      contentLength: request.sizeBytes,
    });

    return {
      fileId: request.fileId,
      url: presigned.url,
      expiresIn: presigned.expiresIn,
      headers: { 'Content-Type': request.mimeType },
    };
  }

  /**
   * Record a photo whose bytes have landed, and drop the one it replaced.
   *
   * Separate from signing the upload because the profile must not point at an
   * object that was never written — unlike a board image, where a row describing
   * bytes that never arrived costs nothing, this one decides what every
   * collaborator tries to load.
   */
  async commitUpload(userId: string, request: { fileId: string; mimeType: string }): Promise<void> {
    if (!AVATAR_FILE_ID_PATTERN.test(request.fileId)) {
      throw new BadRequestException('Malformed file id');
    }
    if (!isAllowedAvatarMimeType(request.mimeType)) {
      throw new BadRequestException(`Unsupported photo type: ${request.mimeType}`);
    }

    const replaced = await setAvatar(this.database.db, userId, {
      fileId: request.fileId,
      mimeType: request.mimeType,
    });

    if (replaced) {
      await this.storage.deleteObjects([avatarObjectKey(userId, replaced)]);
    }
  }

  /** Remove the caller's photo, and the bytes behind it. */
  async remove(userId: string): Promise<void> {
    const removed = await clearAvatar(this.database.db, userId);
    if (removed) {
      await this.storage.deleteObjects([avatarObjectKey(userId, removed)]);
    }
  }

  /**
   * A URL for one board member's photo, or 404.
   *
   * Both parties are checked against the board: the caller, so that only
   * somebody on it can ask, and the subject, so that a board id cannot be used
   * to read the photo of an account that has nothing to do with it.
   *
   * Issued per request rather than stored, so this — not the URL's lifetime —
   * is where access is decided.
   */
  async resolveForBoard(
    boardId: string,
    viewerId: string,
    subjectId: string,
  ): Promise<ResolvedAvatar> {
    const viewerAccess = await resolveBoardAccess(this.database.db, viewerId, boardId);
    if (!viewerAccess) throw new NotFoundException(`Board ${boardId} not found`);

    if (subjectId !== viewerId) {
      const subjectAccess = await resolveBoardAccess(this.database.db, subjectId, boardId);
      if (!subjectAccess) throw new NotFoundException('No photo for that person');
    }

    const source = await getAvatarSource(this.database.db, subjectId);
    if (!source) throw new NotFoundException('No photo for that person');

    if (source.fileId && source.mimeType) {
      const presigned = await this.storage.presignDownload({
        key: avatarObjectKey(subjectId, source.fileId),
        contentType: source.mimeType as AllowedAvatarMimeType,
      });
      return { url: presigned.url, expiresIn: presigned.expiresIn };
    }

    // Nothing uploaded, but whoever they signed in with gave us a photo. It is
    // already a public URL on someone else's origin — returning it here rather
    // than putting it on the wire between clients keeps every avatar arriving
    // from one place this app controls.
    if (source.externalUrl) return { url: source.externalUrl, expiresIn: null };

    throw new NotFoundException('No photo for that person');
  }
}
