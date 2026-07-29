/**
 * Server-only client for the Apibara Copart & IAAI Auction Data API
 * (https://apibara.tech). This is an unofficial third-party aggregator, not
 * a Copart/IAAI product - see the AmberAutoBid project memory for the ToS
 * and business-risk context behind why we're using it as a bridge until
 * SmartAutoBid has its own dealer's license.
 *
 * The live response shapes below were captured by calling the real API
 * directly (not just read from Apibara's published OpenAPI schema, which
 * turned out to disagree with reality for /related and /history - both
 * return a nested object, not the flat array the schema advertises). Fields
 * under `details` are an undocumented raw pass-through of the source
 * auction site's own internal API and were only verified against one live
 * IAAI lot - treat them as best-effort and always optional.
 */

const BASE_URL = "https://apibara.tech/api/v1/vehicle-auction";

// Apibara's own docs say underlying listing data only refreshes ~every 30
// min, so caching identical requests for 10 min loses effectively no
// freshness. This uses Next's built-in Data Cache (`next.revalidate`), which
// - unlike a hand-rolled in-memory Map - is shared across concurrent
// visitors and persists across separate serverless invocations. That's the
// difference that matters for quota: an in-memory Map only protects repeat
// calls from the *same* warm server instance, so on Vercel it barely helped;
// this makes ANY two visitors (or a crawler re-hitting the same URL, or the
// same page's generateMetadata + body both requesting the same vehicle)
// share one real API call instead of paying for it twice.
const REVALIDATE_SECONDS = 600;

function apiKey(): string {
  const key = process.env.APIBARA_API_KEY;
  if (!key) {
    throw new Error(
      "APIBARA_API_KEY is not set. Add it to .env.local (see .env.example)."
    );
  }
  return key;
}

async function apibaraGet<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<T> {
  const url = new URL(BASE_URL + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, {
    headers: { "X-API-Key": apiKey() },
    next: { revalidate: REVALIDATE_SECONDS },
  });

  if (!res.ok) {
    throw new Error(`Apibara request failed (${res.status}): ${path}`);
  }

  return (await res.json()) as T;
}

export type AuctionPlatform = "copart" | "iaai";

