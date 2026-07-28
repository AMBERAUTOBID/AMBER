/**
 * Standalone Apibara client for the Telegram bot script. Deliberately
 * separate from src/lib/apibara.ts (which is Next.js-only - it uses
 * `next: { revalidate }`, a caching option only the Next.js runtime
 * understands) since this runs outside Next entirely, via a plain `tsx`
 * process in a GitHub Actions workflow. No caching here on purpose: the
 * script runs once, does its work, and exits - there's nothing to reuse a
 * cache across.
 */

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

export type AuctionPlatform = "copart" | "iaai";

// Subset of the fields the search list endpoint returns - just what the
// bot needs to filter and format a post. See src/lib/apibara.ts for the
// fuller, verified shape shared with the website.
export interface VehicleListItem {
  platform: AuctionPlatform;
  lot_number: string;
  vin: string;
  title: string;
  year: number;
  make: string;
  model: string;
  auction?: { state?: string; auction_at?: string | null; formatted?: string };
  pricing?: { current_bid_usd?: number | null; buy_now_usd?: number | null };
  location?: { display?: string };
  seller?: { name?: string; type?: string };
  condition?: {
    run_condition?: { label?: string };
    has_key?: boolean | null;
    primary_damage?: string | null;
    secondary_damage?: string | null;
  };
  odometer?: { mi?: number | null };
  vehicle_specs?: {
    exterior_color?: string;
    transmission?: string;
    fuel_type?: string;
    drive_type?: string;
    body_style?: string;
  };
  sale_document?: { name?: string };
  media?: {
    items?: { type: string; thumb?: string; large?: string }[];
  };
}

export interface SearchVehiclesParams {
  platform?: AuctionPlatform;
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
