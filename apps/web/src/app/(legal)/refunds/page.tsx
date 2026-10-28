import type { Metadata } from 'next';
import { PLAN_NAMES, PLAN_PRICES, formatPlanPrice } from '@canvasflow/types';
import { LegalDocument, type LegalSection } from '@/components/legal/legal-document';
import { CONTACT, OPERATOR } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Cancellation and Refund Policy — CanvasFlow',
  description: 'How paid plans renew, how to cancel, and which charges are refunded.',
};

/** Move this whenever the text below changes: the page tells readers it did. */
const LAST_UPDATED = '2026-10-28';

const supportEmail = <a href={`mailto:${CONTACT.support}`}>{CONTACT.support}</a>;
const legalEmail = <a href={`mailto:${CONTACT.legal}`}>{CONTACT.legal}</a>;

/**
 * The prices come from plans.ts, like the pricing section's. Polar sells the
 * plans as merchant of record, so receipts, card retries and the refund itself
 * are Polar's; what is refunded is ours. Each promise below is what the billing
 * code does: change one, change the other.
 */
const SECTIONS: LegalSection[] = [
  {
    id: 'plans-and-prices',
    title: 'Plans and prices',
    body: (
      <>
        <p>
          CanvasFlow is free to use. Paid plans add more on top: see <a href="/#pricing">pricing</a>{' '}
          for what each one includes.
        </p>
        <ul>
          {(['pro', 'team'] as const).map((plan) => {
            const price = PLAN_PRICES[plan]!;
            const per = price.per === 'member' ? ' for each member' : '';
            return (
              <li key={plan}>
                <strong>{PLAN_NAMES[plan]}</strong>: {formatPlanPrice(price.monthly)} a month{per},
                or {formatPlanPrice(price.yearly)} a month{per} when paid for a year at a time (
                {formatPlanPrice(price.yearly * 12)} a year{per}).
              </li>
            );
          })}
        </ul>
        <p>
          Prices are in US dollars. Checkout shows the total before you pay, including any sales
          tax, VAT or GST that applies where you live.
        </p>
      </>
    ),
  },
  {
    id: 'who-you-pay',
    title: 'Who you pay',
    body: (
      <>
        <p>
          Payments are handled by <a href="https://polar.sh">Polar</a>, our payment provider and
          merchant of record. Polar sells the plan to you on our behalf: it takes the payment, works
          out and pays any tax on it, and sends your receipts and invoices. Polar’s own terms apply
          to the purchase as well as ours.
        </p>
        <p>
          You pay by card. Your card details go to Polar and its payment processor, never to us. If
          your bank charges a fee for paying in US dollars, that fee is your bank’s, not ours.
        </p>
      </>
    ),
  },
  {
    id: 'how-billing-works',
    title: 'How billing works',
    body: (
      <>
        <p>
          A plan belongs to a workspace, and is paid for month by month or a year at a time. You
          choose which at checkout.
        </p>
        <ul>
          <li>
            The plan renews automatically at the end of each month or year, on the same date, until
            you cancel. Each renewal is charged to the card you paid with, and Polar emails you a
            receipt.
          </li>
          <li>
            Team is charged for each member of the workspace. When someone joins, a seat is added
            straight away and charged for the rest of the current period on your next invoice. When
            someone leaves, their seat comes off at the next renewal; the rest of the period isn’t
            refunded.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'cancelling',
    title: 'Cancelling',
    body: (
      <>
        <p>
          You can cancel at any time, with no fee, in <strong>Settings → Billing</strong>, or by
          emailing {supportEmail} from the address on your account. A workspace with a plan that
          still renews can’t be deleted until the plan is cancelled, so you’re never charged for a
          workspace that’s gone. Deleting your account cancels the plans of the workspaces you own.
        </p>
        <p>
          When you cancel, nothing more is charged. Your plan stays on until the end of the period
          you’ve already paid for, then the workspace moves to the Free plan. Your boards stay
          exactly as they are: boards are unlimited on every plan, Free included.
        </p>
      </>
    ),
  },
  {
    id: 'refunds',
    title: 'Refunds',
    body: (
      <>
        <ul>
          <li>
            <strong>No change-of-mind refunds.</strong> Payments aren’t refunded, including your
            first payment and renewals. The Free plan, with unlimited boards, is the way to try
            CanvasFlow before paying.
          </li>
          <li>
            <strong>Mistakes.</strong> If you were charged twice, charged after you cancelled, or
            charged an amount you didn’t agree to, we’ll refund the wrong charge in full, through
            Polar, whenever you tell us.
          </li>
        </ul>
        <p>
          If you were charged by mistake, email {supportEmail} from the address on your account and
          tell us which workspace it’s for.
        </p>
      </>
    ),
  },
  {
    id: 'how-refunds-are-paid',
    title: 'How refunds are paid',
    body: (
      <>
        <p>
          A refund goes back to the card you paid with, through Polar. We start it within 2 working
          days of agreeing to it. Your bank then usually takes 5 to 10 working days to show it.
        </p>
      </>
    ),
  },
  {
    id: 'failed-payments',
    title: 'If a payment fails',
    body: (
      <>
        <p>
          If a renewal payment doesn’t go through, Polar emails you and tries your card again over
          the following days. If it still hasn’t gone through after that, the workspace moves to the
          Free plan. Nothing is deleted, and you can subscribe again at any time to get the plan
          back.
        </p>
      </>
    ),
  },
  {
    id: 'delivery',
    title: 'Delivery',
    body: (
      <>
        <p>
          CanvasFlow is an online service, so there’s nothing to ship. A plan starts on your
          workspace as soon as your payment is confirmed, usually within a minute.
        </p>
        <p>
          If your payment went through but your plan hasn’t started within 24 hours, email{' '}
          {supportEmail} and we’ll sort it out or refund you.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: 'Questions and complaints',
    body: (
      <>
        <p>
          For anything about a payment, email {supportEmail}. For questions about this policy, email{' '}
          {legalEmail}.
        </p>
        <p>
          Complaints go to our Grievance Officer, {OPERATOR.name}, at {legalEmail}. We’ll
          acknowledge your complaint within 24 hours and resolve it within 15 days.
        </p>
      </>
    ),
  },
];

export default function RefundsPage() {
  return (
    <LegalDocument
      title="Cancellation and Refund Policy"
      updated={LAST_UPDATED}
      intro={
        <>
          <p>
            This policy explains how CanvasFlow’s paid plans are billed, how to cancel, and which
            charges are refunded.
          </p>
          <p>
            It’s part of our <a href="/terms">Terms of Service</a>.
          </p>
        </>
      }
      sections={SECTIONS}
    />
  );
}
