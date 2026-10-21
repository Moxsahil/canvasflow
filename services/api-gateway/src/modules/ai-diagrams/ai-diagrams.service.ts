import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Direction } from '@canvasflow/canvas-engine';
import {
  canEdit,
  diagramsUsed,
  nextUsageMonth,
  refundDiagram,
  reserveDiagram,
  resolveBoardAccess,
  workspacePlan,
  type BoardAccess,
} from '@canvasflow/db';
import {
  DIAGRAM_LIMIT_REACHED,
  DIAGRAM_PROMPT_MAX,
  DIAGRAM_PROMPT_MIN,
  PLAN_ALLOWANCES,
  PLAN_NAMES,
  type DiagramStreamEnd,
  type DiagramUsage,
} from '@canvasflow/types';
import { DatabaseService } from '../../infra/database/database.service.js';
import type { AuthenticatedUser } from '../auth/jwt.guard.js';
import { runDiagram } from './diagram-run.js';
import { DIAGRAM_WRITER, type DiagramWriter } from './diagram-writer.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A diagram that has been counted and may now be written. */
export interface DiagramStart {
  userId: string;
  description: string;
  direction?: Direction;
  /** The month it was counted in, which is the one a refund goes back to. */
  month: string;
  usage: DiagramUsage;
}

/** What the person is told when nothing could be drawn, by why. */
const FAILURE_MESSAGES = {
  refused: 'That description can’t be drawn as a diagram. Try describing it another way.',
  empty: 'Nothing in that description could be drawn. Try naming the steps or parts it has.',
  busy: 'Diagrams are busy right now. Try again in a minute.',
  unavailable: 'The diagram couldn’t be made. Try again in a moment.',
} as const;

/**
 * Generating a diagram on a board, counted against the month's allowance.
 *
 * The allowance comes from the plan of the board's workspace, and the count is
 * the person's own across every board: somebody on a Team board has Team's
 * room, wherever else they have used diagrams this month.
 */
@Injectable()
export class AiDiagramsService {
  private readonly logger = new Logger(AiDiagramsService.name);

  constructor(
    private readonly database: DatabaseService,
    @Inject(DIAGRAM_WRITER) private readonly writer: DiagramWriter | null,
  ) {}

  async usage(user: AuthenticatedUser, boardId: unknown): Promise<DiagramUsage> {
    const access = await this.boardFor(user, boardId);
    const now = new Date();
    return this.usageOn(access, await diagramsUsed(this.database.db, user.id, now), now);
  }

