/**
 * What the auctions themselves charge a licensed buyer on top of the hammer.
 *
 * ── SOURCES, all captured 2026-08-20 ────────────────────────────────────
 * IAA: their own fee page (effective 2024-11-04) — the tables there are
 * vectorised SVGs with no text layer, read by rasterising them. Copart: the
 * owner's screenshots of Copart's fee page, BOTH "Secured Payment Methods"
 * columns — Non-Clean Title and Clean Title. Secured is our case: we pay by
 * wire. Full tables and provenance live in the memory note
 * `reference-auction-buyer-fees`.
 *
 * ── THE TIER IS BIDMANAGER'S CATEGORY LETTER ────────────────────────────
 * The owner's definition (2026-08-20): category A = licensed, fewer than 5
 * bidders, over $75k bought; category C = licensed with 5+ bidders or under
 * $75k. Those are the auctions' own High Volume / Standard criteria, so
 * A ↔ `highVolume`, C ↔ `standard`. Three of Aivi's four accounts are A.
 *
 * ── WHY COPART AND IAA-HIGH SHARE ONE TABLE ─────────────────────────────
 * Verified row by row, not assumed: Copart's secured/non-clean schedule and
 * IAA's High Volume column are numerically identical across every bracket,
 * including the 6.0% above $15,000. Copart slices 8.5k–11.5k into more rows,
 * but every extra row carries the same value, so the step function is the
 * same function. One table, two names, and a test pins the equivalence to
 * the published examples so a future edit to one house cannot silently move
 * the other.
 *
 * ── QUOTE HIGH, RECONCILE REAL ──────────────────────────────────────────
 * The one real receipt we hold (lot 62288396) came in $67 UNDER this
 * schedule — Aivi's member number pays below list. So these tables are the
 * client-facing quote (safe direction: the invoice can only come in lower),
 * and the auction's own receipt remains the sole source for actual cost
 * lines. Never book these estimates into `order_cost_lines`.
 *
 * Pure. Cents in, cents out, same as every money module here.
 */

export type AuctionHouse = "copart" | "iaai";
/** BidManager category A ↔ highVolume, C ↔ standard. */
export type BuyerFeeTier = "standard" | "highVolume";
/** Copart calls them Pre-Bid / Live Bid; IAA proxy / live online. Same idea. */
export type BidMode = "prebid" | "live";

/** [upper bound in cents (inclusive of .99 via <), fee in cents] */
type Bracket = readonly [upToCents: number, feeCents: number];

/**
 * IAA Standard (= category C). IAA only — Copart does not tier by volume at
 * all: their published secured-payment schedules split by TITLE instead
 * (clean vs non-clean), both captured below.
 */
const IAA_STANDARD: readonly Bracket[] = [
  [5_000, 2_500],
  [10_000, 4_500],
  [20_000, 8_000],
  [30_000, 13_000],
  [35_000, 13_750],
  [40_000, 14_500],
  [45_000, 17_500],
  [50_000, 18_500],
  [55_000, 20_500],
  [60_000, 21_000],
  [70_000, 24_000],
  [80_000, 27_000],
  [90_000, 29_500],
  [100_000, 32_000],
  [120_000, 37_500],
  [130_000, 39_500],
  [140_000, 41_000],
  [150_000, 43_000],
  [160_000, 44_500],
  [170_000, 46_500],
  [180_000, 48_500],
  [200_000, 51_000],
  [240_000, 53_500],
  [250_000, 57_000],
  [300_000, 61_000],
  [350_000, 65_500],
  [400_000, 70_500],
  [450_000, 72_500],
  [500_000, 75_000],
  [550_000, 77_500],
  [600_000, 80_000],
  [650_000, 82_500],
  [700_000, 84_500],
  [750_000, 88_000],
  [800_000, 90_000],
  [850_000, 92_500],
  [1_000_000, 94_500],
  [1_500_000, 100_000],
] as const;
const IAA_STANDARD_PERCENT_ABOVE = 0.075;

