import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  isBillingCycle,
  isPurchasablePlan,
  type BillingCycle,
  type PurchasablePlan,
} from '@canvasflow/types';

/** The most seats one checkout can buy, as the stepper allows. */
export const MAX_SEATS = 1000;

/**
 * The plan, period and seats picked on the upgrade page, kept in its address
 * (`?plan=pro&cycle=yearly&seats=3`). A refresh, the back button from Polar,
 * or coming back after a failed payment opens the page as it was left.
 *
 * Each change replaces the current history entry rather than adding one, so
 * Back still leaves the page instead of stepping through every click.
 * `seats` is null until one is picked; the page then starts at the member count.
 */
export function useCheckoutChoices(): {
  plan: PurchasablePlan;
  cycle: BillingCycle;
  seats: number | null;
  setPlan: (plan: PurchasablePlan) => void;
  setCycle: (cycle: BillingCycle) => void;
  setSeats: (seats: number) => void;
} {
  const [params, setParams] = useSearchParams();
  const askedPlan = params.get('plan');
  const askedCycle = params.get('cycle');
  const askedSeats = Number(params.get('seats'));

  const write = useCallback(
    (key: string, value: string) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set(key, value);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  return {
    plan: isPurchasablePlan(askedPlan) ? askedPlan : 'pro',
    cycle: isBillingCycle(askedCycle) ? askedCycle : 'yearly',
    seats:
      Number.isInteger(askedSeats) && askedSeats >= 1 && askedSeats <= MAX_SEATS
        ? askedSeats
        : null,
    setPlan: useCallback((plan) => write('plan', plan), [write]),
    setCycle: useCallback((cycle) => write('cycle', cycle), [write]),
    setSeats: useCallback((seats) => write('seats', String(seats)), [write]),
  };
}
