import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ConflictException,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { BoardsService } from './boards.service.js';
import {
  boardOverview,
  canEdit,
  canManageBoard,
  pinBoard,
  resolveBoardAccess,
  setBoardArchived,
  softDeleteBoard,
  unpinBoard,
  updateBoardDetails,
  type BoardAccess,
  type BoardOverview,
  type BoardRow,
  type BoardRole,
  type BoardSummary,
} from '@canvasflow/db';
import { isAllowedOrigin } from '../../common/allowed-origins.js';
import { parseEnv } from '../../config/env.js';
import { DatabaseService } from '../../infra/database/database.service.js';
import { AccountThrottlerGuard } from '../auth/account-throttler.guard.js';
import { JwtAuthGuard } from '../auth/jwt.guard.js';
import type { AuthenticatedUser } from '../auth/jwt.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { WorkspaceEventsService } from '../workspaces/workspace-events.service.js';
import { readBoardDetails, readPinPosition } from './board-details.js';

const DEFAULT_BOARD_TITLE = 'Untitled board';

const createBoardSchema = z.object({
  title: z.string().trim().min(1).max(200).default(DEFAULT_BOARD_TITLE),
});

@Controller('boards')
@UseGuards(JwtAuthGuard)
export class BoardsController {
  private readonly env = parseEnv();

  constructor(
    private readonly boards: BoardsService,
    private readonly database: DatabaseService,
    private readonly events: WorkspaceEventsService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<{ data: BoardRow[] }> {
    const data = await this.boards.findAllForUser(user.id);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: BoardRow }> {
    const parsed = createBoardSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid board payload');
    }

    const data = await this.boards.createForUser({
      userId: user.id,
      userName: user.name,
      title: parsed.data.title,
    });
    return { data };
  }

  @Get(':id')
  async get(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: BoardRow }> {
    const data = await this.boards.findByIdForUser(id, user.id);
    if (!data) {
      // Intentionally 404, not 403. Returning "forbidden" tells an attacker
      // the resource exists, which is itself an info leak.
      throw new NotFoundException(`Board ${id} not found`);
    }
    return { data };
  }

  /**
   * The board's name, tag colour and owner, and the caller's own role on it —
   * what the Share window shows someone who is not the owner.
   *
   * Anyone who can open the board may read it, including a guest with only the
   * editor's own token: it says nothing they cannot already see on the board,
   * apart from whose it is. Everyone else gets 404, as for a board that does
   * not exist.
   */
  @Get(':id/overview')
  @Header('Cache-Control', 'private, no-store')
  async overview(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: BoardOverview & { role: BoardRole } }> {
    const db = this.database.db;
    const access = await resolveBoardAccess(db, user.id, id);
    const board = access && (await boardOverview(db, id));
    if (!access || !board) throw new NotFoundException(`Board ${id} not found`);
    return { data: { ...board, role: access.role } };
  }

