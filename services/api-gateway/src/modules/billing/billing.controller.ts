import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
import {
  BillingService,
  type BillingHistory,
  type BillingWorkspace,
  type CheckoutStatus,
  type PaidSubscription,
} from './billing.service.js';

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

  /** Polled every couple of seconds by the page someone returns to after paying. */
  @Get('checkouts/:id')
  @UseGuards(JwtAuthGuard, AccountThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async checkoutStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ data: CheckoutStatus }> {
    return { data: await this.billing.checkoutStatus(user, id) };
  }

  /** The workspace as the upgrade page shows it: name, plan, role, members and subscription. */
  @Get('workspaces/:workspaceId')
  @UseGuards(JwtAuthGuard, AccountThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async workspace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
  ): Promise<{ data: BillingWorkspace }> {
    return { data: await this.billing.workspace(user, workspaceId) };
  }

  /** A link into Polar's billing portal: card, invoices and cancelling. Owners only. */
  @Post('workspaces/:workspaceId/portal')
  @UseGuards(JwtAuthGuard, AccountThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async portal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: unknown,
  ): Promise<{ data: { url: string } }> {
    return { data: await this.billing.portal(user, workspaceId, body) };
  }

  /** The card on file and every invoice, for Settings → Billing. Owners only. */
  @Get('workspaces/:workspaceId/history')
  @UseGuards(JwtAuthGuard, AccountThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
  ): Promise<{ data: BillingHistory }> {
    return { data: await this.billing.history(user, workspaceId) };
  }

  /** A short-lived link to one invoice's PDF. Owners only. */
  @Get('workspaces/:workspaceId/invoices/:orderId')
  @UseGuards(JwtAuthGuard, AccountThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async invoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
  ): Promise<{ data: { url: string } }> {
    return { data: await this.billing.invoice(user, workspaceId, orderId) };
  }

  /** Takes back a cancellation at the end of the period. Owners only. */
  @Post('workspaces/:workspaceId/resume')
  @UseGuards(JwtAuthGuard, AccountThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async resume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
  ): Promise<{ data: PaidSubscription }> {
    return { data: await this.billing.resume(user, workspaceId) };
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
