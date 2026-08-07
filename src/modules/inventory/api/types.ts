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
  /** `send_from` is the US departure port the auction branch feeds into. */
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
  price_min?: number;
  price_max?: number;
  year_from?: number;
  year_to?: number;
  odometer_from?: number;
  odometer_to?: number;
  run_cond?: string;
  damage?: string;
  lot_status?: LotStatus;
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
  data: VehicleListItem & { slug_vin?: string };
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
