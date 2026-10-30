import { createPolar, errors, webhooks, type Polar, type models } from '@polar-sh/sdk/2026-10';
import {
  BillingWebhookRejected,
  type BillingProvider,
  type BillingWebhook,
  type CatalogueProduct,
  type CheckoutRequest,
  type ProviderInvoice,
  type ProviderSubscription,
  type SavedCard,
  type SeatChange,
} from './billing-provider.js';

/** The catalogue is a handful of products; one page holds them all. */
const PRODUCT_PAGE = 100;

/** Eight years of monthly charges: more than the list will ever need to show. */
const ORDER_PAGE = 100;

/** A workspace has one subscription at a time, and a few ended ones at most. */
const WORKSPACE_SUBSCRIPTION_PAGE = 20;

/** How long a freshly asked-for invoice is waited for before saying to try again. */
const INVOICE_POLLS = 4;
const INVOICE_POLL_MS = 1000;

/**
 * Billing through Polar, which sells the plans as merchant of record.
 *
 * Only this file knows Polar's shapes. Everything it hands back is in the
 * terms of `billing-provider.ts`, so the rules never read a Polar object.
 */
export class PolarBillingProvider implements BillingProvider {
  private readonly polar: Polar;

  constructor(
    accessToken: string,
    environment: 'sandbox' | 'production',
    private readonly webhookSecret: string | undefined,
  ) {
    this.polar = createPolar({ accessToken, environment, timeout: 20 });
  }

  async products(): Promise<CatalogueProduct[]> {
    const page = await this.polar.products.list({ is_archived: false, limit: PRODUCT_PAGE });
    return page.items.map(toCatalogueProduct);
  }

  async createCheckout(request: CheckoutRequest): Promise<{ id: string; url: string }> {
    const checkout = await this.polar.checkouts.create({
      products: [request.productId],
      external_customer_id: request.userId,
      customer_email: request.email,
      ...(request.name ? { customer_name: request.name } : {}),
      // Copied to the subscription, which is how its webhooks find the workspace.
      metadata: { workspace_id: request.workspaceId },
      ...(request.seats
        ? { seats: request.seats, min_seats: request.minSeats ?? request.seats }
        : {}),
      allow_discount_codes: false,
      allow_trial: false,
      require_billing_address: request.requireBillingAddress,
      success_url: request.successUrl,
      return_url: request.returnUrl,
    });
    return { id: checkout.id, url: checkout.url };
  }

  async portalUrl(customerId: string, returnUrl: string): Promise<string> {
    const session = await this.polar.customerSessions.create({
      customer_id: customerId,
      return_url: returnUrl,
    });
    return session.customer_portal_url;
  }

  async savedCard(customerId: string): Promise<SavedCard | null> {
    const page = await this.polar.customers.listPaymentMethods(customerId, { limit: 10 });
    const cards = page.items.filter(isCard);
    const card = cards.find((method) => method.is_default) ?? cards[0];
    if (!card) return null;
    const { brand, last4, exp_month, exp_year } = card.method_metadata;
    return { brand, last4, expMonth: exp_month, expYear: exp_year };
  }

  async invoices(subscriptionIds: string[]): Promise<ProviderInvoice[]> {
    if (subscriptionIds.length === 0) return [];
    const page = await this.polar.orders.list({
      subscription_id: subscriptionIds,
      sorting: ['-created_at'],
      limit: ORDER_PAGE,
    });
    return page.items
      .filter((order) => order.status !== 'draft')
      .map((order) => ({
        id: order.id,
        createdAt: new Date(order.created_at),
        totalCents: order.total_amount,
        currency: order.currency,
        status: order.status,
      }));
  }

  async workspaceSubscriptions(workspaceId: string): Promise<ProviderSubscription[]> {
    const page = await this.polar.subscriptions.list({
      metadata: { workspace_id: workspaceId },
      limit: WORKSPACE_SUBSCRIPTION_PAGE,
    });
    return page.items.map(toSubscription);
  }

  async orderSubscription(orderId: string): Promise<string | null> {
    try {
      return (await this.polar.orders.get(orderId)).subscription_id;
    } catch (error) {
      if (error instanceof errors.ResourceNotFound) return null;
      throw error;
    }
  }

  async invoiceUrl(orderId: string): Promise<string | null> {
    const order = await this.polar.orders.get(orderId);
    if (order.is_invoice_generated) return (await this.polar.orders.invoice(orderId)).url;
    // Polar makes an invoice only when asked. Its receipt endpoint is not used:
    // it answers with an empty body that the SDK cannot read.
    try {
      await this.polar.orders.generateInvoice(orderId);
    } catch (error) {
      // Accepted with an empty body: the invoice is on its way.
      if (error instanceof SyntaxError) return this.waitForInvoice(orderId);
      // Not eligible yet (unpaid, or missing billing details): there is no PDF.
      if (
        error instanceof errors.MissingInvoiceBillingDetails ||
        error instanceof errors.OrderNotEligibleForInvoice
      ) {
        return null;
      }
      throw error;
    }
    return this.waitForInvoice(orderId);
  }