  /**
   * Check everything and count the diagram, or refuse.
   *
   * Refusals are ordinary HTTP errors because nothing has been sent yet; once
   * this returns, the answer is a stream and its outcome travels in it.
   */
  async start(user: AuthenticatedUser, body: unknown): Promise<DiagramStart> {
    const { boardId, description, direction } = readRequest(body);
    const access = await this.boardFor(user, boardId);
    if (!canEdit(access)) {
      throw new ForbiddenException('Only people who can edit this board can add a diagram to it.');
    }
    if (!this.writer) {
      throw new ServiceUnavailableException({
        message: 'Generating diagrams isn’t set up on this server.',
        error: 'Service Unavailable',
        code: 'diagrams-unavailable',
      });
    }

    const now = new Date();
    const plan = await workspacePlan(this.database.db, access.workspaceId);
    const limit = PLAN_ALLOWANCES[plan].diagramsPerMonth;
    const reserved = await reserveDiagram(this.database.db, { userId: user.id, limit, now });
    if (!reserved.ok) {
      throw new HttpException(
        {
          message: `You’ve used all ${limit} diagrams included with ${PLAN_NAMES[plan]} this month. Upgrade for more, or wait until the 1st.`,
          error: 'Payment Required',
          code: DIAGRAM_LIMIT_REACHED,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    return {
      userId: user.id,
      description,
      ...(direction ? { direction } : {}),
      month: reserved.month,
      usage: { plan, used: reserved.used, limit, resetsAt: nextUsageMonth(now).toISOString() },
    };
  }

  /**
   * Write the diagram, line by line through `emit`, and say how it went.
   *
   * A diagram with no box in it is given back, whether the writer failed or
   * the person left before anything arrived: a count is for a diagram somebody
   * got.
   */
  async write(
    start: DiagramStart,
    signal: AbortSignal,
    emit: (line: string) => void,
  ): Promise<DiagramStreamEnd> {
    let nodes = 0;
    let failure: keyof typeof FAILURE_MESSAGES | null;
    try {
      // Gone already: nothing to write, and the diagram goes straight back.
      if (signal.aborted) throw new Error('caller left');
      ({ nodes, failure } = await runDiagram({
        writer: this.writer!,
        description: start.description,
        ...(start.direction ? { direction: start.direction } : {}),
        signal,
        emit,
      }));
    } catch (error) {
      if (!signal.aborted) this.logger.error(`Diagram run failed: ${String(error)}`);
      failure = 'unavailable';
    }

    if (nodes === 0) {
      try {
        await refundDiagram(this.database.db, { userId: start.userId, month: start.month });
      } catch (error) {
        // The person keeps the diagram's count rather than an error: the
        // stream is already open, and one unreturned diagram is the cost.
        this.logger.error(`Diagram refund failed for ${start.userId}: ${String(error)}`);
      }
    }

    const usage =
      nodes === 0 ? { ...start.usage, used: Math.max(start.usage.used - 1, 0) } : start.usage;
    return nodes > 0
      ? { t: 'end', ok: true, usage }
      : { t: 'end', ok: false, usage, message: FAILURE_MESSAGES[failure ?? 'unavailable'] };
  }

  /**
   * The board, for somebody signed in to an account who may at least see it.
   *
   * Signed in means a session: a guest's board token names none, and generated
   * diagrams are an account's allowance, so a guest has nothing to spend.
   */
  private async boardFor(user: AuthenticatedUser, boardId: unknown): Promise<BoardAccess> {
    if (!user.sessionId) {
      throw new ForbiddenException({
        message: 'Sign in to generate diagrams.',
        error: 'Forbidden',
        code: 'sign-in-required',
      });
    }
    if (typeof boardId !== 'string' || !UUID.test(boardId)) {
      throw new BadRequestException('Say which board the diagram is for.');
    }
    const access = await resolveBoardAccess(this.database.db, user.id, boardId);
    // 404 rather than 403 for "exists but not yours": board ids are not probeable.
    if (!access) throw new NotFoundException(`Board ${boardId} not found`);
    return access;
  }

  private async usageOn(access: BoardAccess, used: number, now: Date): Promise<DiagramUsage> {
    const plan = await workspacePlan(this.database.db, access.workspaceId);
    return {
      plan,
      used,
      limit: PLAN_ALLOWANCES[plan].diagramsPerMonth,
      resetsAt: nextUsageMonth(now).toISOString(),
    };
  }
}

export function readRequest(body: unknown): {
  boardId: unknown;
  description: string;
  direction?: Direction;
} {
  const fields = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  const description = typeof fields.description === 'string' ? fields.description.trim() : '';
  if (description.length < DIAGRAM_PROMPT_MIN) {
    throw new BadRequestException('Describe the diagram you want in a few words.');
  }
  if (description.length > DIAGRAM_PROMPT_MAX) {
    throw new BadRequestException(
      `Keep the description under ${DIAGRAM_PROMPT_MAX.toLocaleString('en')} characters.`,
    );
  }

  const direction = fields.direction;
  if (direction !== undefined && direction !== 'TB' && direction !== 'LR') {
    throw new BadRequestException('A diagram runs top to bottom (TB) or left to right (LR).');
  }

  return { boardId: fields.boardId, description, ...(direction ? { direction } : {}) };
}
