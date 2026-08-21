/**
 * Response shapes for the Apibara Copart & IAAI Auction Data API
 * (https://apibara.tech) — an unofficial third-party aggregator, not a
 * Copart/IAAI product.
 *
 * These shapes were captured by calling the real API, not read from Apibara's
 * published OpenAPI schema, which disagrees with reality for /related and
 * /history (both return a nested object, not the flat array the schema
 * advertises). Fields under `details` are an undocumented raw pass-through of
 * the source auction site's own internal API — treat them as best-effort and
 * always optional.
 *
 * DELIBERATELY FREE OF `next/*` IMPORTS. This file is the shared seam between
 * the website (which fetches through Next's Data Cache) and the Telegram bot
 * (which runs under plain tsx in GitHub Actions). Both previously declared
 * their own copy of VehicleListItem, the bot's being a narrower subset — so a
 * renamed upstream field would have broken one of them silently, with no
 * compile error to catch it. Keep types here; keep fetching elsewhere.
 */

export type AuctionPlatform = "copart" | "iaai";

/**
 * Confirmed against the live /vehicles/filters endpoint, which advertises
 * lot_status as All | "Buy Now" | Timed (and a separate lot_sub_status of
 * Open | Live | Ended, defaulting to Open — i.e. we already only ever see
 * lots that are still biddable).
 *
 * MEASURED GOTCHA: `"Timed"` is IAAI-only — Copart returns literally zero
 * results for it. A "live lots" feed must therefore use "All" plus a
 * client-side "has no buy_now_usd" filter, never "Timed", which silently
 * makes the feed IAAI-only. `"Buy Now"` is exact on both platforms.
 */
export type LotStatus = "All" | "Buy Now" | "Timed";

export interface VehicleListItem {
  platform: AuctionPlatform;
  lot_number: string;
  vin: string;
  title: string;
  year: number;
  make: string;
  model: string;
  type?: string | null;
  /**
   * MEASURED GOTCHA: in a *list* response these fields are batch-stamped, not
   * per-lot — every row in a 20-row page carried an identical `diff_minutes`
   * and `state: "open"`, including a lot whose detail endpoint reported
   * `state: "finished"` 147 days earlier. Already-sold cars therefore appear
   * in search results labelled live, and only the detail endpoint knows the
   * truth. Trust these fields on a detail response; don't on a list one.
   */
  auction?: {
    state?: string;
    auction_at?: string | null;
    /** ISO 8601 with offset — the one to compute a live countdown from. */
    full_date?: string | null;
    formatted?: string;
    /** Minutes until the sale; negative once it's in the past. */
    diff_minutes?: number | null;
    countdown?: { days?: number; hours?: number; minutes?: number };
    is_timed?: boolean;
    is_buy_now?: boolean;
    last_sold_day?: string | null;
    last_sold_status?: string | null;
  };
  pricing?: {
    /** MEASURED GOTCHA: Copart lots are often null here before bidding opens.
     * Running a cost estimate on that as if it were $0 once produced a real
     * post advertising a 2022 BMW landed in Klaipėda for €1,656. Suppress the
     * estimate rather than treating absent as zero. */
    current_bid_usd?: number | null;
    buy_now_usd?: number | null;
    last_sold_price_usd?: number | null;
    estimated_cost?: { from?: number; to?: number; text?: string };
  };
  /** ⚠️ `send_from` is NOT auction data — it is the AGGREGATOR'S own
   * export-routing note (they run a shipping business). Verified 2026-08-21 on
   * lot 45501928: iaai.com shows no port, their API says "Norfolk". Do not
   * present it to visitors as a fact about the lot. */
  location?: { display?: string; send_from?: string | null; state?: string | null };
  seller?: { name?: string; type?: string };
  condition?: {
    run_condition?: { value?: string; label?: string };
    has_key?: boolean | null;
    loss?: string | null;
    primary_damage?: string | null;
    secondary_damage?: string | null;
  };
  odometer?: { mi?: number | null; km?: number | null };
  vehicle_specs?: {
    exterior_color?: string;
    engine?: { raw?: string; size_l?: string; hp?: number | null; layout?: string | null };
    transmission?: string;
    fuel_type?: string;
    drive_type?: string;
    body_style?: string | null;
    airbags?: string | null;
    restraint_system?: string | null;
  };
  /** `export`/`registration` say whether the paperwork allows shipping the
   * car out of the US and re-registering it — the two things a European
   * buyer needs to know before bidding. */
  sale_document?: {
    name?: string;
    type?: string;
    export?: boolean;
    registration?: boolean;
    is_pending?: boolean;
  };
  media?: {
    thumbs_count?: number;
    has_video?: boolean;
    has_360?: boolean;
    thumbs?: string[];
    items?: { type: string; thumb?: string; large?: string; full?: string; url?: string }[];
  };
  /**
   * Raw, undocumented pass-through of the source site's own internal API.
   * VERIFIED against live lots on both platforms: IAAI returns all six keys
   * below populated; Copart returns an empty object. Everything read out of
   * here must therefore degrade to "row simply not shown", never to a dash or
   * a zero that would read as a real value.
   */
  details?: {
    attributes?: Record<string, unknown>;
    vehicle_information?: Record<string, unknown>;
    vehicle_description?: Record<string, unknown>;
    sale_information?: Record<string, unknown>;
    auction_information?: Record<string, unknown>;
    bid_increment?: number | null;
  };
}

