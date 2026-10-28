/**
 * The plans, what each one allows, and what it costs.
 *
 * A plan belongs to a workspace, and everything about it is read from here:
 * the gateway enforces these numbers, and the pricing page, the editor and
 * the billing page print them. Changing an allowance or a price is a change to
 * this file and nothing else.
 *
 * Free, Pro and Team are on sale. Enterprise is arranged by talking to us and
 * allows what Team does.
 */
// The order is the database enum's (migration 0035 put `team` before `pro`).
// A new plan goes on the end, with a migration of its own.
export const WORKSPACE_PLANS = ['free', 'team', 'pro', 'enterprise'] as const;

export type WorkspacePlan = (typeof WORKSPACE_PLANS)[number];

/** Every plan somebody pays for. */
export const PAID_PLANS: readonly WorkspacePlan[] = ['pro', 'team', 'enterprise'];

/** What each plan is called wherever a person reads it. */
export const PLAN_NAMES: Readonly<Record<WorkspacePlan, string>> = {
  free: 'Free',
  pro: 'Pro',
  team: 'Team',
  enterprise: 'Enterprise',
};

export interface PlanAllowance {
  /** Diagrams one person may generate in a calendar month (UTC). */
  readonly diagramsPerMonth: number;
  /** Pictures, boards and library one person may keep, in gigabytes. */
  readonly storageGb: number;
  /** How far back a board's history reaches, in days; null for all of it. */
  readonly historyDays: number | null;
  /** Whether a board embedded on another site carries a "Made with CanvasFlow" badge. */
  readonly embedBadge: boolean;
  /** Whether the workspace can take invites, roles and guests, or is one person's. */
  readonly teamWorkspace: boolean;
}

/**
 * Boards are unlimited on every plan, and so is the trash: drawing and getting
 * back what was deleted are the whiteboard itself, and are never what somebody
 * pays for. Plans differ in how much more they allow, not in what works.
 */
export const PLAN_ALLOWANCES: Readonly<Record<WorkspacePlan, PlanAllowance>> = {
  free: {
    diagramsPerMonth: 10,
    storageGb: 1,
    historyDays: 7,
    embedBadge: true,
    teamWorkspace: false,
  },
  pro: {
    diagramsPerMonth: 100,
    storageGb: 10,
    historyDays: 90,
    embedBadge: false,
    teamWorkspace: false,
  },
  team: {
    diagramsPerMonth: 200,
    storageGb: 25,
    historyDays: null,
    embedBadge: false,
    teamWorkspace: true,
  },
  enterprise: {
    diagramsPerMonth: 200,
    storageGb: 25,
    historyDays: null,
    embedBadge: false,
    teamWorkspace: true,
  },
};

export interface PlanPrice {
  /** Dollars a month when paid month by month. */
  readonly monthly: number;
  /** Dollars a month when paid a year at a time. */
  readonly yearly: number;
  /** Pro is one person's; Team is charged for each member of the workspace. */
  readonly per: 'person' | 'member';
}

/**
 * The plans with a listed price. Free costs nothing; Enterprise is agreed with us.
 *
 * They match the products in the payment provider's catalogue, where a yearly
 * product is charged twelve times the `yearly` figure at once. Change one, change
 * the other.
 */
export const PLAN_PRICES: Readonly<Partial<Record<WorkspacePlan, PlanPrice>>> = {
  pro: { monthly: 6, yearly: 5, per: 'person' },
  team: { monthly: 11, yearly: 8, per: 'member' },
};

/** The currency every plan is priced and charged in. */
export const PLAN_CURRENCY = 'USD';

const PRICE_FORMAT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: PLAN_CURRENCY,
  minimumFractionDigits: 0,
});

/** A plan price as people read it: `$6`, `$96`. */
export function formatPlanPrice(amount: number): string {
  return PRICE_FORMAT.format(amount);
}

export function isWorkspacePlan(value: unknown): value is WorkspacePlan {
  return typeof value === 'string' && (WORKSPACE_PLANS as readonly string[]).includes(value);
}

export function isPaidPlan(plan: WorkspacePlan): boolean {
  return PAID_PLANS.includes(plan);
}
