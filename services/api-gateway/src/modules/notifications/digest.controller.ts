import { timingSafeEqual } from 'node:crypto';
import {
  Body,
  ConflictException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { parseEnv } from '../../config/env.js';
import { DigestService, isoWeek, type DigestSummary } from './digest.service.js';

/**
 * Where the scheduled job starts the weekly digest.
 *
 * A dry run answers with what a real one would do — who wants it, who has
 * news — and sends nothing. A real run answers at once and sends behind the
 * answer, since a run outlasts what the edge lets one request take; its
 * summary is in this service's log. Refused without the job's own secret,
 * and absent altogether where none is set.
 */
@Controller('internal/digest')
export class DigestController {
  private readonly logger = new Logger(DigestController.name);
  private readonly env = parseEnv();

  constructor(private readonly digest: DigestService) {}

  @Post()
  @HttpCode(200)
  async start(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: DigestSummary | { started: true; week: string } }> {
    const secret = this.env.DIGEST_TRIGGER_SECRET;
    if (!secret) throw new NotFoundException();
    if (!isTrigger(authorization, secret)) throw new UnauthorizedException('Not authorized');
    if (this.digest.isRunning) throw new ConflictException('A digest run is already under way');

    const dryRun = (body as { dryRun?: unknown } | null)?.dryRun === true;
    if (dryRun) return { data: await this.digest.run({ dryRun: true }) };

    void this.digest
      .run({ dryRun: false })
      .catch((error: unknown) => this.logger.error('Weekly digest run failed', error));
    response.status(202);
    return { data: { started: true, week: isoWeek(new Date()) } };
  }
}

/** `Bearer <secret>`, compared in constant time. */
function isTrigger(authorization: string | undefined, secret: string): boolean {
  const presented = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  const expected = Buffer.from(secret);
  const given = Buffer.from(presented);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
