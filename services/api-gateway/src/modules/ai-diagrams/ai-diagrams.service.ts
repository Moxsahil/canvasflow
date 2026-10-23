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
import {
  collectDiagram,
  parseDiagramLine,
  parseMindMapLine,
  type Direction,
} from '@canvasflow/canvas-engine';
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
  DIAGRAM_DETAILED_COST,
  DIAGRAM_LIMIT_REACHED,
  DIAGRAM_NOT_ENOUGH_LEFT,
  DIAGRAM_LINE_MAX,
  DIAGRAM_MAX_NODES,
  DIAGRAM_REFINE_MAX_LINES,
  DIAGRAM_PROMPT_MAX,
  DIAGRAM_PROMPT_MIN,
  MIND_MAP_CONTEXT_MAX,
  MIND_MAP_MAX_TOPICS,
  MIND_MAP_TOPIC_MAX,
  PLAN_ALLOWANCES,
  PLAN_NAMES,
  type DiagramKind,
  type DiagramStreamEnd,
  type DiagramUsage,
} from '@canvasflow/types';
import { DatabaseService } from '../../infra/database/database.service.js';
import type { AuthenticatedUser } from '../auth/jwt.guard.js';
import { runDiagram } from './diagram-run.js';
import { runMindMap } from './mind-map-run.js';
import { DIAGRAM_WRITER, type DiagramWriter } from './diagram-writer.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A diagram that has been counted and may now be written. */
export interface DiagramStart {
  userId: string;
  description: string;
  direction?: Direction;
  /** The diagram being changed, when this is a change rather than a new one. */
  previous?: readonly string[];
  detailed: boolean;
  /** A diagram, a mind map, or ideas under one topic of a map. */
  kind: DiagramKind;
  /** For `expand`: the topics from the centre down to it, and those already under it. */
  topicPath?: readonly string[];
  topicChildren?: readonly string[];
  /** Diagrams of the month this one uses: what a refund gives back. */
  cost: number;
  /** The month it was counted in, which is the one a refund goes back to. */
  month: string;
  usage: DiagramUsage;
}

