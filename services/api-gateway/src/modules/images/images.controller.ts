import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ImagesService, type PresignedDownload, type PresignedUpload } from './images.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';

interface CreateUploadBody {
  /** Lowercase hex SHA-256 of the bytes, computed by the client before upload. */
  fileId: string;
  mimeType: string;
  sizeBytes: number;
}

/** A hex SHA-256 and nothing else — no path traversal into the object key. */
const FILE_ID_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Images on a board.
 *
 * Neither route carries an image. Both check access and answer with a signed,
 * short-lived URL — one to send bytes to, one to read them from. The gateway
 * stays a permission check with a signature attached, and the payload never
 * enters this process, which is what keeps a board of photographs from costing
 * bandwidth here and, before that, in the database.
 */
@Controller('boards/:boardId/images')
@UseGuards(JwtAuthGuard)
export class ImagesController {
  constructor(private readonly images: ImagesService) {}

  @Post('upload-url')
  async createUpload(
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) boardId: string,
    @Body() body: CreateUploadBody,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: PresignedUpload }> {
    if (typeof body?.fileId !== 'string' || !FILE_ID_PATTERN.test(body.fileId)) {
      throw new BadRequestException('Malformed file id');
    }
    if (typeof body?.mimeType !== 'string' || body.mimeType.length === 0) {
      throw new BadRequestException('Missing image type');
    }
    if (typeof body?.sizeBytes !== 'number') {
      throw new BadRequestException('Missing image size');
    }

    return {
      data: await this.images.createUpload(boardId, user.id, {
        fileId: body.fileId,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
      }),
    };
  }

  /**
   * Hand back a URL to read the bytes from, rather than redirecting to one.
   *
   * A redirect would be tidier — the client would not need to know storage
   * exists — but it cannot work here. Following a cross-origin redirect makes
   * the browser send `Origin: null` on the second request, storage compares
   * that against its allow-list, finds no match, and omits the CORS header even
   * from a perfectly good 200. The bytes arrive and the browser refuses to let
   * script read them.
   *
   * Returning the URL instead means the client fetches it directly, carrying
   * its real origin, which the bucket recognises. The extra round trip costs
   * one small request per image per session — the decoded bitmap is cached from
   * then on.
   */
  @Get(':fileId/url')
  async downloadUrl(
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) boardId: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: PresignedDownload }> {
    if (!FILE_ID_PATTERN.test(fileId)) {
      throw new BadRequestException('Malformed file id');
    }

    return { data: await this.images.createDownload(boardId, user.id, fileId) };
  }
}