  /**
   * Rename a board, re-tag it, or both.
   *
   * Naming a board is an edit to it rather than an administrative act, so an
   * editor may do it and a viewer may not: a title is document content, and a
   * team that shares a board shares the right to say what it is called.
   */
  @Patch(':id')
  @UseGuards(AccountThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<{ data: BoardSummary }> {
    const patch = readBoardDetails(body);
    if (typeof patch === 'string') throw new BadRequestException(patch);

    const access = await this.enter(id, user, origin);
    if (access.archived) {
      throw new ForbiddenException('This board is archived. Unarchive it to change it.');
    }
    if (!canEdit(access)) throw new ForbiddenException('Not allowed to rename this board');

    const board = await updateBoardDetails(this.database.db, id, patch);
    // Access resolved a moment ago, so a miss here means it was deleted in
    // between — the same answer as a board that was never there.
    if (!board) throw new NotFoundException(`Board ${id} not found`);

    this.events.changed(board.workspaceId);
    return { data: board };
  }

  /**
   * Delete a board, softly — see `softDeleteBoard`.
   *
   * Held to a higher bar than renaming: every workspace member resolves to
   * editor on its boards, which is fine for a title and far too loose for
   * discarding someone else's work. So it takes the board's owner or an admin
   * of its workspace, the two people who should be able to clean it up. The
   * answer is the board as it was, so the editor can name it afterwards.
   */
  @Delete(':id')
  @UseGuards(AccountThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<{ data: BoardSummary }> {
    const access = await this.enter(id, user, origin);
    if (!canManageBoard(access)) {
      throw new ForbiddenException(
        'Only the board owner or a workspace admin can delete this board.',
      );
    }

    const board = await softDeleteBoard(this.database.db, id);
    // Already gone by the time the write landed — a double-submit, most likely.
    if (!board) throw new NotFoundException(`Board ${id} not found`);

    this.events.changed(board.workspaceId);
    return { data: board };
  }

  /**
   * Archive a board: out of everyone's lists and read-only for everyone,
   * owner included, until it is unarchived. Nothing in it is removed.
   *
   * The same bar as deleting it, since it takes the board away from the whole
   * workspace. The caller's own open copy is re-checked at once, so it turns
   * read-only under them; everyone else's follows within the sync-server's
   * five-second sweep.
   */
  @Put(':id/archive')
  @UseGuards(AccountThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async archive(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<{ data: BoardSummary }> {
    return { data: await this.setArchived(id, true, user, origin) };
  }

  /** Bring an archived board back: listed again, and editable again. */
  @Delete(':id/archive')
  @UseGuards(AccountThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async unarchive(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<{ data: BoardSummary }> {
    return { data: await this.setArchived(id, false, user, origin) };
  }

  /**
   * Pin a board to the top of the caller's own sidebar, or move their pin.
   *
   * Personal: nobody else's sidebar changes, so there is nothing to announce.
   * The editor picks the order key — it is the one that knows the neighbours
   * the board was dropped between — and this checks it is a well-formed one.
   * Sixty a minute, as dragging a pin about is a run of quick moves.
   */
  @Put(':id/pin')
  @HttpCode(204)
  @UseGuards(AccountThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async pin(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<void> {
    const position = readPinPosition(body);
    if (position === null) throw new BadRequestException('A pin needs a valid position.');

    // Only a board they can open: a pin is a way back to it.
    await this.enter(id, user, origin);
    await pinBoard(this.database.db, user.id, id, position);
  }

  /**
   * Take a board off the caller's pins. Touches only their own row, so it
   * needs no access check — and still works for a board they have since
   * lost, which is when they most want it gone.
   */
  @Delete(':id/pin')
  @HttpCode(204)
  @UseGuards(AccountThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async unpin(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<void> {
    if (!isAllowedOrigin(origin, this.env)) {
      throw new ForbiddenException('Cross-origin requests are not allowed');
    }
    await unpinBoard(this.database.db, user.id, id);
  }

  private async setArchived(
    id: string,
    archived: boolean,
    user: AuthenticatedUser,
    origin: string | undefined,
  ): Promise<BoardSummary> {
    const access = await this.enter(id, user, origin);
    if (!canManageBoard(access)) {
      throw new ForbiddenException(
        archived
          ? 'Only the board owner or a workspace admin can archive this board.'
          : 'Only the board owner or a workspace admin can unarchive this board.',
      );
    }

    const board = await setBoardArchived(this.database.db, id, archived);
    // Access was resolved a moment ago, so a miss means it is already where
    // it was asked to go — a second click, or somebody else just now.
    if (!board) {
      throw new ConflictException(
        archived ? 'This board is already archived.' : 'This board is not archived.',
      );
    }

    this.events.changed(board.workspaceId);
    // Their own open copy turns read-only, or editable, now rather than at
    // the next sweep.
    this.events.boardAccessChanged([id], user.id);
    return board;
  }

  /**
   * The checks every change to a board starts with: from the editor itself,
   * and by somebody who can open the board — one query, which also carries
   * their workspace role for the delete's stricter bar.
   */
  private async enter(
    id: string,
    user: AuthenticatedUser,
    origin: string | undefined,
  ): Promise<BoardAccess> {
    if (!isAllowedOrigin(origin, this.env)) {
      throw new ForbiddenException('Cross-origin requests are not allowed');
    }
    const access = await resolveBoardAccess(this.database.db, user.id, id);
    // 404 rather than 403 for "exists but you may not": board ids must not be
    // probeable for existence.
    if (!access) throw new NotFoundException(`Board ${id} not found`);
    return access;
  }
}
