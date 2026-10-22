import type { Metadata } from 'next';
import { PLAN_NAMES, PLAN_PRICES } from '@canvasflow/types';
import { LegalDocument, type LegalSection } from '@/components/legal/legal-document';
import { CONTACT, OPERATOR } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Cancellation and Refund Policy — CanvasFlow',
  description: 'How paid plans renew, how to cancel, and which charges are refunded.',
};

/** Move this whenever the text below changes: the page tells readers it did. */
const LAST_UPDATED = '2026-10-22';

/** How long a workspace keeps its plan while a renewal payment is retried. */
const GRACE_DAYS = 7;

const supportEmail = <a href={`mailto:${CONTACT.support}`}>{CONTACT.support}</a>;
const legalEmail = <a href={`mailto:${CONTACT.legal}`}>{CONTACT.legal}</a>;

const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

/**
 * Paid plans aren't on sale yet, so this is the policy that will apply when
 * they are, and the intro says so. The prices come from plans.ts, like the
 * pricing section's. When checkout launches, drop the "not on sale yet" lines
 * and check each promise below against what the billing code does.
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
                <strong>{PLAN_NAMES[plan]}</strong>: {rupees(price.monthly)} a month{per}, or{' '}
                {rupees(price.yearly)} a month{per} when paid for a year at a time (
                {rupees(price.yearly * 12)} a year).
              </li>
            );
          })}
        </ul>
        <p>
          Prices are in Indian rupees, and the price you see at checkout is the price you pay,
          including any taxes.
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
            If you pay with UPI Autopay or a card, the plan renews automatically at the end of each
            month or year, on the same date, until you cancel. We’ll remind you before each renewal
            charge.
          </li>
          <li>
            If you pay for a year in one payment without Autopay, the plan doesn’t renew by itself.
            We’ll remind you before it ends, and you can pay again to keep it.
          </li>
          <li>
            Team is charged for each member of the workspace. If you add members, the extra cost is
            charged from your next renewal.
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
          emailing {supportEmail} from the address on your account.
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
            charged an amount you didn’t agree to, we’ll refund the wrong charge in full, whenever
            you tell us.
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
          A refund goes back to the way you paid: the same card, UPI account or bank account. We
          start it within 2 working days of agreeing to it. Your bank then usually takes 5 to 7
          working days to show it.
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
          If a renewal payment doesn’t go through, we’ll email you and try again over the next few
          days. Your plan stays on for {GRACE_DAYS} days while we do. If it still hasn’t gone
          through by then, the workspace moves to the Free plan. Nothing is deleted, and you can pay
          again at any time to get the plan back.
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
            <strong>Paid plans aren’t on sale yet.</strong> Nothing on CanvasFlow costs money today.
            This is the policy that will apply once they are, and it’s also part of our{' '}
            <a href="/terms">Terms of Service</a> from then on.
          </p>
        </>
      }
      sections={SECTIONS}
    />
  );
}
