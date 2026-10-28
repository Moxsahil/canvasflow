import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  getProfile,
  paidPlanOfWorkspace,
  recordBillingCheckout,
  saveSubscriptionSnapshot,
  workspaceMemberIds,
  workspaceOfCheckout,
  workspacePlan,
  workspaceRoleOf,
} from '@canvasflow/db';
import { BILLING_CYCLES, PURCHASABLE_PLANS } from '@canvasflow/types';
import { parseEnv } from '../../config/env.js';
import { DatabaseService } from '../../infra/database/database.service.js';
import type { AuthenticatedUser } from '../auth/jwt.guard.js';
import { PlansService } from '../plans/plans.service.js';
import {
  BILLING_PROVIDER,
  type BillingProvider,
  type CatalogueProduct,
  type ProviderSubscription,
} from './billing-provider.js';
import { pickProduct, snapshotOf, workspaceIdIn } from './billing-rules.js';

const CheckoutBody = z.object({
  workspaceId: z.string().uuid(),
  plan: z.enum(PURCHASABLE_PLANS),
  cycle: z.enum(BILLING_CYCLES),
});

/** How long the catalogue is trusted before it is read again. */
const CATALOGUE_TTL_MS = 5 * 60_000;

/**
 * Buying a plan, and keeping a workspace's plan in step with what is paid for.
 *
 * The provider is the record of truth. A checkout only opens the provider's
 * payment page; nothing changes here until the provider's webhook says a
 * subscription exists, and then the plan is worked out again from every
 * subscription the workspace has, so the order webhooks arrive in never
 * matters.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly env = parseEnv();
  private catalogue: { products: CatalogueProduct[]; readAt: number } | null = null;

  constructor(
    private readonly database: DatabaseService,
    private readonly plans: PlansService,
    @Optional() @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider | null,
  ) {}

  /** The payment page for this workspace and plan. Only the workspace's owner may open one. */
  async startCheckout(user: AuthenticatedUser, body: unknown): Promise<{ url: string }> {
    const parsed = CheckoutBody.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Say which workspace, plan and billing period to buy.');
    }
    const { workspaceId, plan, cycle } = parsed.data;
    const db = this.database.db;

    const role = await workspaceRoleOf(db, user.id, workspaceId);
    if (role !== 'owner') {
      throw new ForbiddenException('Only the workspace’s owner can change its plan.');
    }
    const provider = this.requireProvider();

    // From the account, not the sign-in token: the session cookie names the
    // account but does not carry its address, and Polar sends receipts there.
    const profile = await getProfile(db, user.id);
    if (!profile?.email) {
      throw new BadRequestException('Add an email address to your account before buying a plan.');
    }

    if ((await workspacePlan(db, workspaceId)) === 'enterprise') {
      throw new ConflictException({
        message: 'This workspace’s plan is arranged with us. Email support to change it.',
        error: 'Conflict',
        code: 'enterprise-plan',
      });
    }
    if (await paidPlanOfWorkspace(db, workspaceId)) {
      throw new ConflictException({
        message: 'This workspace already has a paid plan. Manage it from Billing.',
        error: 'Conflict',
        code: 'already-subscribed',
      });
    }

    const pick = pickProduct(await this.products(provider), plan, cycle);
    if (!pick.ok) {
      // A catalogue that disagrees with the pricing page is ours to fix, and
      // nobody is charged in the meantime.
      this.logger.error(`Checkout refused: ${pick.problem}`);
      this.catalogue = null;
      throw new ServiceUnavailableException({
        message: 'This plan can’t be bought right now. Please try again later.',
        error: 'Service Unavailable',
        code: 'billing-unavailable',
      });
    }

    const seats =
      pick.product.price.kind === 'seats'
        ? Math.max(1, (await workspaceMemberIds(db, workspaceId)).length)
        : undefined;
    const app = this.env.EDITOR_URL ?? this.env.WEB_URL;

    let checkout: { id: string; url: string };
    try {
      checkout = await provider.createCheckout({
        productId: pick.product.id,
        workspaceId,
        userId: user.id,
        email: profile.email,
        ...(profile.name ? { name: profile.name } : {}),
        ...(seats ? { seats } : {}),
        // A company buying for its team usually needs its address on the invoice.
        requireBillingAddress: plan === 'team',
        successUrl: `${app}/?checkout_id={CHECKOUT_ID}`,
        returnUrl: `${this.env.WEB_URL}/#pricing`,
      });
    } catch (error) {
      this.logger.error(`Checkout for workspace ${workspaceId} failed: ${String(error)}`);
      throw new BadGatewayException({
        message: 'The payment page didn’t open. Please try again.',
        error: 'Bad Gateway',
        code: 'billing-provider-error',
      });
    }

    await recordBillingCheckout(db, { id: checkout.id, workspaceId, userId: user.id, plan, cycle });
    return { url: checkout.url };
  }

  /**
   * One webhook from the provider. Throws `BillingWebhookRejected` for one it
   * did not sign; anything else that throws is retried by the provider.
   */
  async receiveWebhook(body: Buffer, headers: Record<string, string>): Promise<void> {
    const provider = this.requireProvider();
    const event = await provider.readWebhook(body, headers);
    if (event.kind === 'ignored') return;
    await this.applySubscription(event.subscription, event.type);
  }

  private async applySubscription(subscription: ProviderSubscription, type: string): Promise<void> {
    const db = this.database.db;
    const workspaceId =
      workspaceIdIn(subscription) ??
      (subscription.checkoutId ? await workspaceOfCheckout(db, subscription.checkoutId) : null);
    if (!workspaceId) {
      // Retrying cannot find it either, so it is acknowledged and logged.
      this.logger.warn(`${type} for subscription ${subscription.id} names no workspace of ours`);
      return;
    }

    const snapshot = snapshotOf(subscription, workspaceId);
    if (!snapshot.ok) {
      this.logger.error(`${type}: ${snapshot.problem}`);
      return;
    }
    await saveSubscriptionSnapshot(db, snapshot.snapshot);

    // Enterprise is arranged by hand, and no subscription moves it.
    const current = await workspacePlan(db, workspaceId);
    if (current === 'enterprise') return;
    const paid = (await paidPlanOfWorkspace(db, workspaceId)) ?? 'free';
    if (paid !== current) {
      await this.plans.setPlan(
        workspaceId,
        paid,
        'billing',
        `Polar subscription ${subscription.id} is ${subscription.status}`,
      );
    }
  }

  private requireProvider(): BillingProvider {
    if (!this.provider) {
      throw new ServiceUnavailableException({
        message: 'Payments aren’t set up on this server.',
        error: 'Service Unavailable',
        code: 'billing-unavailable',
      });
    }
    return this.provider;
  }

  private async products(provider: BillingProvider): Promise<CatalogueProduct[]> {
    const now = Date.now();
    if (this.catalogue && now - this.catalogue.readAt < CATALOGUE_TTL_MS) {
      return this.catalogue.products;
    }
    const products = await provider.products();
    this.catalogue = { products, readAt: now };
    return products;
  }
}
