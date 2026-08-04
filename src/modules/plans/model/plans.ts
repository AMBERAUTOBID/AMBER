/**
 * The plan catalogue — the single place where "what does each plan allow"
 * exists. Adding a plan means adding a row here; nothing else in the app may
 * hard-code a plan name or limit. Every gate goes through can() (see can.ts),
 * and can() reads only this table.
 *
 * ── EVERY NUMBER BELOW IS A PLACEHOLDER ─────────────────────────────────
 * Three tiers are scaffolded so the plans page, deposit flow and admin
 * console can be built and tested end to end. The figures are shaped like
 * plausible ones but are NOT SmartAutoBid's pricing. Per ARCHITECTURE.md
 * invariant #4 ("never invent a number"), they MUST be replaced with real
 * values before the site goes public. The site is gated meanwhile, so no
 * customer can see them.
 *
 * To fill in the real plans, edit ONLY this file plus the display names in
 * messages/*.json → Plans.tiers.*. Nothing else needs to change.
 * ────────────────────────────────────────────────────────────────────────
 *
 * WHY THE KEYS ARE NUMBERED: `tier1`/`tier2`/`tier3` are stored in the
 * database (users.active_plan_key, deposits.plan_key). Names customers see
 * live in messages/*.json instead, so renaming "Standard" to "Gold" later is
 * a text edit in three JSON files rather than a data migration over rows that
 * already reference the old key. Only add or remove tiers here; don't rename
 * these keys casually.
 *
 * Other modelling decisions that are NOT placeholders:
 * - Money is integer cents (EUR) / whole dollars (USD bid caps), matching
 *   the schema's no-floats rule.
 * - `null` for a limit means "unlimited" — explicit, so a missing field is a
 *   type error rather than accidental infinity.
 * - `selfBiddingEligible` marks plans whose buyers MAY be granted live
 *   self-bidding. The grant itself is a per-user admin action
 *   (users.selfBiddingGrantedAt) after the mandatory contact step — the plan
 *   alone never unlocks it.
 */

export const PLAN_KEYS = ["tier1", "tier2", "tier3"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export interface Plan {
  key: PlanKey;
  /** Refundable deposit, EUR cents. 0 = no deposit. PLACEHOLDER. */
  depositCents: number;
  /** Max USD amount of a single bid. null = unlimited. PLACEHOLDER. */
  maxBidUsd: number | null;
  /** How many bids may be live at once. null = unlimited. PLACEHOLDER. */
  maxConcurrentBids: number | null;
  /** Whether night-auction reserve prices are shown. PLACEHOLDER. */
  nightReserveVisible: boolean;
  /** Whether the client may join live auctions (with us bidding). PLACEHOLDER. */
  liveAuctionAccess: boolean;
  /** Service fee per purchased lot, EUR cents. PLACEHOLDER. */
  feePerLotCents: number;
  /** May an admin grant this user live self-bidding at all? */
  selfBiddingEligible: boolean;
  /** Highlighted as "most popular" on the plans page. Presentation only. */
  featured: boolean;
}

export const PLANS: Record<PlanKey, Plan> = {
  tier1: {
    key: "tier1",
    depositCents: 0, // PLACEHOLDER
    maxBidUsd: 5000, // PLACEHOLDER
    maxConcurrentBids: 1, // PLACEHOLDER
    nightReserveVisible: false,
    liveAuctionAccess: false,
    feePerLotCents: 35000, // PLACEHOLDER
    selfBiddingEligible: false,
    featured: false,
  },
  tier2: {
    key: "tier2",
    depositCents: 100000, // PLACEHOLDER
    maxBidUsd: 15000, // PLACEHOLDER
    maxConcurrentBids: 3, // PLACEHOLDER
    nightReserveVisible: true,
    liveAuctionAccess: true,
    feePerLotCents: 25000, // PLACEHOLDER
    selfBiddingEligible: false,
    featured: true,
  },
  tier3: {
    key: "tier3",
    depositCents: 300000, // PLACEHOLDER
    maxBidUsd: null, // PLACEHOLDER (unlimited)
    maxConcurrentBids: null, // PLACEHOLDER (unlimited)
    nightReserveVisible: true,
    liveAuctionAccess: true,
    feePerLotCents: 25000, // PLACEHOLDER
    selfBiddingEligible: true,
    featured: false,
  },
};

/** Catalogue order for display — the array, not Object.keys(), is the
 * source of truth for what order tiers appear in. */
export const PLANS_IN_ORDER: Plan[] = PLAN_KEYS.map((k) => PLANS[k]);

export function isPlanKey(value: string): value is PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(value);
}

/** €1,500 from 150000. Whole euros only — no tier is priced in cents. */
export function formatDepositEur(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
