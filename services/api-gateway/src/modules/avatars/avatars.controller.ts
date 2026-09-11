import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AvatarsService,
  type PresignedAvatarUpload,
  type ResolvedAvatar,
} from './avatars.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';

interface CreateUploadBody {
  /** Lowercase hex SHA-256 of the bytes, computed by the client before upload. */
  fileId: string;
  mimeType: string;
  sizeBytes: number;
}

interface CommitBody {
  fileId: string;
  mimeType: string;
}

/**
 * The caller's own photo.
 *
 * No id in either path: the token names whose photo this is, so there is no
 * request that reaches somebody else's. Board-scoped tokens are what the editor
 * holds, but a photo belongs to the account rather than to a board — the scope
 * decides nothing here beyond the caller being who they say they are.
 */
@Controller('users/me/avatar')
@UseGuards(JwtAuthGuard)
export class MyAvatarController {
  constructor(private readonly avatars: AvatarsService) {}

  @Post('upload-url')
  async createUpload(
    @Body() body: CreateUploadBody,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: PresignedAvatarUpload }> {
    if (typeof body?.fileId !== 'string') throw new BadRequestException('Missing file id');
    if (typeof body?.mimeType !== 'string') throw new BadRequestException('Missing photo type');
    if (typeof body?.sizeBytes !== 'number') throw new BadRequestException('Missing photo size');

    return {
      data: await this.avatars.createUpload(user.id, {
        fileId: body.fileId,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
      }),
    };
  }

  /** Called once the bytes have landed, so the profile never names a missing object. */
  @Post()
  @HttpCode(204)
  async commit(@Body() body: CommitBody, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    if (typeof body?.fileId !== 'string') throw new BadRequestException('Missing file id');
    if (typeof body?.mimeType !== 'string') throw new BadRequestException('Missing photo type');

    await this.avatars.commitUpload(user.id, { fileId: body.fileId, mimeType: body.mimeType });
  }

  @Delete()
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.avatars.remove(user.id);
  }
}

/**
 * Somebody else's photo, read through the board you share with them.
 *
 * The board is in the path because it is what authorizes the read: this is how
 * a collaborator's photo stops resolving for someone who has been removed.
 */
@Controller('boards/:boardId/avatars')
@UseGuards(JwtAuthGuard)
export class BoardAvatarsController {
  constructor(private readonly avatars: AvatarsService) {}

  @Get(':userId')
  async get(
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) boardId: string,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @CurrentUser() viewer: AuthenticatedUser,
  ): Promise<{ data: ResolvedAvatar }> {
    return { data: await this.avatars.resolveForBoard(boardId, viewer.id, userId) };
  }
}
