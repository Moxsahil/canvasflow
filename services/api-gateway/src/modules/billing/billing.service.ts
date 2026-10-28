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
  payingSubscriptionsOwnedBy,
  workspaceNameAndPlan,
  type WorkspaceRole,
  paidPlanOfWorkspace,
  recordBillingCheckout,
  saveSubscriptionSnapshot,
  subscriptionIdsOf,
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
  type SavedCard,
} from './billing-provider.js';
import { pickProduct, seatChange, snapshotOf, workspaceIdIn } from './billing-rules.js';

const CheckoutBody = z.object({
  workspaceId: z.string().uuid(),
  plan: z.enum(PURCHASABLE_PLANS),
  cycle: z.enum(BILLING_CYCLES),
  /** Where to come back to: a page of the editor or the web app, and nowhere else. */
  returnTo: z.string().url().max(2000).optional(),
  /** For a per-member plan: seats to buy, never fewer than the workspace's members. */
  seats: z.number().int().min(1).max(1000).optional(),
});

const PortalBody = z.object({
  /** Where the portal's back link goes: a page of the editor or the web app. */
  returnTo: z.string().url().max(2000).optional(),
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
  /** The provider's state: `active`, `trialing`, or `past_due` while a failed payment is retried. */
  status: string;
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

/** The owner's view of what has been paid: the card on file and every charge. */
export interface BillingHistory {
  card: SavedCard | null;
  invoices: BillingInvoice[];
}

export interface BillingInvoice {
  id: string;
  date: string;
  /** In cents, tax included. */
  total: number;
  currency: string;
  status: string;
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

  /**
   * A link into Polar's billing portal for the subscription paying for this
   * workspace. Only its owner may open one: the portal can cancel the plan.
   */
  async portal(
    user: AuthenticatedUser,
    workspaceId: string,
    body: unknown,
  ): Promise<{ url: string }> {
    const parsed = PortalBody.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('Give a page to come back to.');
    await this.requireOwner(user, workspaceId);
    const provider = this.requireProvider();
    const row = await payingSubscriptionOf(this.database.db, workspaceId);
    if (!row) {
      throw new ConflictException({
        message: 'This workspace has no paid plan to manage.',
        error: 'Conflict',
        code: 'no-subscription',
      });
    }
    try {
      return {
        url: await provider.portalUrl(row.customerId, this.returnAddress(parsed.data.returnTo)),
      };
    } catch (error) {
      this.logger.error(`Billing portal for workspace ${workspaceId} failed: ${String(error)}`);
      throw new BadGatewayException({
        message: 'The billing portal didn’t open. Please try again.',
        error: 'Bad Gateway',
        code: 'billing-provider-error',
      });
    }
  }

  /**
   * The card and the invoices of every subscription this workspace has had.
   * Owners only: it is the payer's card and the payer's charges.
   */
  async history(user: AuthenticatedUser, workspaceId: string): Promise<BillingHistory> {
    const db = this.database.db;
    await this.requireOwner(user, workspaceId);
    const ids = await subscriptionIdsOf(db, workspaceId);
    if (ids.length === 0 || !this.provider) return { card: null, invoices: [] };
    const provider = this.provider;
    const paying = await payingSubscriptionOf(db, workspaceId);
    // Each call is named in the log, so a missing token scope says which one.
    const named = <T>(what: string, call: Promise<T>): Promise<T> =>
      call.catch((error: unknown) => {
        throw new Error(`${what}: ${String(error)}`);
      });
    try {
      const [card, invoices] = await Promise.all([
        paying ? named('saved card', provider.savedCard(paying.customerId)) : null,
        named('invoices', provider.invoices(ids)),
      ]);
      return {
        card,
        invoices: invoices.map((invoice) => ({
          id: invoice.id,
          date: invoice.createdAt.toISOString(),
          total: invoice.totalCents,
          currency: invoice.currency,
          status: invoice.status,
        })),
      };
    } catch (error) {
      this.logger.error(`Billing history for workspace ${workspaceId} failed: ${String(error)}`);
      throw providerError('Your invoices couldn’t be loaded. Please try again.');
    }
  }

  /** A link to one invoice's PDF, for an order on one of this workspace's subscriptions. */
  async invoice(
    user: AuthenticatedUser,
    workspaceId: string,
    orderId: string,
  ): Promise<{ url: string }> {
    const db = this.database.db;
    await this.requireOwner(user, workspaceId);
    const provider = this.requireProvider();
    const ids = await subscriptionIdsOf(db, workspaceId);
    let url: string | null;
    try {
      const subscriptionId = await provider.orderSubscription(orderId);
      // Somebody else's order is answered as one that does not exist.
      if (!subscriptionId || !ids.includes(subscriptionId)) {
        throw new NotFoundException('No such invoice.');
      }
      url = await provider.invoiceUrl(orderId);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Invoice ${orderId} failed: ${String(error)}`);
      throw providerError('The invoice couldn’t be opened. Please try again.');
    }
    if (!url) {
      throw new ConflictException({
        message: 'This invoice isn’t ready yet. Try again in a minute.',
        error: 'Conflict',
        code: 'invoice-unavailable',
      });
    }
    return { url };
  }

  /** Takes back a cancellation, so the plan renews at the end of the period after all. */
  async resume(user: AuthenticatedUser, workspaceId: string): Promise<PaidSubscription> {
    const db = this.database.db;
    await this.requireOwner(user, workspaceId);
    const provider = this.requireProvider();
    const row = await payingSubscriptionOf(db, workspaceId);
    if (!row?.cancelAtPeriodEnd) {
      throw new ConflictException({
        message: 'This plan isn’t cancelled.',
        error: 'Conflict',
        code: 'not-cancelled',
      });
    }
    let subscription: ProviderSubscription;
    try {
      subscription = await provider.resume(row.id);
    } catch (error) {
      this.logger.error(`Resuming subscription ${row.id} failed: ${String(error)}`);
      throw providerError('The plan couldn’t be resumed. Please try again.');
    }
    // Saved now rather than when the webhook lands, so the page shows it at once.
    await this.applySubscription(subscription, 'subscription.uncanceled');
    const paid = await this.paidSubscription(workspaceId);
    if (!paid) throw new NotFoundException('No paid plan.');
    return paid;
  }

  /**
   * Brings a Team subscription's seats to the workspace's member count, after
   * someone joins, leaves or is removed. A joiner's seat is charged for the
   * rest of the period; a leaver's comes off at the renewal.
   *
   * Never throws: the membership change has already happened and must stand.
   * A failure is logged, and the next change works the count out afresh.
   *
   * `addOnly` only ever adds: for a subscription that has just changed, such as
   * Pro moved to Team in Polar's portal with one seat for four members. Seats
   * bought beyond the members at checkout are left for the owner to fill.
   */
  async syncSeats(workspaceId: string, { addOnly = false } = {}): Promise<void> {
    if (!this.provider) return;
    const db = this.database.db;
    try {
      const row = await payingSubscriptionOf(db, workspaceId);
      if (!row || row.plan !== 'team') return;
      const members = (await workspaceMemberIds(db, workspaceId)).length;
      const { seats, pendingSeats } = await this.provider.seatsOf(row.id);
      if (seats === null) return;
      const change = seatChange(members, seats, pendingSeats);
      if (!change || (addOnly && change.kind !== 'add-now')) return;
      const subscription = await this.provider.changeSeats(row.id, change);
      await this.applySubscription(subscription, `seats.${change.kind}`);
      this.logger.log(`Workspace ${workspaceId}: ${change.kind} for ${members} members`);
    } catch (error) {
      this.logger.error(`Seat sync for workspace ${workspaceId} failed: ${String(error)}`);
    }
  }

  /**
   * The paid plans of the workspaces someone owns, as their account deletion
   * lists them: name, plan and when each one ends.
   */
  async plansEndingWithAccount(
    userId: string,
  ): Promise<Array<{ workspaceName: string; plan: WorkspacePlan; endsAt: string | null }>> {
    const rows = await payingSubscriptionsOwnedBy(this.database.db, userId);
    return rows.map((row) => ({
      workspaceName: row.workspaceName,
      plan: row.plan,
      endsAt: row.currentPeriodEnd?.toISOString() ?? null,
    }));
  }

  /**
   * Stops every plan this person pays for from renewing, before their account
   * is deleted. Each runs to the end of its period. Returns the ones it
   * stopped, so a deletion that then fails can put them back.
   *
   * Throws when the provider can't be reached: an account must not be deleted
   * while a plan it pays for would keep charging.
   */
  async cancelForAccountDeletion(userId: string): Promise<string[]> {
    const rows = (await payingSubscriptionsOwnedBy(this.database.db, userId)).filter(
      (row) => !row.cancelAtPeriodEnd,
    );
    if (rows.length === 0) return [];
    const provider = this.requireProvider();
    const stopped: string[] = [];
    try {
      for (const row of rows) {
        await this.applySubscription(
          await provider.cancelAtPeriodEnd(row.id),
          'subscription.canceled',
        );
        stopped.push(row.id);
      }
    } catch (error) {
      this.logger.error(`Cancelling plans of ${userId} failed: ${String(error)}`);
      await this.resumeAfterFailedDeletion(stopped);
      throw providerError(
        'Your paid plan couldn’t be cancelled, so the account wasn’t deleted. Please try again.',
      );
    }
    return stopped;
  }

  /** Puts back plans stopped for an account deletion that did not go through. */
  async resumeAfterFailedDeletion(subscriptionIds: string[]): Promise<void> {
    if (!this.provider) return;
    for (const id of subscriptionIds) {
      try {
        await this.applySubscription(await this.provider.resume(id), 'subscription.uncanceled');
      } catch (error) {
        this.logger.error(`Resuming subscription ${id} failed: ${String(error)}`);
      }
    }
  }

  private async requireOwner(user: AuthenticatedUser, workspaceId: string): Promise<void> {
    if ((await workspaceRoleOf(this.database.db, user.id, workspaceId)) !== 'owner') {
      throw new ForbiddenException('Only the workspace’s owner can manage its billing.');
    }
  }

  private async paidSubscription(workspaceId: string): Promise<PaidSubscription | null> {
    const row = await payingSubscriptionOf(this.database.db, workspaceId);
    if (!row || !isBillingCycle(row.cycle)) return null;
    return {
      status: row.status,
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
    const workspaceId = await this.applySubscription(event.subscription, event.type);
    // A Team plan with fewer seats than members, as a plan change in Polar's
    // portal can leave it: topped up behind the answer, so Polar isn't kept
    // waiting and a failure here never makes it send the event again.
    if (workspaceId && event.subscription.plan === 'team') {
      void this.syncSeats(workspaceId, { addOnly: true });
    }
  }

  /** Saves what the provider said and moves the plan to match. Returns the workspace, if ours. */
  private async applySubscription(
    subscription: ProviderSubscription,
    type: string,
  ): Promise<string | null> {
    const db = this.database.db;
    const workspaceId =
      workspaceIdIn(subscription) ??
      (subscription.checkoutId ? await workspaceOfCheckout(db, subscription.checkoutId) : null);
    if (!workspaceId) {
      // Retrying cannot find it either, so it is acknowledged and logged.
      this.logger.warn(`${type} for subscription ${subscription.id} names no workspace of ours`);
      return null;
    }

    const snapshot = snapshotOf(subscription, workspaceId);
    if (!snapshot.ok) {
      this.logger.error(`${type}: ${snapshot.problem}`);
      return null;
    }
    await saveSubscriptionSnapshot(db, snapshot.snapshot);

    // Enterprise is arranged by hand, and no subscription moves it.
    const current = await workspacePlan(db, workspaceId);
    if (current === 'enterprise') return null;
    const paid = (await paidPlanOfWorkspace(db, workspaceId)) ?? 'free';
    if (paid !== current) {
      await this.plans.setPlan(
        workspaceId,
        paid,
        'billing',
        `Polar subscription ${subscription.id} is ${subscription.status}`,
      );
    }
    return workspaceId;
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

function providerError(message: string): BadGatewayException {
  return new BadGatewayException({ message, error: 'Bad Gateway', code: 'billing-provider-error' });
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