export interface VehicleSearchParams {
  s?: string;
  platform?: AuctionPlatform;
  type?: string;
  make?: string;
  model?: string;
  /**
   * Current bid, in whole currency units.
   *
   * DELIBERATELY NOT ONE GENERIC "price". Only 25.4% of searchable lots carry a
   * current bid and 37.0% a buy-now price, so a single combined filter would
   * silently hide most of the catalogue — the same trap as `vehicle_type`, which
   * covers 9.3% and would have hidden 90% of inventory had it driven the
   * category tabs. Two explicit ranges instead, matching the two figures the lot
   * card already shows, so a visitor filters on a number they can see.
   *
   * A lot with no bid is excluded when this is set: we cannot claim an unknown
   * price falls in the requested range.
   */
  price_min?: number;
  price_max?: number;
  buy_now_min?: number;
  buy_now_max?: number;

  /**
   * Estimated US retail value, in whole currency units. **This is the range the
   * search widget actually exposes**, and the reason is coverage.
   *
   * MEASURED over the 132,711 upcoming lots: a current bid exists on 34.6% and a
   * buy-now price on 37.2%, but an estimated retail value on **88.0%**. Bids do
   * not fill in as the sale approaches either — lots selling within four days
   * carry one only 36.1% of the time — so no amount of sweeping more often fixes
   * it.
   *
   * The current bid is also not a price. Its median across upcoming lots is
   * **$225**: an opening bid on a salvage car that will sell for thousands. A
   * visitor asking for "up to $1,000" would be shown cars that go for $8,000,
   * which is worse than showing nothing.
   *
   * bidauto.online exposes this same field as "Price New" and it is populated on
   * about 6.9% of their catalogue — setting their filter to $1–$500,000, a range
   * containing every possible value, drops their result count from 595,081 to
   * 41,104. The idea is right and their data is not there. Ours is.
   *
   * It is an estimate of what the car is worth retail, NOT what it will cost, and
   * the label has to say so. The 12% without one are excluded when this is set,
   * for the same reason as above: an unknown value cannot be claimed to fall in
   * the requested range.
   */
  retail_min?: number;
  retail_max?: number;
  year_from?: number;
  year_to?: number;
  odometer_from?: number;
  odometer_to?: number;
  /** Engine displacement in cc — 2.0L is 2000. Integers, because a range filter
   * comparing floats drops boundary matches. 92.5% populated. */
  engine_from?: number;
  engine_to?: number;
  /** ISO instants bounding the auction date. 100% populated; the catalogue
   * currently spans about three weeks ahead. */
  sale_date_from?: string;
  sale_date_to?: string;

  /**
   * The categorical filters, each a comma-separated list of normalised class
   * values — `fuel=gasoline,diesel`. Multi-select is the point: a buyer willing
   * to accept a clean OR a rebuildable title must be able to say so.
   *
   * An unrecognised value matches nothing rather than being dropped. Returning
   * zero for `fuel=banana` is honest; ignoring the filter and showing petrol
   * cars is not.
   */
  /** Category classes — `automobile,truck`. Distinct from `type`/`category`,
   * which drive the Apibara-compatible fan-out; this filters our own column
   * directly and is what the facet panel toggles. */
  vehicle_class?: string;
  fuel?: string;
  drive?: string;
  body_type?: string;
  title?: string;
  color?: string;
  transmission?: string;
  /** Primary damage classes. */
  damage?: string;
  secondary_damage?: string;
  /** Run condition: run_and_drive | starts | stationary. */
  run_cond?: string;
  /** Cylinder counts, e.g. `4,6,8`. */
  cylinders?: string;
  /** `insurance` | `non_insurance`. Only 62.9% populated, so this narrows hard
   * and the UI should say so. */
  seller?: string;
  /** `yes` | `no`. 100% populated. */
  keys?: string;
  /** Copart's cosmetic-preparation flag. NOT a run condition and never a promise
   * the work happened — see `isEnhanced` in lotNormalize. */
  enhanced?: boolean;

