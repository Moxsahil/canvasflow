import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AccountThrottlerGuard } from '../auth/account-throttler.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard, type AuthenticatedUser } from '../auth/jwt.guard.js';
import { BillingWebhookRejected } from './billing-provider.js';
import { BillingService } from './billing.service.js';

/** Where the provider posts its webhooks. main.ts keeps this body raw for the signature. */
export const BILLING_WEBHOOK_PATH = '/billing/polar/webhook';

/** The headers a webhook signature is made from. */
const SIGNATURE_HEADERS = ['webhook-id', 'webhook-timestamp', 'webhook-signature'] as const;

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** The provider's payment page for a plan. A handful a minute is plenty for anyone buying one. */
  @Post('checkout')
  @UseGuards(JwtAuthGuard, AccountThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<{ data: { url: string } }> {
    return { data: await this.billing.startCheckout(user, body) };
  }

  /**
   * The provider telling us a subscription changed. Not signed in: the
   * signature is the credential, and an unsigned call is refused before
   * anything is read.
   */
  @Post('polar/webhook')
  @HttpCode(202)
  async webhook(@Req() request: Request): Promise<{ received: true }> {
    const body: unknown = request.body;
    if (!Buffer.isBuffer(body)) throw new ForbiddenException('Unsigned webhook.');
    const headers: Record<string, string> = {};
    for (const name of SIGNATURE_HEADERS) headers[name] = request.header(name) ?? '';
    try {
      await this.billing.receiveWebhook(body, headers);
    } catch (error) {
      if (error instanceof BillingWebhookRejected) {
        throw new ForbiddenException(`Webhook refused: ${error.reason}.`);
      }
      throw error;
    }
    return { received: true };
  }
}
