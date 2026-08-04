/**
 * The plan catalogue — the single place where "what does each plan allow"
 * exists. Adding a plan means adding a row here; nothing else in the app may
 * hard-code a plan name or limit. Every gate goes through can() (see can.ts),
 * and can() reads only this table.
 *
 * ── PLACEHOLDER NUMBERS ─────────────────────────────────────────────────
 * Every figure below is a PLACEHOLDER modelled on a competitor's public
 * pricing (bidplius), pending the real SmartAutoBid numbers from the owner.
 * Per ARCHITECTURE.md invariant #4 ("never invent a number"), these MUST be
 * replaced before any plan page or deposit flow ships to the public.
 * ────────────────────────────────────────────────────────────────────────
 *
 * Modelling decisions that are NOT placeholders:
 * - Money is integer cents (EUR) / whole dollars (USD bid caps), matching
 *   the schema's no-floats rule.
 * - `null` for a limit means "unlimited" — explicit, so a missing field is a
 *   type error rather than accidental infinity.
 * - `selfBiddingEligible` marks plans whose buyers MAY be granted live
 *   self-bidding. The grant itself is a per-user admin action
 *   (users.selfBiddingGrantedAt) after the mandatory contact step — the plan
 *   alone never unlocks it.
 */

export const PLAN_KEYS = ["starter", "minimal", "standard", "premium", "professional"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export interface Plan {
  key: PlanKey;
  /** Refundable deposit, EUR cents. 0 = no deposit. PLACEHOLDER values. */
  depositCents: number;
  /** Max USD amount of a single bid. null = unlimited. PLACEHOLDER values. */
  maxBidUsd: number | null;
  /** How many bids may be live at once. null = unlimited. PLACEHOLDER values. */
  maxConcurrentBids: number | null;
  /** Whether night-auction reserve prices are shown. PLACEHOLDER values. */
  nightReserveVisible: boolean;
  /** Whether the client may join live auctions (with us bidding). PLACEHOLDER values. */
  liveAuctionAccess: boolean;
  /** Service fee per purchased lot, EUR cents. PLACEHOLDER values. */
  feePerLotCents: number;
  /** May an admin grant this user live self-bidding at all? */
  selfBiddingEligible: boolean;
}

export const PLANS: Record<PlanKey, Plan> = {
  starter: {
    key: "starter",
    depositCents: 0,
    maxBidUsd: null,
    maxConcurrentBids: null,
    nightReserveVisible: false,
    liveAuctionAccess: false,
    feePerLotCents: 35000,
    selfBiddingEligible: false,
  },
  minimal: {
    key: "minimal",
    depositCents: 50000,
    maxBidUsd: 5000,
    maxConcurrentBids: 3,
    nightReserveVisible: true,
    liveAuctionAccess: true,
    feePerLotCents: 25000,
    selfBiddingEligible: false,
  },
  standard: {
    key: "standard",
    depositCents: 150000,
    maxBidUsd: 15000,
    maxConcurrentBids: 3,
    nightReserveVisible: true,
    liveAuctionAccess: true,
    feePerLotCents: 25000,
    selfBiddingEligible: false,
  },
  premium: {
    key: "premium",
    depositCents: 300000,
    maxBidUsd: 30000,
    maxConcurrentBids: 5,
    nightReserveVisible: true,
    liveAuctionAccess: true,
    feePerLotCents: 25000,
    selfBiddingEligible: false,
  },
  professional: {
    key: "professional",
    depositCents: 500000,
    maxBidUsd: null,
    maxConcurrentBids: null,
    nightReserveVisible: true,
    liveAuctionAccess: true,
    feePerLotCents: 25000,
    selfBiddingEligible: true,
  },
};

export function isPlanKey(value: string): value is PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(value);
}