  lot_status?: LotStatus;
  /**
   * An explicit result order — one of `EXPLICIT_SORTS` in `postgresSource`, or
   * absent for the default (soonest sale first, biddable lots ahead).
   *
   * Only the postgres source honours it: Apibara's API accepts no ordering, so
   * there the page simply never offers the control — same contract as facets.
   */
  sort?: string;
  cursor?: string;
  per_page?: number;
  [key: string]: string | number | boolean | undefined;
}

export interface VehicleSearchResponse {
  ok: boolean;
  data: VehicleListItem[];
  meta: {
    next_cursor: string | null;
    prev_cursor: string | null;
    per_page?: number;
    /**
     * Total matching lots.
     *
     * OPTIONAL because Apibara cannot supply it — its `meta` carries only the two
     * cursors and a page size, which is why a "Search Results (256,934)" counter
     * was impossible while search ran on the aggregator. The local mirror answers
     * it with a COUNT, so the field is present there and absent here. Callers must
     * treat undefined as "unknown", never as zero.
     */
    total?: number;
  };
}

export interface VehicleDetailResponse {
  ok: boolean;
  data: VehicleListItem & {
    slug_vin?: string;
    /**
     * Set ONLY when this lot was served from our own mirror because the upstream
     * aggregator was unreachable. Carries the moment the row was last confirmed
     * live, so the page can say "as of ..." instead of presenting stale data as
     * current.
     *
     * Absent on every normal response, which is what makes it safe: the banner
     * cannot appear while upstream is healthy. A visitor must never be shown a
     * bid or an auction time from a stale row without being told.
     */
    mirror_as_of?: string;
  };
}

/**
 * Real comparable sales for a lot. A nested object, NOT the flat array the
 * OpenAPI schema advertises.
 *
 * MEASURED GOTCHA on `past`: it is matched at make/model level only, so a
 * 2010 Civic VP, a 2014 EX and a 2020 Sport Touring all receive the identical
 * twelve sales spanning 2010–2026 — mixing a burnt shell sold at $150 with a
 * clean 2024 at $17,000. A raw average over that is a confident-looking number
 * that means nothing. Roughly a third of entries also carry
 * `last_sold_price_usd: 0`, meaning "no sale recorded", and some models return
 * an empty `past` entirely. Filter before quoting.
 */
export interface RelatedVehiclesResponse {
  ok: boolean;
  data: {
    source: VehicleListItem;
    past: VehicleListItem[];
    upcoming: VehicleListItem[];
  };
}

export interface SoldPriceStats {
  min: number;
  max: number;
  avg: number;
  sampleSize: number;
}

export interface IaaiValuation {
  estimatedRepairCostUsd: number | null;
  actualCashValueUsd: number | null;
}

export interface LotDeepSpecs {
  cylinders: string | null;
  countryOfOrigin: string | null;
  interiorColor: string | null;
  options: string | null;
  vehicleClass: string | null;
  series: string | null;
  /** IAAI's own 0-100 condition score for the lot. */
  vehicleGrade: string | null;
  catalyticConverter: string | null;
  navigation: string | null;
  hasKeyFob: boolean;
  /** e.g. "NOT ACTUAL" / "EXEMPT" — qualifies whether the mileage is trusted. */
  odometerBrand: string | null;
  titleState: string | null;
  titleBrand: string | null;
  startsDescription: string | null;
  lossType: string | null;
  /** Minimum step between bids at this auction, in USD. */
  bidIncrementUsd: number | null;
  branchPhone: string | null;
  branchAddress: string | null;
}

export interface LotMediaExtras {
  /** Engine-start clip, when the auction house recorded one. */
  engineVideoUrl: string | null;
  /** External 360° walkaround viewer. */
  view360Url: string | null;
}
