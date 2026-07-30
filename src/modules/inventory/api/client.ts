/**
 * Server-only HTTP client for the Apibara auction-data API.
 *
 * This file is the *only* part of the integration that depends on Next — it
 * caches through Next's Data Cache. Types live in ./types and pure readers in
 * ./lotFields precisely so the Telegram bot, which runs outside Next, can
 * share those without inheriting a caching option its runtime doesn't
 * understand.
 */
import type {
  RelatedVehiclesResponse,
  VehicleDetailResponse,
  VehicleSearchParams,
  VehicleSearchResponse,
} from "./types";

const BASE_URL = "https://apibara.tech/api/v1/vehicle-auction";

// Apibara's own docs say underlying listing data only refreshes ~every 30
// min, so caching identical requests for 10 min loses effectively no
// freshness. Next's Data Cache — unlike a hand-rolled in-memory Map — is
// shared across concurrent visitors and persists across separate serverless
// invocations. That's the difference that matters for quota: an in-memory Map
// only protects repeat calls from the *same* warm server instance, so on
// Vercel it barely helped; this makes ANY two visitors (or a crawler
// re-hitting the same URL, or the same page's generateMetadata and body both
// requesting the same vehicle) share one real API call instead of paying for
// it twice.
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

export function searchVehicles(params: VehicleSearchParams) {
  return apibaraGet<VehicleSearchResponse>("/vehicles", params);
}

/**
 * Fans out across multiple `type` values and merges the results — needed
 * because a single request can only filter by one `type`, but a vehicle
 * category (see CATEGORY_TYPE_GROUPS in ../model/searchQuery) covers several.
 * There's no reliable single cursor across merged streams, so pagination is
 * intentionally dropped for this path (next_cursor/prev_cursor come back
 * null) — acceptable for a broad "just the make, no model" browse, which is
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

/** Resolves both VINs and lot numbers, and keeps working after a sale — which
 * is what makes archived-lot lookup possible at all, given the search endpoint
 * returns live lots only. */
export function getVehicleDetail(vinOrLot: string) {
  return apibaraGet<VehicleDetailResponse>(`/vehicles/${encodeURIComponent(vinOrLot)}`);
}

export function getRelatedVehicles(vinOrLot: string) {
  return apibaraGet<RelatedVehiclesResponse>(
    `/vehicles/${encodeURIComponent(vinOrLot)}/related`
  );
}
