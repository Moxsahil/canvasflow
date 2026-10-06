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
  addLibrary,
  createLibraryItem,
  deleteLibraryItem,
  importLibraryItems,
  listAddedLibraries,
  listLibraryItems,
  parseAddedLibraryInput,
  parseLibraryImportInput,
  parseLibraryItemInput,
  parseLibraryName,
  removeAddedLibrary,
  renameLibraryItem,
  users,
  type AddedLibrary,
  type Database,
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
    await requireAccount(this.database.db, user);
    return { data: await listLibraryItems(this.database.db, user.id) };
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: LibraryItem }> {
    await requireAccount(this.database.db, user);
    const parsed = parseLibraryItemInput(body);
    if (!parsed.ok) throw new BadRequestException(parsed.error);

    const result = await createLibraryItem(this.database.db, user.id, parsed.value);
    if (!result.ok) {
      throw new ConflictException('Your library is full. Delete something from it to make room.');
    }
    return { data: result.item };
  }

  /** Several items at once, from a library file. All of them are kept, or none. */
  @Post('import')
  @HttpCode(201)
  async import(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: LibraryItem[] }> {
    await requireAccount(this.database.db, user);
    const parsed = parseLibraryImportInput(body);
    if (!parsed.ok) throw new BadRequestException(parsed.error);

    const result = await importLibraryItems(this.database.db, user.id, parsed.value);
    if (!result.ok) {
      throw new ConflictException(
        'That is more than your library has room for. Delete something from it to make room.',
      );
    }
    return { data: result.items };
  }

  @Patch(':id')
  async rename(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: LibraryItem }> {
    await requireAccount(this.database.db, user);
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
    await requireAccount(this.database.db, user);
    if (!(await deleteLibraryItem(this.database.db, user.id, id))) {
      throw new NotFoundException('That item is not in your library');
    }
  }
}

/**
 * Libraries someone has added from the public catalogue. Which ones, and
 * nothing of what is in them: the editor reads that from the catalogue.
 */
@Controller('library/added')
@UseGuards(JwtAuthGuard)
export class AddedLibrariesController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<{ data: AddedLibrary[] }> {
    await requireAccount(this.database.db, user);
    return { data: await listAddedLibraries(this.database.db, user.id) };
  }

  @Post()
  @HttpCode(201)
  async add(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: AddedLibrary }> {
    await requireAccount(this.database.db, user);
    const parsed = parseAddedLibraryInput(body);
    if (!parsed.ok) throw new BadRequestException(parsed.error);

    const result = await addLibrary(this.database.db, user.id, parsed.value);
    if (!result.ok) {
      throw new ConflictException('You have added as many libraries as you can. Remove one first.');
    }
    return { data: result.library };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await requireAccount(this.database.db, user);
    if (!(await removeAddedLibrary(this.database.db, user.id, id))) {
      throw new NotFoundException('That library is not in yours');
    }
  }
}

/** A guest's session is a share link's, with no account behind it to keep anything in. */
async function requireAccount(db: Database, user: AuthenticatedUser): Promise<void> {
  const [row] = await db
    .select({ isGuest: users.isGuest })
    .from(users)
    .where(eq(users.id, user.id));
  if (!row || row.isGuest) {
    throw new ForbiddenException('Sign up to keep a library of your own');
  }
}
