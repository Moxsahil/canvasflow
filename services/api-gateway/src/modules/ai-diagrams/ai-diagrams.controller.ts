import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { DiagramUsage } from '@canvasflow/types';
import { AccountThrottlerGuard } from '../auth/account-throttler.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard, type AuthenticatedUser } from '../auth/jwt.guard.js';
import { AiDiagramsService } from './ai-diagrams.service.js';

/**
 * Diagrams generated from a description, for signed-in people on a board they
 * can edit.
 *
 * The answer is a stream of newline-separated JSON: the diagram's own lines as
 * they are written — the editor draws them as they arrive — and then one
 * `{"t":"end"}` line with the outcome and the month's count. The description
 * travels in the body, so it stays out of request logs.
 */
@Controller('ai/diagrams')
@UseGuards(JwtAuthGuard, AccountThrottlerGuard)
export class AiDiagramsController {
  constructor(private readonly diagrams: AiDiagramsService) {}

  @Get('usage')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async usage(
    @CurrentUser() user: AuthenticatedUser,
    @Query('boardId') boardId: unknown,
  ): Promise<{ data: DiagramUsage }> {
    return { data: await this.diagrams.usage(user, boardId) };
  }

  /** Ten a minute: well past anyone drawing by hand, and a ceiling on a runaway script. */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async generate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res() res: Response,
  ): Promise<void> {
    // Somebody who closes the window stops the writing, so nobody pays for
    // lines nobody will see. Listened for before anything else: the checks
    // below take a few database reads, and a person can be gone before they
    // finish — a diagram counted then is given straight back.
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });
    // The sign-in check runs before this handler, so the connection may
    // already have closed, and its 'close' gone by unheard.
    if (res.socket === null || res.socket.destroyed) controller.abort();

    // Refusals throw from here, before anything is written, and reach the
    // exception filter as an ordinary error response.
    const start = await this.diagrams.start(user, body);

    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    // Proxies that hold a response back until it ends would hide the diagram
    // drawing itself in.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const end = await this.diagrams.write(start, controller.signal, (line) => {
      if (!res.writableEnded) res.write(`${line}\n`);
    });
    if (!res.writableEnded) res.end(`${JSON.stringify(end)}\n`);
  }
}