export interface VehicleListItem {
  platform: AuctionPlatform;
  lot_number: string;
  vin: string;
  title: string;
  year: number;
  make: string;
  model: string;
  type?: string | null;
  auction?: {
    state?: string;
    auction_at?: string | null;
    /** ISO 8601 with offset - the one to compute a live countdown from. */
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
   * car out of the US and re-registering it - the two things a European
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
  // Raw, undocumented pass-through of the source site's own internal API.
  // VERIFIED 2026-07-29 against live lots on both platforms: IAAI returns all
  // six keys below populated; Copart returns an empty object. Everything read
  // out of here must therefore degrade to "row simply not shown", never to a
  // dash or a zero that would read as a real value.
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
  lot_status?: "All" | "Timed" | "Buy Now";
  cursor?: string;
  per_page?: number;
  [key: string]: string | number | boolean | undefined;
}

export interface VehicleSearchResponse {
  ok: boolean;
  data: VehicleListItem[];
  meta: { next_cursor: string | null; prev_cursor: string | null; per_page?: number };
}

export function searchVehicles(params: VehicleSearchParams) {
  return apibaraGet<VehicleSearchResponse>("/vehicles", params);
}

/**
 * Fans out across multiple `type` values and merges the results - needed
 * because a single request can only filter by one `type`, but a vehicle
 * category (see CATEGORY_TYPE_GROUPS in searchQuery.ts) covers several.
 * There's no reliable single cursor across merged streams, so pagination is
 * intentionally dropped for this path (next_cursor/prev_cursor come back
 * null) - acceptable for a broad "just the make, no model" browse, which is
 * already a coarser action than a specific make+model search.
 */
export async function searchVehiclesAcrossTypes(
  params: VehicleSearchParams,
  typeValues: string[]
): Promise<VehicleSearchResponse> {
  const perType = Math.max(4, Math.ceil((params.per_page ?? 20) / typeValues.length));
  const results = await Promise.all(
    typeValues.map((type) =>
      searchVehicles({ ...params, type, per_page: perType }).catch(
        (): VehicleSearchResponse => ({
          ok: true,
          data: [],
          meta: { next_cursor: null, prev_cursor: null },
        })
      )
    )
  );

  return {
    ok: true,
    data: results.flatMap((r) => r.data).slice(0, params.per_page ?? 20),
    meta: { next_cursor: null, prev_cursor: null },
  };
}

export interface VehicleDetailResponse {
  ok: boolean;
  data: VehicleListItem & { slug_vin?: string };
}

export function getVehicleDetail(vinOrLot: string) {
  return apibaraGet<VehicleDetailResponse>(`/vehicles/${encodeURIComponent(vinOrLot)}`);
}

export interface RelatedVehiclesResponse {
  ok: boolean;
  data: {
    source: VehicleListItem;
    past: VehicleListItem[];
    upcoming: VehicleListItem[];
  };
}

export function getRelatedVehicles(vinOrLot: string) {
  return apibaraGet<RelatedVehiclesResponse>(
    `/vehicles/${encodeURIComponent(vinOrLot)}/related`
  );
}

export interface SoldPriceStats {
  min: number;
  max: number;
  avg: number;
  sampleSize: number;
}

/**
 * Two comparables can't describe a market. A single $50 scrap sale rendered
 * as "lowest / average / highest = $50" reads like a valuation and would
 * badly mislead someone deciding what to bid, so the stats are withheld
 * below this many real sales rather than shown with a caveat.
 */
export const MIN_COMPARABLE_SAMPLE = 3;

/** Computed client-side from real comparable past sales - Apibara has no
 * single "market value range" field, unlike the repair-cost/ACV numbers
 * below which do come straight from the source. */
export function computeSoldPriceStats(past: VehicleListItem[]): SoldPriceStats | null {
  const sold = past
    .map((v) => v.pricing?.last_sold_price_usd)
    .filter((n): n is number => typeof n === "number" && n > 0);
  if (sold.length < MIN_COMPARABLE_SAMPLE) return null;
  const min = Math.min(...sold);
  const max = Math.max(...sold);
  const avg = Math.round(sold.reduce((a, b) => a + b, 0) / sold.length);
  return { min, max, avg, sampleSize: sold.length };
}

export interface IaaiValuation {
  estimatedRepairCostUsd: number | null;
  actualCashValueUsd: number | null;
}

/** Reads a raw pass-through field as a plain string, treating the API's many
 * "False"/""/null empties as absent. Every raw value arrives as a string
 * regardless of its real type. */
function rawStr(source: Record<string, unknown> | undefined, key: string): string | null {
  const value = source?.[key];
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Parses a raw money field like "$3,250 USD" or "3250" into a number. */
function rawUsd(source: Record<string, unknown> | undefined, key: string): number | null {
  const value = source?.[key];
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Only verified against IAAI-sourced lots. Copart's equivalent raw field
 * names haven't been confirmed yet (it sends no `details` at all), so this
 * returns null rather than guessing. */
export function extractIaaiValuation(vehicle: VehicleListItem): IaaiValuation | null {
  const attrs = vehicle.details?.attributes;
  const saleInfo = vehicle.details?.sale_information;
  if (!attrs && !saleInfo) return null;

  // The same repair estimate appears under two different names depending on
  // which sub-object the source populated, so fall back rather than miss it.
  const estimatedRepairCostUsd =
    rawUsd(attrs, "EstRepairCost") ?? rawUsd(saleInfo, "EstimatedRepairCost");
  const actualCashValueUsd =
    rawUsd(saleInfo, "ActualCashValue") ?? rawUsd(attrs, "ProviderACV");

  if (estimatedRepairCostUsd == null && actualCashValueUsd == null) return null;
  return { estimatedRepairCostUsd, actualCashValueUsd };
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
  /** e.g. "NOT ACTUAL" / "EXEMPT" - qualifies whether the mileage is trusted. */
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

/**
 * Pulls the extra spec rows out of the undocumented raw pass-through. Returns
 * null when there's nothing there at all, which is the normal case for every
 * Copart lot - callers should skip the whole section rather than render empty
 * rows.
 */
export function extractLotDeepSpecs(vehicle: VehicleListItem): LotDeepSpecs | null {
  const attrs = vehicle.details?.attributes;
  const description = vehicle.details?.vehicle_description;
  const saleInfo = vehicle.details?.sale_information;
  if (!attrs && !description) return null;

  const city = rawStr(attrs, "City");
  const state = rawStr(attrs, "State");
  const street = rawStr(attrs, "Address");
  const branchAddress = street && city && state ? `${street}, ${city}, ${state}` : null;

  const specs: LotDeepSpecs = {
    cylinders: rawStr(description, "Cylinders") ?? rawStr(attrs, "CylindersDesc"),
    countryOfOrigin: rawStr(description, "ManufacturedIn") ?? rawStr(attrs, "CountryOfOrigin"),
    interiorColor: rawStr(attrs, "InteriorColor"),
    options: rawStr(description, "Options"),
    vehicleClass: rawStr(description, "VehicleClass") ?? rawStr(attrs, "VehicleClass"),
    series: rawStr(description, "Series") ?? rawStr(attrs, "Series"),
    vehicleGrade: rawStr(description, "VehicleScore") ?? rawStr(attrs, "VehicleGrade"),
    catalyticConverter: rawStr(attrs, "CatalyticConverter"),
    navigation: rawStr(attrs, "Navigation"),
    hasKeyFob: rawStr(attrs, "KeyFOB") === "True",
    odometerBrand: rawStr(attrs, "ODOBrand"),
    titleState: rawStr(attrs, "TitleStateName") ?? rawStr(attrs, "TitleState"),
    titleBrand: rawStr(attrs, "TitleBrand") ?? rawStr(saleInfo, "Brand"),
    startsDescription: rawStr(attrs, "StartsDesc"),
    lossType: rawStr(attrs, "LossTypeDesc"),
    bidIncrementUsd:
      typeof vehicle.details?.bid_increment === "number" ? vehicle.details.bid_increment : null,
    branchPhone: rawStr(attrs, "Phone"),
    branchAddress,
  };

  const hasAnything = Object.values(specs).some(
    (v) => v !== null && v !== false && v !== ""
  );
  return hasAnything ? specs : null;
}

export interface LotMediaExtras {
  /** Engine-start clip, when the auction house recorded one. */
  engineVideoUrl: string | null;
  /** External 360° walkaround viewer. */
  view360Url: string | null;
}

export function extractMediaExtras(vehicle: VehicleListItem): LotMediaExtras {
  const engineVideoUrl =
    vehicle.media?.items?.find((i) => i.type === "video" && i.url)?.url ?? null;
  const view360Url =
    (typeof vehicle.details?.attributes?.Link360 === "string" &&
      vehicle.details.attributes.Link360.trim()) ||
    null;
  return { engineVideoUrl, view360Url };
}

/**
 * Whether the car was built in the USA - decides if the 2026 EU-US trade
 * deal's 0% duty applies (see PORT_CUSTOMS in costEstimate.ts). Returns null
 * when the source didn't say, so callers can fall back to the conservative
 * "assume duty applies" rather than silently claiming a waiver.
 */
export function isUsaManufactured(vehicle: VehicleListItem): boolean | null {
  const origin =
    rawStr(vehicle.details?.vehicle_description, "ManufacturedIn") ??
    rawStr(vehicle.details?.attributes, "CountryOfOrigin");
  if (!origin) return null;
  return /^(usa|united states)/i.test(origin);
}