/** IAA High Volume (= category A), and equally Copart secured/non-clean. */
const HIGH_VOLUME: readonly Bracket[] = [
  [10_000, 100],
  [20_000, 2_500],
  [30_000, 6_000],
  [35_000, 8_500],
  [40_000, 10_000],
  [45_000, 12_500],
  [50_000, 13_500],
  [55_000, 14_500],
  [60_000, 15_500],
  [70_000, 17_000],
  [80_000, 19_500],
  [90_000, 21_500],
  [100_000, 23_000],
  [120_000, 25_000],
  [130_000, 27_000],
  [140_000, 28_500],
  [150_000, 30_000],
  [160_000, 31_500],
  [170_000, 33_000],
  [180_000, 35_000],
  [200_000, 37_000],
  [240_000, 39_000],
  [250_000, 42_500],
  [300_000, 46_000],
  [350_000, 50_500],
  [400_000, 55_500],
  [450_000, 60_000],
  [500_000, 62_500],
  [550_000, 65_000],
  [600_000, 67_500],
  [650_000, 70_000],
  [700_000, 72_000],
  [750_000, 75_500],
  [800_000, 77_500],
  [850_000, 80_000],
  [1_000_000, 82_000],
  [1_150_000, 85_000],
  [1_200_000, 86_000],
  [1_250_000, 87_500],
  [1_500_000, 89_000],
] as const;
const HIGH_VOLUME_PERCENT_ABOVE = 0.06;

/**
 * Copart "Secured Payment Methods — Clean Title", owner's screenshots
 * 2026-08-20. CHEAPER than non-clean nearly everywhere, with long plateaus
 * ($625 across 4,500–5,999.99, $675 across 6,000–7,499.99, $720 across
 * 10,000–14,999.99) and 5.75% above $15,000 — and it retroactively explains
 * the Mercedes receipt: its $625 buyer fee at a $5,400 hammer is EXACTLY
 * this table's row, not a negotiated discount.
 */
const COPART_CLEAN: readonly Bracket[] = [
  [10_000, 100],
  [20_000, 2_500],
  [30_000, 5_000],
  [40_000, 7_500],
  [50_000, 11_000],
  [55_000, 12_500],
  [60_000, 13_000],
  [70_000, 14_000],
  [80_000, 15_500],
  [90_000, 17_000],
  [100_000, 18_500],
  [120_000, 20_000],
  [130_000, 22_500],
  [140_000, 24_000],
  [150_000, 25_000],
  [160_000, 26_000],
  [170_000, 27_500],
  [180_000, 28_500],
  [200_000, 30_000],
  [240_000, 32_500],
  [250_000, 33_500],
  [300_000, 35_000],
  [350_000, 40_000],
  [400_000, 45_500],
  [450_000, 60_000],
  [500_000, 62_500],
  [600_000, 62_500],
  [650_000, 67_500],
  [750_000, 67_500],
  [800_000, 69_000],
  [1_000_000, 71_500],
  [1_500_000, 72_000],
] as const;
const COPART_CLEAN_PERCENT_ABOVE = 0.0575;

/**
 * Internet bidding fee. One table because both houses publish the same
 * numbers, bracket for bracket — verified against both pages, not assumed
 * from one.
 */
const BID_FEE: Record<BidMode, readonly Bracket[]> = {
  prebid: [
    [10_000, 0],
    [50_000, 4_000],
    [100_000, 5_500],
    [150_000, 7_500],
    [200_000, 8_500],
    [400_000, 10_000],
    [600_000, 11_000],
    [800_000, 12_500],
  ],
  live: [
    [10_000, 0],
    [50_000, 5_000],
    [100_000, 6_500],
    [150_000, 8_500],
    [200_000, 9_500],
    [400_000, 11_000],
    [600_000, 12_500],
    [800_000, 14_500],
  ],
};
const BID_FEE_TOP: Record<BidMode, number> = { prebid: 14_000, live: 16_000 };

export interface FixedFee {
  /** A stable key the UI translates; never shown raw to a client. */
  key: "gate" | "service" | "environmental" | "title";
  cents: number;
}

