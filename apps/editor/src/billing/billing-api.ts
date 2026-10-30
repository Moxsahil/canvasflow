import type { BillingCycle, PurchasablePlan, WorkspacePlan } from '@canvasflow/types';
import { env } from '../lib/env';
import { t } from '../i18n';

/**
 * Buying a plan, through the gateway. The gateway opens Polar's payment page
 * and keeps the workspace's plan in step with what Polar says was paid; this
 * only asks for the page and, afterwards, whether the plan has arrived.
 */

export class BillingApiError extends Error {
  readonly status: number;
  /** The gateway's fixed name for the refusal, such as `already-subscribed`. */
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = 'BillingApiError';
    this.status = status;
    this.code = code;
  }
}

async function failure(res: Response): Promise<BillingApiError> {
  if (res.status === 401) return new BillingApiError(t('errors.sessionExpired'), 401, null);
  if (res.status === 429) return new BillingApiError(t('errors.tooManyTries'), 429, null);
  try {
    const body = (await res.json()) as { message?: unknown; code?: unknown };
    const code = typeof body.code === 'string' ? body.code : null;
    if (typeof body.message === 'string' && body.message) {
      return new BillingApiError(body.message, res.status, code);
    }
  } catch {
    // Fall through to the generic message.
  }
  return new BillingApiError(t('errors.status', { status: res.status }), res.status, null);
}

/**
 * The address of Polar's payment page for this workspace and plan. Coming back
 * lands on `returnTo` with `checkout_id` added.
 */
export async function startCheckout(input: {
  workspaceId: string;
  plan: PurchasablePlan;
  cycle: BillingCycle;
  returnTo: string;
  /** Where Polar's back button goes: this page, with the choices in its address. */
  backTo: string;
  /** For Team: seats to buy, never fewer than the members. */
  seats?: number;
}): Promise<string> {
  const res = await fetch(`${env.VITE_API_URL}/billing/checkout`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { data: { url: string } };
  return body.data.url;
}

/** A subscription as Polar last described it to the gateway. */
export interface PaidSubscription {
  /** `active`, `trialing`, or `past_due` while Polar retries a failed payment. */
  status: string;
  plan: WorkspacePlan;
  cycle: BillingCycle;
  seats: number | null;
  /** ISO time of the next charge. */
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface CheckoutStatus {
  workspaceId: string;
  plan: WorkspacePlan;
  /** True once the workspace is on the plan, which is when the payment has landed. */
  done: boolean;
  subscription: PaidSubscription | null;
}

/** What the upgrade page needs about a workspace. */
export interface BillingWorkspace {
  id: string;
  name: string;
  plan: WorkspacePlan;
  role: 'owner' | 'admin' | 'member';
  members: number;
  subscription: PaidSubscription | null;
}

export async function billingWorkspace(workspaceId: string): Promise<BillingWorkspace> {
  const res = await fetch(
    `${env.VITE_API_URL}/billing/workspaces/${encodeURIComponent(workspaceId)}`,
    { credentials: 'include' },
  );
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { data: BillingWorkspace };
  return body.data;
}

export async function checkoutStatus(checkoutId: string): Promise<CheckoutStatus> {
  const res = await fetch(
    `${env.VITE_API_URL}/billing/checkouts/${encodeURIComponent(checkoutId)}`,
    { credentials: 'include' },
  );
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { data: CheckoutStatus };
  return body.data;
}

/** A short-lived link into Polar's billing portal: card, invoices, cancelling. Owners only. */
export async function openBillingPortal(workspaceId: string, returnTo: string): Promise<string> {
  const res = await fetch(
    `${env.VITE_API_URL}/billing/workspaces/${encodeURIComponent(workspaceId)}/portal`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnTo }),
    },
  );
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { data: { url: string } };
  return body.data.url;
}

/** The card Polar charges, as much of it as may be shown. */
export interface SavedCard {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface BillingInvoice {
  id: string;
  /** ISO time it was charged. */
  date: string;
  /** In cents, tax included. */
  total: number;
  currency: string;
  /** `paid`, `refunded`, `partially_refunded`, `pending` or `void`. */
  status: string;
}

export interface BillingHistory {
  card: SavedCard | null;
  invoices: BillingInvoice[];
}

/** The card on file and every invoice. Owners only. */
export async function billingHistory(workspaceId: string): Promise<BillingHistory> {
  const res = await fetch(
    `${env.VITE_API_URL}/billing/workspaces/${encodeURIComponent(workspaceId)}/history`,
    { credentials: 'include' },
  );
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { data: BillingHistory };
  return body.data;
}

/** A short-lived link to one invoice's PDF. */
export async function invoiceUrl(workspaceId: string, invoiceId: string): Promise<string> {
  const res = await fetch(
    `${env.VITE_API_URL}/billing/workspaces/${encodeURIComponent(workspaceId)}/invoices/${encodeURIComponent(invoiceId)}`,
    { credentials: 'include' },
  );
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { data: { url: string } };
  return body.data.url;
}

/** Takes back a cancellation, so the plan renews after all. */
export async function resumePlan(workspaceId: string): Promise<PaidSubscription> {
  const res = await fetch(
    `${env.VITE_API_URL}/billing/workspaces/${encodeURIComponent(workspaceId)}/resume`,
    { method: 'POST', credentials: 'include' },
  );
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { data: PaidSubscription };
  return body.data;
}
