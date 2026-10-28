import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  checkoutOf,
  getProfile,
  payingSubscriptionOf,
  workspaceNameAndPlan,
  type WorkspaceRole,
  paidPlanOfWorkspace,
  recordBillingCheckout,
  saveSubscriptionSnapshot,
  workspaceMemberIds,
  workspaceOfCheckout,
  workspacePlan,
  workspaceRoleOf,
} from '@canvasflow/db';
import {
  BILLING_CYCLES,
  PURCHASABLE_PLANS,
  isBillingCycle,
  type BillingCycle,
  type WorkspacePlan,
} from '@canvasflow/types';
import { allowedOrigins } from '../../common/allowed-origins.js';
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
  /** Where to come back to: a page of the editor or the web app, and nowhere else. */
  returnTo: z.string().url().max(2000).optional(),
  /** For a per-member plan: seats to buy, never fewer than the workspace's members. */
  seats: z.number().int().min(1).max(1000).optional(),
});

export interface CheckoutStatus {
  workspaceId: string;
  /** The plan the checkout was for. */
  plan: WorkspacePlan;
  /** True once the workspace is on that plan, which is when the payment has landed. */
  done: boolean;
  /** Once done, the subscription Polar describes: how often, how many seats, and the next charge. */
  subscription: PaidSubscription | null;
}

export interface PaidSubscription {
  plan: WorkspacePlan;
  cycle: BillingCycle;
  seats: number | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

/** What the upgrade page needs to know about a workspace before anyone pays. */
export interface BillingWorkspace {
  id: string;
  name: string;
  plan: WorkspacePlan;
  role: WorkspaceRole;
  members: number;
  /** The subscription paying for it, when there is one. */
  subscription: PaidSubscription | null;
}

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
    const { workspaceId, plan, cycle, returnTo, seats: asked } = parsed.data;
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

    const members =
      pick.product.price.kind === 'seats'
        ? Math.max(1, (await workspaceMemberIds(db, workspaceId)).length)
        : undefined;
    const seats = members ? Math.max(members, asked ?? members) : undefined;
    const back = this.returnAddress(returnTo);

    let checkout: { id: string; url: string };
    try {
      checkout = await provider.createCheckout({
        productId: pick.product.id,
        workspaceId,
        userId: user.id,
        email: profile.email,
        ...(profile.name ? { name: profile.name } : {}),
        ...(seats && members ? { seats, minSeats: members } : {}),
        // A company buying for its team usually needs its address on the invoice.
        requireBillingAddress: plan === 'team',
        successUrl: withCheckoutId(back),
        returnUrl: back,
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
   * How a checkout this person can see has gone: whether its workspace is on
   * the plan yet. Asked by the page they come back to, until it is.
   */
  async checkoutStatus(user: AuthenticatedUser, checkoutId: string): Promise<CheckoutStatus> {
    const db = this.database.db;
    const checkout = await checkoutOf(db, checkoutId);
    // A checkout for a workspace they are not in is answered as one that does
    // not exist, so ids cannot be probed.
    if (!checkout || !(await workspaceRoleOf(db, user.id, checkout.workspaceId))) {
      throw new NotFoundException('No such checkout.');
    }
    const current = await workspacePlan(db, checkout.workspaceId);
    const done = current === checkout.plan;
    return {
      workspaceId: checkout.workspaceId,
      plan: checkout.plan,
      done,
      subscription: done ? await this.paidSubscription(checkout.workspaceId) : null,
    };
  }

  /** The workspace as the upgrade page shows it, for anyone in it. */
  async workspace(user: AuthenticatedUser, workspaceId: string): Promise<BillingWorkspace> {
    const db = this.database.db;
    const role = await workspaceRoleOf(db, user.id, workspaceId);
    const row = role ? await workspaceNameAndPlan(db, workspaceId) : null;
    if (!role || !row) throw new NotFoundException('No such workspace.');
    return {
      id: workspaceId,
      name: row.name,
      plan: row.plan,
      role,
      members: (await workspaceMemberIds(db, workspaceId)).length,
      subscription: await this.paidSubscription(workspaceId),
    };
  }

  private async paidSubscription(workspaceId: string): Promise<PaidSubscription | null> {
    const row = await payingSubscriptionOf(this.database.db, workspaceId);
    if (!row || !isBillingCycle(row.cycle)) return null;
    return {
      plan: row.plan,
      cycle: row.cycle,
      seats: row.seats,
      renewsAt: row.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    };
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

  /**
   * The page to send someone back to: the one they asked for when it is on
   * one of our own origins, otherwise the pricing section.
   */
  private returnAddress(returnTo: string | undefined): string {
    const fallback = `${this.env.WEB_URL}/#pricing`;
    if (!returnTo) return fallback;
    const url = new URL(returnTo);
    if (!allowedOrigins(this.env).includes(url.origin)) return fallback;
    url.searchParams.delete('checkout_id');
    return url.toString();
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

/**
 * The address with Polar's placeholder for the checkout's id added, which it
 * fills in on the way back. Built as text: a URL object would escape the braces.
 */
export function withCheckoutId(address: string): string {
  const [base, hash] = address.split('#', 2) as [string, string | undefined];
  const joined = `${base}${base.includes('?') ? '&' : '?'}checkout_id={CHECKOUT_ID}`;
  return hash === undefined ? joined : `${joined}#${hash}`;
}
