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
 * ⚠️ **WHAT A DEPOSIT TIER BUYS TODAY IS THE $350 RATE AND THE BIDDING TERMS,
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
 * The four names; Bronze free at **$400** per vehicle; Silver/Gold/Platinum
 * deposits of $1,500/$2,500/$5,000 at **$350** per vehicle, with limits
 * matching bidauto.online's published tiers.
 *
 * The fee is the whole commercial shape of the offer: a deposit buys the
 * reduced rate, and Bronze trades that discount for costing nothing up front.
 * Change one of those numbers and the reason to pay a deposit changes with it.
 *
 * ⚠️ **AND IT JUST CHANGED, 2026-08-14 — the gap narrowed from $150 to $50.**
 * It was $350 Bronze against $200 on a deposit tier. The owner raised both,
 * and the consequence is worth stating plainly because the whole plans pitch
 * rests on it: a deposit used to save $150 on every car, and now saves $50, so
 * "Silver is cheaper than Bronze from the very first vehicle" survives but is
 * three times weaker. The deposit is refundable, so it still costs nothing but
 * frozen cash — that argument is now doing most of the work and belongs on the
 * page, where it does not yet appear.
 *
 * ⚠️ **THE SAME NUMBER LIVES IN `modules/pricing/costEstimate.ts`.** The
 * landed-cost calculator's brokerage line and the per-vehicle fee here are one
 * commercial figure, and they were two unlinked constants that had already been
 * measured drifting. `costEstimate` now imports from this table — never restate
 * a fee there. Note the calculator is also imported by the Telegram bot, so a
 * change here moves numbers in future channel captions.
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
  /**
   * Up to this single-bid amount we ask for no security at all; above it, and
   * up to `maxBidUsd`, a person decides per car whether a refundable hold is
   * needed. USD. `null` on every tier that already holds a deposit — they have
   * posted their security once and the question does not arise again.
   *
   * ⚠️ THIS IS THE FIGURE THE FREE CARD PUBLISHES AS ITS LIMIT, and it is
   * deliberately NOT `maxBidUsd`. The owner's rule, 2026-08-17: "bid limit up
   * to $5,000, and from $5,000 our team decides whether a deposit is needed."
   * Two different promises, so two different numbers — and `bidDepositFor()`
   * reads this one, so the card cannot drift from what is enforced.
   */
  depositFreeUpToUsd: number | null;
  /** How many bids may be live at once. null = unlimited. */
  maxConcurrentBids: number | null;
  /**
   * Above this single-bid amount, the concurrency allowance shrinks to one —
   * bidauto's "bid on up to N lots at a time (if bid not higher than $X)".
   * null = concurrency is unconditional.
   *
   * Enforced in `judgeBidRequest()`, over the incoming bid *and* the ones
   * already live: a rule that read only the new amount would let the set drift
   * past the threshold one small bid at a time.
   *
   * This carried a warning that it was unenforced, kept true by every tier
   * holding a threshold being `available: false`. Both halves stopped being
   * true when Gold and Platinum opened and the enforcement landed with them —
   * see the note above the conditional-concurrency tests in can.test.ts, where
   * the tripwire that guarded this was replaced by the rule it was standing in
   * for. Left recorded rather than deleted: a comment that once said "not
   * enforced" is worth showing as settled, so nobody implements it twice.
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
  /**
   * Draws the eye to one card in the row — amber border, filled button.
   * Presentation only.
   *
   * ⚠️ IT NO LONGER PRINTS A BADGE, AND THAT HISTORY IS WORTH KEEPING. The
   * badge first read "Most popular", which was a claim about a track record
   * this company does not have — the same class of statement as an invented
   * testimonial, scrubbed site-wide once already. It was rewritten to name the
   * AUDIENCE instead ("For one or two cars"), which was at least true. The
   * owner removed it outright on 2026-08-17 for looking wrong above the card,
   * and nothing was lost: Bronze's tagline already says who it is for, in a
   * full sentence, two lines below where the badge sat.
   *
   * The emphasis stays. Without it the row reads as four equal options with no
   * suggested way in, which is worse for a first-time visitor than a quiet
   * highlight on the free tier.
   */
  featured: boolean;
}

