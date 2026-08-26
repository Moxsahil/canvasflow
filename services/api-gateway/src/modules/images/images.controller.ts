import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ImagesService } from './images.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';
import { MAX_STORED_IMAGE_BYTES } from './image-formats.js';

interface UploadImageBody {
  /** Lowercase hex SHA-256 of the bytes, computed by the client before upload. */
  fileId: string;
  /** Base64-encoded image bytes. */
  data: string;
}

interface UploadResponse {
  data: {
    fileId: string;
    mimeType: string;
    deduplicated: boolean;
  };
}

/** A hex SHA-256 and nothing else — no path traversal to worry about downstream. */
const FILE_ID_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Bytes for the images on a board.
 *
 * Base64 in JSON rather than multipart, matching how the update log already
 * moves binary: it keeps auth, error shape and the exception filter identical
 * to every other route here, and an image small enough to put on a board is
 * small enough that the encoding overhead is not what costs anything.
 */
@Controller('boards/:boardId/images')
@UseGuards(JwtAuthGuard)
export class ImagesController {
  constructor(private readonly images: ImagesService) {}

  @Post()
  async upload(
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) boardId: string,
    @Body() body: UploadImageBody,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UploadResponse> {
    if (typeof body?.data !== 'string' || body.data.length === 0) {
      throw new BadRequestException('Missing image data');
    }
    if (typeof body?.fileId !== 'string' || !FILE_ID_PATTERN.test(body.fileId)) {
      throw new BadRequestException('Malformed file id');
    }
    // Base64 inflates by 4/3. Checking the encoded length first means an
    // oversized upload is refused before it is decoded into memory.
    if (body.data.length > Math.ceil((MAX_STORED_IMAGE_BYTES * 4) / 3) + 4) {
      throw new BadRequestException('Image too large');
    }

    const result = await this.images.store(
      boardId,
      user.id,
      new Uint8Array(Buffer.from(body.data, 'base64')),
      body.fileId,
    );

    return { data: result };
  }

  @Get(':fileId')
  async download(
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) boardId: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    if (!FILE_ID_PATTERN.test(fileId)) {
      throw new BadRequestException('Malformed file id');
    }

    const image = await this.images.load(boardId, user.id, fileId);

    response.setHeader('Content-Type', image.mimeType);
    response.setHeader('Content-Length', image.bytes.length);
    // The id is a hash of the body, so the body behind it can never change.
    // Private, because who may read it is still a per-board decision.
    response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    // An SVG opened as a top-level document runs as one; loaded through an
    // <img> it never does. This response is only ever the second case, and
    // these two headers are what keep it that way even if someone pastes the
    // URL into a tab. Applied to every type — nothing served here is a page.
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    response.setHeader('X-Content-Type-Options', 'nosniff');

    response.end(Buffer.from(image.bytes));
  }
}
