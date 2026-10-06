import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  createLibraryItem,
  deleteLibraryItem,
  listLibraryItems,
  parseLibraryItemInput,
  parseLibraryName,
  renameLibraryItem,
  users,
  type LibraryItem,
} from '@canvasflow/db';
import { DatabaseService } from '../../infra/database/database.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';

/**
 * A person's library: things they saved from one board to use on any other.
 *
 * Every route acts on the caller's own items and no one else's — an id that
 * belongs to somebody else answers exactly as one that does not exist. A
 * share-link guest has no account to keep a library in, and is told so.
 */
@Controller('library/items')
@UseGuards(JwtAuthGuard)
export class LibraryController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<{ data: LibraryItem[] }> {
    await this.requireAccount(user);
    return { data: await listLibraryItems(this.database.db, user.id) };
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: LibraryItem }> {
    await this.requireAccount(user);
    const parsed = parseLibraryItemInput(body);
    if (!parsed.ok) throw new BadRequestException(parsed.error);

    const result = await createLibraryItem(this.database.db, user.id, parsed.value);
    if (!result.ok) {
      throw new ConflictException('Your library is full. Delete something from it to make room.');
    }
    return { data: result.item };
  }

  @Patch(':id')
  async rename(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: LibraryItem }> {
    await this.requireAccount(user);
    const parsed = parseLibraryName((body as { name?: unknown } | null)?.name);
    if (!parsed.ok) throw new BadRequestException(parsed.error);

    const item = await renameLibraryItem(this.database.db, user.id, id, parsed.name);
    if (!item) throw new NotFoundException('That item is not in your library');
    return { data: item };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.requireAccount(user);
    if (!(await deleteLibraryItem(this.database.db, user.id, id))) {
      throw new NotFoundException('That item is not in your library');
    }
  }

  /** A guest's session is a share link's, with no account behind it to keep anything in. */
  private async requireAccount(user: AuthenticatedUser): Promise<void> {
    const [row] = await this.database.db
      .select({ isGuest: users.isGuest })
      .from(users)
      .where(eq(users.id, user.id));
    if (!row || row.isGuest) {
      throw new ForbiddenException('Sign up to keep a library of your own');
    }
  }
}
