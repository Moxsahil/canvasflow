import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { isAllowedOrigin } from '../../common/allowed-origins.js';
import { parseEnv } from '../../config/env.js';
import { AccountThrottlerGuard } from '../auth/account-throttler.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';
import type { PresignedDownload } from '../images/images.service.js';
import { BoardEmbedsService, type EmbedView } from './board-embeds.service.js';

/** A hex SHA-256 and nothing else — no path traversal into the object key. */
const FILE_ID_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Share → Embed on a website: the switch, for whoever runs the board's sharing.
 *
 * On answers with the embed id, which the editor builds the code around; off
 * stops every copy of the code at once.
 */
@Controller('boards/:id/embed')
@UseGuards(JwtAuthGuard, AccountThrottlerGuard)
export class BoardEmbedSettingsController {
  private readonly env = parseEnv();

  constructor(private readonly embeds: BoardEmbedsService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  async get(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: { id: string } | null }> {
    const embedId = await this.embeds.settings(id, user.id);
    return { data: embedId ? { id: embedId } : null };
  }

  @Put()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async enable(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<{ data: { id: string } }> {
    this.requireEditorOrigin(origin);
    return { data: { id: await this.embeds.enable(id, user.id) } };
  }

  @Delete()
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async disable(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<void> {
    this.requireEditorOrigin(origin);
    await this.embeds.disable(id, user.id);
  }

  private requireEditorOrigin(origin: string | undefined): void {
    if (!isAllowedOrigin(origin, this.env)) {
      throw new ForbiddenException('Cross-origin requests are not allowed');
    }
  }
}

/**
 * An embedded board, for the embed page: no sign-in, as whoever is reading
 * the page the board sits on has none here. The embed id is what lets them
 * in, and it opens a picture of the board's shapes and the pictures they
 * draw — never the document, its comments or its people.
 *
 * Counted per address. The page asks again every little while to stay
 * current, and a board's images are one request each.
 */
@Controller('embeds/:embedId')
@UseGuards(ThrottlerGuard)
export class EmbedsController {
  constructor(private readonly embeds: BoardEmbedsService) {}

  /**
   * Revalidated rather than cached, and answered 304 by its ETag when the
   * board has not changed since the page last asked.
   */
  @Get()
  @Header('Cache-Control', 'no-cache')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async view(@Param('embedId') embedId: string): Promise<{ data: EmbedView }> {
    return { data: await this.embeds.view(embedId) };
  }

  /** A URL rather than a redirect, for the reason given on the board images route. */
  @Get('images/:fileId/url')
  @Header('Cache-Control', 'private, no-store')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  async imageUrl(
    @Param('embedId') embedId: string,
    @Param('fileId') fileId: string,
  ): Promise<{ data: PresignedDownload }> {
    if (!FILE_ID_PATTERN.test(fileId)) throw new BadRequestException('Malformed file id');
    return { data: await this.embeds.imageUrl(embedId, fileId) };
  }

  @Get('previews/:name/url')
  @Header('Cache-Control', 'private, no-store')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  async previewUrl(
    @Param('embedId') embedId: string,
    @Param('name') name: string,
  ): Promise<{ data: PresignedDownload }> {
    return { data: await this.embeds.previewUrl(embedId, name) };
  }
}