  /** Generated in the background, usually within a second or two. */
  private async waitForInvoice(orderId: string): Promise<string | null> {
    for (let attempt = 0; attempt < INVOICE_POLLS; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, INVOICE_POLL_MS));
      if ((await this.polar.orders.get(orderId)).is_invoice_generated) {
        return (await this.polar.orders.invoice(orderId)).url;
      }
    }
    return null;
  }

  async resume(subscriptionId: string): Promise<ProviderSubscription> {
    const subscription = await this.polar.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
    return toSubscription(subscription);
  }

  async cancelAtPeriodEnd(subscriptionId: string): Promise<ProviderSubscription> {
    const subscription = await this.polar.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    return toSubscription(subscription);
  }

  async seatsOf(
    subscriptionId: string,
  ): Promise<{ seats: number | null; pendingSeats: number | null }> {
    const subscription = await this.polar.subscriptions.get(subscriptionId);
    return {
      seats: subscription.seats ?? null,
      pendingSeats: subscription.pending_update?.seats ?? null,
    };
  }

  async changeSeats(subscriptionId: string, change: SeatChange): Promise<ProviderSubscription> {
    const subscription = await this.polar.subscriptions.update(
      subscriptionId,
      change.kind === 'drop-pending'
        ? { pending_update: null }
        : {
            seats: change.seats,
            // Added seats land on the next invoice for the days left; fewer
            // seats wait for the renewal, so nothing paid is handed back.
            proration_behavior: change.kind === 'add-now' ? 'prorate' : 'next_period',
          },
    );
    return toSubscription(subscription);
  }

  async readWebhook(body: Buffer, headers: Record<string, string>): Promise<BillingWebhook> {
    if (!this.webhookSecret) throw new BillingWebhookRejected('signature');
    let event: Awaited<ReturnType<typeof webhooks.validateEvent>>;
    try {
      event = await webhooks.validateEvent(body, headers, this.webhookSecret);
    } catch (error) {
      if (error instanceof webhooks.PolarWebhookVerificationError) {
        throw new BillingWebhookRejected('signature');
      }
      // Signed by Polar but an event this API version does not describe:
      // nothing here listens for it, so it is acknowledged and dropped.
      if (error instanceof webhooks.PolarWebhookUnknownTypeError) {
        return { kind: 'ignored', type: 'unknown' };
      }
      if (error instanceof webhooks.PolarWebhookError) throw new BillingWebhookRejected('payload');
      throw error;
    }
    if (event.type.startsWith('subscription.') && 'data' in event && isSubscription(event.data)) {
      return { kind: 'subscription', type: event.type, subscription: toSubscription(event.data) };
    }
    return { kind: 'ignored', type: event.type };
  }
}

type PaymentMethod = Awaited<ReturnType<Polar['customers']['listPaymentMethods']>>['items'][number];

function isCard(method: PaymentMethod): method is Extract<PaymentMethod, { type: 'card' }> {
  return method.type === 'card';
}

function isSubscription(data: unknown): data is models.Subscription {
  return typeof data === 'object' && data !== null && 'status' in data && 'product' in data;
}

function toCatalogueProduct(product: models.Product): CatalogueProduct {
  const prices = product.prices.filter((price) => !price.is_archived);
  return {
    id: product.id,
    archived: product.is_archived,
    plan: product.metadata['plan'],
    cycle: product.metadata['cycle'],
    interval: product.recurring_interval_count === 1 ? product.recurring_interval : null,
    price: prices.length === 1 ? toPrice(prices[0]!) : { kind: 'other' },
  };
}

function toPrice(price: models.Product['prices'][number]): CatalogueProduct['price'] {
  if (price.amount_type === 'fixed' && 'price_amount' in price) {
    return { kind: 'fixed', cents: price.price_amount };
  }
  if (price.amount_type === 'seat_based' && 'seat_tiers' in price) {
    const tiers = price.seat_tiers.tiers;
    // One flat price per seat from the first seat; tiered seat prices are not
    // something the pricing page could describe.
    if (tiers.length === 1 && tiers[0]!.min_seats <= 1) {
      return { kind: 'seats', centsPerSeat: tiers[0]!.price_per_seat };
    }
  }
  return { kind: 'other' };
}

function toSubscription(subscription: models.Subscription): ProviderSubscription {
  return {
    id: subscription.id,
    customerId: subscription.customer_id,
    status: subscription.status,
    seats: subscription.seats ?? null,
    currentPeriodEnd: dateOrNull(subscription.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    endedAt: dateOrNull(subscription.ended_at),
    modifiedAt: new Date(subscription.modified_at ?? subscription.created_at),
    checkoutId: subscription.checkout_id,
    workspaceId: subscription.metadata['workspace_id'],
    plan: subscription.product.metadata['plan'],
    cycle: subscription.product.metadata['cycle'],
  };
}

function dateOrNull(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}
