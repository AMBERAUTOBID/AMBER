import type { VehicleListItem } from "@/modules/inventory/api/types";

/**
 * Turns a lot into the row we store.
 *
 * Pure, and takes an already-fetched lot rather than fetching one, so the
 * mapping can be tested without a network or a database — it is the piece
 * most likely to quietly rot when Apibara changes a field name.
 */
export interface FavoriteSnapshot {
  platform: "copart" | "iaai";
  lotNumber: string;
  vin: string | null;
  title: string;
  year: number | null;
  make: string | null;
  model: string | null;
  imageUrl: string | null;
  priceUsdCents: number | null;
  auctionAt: Date | null;
}

/**
 * `null` when the lot can't be identified. Everything else degrades to a
 * missing field rather than a fabricated one.
 */
export function snapshotFromLot(lot: VehicleListItem): FavoriteSnapshot | null {
  // The lot number is the identity and the unique key. Without it there is
  // nothing to save, and nothing to refresh against later.
  if (!lot.lot_number) return null;

  return {
    platform: lot.platform,
    lotNumber: lot.lot_number,
    vin: lot.vin || null,
    // A row must have something to show. Falling back to the lot number is
    // better than an empty card; both beat inventing a description.
    title: lot.title?.trim() || `${lot.platform.toUpperCase()} ${lot.lot_number}`,
    year: typeof lot.year === "number" && lot.year > 0 ? lot.year : null,
    make: lot.make || null,
    model: lot.model || null,
    imageUrl: lot.media?.thumbs?.[0] ?? null,
    priceUsdCents: priceCents(lot),
    auctionAt: parseAuctionDate(lot),
  };
}

/**
 * What the car costs right now, in cents.
 *
 * Current bid first, Buy Now second — a lot with both is being bid on, and
 * the bid is the live number. **Absent stays absent:** Copart lots routinely
 * carry `current_bid_usd: null` before bidding opens, and treating that as
 * zero is the exact mistake that once published a 2022 BMW landed in Klaipėda
 * for €1,656. Invariant #5.
 */
function priceCents(lot: VehicleListItem): number | null {
  const usd = lot.pricing?.current_bid_usd ?? lot.pricing?.buy_now_usd ?? null;
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) return null;
  return Math.round(usd * 100);
}

/**
 * `full_date` is the ISO instant with an offset; `auction_at` is the fallback.
 * Apibara's pre-`formatted` string is deliberately ignored — its timezone is
 * undocumented and read as UTC+3 in testing, which could be Moscow.
 */
function parseAuctionDate(lot: VehicleListItem): Date | null {
  const raw = lot.auction?.full_date || lot.auction?.auction_at;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