export const PLANS: Record<PlanKey, Plan> = {
  /**
   * Bronze — free. We find the car and place every bid by hand together with
   * the client. Revenue is the per-lot fee on a successful purchase.
   *
   * ⚠️ BOTH CAPS USED TO BE `null` — "unlimited" — AND THAT INVERTED THE PAGE.
   * Read left to right, a client saw the free tier offering unlimited bidding
   * power and unlimited concurrent bids, while Platinum at $5,000 offered
   * $50,000 and five lots. The free plan read as strictly better than the most
   * expensive one, and nothing on the page explained why anyone would pay.
   *
   * `null` was never a promise, only an absence: every bronze bid passes through
   * us, so there had been nothing to cap. But §6 forbids a screen from
   * describing a limit in prose — a card may only say what this table says — so
   * the honest repair is to record the real limits here, where
   * `judgeBidRequest()` already enforces them, not to reword a card.
   *
   * NEITHER NUMBER IS NEW. $10,000 is exactly where `bidDepositFor()` already
   * stops taking a per-car deposit and quotes a tier instead: above it a hold
   * and a tier cost the same money, and the tier covers every car.
   *
   * ⚠️ CONCURRENCY IS 1, NOT 2, AND THE DIFFERENCE IS EASY TO GET WRONG. The
   * owner describes this client as buying "one car, at most two" — but that is
   * a LIFETIME intent, not a number of simultaneous bids. Setting 2 here would
   * let the free plan run MORE bids at once than Silver, which allows 1, and
   * rebuild the same inversion one column to the left. The "one or two cars"
   * idea belongs in the card's audience copy, which claims no limit at all.
   *
   * ⚠️ BRONZE AND SILVER USED TO SHARE THIS CAP, AND NO LONGER DO. Both sat at
   * $10,000, so Silver's whole argument had to be the cheaper fee ($350 against
   * $400) and live-auction access — it bought no extra room at all. The owner
   * raised Silver to $15,000 on 2026-08-17, so the ladder now climbs on every
   * rung: $10,000 → $15,000 → $25,000 → $50,000. Bronze keeps $10,000 as the
   * hard ceiling, with $5,000 as the point below which we ask no security.
   */
  bronze: {
    key: "bronze",
    depositUsdCents: 0,
    maxBidUsd: 10000,
    // The card's headline limit. $10,000 above stays the hard ceiling — see
    // depositFreeUpToUsd on the interface for why the two differ.
    depositFreeUpToUsd: 5000,
    maxConcurrentBids: 1,
    concurrencyThresholdUsd: null,
    nightReserveVisible: false,
    liveAuctionAccess: false,
    feesPerVehicleUsdCents: [40000], // $400 — the no-deposit rate. See FEES below.
    selfBiddingEligible: false,
    available: true,
    featured: true,
  },

  /**
   * Silver — the first deposit tier: one lot at a time, at the reduced fee.
   *
   * ⚠️ $15,000, RAISED FROM $10,000 BY THE OWNER 2026-08-17, and the change
   * lands in two places worth knowing about.
   *
   * It puts Silver on the same ten-percent line as the tiers above it. At
   * $10,000 a $1,500 deposit was 15%, the one tier that broke the pattern, and
   * `bidDeposit.ts` carried a note calling it "the exception that proves the
   * rule". At $15,000 it is exactly 10%, like Gold and Platinum — the note is
   * gone because the exception is.
   *
   * It also changes what `tierCovering()` answers between $10,000 and $15,000:
   * that band used to quote Gold at $2,500, and now quotes Silver at $1,500.
   * Cheaper for the client, and it is the tier that genuinely covers them.
   */
  silver: {
    key: "silver",
    depositUsdCents: 150000, // $1,500 — exactly 10% of the cap below
    maxBidUsd: 15000,
    depositFreeUpToUsd: null,
    maxConcurrentBids: 1,
    concurrencyThresholdUsd: null,
    nightReserveVisible: false,
    liveAuctionAccess: true,
    feesPerVehicleUsdCents: [35000], // $350 — the reduced rate a deposit buys
    selfBiddingEligible: false,
    available: true,
    featured: false,
  },

  /** Gold — bidauto's "Professional": $25k power, 2 lots if each ≤ $10k. */
  gold: {
    key: "gold",
    depositUsdCents: 250000, // $2,500
    maxBidUsd: 25000,
    depositFreeUpToUsd: null,
    maxConcurrentBids: 2,
    concurrencyThresholdUsd: 10000,
    nightReserveVisible: false,
    liveAuctionAccess: true,
    feesPerVehicleUsdCents: [35000],
    selfBiddingEligible: false,
    available: true,
    featured: false,
  },

  /** Platinum — bidauto's "Enterprise": $50k power, 5 lots if each ≤ $10k. */
  platinum: {
    key: "platinum",
    depositUsdCents: 500000, // $5,000
    maxBidUsd: 50000,
    depositFreeUpToUsd: null,
    maxConcurrentBids: 5,
    concurrencyThresholdUsd: 10000,
    nightReserveVisible: false,
    liveAuctionAccess: true,
    feesPerVehicleUsdCents: [35000],
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
