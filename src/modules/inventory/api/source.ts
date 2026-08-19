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
import { postgresSource } from "./postgresSource";

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

  /**
   * How many lots each filter option would return, given everything else the
   * visitor has already chosen.
   *
   * OPTIONAL ON PURPOSE, and the one method Apibara can never implement: its
   * `filters` response field is an echo of the request, and its `meta` carries no
   * total at all. Owning the rows is what makes "Salvage (43,636)" possible, so
   * a caller must check for the method rather than assume it.
   *
   * Kept off `searchVehicles` so an ordinary search does not pay for counts it
   * will not render.
   */
  getFacets?(params: VehicleSearchParams, typeValues?: string[]): Promise<SearchFacets>;
}

/**
 * One option in one dimension.
 *
 * `parent` carries the ONE piece of shape a flat list cannot: which family a
 * model belongs under, so `328i` renders inside `3 Series`. It is optional and
 * absent on every other dimension, which is why the tree is encoded here rather
 * than by widening `SearchFacets` into a record of two different things — the
 * panel, the chips and their tests all keep reading the same `{ value, count }`
 * they always did.
 *
 * A parent always appears in the same array as its children and never has a
 * parent itself: the tree is exactly two levels deep — see `buildModelTree`.
 */
export interface FacetOption {
  value: string;
  count: number;
  /** The family this sits under, on the `model` dimension only. */
  parent?: string;
}

/**
 * Counts per option, keyed by filter dimension:
 * `{ fuel: [{ value: "gasoline", count: 93854 }, ...], ... }`.
 *
 * Values are the normalised class strings the filters accept, so a UI can feed
 * one straight back as `fuel=<value>` without a translation table.
 *
 * `make` and `model` are the two exceptions to "normalised class string": they
 * carry the readable LABEL a marque is merged under — `Mercedes-Benz`, `F-150` —
 * because that is what the URL has always carried and what the server resolves
 * back into every raw spelling. See `resolveMakes` and `modelsForLabel`.
 */
export type SearchFacets = Record<string, FacetOption[]>;

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

  // Absent means Apibara. Production sets nothing, so production gets Apibara —
  // the default is the shipping behaviour, not a fallback from a failure.
  if (!requested || requested === "apibara") return apibaraSource;

  // Opt-in, and only ever set in Preview until the mirror is trusted.
  if (requested === "postgres") return postgresSource;

  if (warnedAbout !== requested) {
    warnedAbout = requested;
    console.warn(
      `[inventory] SEARCH_SOURCE="${requested}" is not an implemented source; ` +
        `falling back to "apibara". Implemented: apibara, postgres.`
    );
  }
  return apibaraSource;
}
