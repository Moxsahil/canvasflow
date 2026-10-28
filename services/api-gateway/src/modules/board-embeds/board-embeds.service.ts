import { randomBytes } from 'node:crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  boardEmbedId,
  boardImages,
  boardSnapshots,
  canManageBoard,
  disableBoardEmbed,
  embeddedBoard,
  enableBoardEmbed,
  getProfile,
  latestBoardSnapshotId,
  resolveBoardAccess,
} from '@canvasflow/db';
import { PLAN_ALLOWANCES } from '@canvasflow/types';
import { DatabaseService } from '../../infra/database/database.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { imageObjectKey, type PresignedDownload } from '../images/images.service.js';
import { LinkPreviewsService } from '../link-previews/link-previews.service.js';
import { boardScene, type BoardScene, type SceneShape } from './board-scene.js';

/** What the embed page draws. */
export interface EmbedView {
  boardId: string;
  title: string;
  shapes: SceneShape[];
  /** Whether it carries the "Made with CanvasFlow" badge: Free plans do, paid ones don't. */
  badge: boolean;
}

/** An embed id as it is handed out: 22 characters of URL-safe base64. */
const PUBLIC_ID = /^[A-Za-z0-9_-]{22}$/;

/**
 * Boards kept read, by board. An embed is opened by everyone who visits the
 * page it is on and asked again every little while, and the board has mostly
 * not changed in between: merging its saves once per change, rather than once
 * per visitor, is what keeps a popular page from costing a merge a request.
 */
const SCENE_CACHE_SIZE = 200;

@Injectable()
export class BoardEmbedsService {
  private readonly scenes = new Map<string, { snapshotId: string | null; scene: BoardScene }>();

  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
    private readonly previews: LinkPreviewsService,
  ) {}

  // --- the owner's switch ----------------------------------------------------

  /** The board's embed id, or null while embedding is off. */
  async settings(boardId: string, userId: string): Promise<string | null> {
    await this.requireManager(boardId, userId);
    return boardEmbedId(this.database.db, boardId);
  }

  /**
   * Held to the bar a share link is: an address that has been confirmed, so a
   * throwaway account cannot put boards in front of anyone who visits a page.
   */
  async enable(boardId: string, userId: string): Promise<string> {
    await this.requireManager(boardId, userId);
    const profile = await getProfile(this.database.db, userId);
    if (!profile?.emailVerified) {
      throw new ForbiddenException({
        message:
          'Confirm your email address before embedding a board. Check your inbox, or send yourself a new link from Settings.',
        error: 'Forbidden',
        code: 'email-not-verified',
      });
    }
    return enableBoardEmbed(this.database.db, boardId, randomBytes(16).toString('base64url'));
  }

  async disable(boardId: string, userId: string): Promise<void> {
    await this.requireManager(boardId, userId);
    await disableBoardEmbed(this.database.db, boardId);
    this.scenes.delete(boardId);
  }

  /**
   * Whoever runs the board's sharing — its owner, or whoever runs its
   * workspace — since showing a board to anyone on a page is sharing it.
   */
  private async requireManager(boardId: string, userId: string): Promise<void> {
    const access = await resolveBoardAccess(this.database.db, userId, boardId);
    // 404 rather than 403 for "exists but you may not": board ids must not be
    // probeable for existence.
    if (!access) throw new NotFoundException(`Board ${boardId} not found`);
    if (!canManageBoard(access)) {
      throw new ForbiddenException('Only the board owner can embed this board on other sites.');
    }
  }

  // --- what anyone with the code may read ------------------------------------

  async view(publicId: string): Promise<EmbedView> {
    const { board, scene } = await this.open(publicId);
    return {
      boardId: board.boardId,
      title: board.title,
      shapes: scene.shapes,
      badge: PLAN_ALLOWANCES[board.plan].embedBadge,
    };
  }

  /** A URL to read one of the board's images from — one the scene draws, and no other. */
  async imageUrl(publicId: string, fileId: string): Promise<PresignedDownload> {
    const { board, scene } = await this.open(publicId);
    if (!scene.imageIds.has(fileId)) throw new NotFoundException('Image not found');

    const [row] = await this.database.db
      .select({ mimeType: boardImages.mimeType })
      .from(boardImages)
      .where(and(eq(boardImages.boardId, board.boardId), eq(boardImages.fileId, fileId)))
      .limit(1);
    if (!row) throw new NotFoundException('Image not found');

    return this.storage.presignDownload({
      key: imageObjectKey(board.boardId, fileId),
      contentType: row.mimeType,
    });
  }

  /** A URL for a link card's picture or an embed's still that the scene draws. */
  async previewUrl(publicId: string, name: string): Promise<PresignedDownload> {
    const { scene } = await this.open(publicId);
    if (!scene.previewNames.has(name)) throw new NotFoundException('Picture not found');
    return this.previews.imageUrl(name);
  }

  /** The board an embed id shows and its scene; 404 for an id that shows nothing. */
  private async open(publicId: string) {
    const board = PUBLIC_ID.test(publicId) ? await embeddedBoard(this.database.db, publicId) : null;
    if (!board) throw new NotFoundException('This board is not embedded');
    return { board, scene: await this.sceneOf(board.boardId) };
  }

  private async sceneOf(boardId: string): Promise<BoardScene> {
    const db = this.database.db;
    const snapshotId = await latestBoardSnapshotId(db, boardId);
    const kept = this.scenes.get(boardId);
    if (kept && kept.snapshotId === snapshotId) {
      // Most recently used goes to the back, so the oldest is first out.
      this.scenes.delete(boardId);
      this.scenes.set(boardId, kept);
      return kept.scene;
    }

    const scene = boardScene(snapshotId ? await boardSnapshots(db, boardId) : []);
    this.scenes.delete(boardId);
    this.scenes.set(boardId, { snapshotId, scene });
    if (this.scenes.size > SCENE_CACHE_SIZE) {
      const oldest = this.scenes.keys().next().value;
      if (oldest !== undefined) this.scenes.delete(oldest);
    }
    return scene;
  }
}
