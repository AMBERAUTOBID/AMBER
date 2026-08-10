/**
 * The plan catalogue — the single place where "what does each plan allow"
 * exists. Adding a plan means adding a row here; nothing else in the app may
 * hard-code a plan name or limit. Every gate goes through can() (see can.ts),
 * and can() reads only this table.
 *
 * CURRENCY: every money figure in this module is **USD cents**. The auctions
 * themselves bid in dollars and the tiers are priced against them, so the
 * whole plans/deposits surface is dollars end to end — deposits and per-lot
 * fees alike. (The landed-cost calculator in modules/pricing is a separate
 * concern and still quotes destination currencies; nothing here changes it.)
 *
 * AVAILABILITY: all four tiers can be taken. Silver, Gold and Platinum were
 * locked behind `available: false` until the deposit side was ready; they open
 * now that the flow they actually need — request, admin approval, reduced
 * per-vehicle fee — is proved end to end. That flag gates *new requests*
 * only; if a plan were ever withdrawn, existing holders would keep what they
 * paid for.
 *
 * ⚠️ **WHAT A DEPOSIT TIER BUYS TODAY IS THE $200 RATE AND THE BIDDING TERMS,
 * NOT SOFTWARE.** We still place every bid ourselves, exactly as with Bronze.
 * The caps below are commercial terms honoured by hand — and set as Bid Limits
 * on the broker platform — not features of this website. Which is why two
 * flags are deliberately `false` on every tier:
 *
 *   - `nightReserveVisible` — would need a reserve-price display that does not
 *     exist. A card line promising it is the pricing page lying, which is the
 *     exact failure `planFeatures.ts` was written to prevent.
 *   - `selfBiddingEligible` — would need the BidManager broker account that
 *     issues per-client access codes. "Self-bidding on request" on a $5,000
 *     tier is a promise we cannot keep this week.
 *
 * `liveAuctionAccess` STAYS true on the deposit tiers: joining a live auction
 * with us bidding is something a person does, not a page we have to ship.
 *
 * Turning either flag back on is one line here — the card, the dialog and
 * `can()` all follow, because none of them restate it.
 *
 * ── ALL FIGURES CONFIRMED BY THE OWNER ──────────────────────────────────
 * The four names; Bronze free at $350 per vehicle; Silver/Gold/Platinum
 * deposits of $1,500/$2,500/$5,000 at $200 per vehicle, with limits matching
 * bidauto.online's published tiers.
 *
 * The fee is the whole commercial shape of the offer: a deposit buys the
 * reduced $200 rate, and Bronze trades that discount for costing nothing up
 * front. Change one of those numbers and the reason to pay a deposit changes
 * with it.
 * ────────────────────────────────────────────────────────────────────────
 */

export const PLAN_KEYS = ["bronze", "silver", "gold", "platinum"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export interface Plan {
  key: PlanKey;
  /** Refundable deposit, USD cents. 0 = no deposit required. */
  depositUsdCents: number;
  /** Max USD amount of a single bid. null = unlimited. */
  maxBidUsd: number | null;
  /** How many bids may be live at once. null = unlimited. */
  maxConcurrentBids: number | null;
  /**
   * Above this single-bid amount, the concurrency allowance shrinks to one —
   * bidauto's "bid on up to N lots at a time (if bid not higher than $X)".
   * null = concurrency is unconditional.
   *
   * ⚠️ NOT YET ENFORCED IN can(). Harmless today because every plan carrying
   * a threshold is `available: false`, so nobody can hold one. Implementing
   * the conditional in judgeBidRequest() is a PREREQUISITE for flipping any
   * of them to available — see can.test.ts, which asserts exactly that.
   */
  concurrencyThresholdUsd: number | null;
  /** Whether night-auction reserve prices are shown. */
  nightReserveVisible: boolean;
  /** Whether the client may join live auctions (with us bidding). */
  liveAuctionAccess: boolean;
  /**
   * Service fees per purchased vehicle, USD cents — one card line each, in
   * order. A list rather than a single number because a tier may quote more
   * than one rate; an empty list means no fee is published yet and the card
   * shows no fee line at all (invariant #5: absent, not zero).
   */
  feesPerVehicleUsdCents: number[];
  /** May an admin grant this user live self-bidding at all? */
  selfBiddingEligible: boolean;
  /** False = shown on /plans but not selectable. See AVAILABILITY above. */
  available: boolean;
  /** Highlighted as "most popular" on the plans page. Presentation only. */
  featured: boolean;
}

export const PLANS: Record<PlanKey, Plan> = {
  /**
   * Bronze — free, and today the only plan anyone can take. We find the car
   * and place the bids together with the client, so there is no deposit and
   * no bidding cap to enforce: every bid passes through us. Revenue is the
   * per-lot fee on a successful purchase.
   */
  bronze: {
    key: "bronze",
    depositUsdCents: 0,
    maxBidUsd: null,
    maxConcurrentBids: null,
    concurrencyThresholdUsd: null,
    nightReserveVisible: false,
    liveAuctionAccess: false,
    feesPerVehicleUsdCents: [35000], // $350 per vehicle — the no-deposit rate
    selfBiddingEligible: false,
    available: true,
    featured: true,
  },

  /** Silver — bidauto's "Basic": $10k bidding power, one lot at a time. */
  silver: {
    key: "silver",
    depositUsdCents: 150000, // $1,500
    maxBidUsd: 10000,
    maxConcurrentBids: 1,
    concurrencyThresholdUsd: null,
    nightReserveVisible: false,
    liveAuctionAccess: true,
    feesPerVehicleUsdCents: [20000], // $200 — the reduced rate a deposit buys
    selfBiddingEligible: false,
    available: true,
    featured: false,
  },

  /** Gold — bidauto's "Professional": $25k power, 2 lots if each ≤ $10k. */
  gold: {
    key: "gold",
    depositUsdCents: 250000, // $2,500
    maxBidUsd: 25000,
    maxConcurrentBids: 2,
    concurrencyThresholdUsd: 10000,
    nightReserveVisible: false,
    liveAuctionAccess: true,
    feesPerVehicleUsdCents: [20000],
    selfBiddingEligible: false,
    available: true,
    featured: false,
  },

  /** Platinum — bidauto's "Enterprise": $50k power, 5 lots if each ≤ $10k. */
  platinum: {
    key: "platinum",
    depositUsdCents: 500000, // $5,000
    maxBidUsd: 50000,
    maxConcurrentBids: 5,
    concurrencyThresholdUsd: 10000,
    nightReserveVisible: false,
    liveAuctionAccess: true,
    feesPerVehicleUsdCents: [20000],
    // Turn back on together with the broker account — see AVAILABILITY above.
    selfBiddingEligible: false,
    available: true,
    featured: false,
  },
};

/** Catalogue order for display — the array, not Object.keys(), is the
 * source of truth for what order tiers appear in. */
export const PLANS_IN_ORDER: Plan[] = PLAN_KEYS.map((k) => PLANS[k]);

export function isPlanKey(value: string): value is PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(value);
}

/** A plan a client may actually take right now. */
export function isSelectable(key: PlanKey): boolean {
  return PLANS[key].available;
}

/** $1,500 from 150000. Whole dollars — no tier is priced in cents. */
export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
