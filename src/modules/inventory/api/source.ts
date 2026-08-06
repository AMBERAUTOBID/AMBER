/**
 * The seam between "what the site asks for" and "which system answers it".
 *
 * Today every lot the site shows is fetched from Apibara **once per page view**,
 * which makes their uptime our uptime — on 2026-08-06 they returned HTTP 500 for
 * over an hour and `/search` had nothing to render. The fix is to serve search
 * from our own Postgres copy so a vendor outage degrades to *stale data* rather
 * than a broken page.
 *
 * This interface is the whole point of that plan: it is the ONE place a second
 * implementation plugs in, so swapping the source is a config change rather than
 * a rewrite of every call site.
 *
 * IMPORTANT — Apibara stays the default, deliberately. The site must remain
 * launchable on it with no revert work if the migration is abandoned half-built.
 * `getAuctionSource()` therefore returns Apibara unless something explicitly and
 * validly asks otherwise, and an unrecognised value falls back rather than
 * throwing: a typo in an env var must never take search down.
 */
import type {
  RelatedVehiclesResponse,
  VehicleDetailResponse,
  VehicleSearchParams,
  VehicleSearchResponse,
} from "./types";
import { apibaraSource } from "./apibaraSource";

/**
 * Every way the site reads lot data. Deliberately shaped like the existing
 * Apibara functions so adopting it changes no behaviour — the Postgres
 * implementation has to satisfy these signatures, not the reverse.
 */
export interface AuctionSource {
  /** For logging and the shadow-compare harness; never shown to visitors. */
  readonly name: AuctionSourceName;

  searchVehicles(params: VehicleSearchParams): Promise<VehicleSearchResponse>;

  /**
   * A category spans several `type` values and Apibara accepts only one per
   * request, so its implementation fans out and merges. A SQL-backed source
   * will answer the same question with a single `type IN (...)` — which is
   * exactly why this belongs on the interface rather than being a helper
   * wrapped around `searchVehicles`.
   */
  searchVehiclesAcrossTypes(
    params: VehicleSearchParams,
    typeValues: string[]
  ): Promise<VehicleSearchResponse>;

  getVehicleDetail(vinOrLot: string): Promise<VehicleDetailResponse>;

  getRelatedVehicles(vinOrLot: string): Promise<RelatedVehiclesResponse>;
}

export type AuctionSourceName = "apibara" | "postgres";

/** Warn once per process, not once per request — a page renders many calls. */
let warnedAbout: string | null = null;

/**
 * Resolves the source for this request from `SEARCH_SOURCE`.
 *
 * Only `apibara` is implemented so far. `postgres` is named in the type because
 * it is the planned second implementation, but asking for it today falls back
 * with a warning — the flag becomes real when that source exists, and until then
 * setting it must not change what visitors see.
 */
export function getAuctionSource(): AuctionSource {
  const requested = process.env.SEARCH_SOURCE?.trim().toLowerCase();

  if (!requested || requested === "apibara") return apibaraSource;

  if (warnedAbout !== requested) {
    warnedAbout = requested;
    console.warn(
      `[inventory] SEARCH_SOURCE="${requested}" is not an implemented source; ` +
        `falling back to "apibara". Implemented: apibara.`
    );
  }
  return apibaraSource;
}