/** What the person is told when nothing could be drawn, by why. */
const FAILURE_MESSAGES = {
  refused: 'That description can’t be drawn as a diagram. Try describing it another way.',
  empty: 'Nothing in that description could be drawn. Try naming the steps or parts it has.',
  refusedMap: 'That subject can’t be made into a mind map. Try describing it another way.',
  emptyMap: 'No ideas came back for that. Try putting it another way.',
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
    const { boardId, description, direction, previous, detailed, kind, topicPath, topicChildren } =
      readRequest(body);
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
    // A mind map and an expand are written by the quick model, whatever was
    // ticked, and use one of the month's diagrams each.
    const cost = detailed && kind === 'diagram' ? DIAGRAM_DETAILED_COST : 1;
    const reserved = await reserveDiagram(this.database.db, { userId: user.id, limit, now, cost });
    if (!reserved.ok && cost > 1 && reserved.used < limit) {
      throw new HttpException(
        {
          message: `A detailed diagram uses ${cost} of your diagrams, and ${limit - reserved.used} are left this month. Draw it quick instead, or upgrade for more.`,
          error: 'Payment Required',
          code: DIAGRAM_NOT_ENOUGH_LEFT,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
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
      ...(previous ? { previous } : {}),
      detailed: detailed && kind === 'diagram',
      kind,
      ...(topicPath ? { topicPath } : {}),
      ...(topicChildren ? { topicChildren } : {}),
      cost,
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
    let failure: 'refused' | 'empty' | 'busy' | 'unavailable' | null;
    try {
      // Gone already: nothing to write, and the diagram goes straight back.
      if (signal.aborted) throw new Error('caller left');
      if (start.kind === 'diagram') {
        ({ nodes, failure } = await runDiagram({
          writer: this.writer!,
          description: start.description,
          ...(start.direction ? { direction: start.direction } : {}),
          ...(start.previous ? { previous: start.previous } : {}),
          detailed: start.detailed,
          signal,
          emit,
        }));
      } else {
        ({ topics: nodes, failure } = await runMindMap({
          writer: this.writer!,
          kind: start.kind,
          description: start.description,
          ...(start.previous ? { previous: start.previous } : {}),
          ...(start.topicPath ? { path: start.topicPath } : {}),
          ...(start.topicChildren ? { existing: start.topicChildren } : {}),
          signal,
          emit,
        }));
      }
    } catch (error) {
      if (!signal.aborted) this.logger.error(`Diagram run failed: ${String(error)}`);
      failure = 'unavailable';
    }

    if (nodes === 0) {
      try {
        await refundDiagram(this.database.db, {
          userId: start.userId,
          month: start.month,
          cost: start.cost,
        });
      } catch (error) {
        // The person keeps the diagram's count rather than an error: the
        // stream is already open, and one unreturned diagram is the cost.
        this.logger.error(`Diagram refund failed for ${start.userId}: ${String(error)}`);
      }
    }

    const usage =
      nodes === 0
        ? { ...start.usage, used: Math.max(start.usage.used - start.cost, 0) }
        : start.usage;
    return nodes > 0
      ? { t: 'end', ok: true, usage }
      : {
          t: 'end',
          ok: false,
          usage,
          message: FAILURE_MESSAGES[messageFor(start.kind, failure ?? 'unavailable')],
          reason: failure ?? 'unavailable',
        };
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

/** The words for a failure, a mind map's own where they differ from a diagram's. */
function messageFor(
  kind: DiagramKind,
  failure: 'refused' | 'empty' | 'busy' | 'unavailable',
): keyof typeof FAILURE_MESSAGES {
  if (kind === 'diagram') return failure;
  if (failure === 'refused') return 'refusedMap';
  if (failure === 'empty') return 'emptyMap';
  return failure;
}

export function readRequest(body: unknown): {
  boardId: unknown;
  description: string;
  direction?: Direction;
  previous?: string[];
  detailed: boolean;
  kind: DiagramKind;
  topicPath?: string[];
  topicChildren?: string[];
} {
  const fields = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  const kind = fields.kind ?? 'diagram';
  if (kind !== 'diagram' && kind !== 'mindmap' && kind !== 'expand') {
    throw new BadRequestException('Ask for a diagram, a mind map or an expand.');
  }

  // A topic to expand can be a single short word; anything else is asked for
  // in a few.
  const description = typeof fields.description === 'string' ? fields.description.trim() : '';
  if (description.length < (kind === 'expand' ? 1 : DIAGRAM_PROMPT_MIN)) {
    throw new BadRequestException(
      kind === 'expand'
        ? 'Say which topic to find ideas for.'
        : 'Describe the diagram you want in a few words.',
    );
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

  if (kind === 'expand' && fields.previous !== undefined) {
    throw new BadRequestException('Ideas for a topic are not a change to anything.');
  }
  const previous =
    fields.previous === undefined
      ? undefined
      : kind === 'mindmap'
        ? readPreviousMap(fields.previous)
        : readPrevious(fields.previous);
  const topicPath = kind === 'expand' ? readTopics(fields.topicPath, 'path') : undefined;
  const topicChildren =
    kind === 'expand' ? readTopics(fields.topicChildren, 'children') : undefined;
  if (fields.detailed !== undefined && typeof fields.detailed !== 'boolean') {
    throw new BadRequestException('Say whether the diagram is detailed with true or false.');
  }

  return {
    boardId: fields.boardId,
    description,
    ...(direction ? { direction } : {}),
    ...(previous ? { previous } : {}),
    detailed: fields.detailed === true,
    kind,
    ...(topicPath ? { topicPath } : {}),
    ...(topicChildren ? { topicChildren } : {}),
  };
}

/**
 * The topics an expand is told about: the path down to the topic, or what is
 * already under it. Optional, bounded and plain words, as anything else from
 * the browser is.
 */
function readTopics(value: unknown, which: 'path' | 'children'): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > MIND_MAP_CONTEXT_MAX ||
    !value.every((topic) => typeof topic === 'string' && topic.length <= MIND_MAP_TOPIC_MAX * 4)
  ) {
    throw new BadRequestException(
      which === 'path'
        ? 'The topics above the one to expand can’t be read.'
        : 'The topics under the one to expand can’t be read.',
    );
  }
  return (value as string[])
    .map((topic) => topic.replace(/\s+/g, ' ').trim().slice(0, MIND_MAP_TOPIC_MAX))
    .filter(Boolean);
}

/** A mind map sent back to be changed, kept only as far as its lines are topics. */
function readPreviousMap(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MIND_MAP_MAX_TOPICS ||
    !value.every((line) => typeof line === 'string' && line.length <= DIAGRAM_LINE_MAX)
  ) {
    throw new BadRequestException('That mind map can’t be changed. Make a new one instead.');
  }
  const lines = (value as string[])
    .map((line) => line.trim())
    .filter((line) => parseMindMapLine(line));
  if (lines.length === 0) {
    throw new BadRequestException('That mind map can’t be changed. Make a new one instead.');
  }
  return lines;
}

/**
 * The diagram sent back to be changed, kept only as far as it is a diagram.
 *
 * It came from the browser, so it is checked as anything else from there is:
 * bounded in size before it is read, and then only the lines that are valid
 * diagram lines go on to the model. A diagram larger than this feature ever
 * draws is refused rather than trimmed, since a change to half of it would
 * quietly lose the rest.
 */
function readPrevious(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > DIAGRAM_REFINE_MAX_LINES ||
    !value.every((line) => typeof line === 'string' && line.length <= DIAGRAM_LINE_MAX)
  ) {
    throw new BadRequestException('That diagram can’t be changed. Draw a new one instead.');
  }
  const lines = (value as string[])
    .map((line) => line.trim())
    .filter((line) => parseDiagramLine(line).ok);
  const nodes = collectDiagram(lines).diagram.nodes.length;
  if (nodes === 0 || nodes > DIAGRAM_MAX_NODES) {
    throw new BadRequestException('That diagram can’t be changed. Draw a new one instead.');
  }
  return lines;
}
