/**
 * Apibara fetch client for the Telegram bot.
 *
 * Only the *transport* is separate from the website's client
 * (src/modules/inventory/api/client.ts). That one caches with
 * `next: { revalidate }`, an option only the Next runtime understands, and
 * this script runs outside Next entirely — a plain `tsx` process in a GitHub
 * Actions workflow. No caching here on purpose: the script runs once, does its
 * work, and exits, so there is nothing to reuse a cache across.
 *
 * The response *types* are NOT duplicated. They used to be — this file
 * declared its own narrower VehicleListItem, so a renamed upstream field would
 * have broken the bot or the website silently, with no compile error to catch
 * it. They now come from the shared, runtime-agnostic module.
 */
import type {
  AuctionPlatform,
  LotStatus,
  RelatedVehiclesResponse,
  VehicleListItem,
} from "../../src/modules/inventory/api/types";

// Re-exported so the bot's own modules can keep importing these from here
// rather than each reaching across into src/ separately.
export type { AuctionPlatform, LotStatus, RelatedVehiclesResponse, VehicleListItem };

const BASE_URL = "https://apibara.tech/api/v1/vehicle-auction";

function apiKey(): string {
  const key = process.env.APIBARA_API_KEY;
  if (!key) throw new Error("APIBARA_API_KEY is not set (expected as a GitHub Actions secret).");
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
  const res = await fetch(url, { headers: { "X-API-Key": apiKey() } });
  if (!res.ok) {
    throw new Error(`Apibara request failed (${res.status}): ${path}`);
  }
  return (await res.json()) as T;
}

/** See the caveats on RelatedVehiclesResponse in the shared types: `past` is
 * matched at make/model level only, so it must be filtered for comparability
 * before anything is quoted from it (marketStats.ts does that). */
export async function getRelatedVehicles(vinOrLot: string): Promise<RelatedVehiclesResponse> {
  return apibaraGet(`/vehicles/${encodeURIComponent(vinOrLot)}/related`);
}

/**
 * The bot's own query surface. Deliberately not the website's
 * VehicleSearchParams: the bot filters on fields the site's search UI doesn't
 * expose (damage, has_key, seller_type) and doesn't paginate.
 */
export interface SearchVehiclesParams {
  platform?: AuctionPlatform;
  lot_status?: LotStatus;
  make?: string;
  model?: string;
  year_from?: number;
  year_to?: number;
  price_max?: number;
  odometer_to?: number;
  damage?: string[];
  run_cond?: string;
  has_key?: "No" | "All" | "With";
  seller_type?: "insurance" | "non_insurance" | "dealer" | "finance";
  per_page?: number;
}

export async function searchVehicles(
  params: SearchVehiclesParams
): Promise<{ ok: boolean; data: VehicleListItem[] }> {
  return apibaraGet("/vehicles", {
    platform: params.platform,
    lot_status: params.lot_status,
    make: params.make,
    model: params.model,
    year_from: params.year_from,
    year_to: params.year_to,
    price_max: params.price_max,
    odometer_to: params.odometer_to,
    // The API's array-style filters (damage, etc.) use repeated query keys
    // per its OpenAPI spec - URLSearchParams.set only keeps the last one,
    // so multi-value damage filtering is applied client-side in run.ts
    // instead (see matchesDamage there). Only the first value is sent
    // here as a coarse server-side pre-filter.
    damage: params.damage?.[0],
    run_cond: params.run_cond,
    has_key: params.has_key,
    seller_type: params.seller_type,
    per_page: params.per_page ?? 20,
  });
}