/**
 * The flat per-unit charges. Copart's gate fee covers what IAA splits into
 * its service fee — different names, same "getting the car to the loading
 * area" money. Title at $20: Copart's FedEx-mailing rate, which is the one
 * an exporter actually uses (the $15 USPS option exists; quoting the higher
 * of the two is the safe direction).
 */
export function fixedAuctionFees(house: AuctionHouse): FixedFee[] {
  if (house === "copart") {
    return [
      { key: "gate", cents: 9_500 },
      { key: "environmental", cents: 1_500 },
      { key: "title", cents: 2_000 },
    ];
  }
  return [
    { key: "service", cents: 10_500 },
    { key: "environmental", cents: 1_500 },
    { key: "title", cents: 2_000 },
  ];
}

function fromBrackets(
  brackets: readonly Bracket[],
  percentAbove: number,
  salePriceCents: number
): number {
  for (const [upTo, fee] of brackets) {
    if (salePriceCents < upTo) return fee;
  }
  return Math.round(salePriceCents * percentAbove);
}

/**
 * The buyer fee. The two houses split their schedules along DIFFERENT axes:
 * IAA by purchase volume (Standard/High ↔ BidManager's C/A), Copart by the
 * car's TITLE — their published secured-payment page has a Clean and a
 * Non-Clean column and no volume split at all. So `tier` steers IAA only,
 * and `cleanTitle` steers Copart only; passing both is always safe.
 *
 * An earlier version returned null for "Copart standard" while that page
 * was thought to be volume-tiered like IAA's. The clean-title capture of
 * 2026-08-20 dissolved the question — there is nothing left to refuse.
 */
export function buyerFeeCents(
  house: AuctionHouse,
  tier: BuyerFeeTier,
  salePriceCents: number,
  cleanTitle = false
): number {
  if (salePriceCents <= 0) return 0;
  if (house === "copart") {
    return cleanTitle
      ? fromBrackets(COPART_CLEAN, COPART_CLEAN_PERCENT_ABOVE, salePriceCents)
      : fromBrackets(HIGH_VOLUME, HIGH_VOLUME_PERCENT_ABOVE, salePriceCents);
  }
  return tier === "highVolume"
    ? fromBrackets(HIGH_VOLUME, HIGH_VOLUME_PERCENT_ABOVE, salePriceCents)
    : fromBrackets(IAA_STANDARD, IAA_STANDARD_PERCENT_ABOVE, salePriceCents);
}

export function bidFeeCents(mode: BidMode, salePriceCents: number): number {
  if (salePriceCents <= 0) return 0;
  for (const [upTo, fee] of BID_FEE[mode]) {
    if (salePriceCents < upTo) return fee;
  }
  return BID_FEE_TOP[mode];
}

export interface EstimateInput {
  house: AuctionHouse;
  tier: BuyerFeeTier;
  mode: BidMode;
  salePriceCents: number;
  /** Copart prices clean-title cars from their own (cheaper) column. Derive
   * from the lot's `titleClass === "clean"`, never ask a human to remember. */
  cleanTitle?: boolean;
}

export interface AuctionFeeEstimate {
  buyerFeeCents: number;
  bidFeeCents: number;
  fixed: FixedFee[];
  totalCents: number;
}

/**
 * Everything the auction will add to the hammer.
 *
 * This is the number for the bid dialog's consequence line and for the
 * calculator's auction-fee row — the two places that must agree with each
 * other, which is the whole reason this is one module.
 */
export function estimateAuctionFees(input: EstimateInput): AuctionFeeEstimate {
  const buyer = buyerFeeCents(
    input.house,
    input.tier,
    input.salePriceCents,
    input.cleanTitle ?? false
  );

  const bid = bidFeeCents(input.mode, input.salePriceCents);
  const fixed = fixedAuctionFees(input.house);
  const fixedTotal = fixed.reduce((sum, fee) => sum + fee.cents, 0);

  return {
    buyerFeeCents: buyer,
    bidFeeCents: bid,
    fixed,
    totalCents: buyer + bid + fixedTotal,
  };
}
