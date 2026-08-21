/**
 * Turns a mirrored `auction_lots` row back into the `VehicleListItem` shape the
 * UI already speaks.
 *
 * WHY BACKWARDS: `LotCard`, the favourites snapshot and the vehicle page were all
 * written against the aggregator's response shape. Making the local source speak
 * that same shape means the switch is a config change, not a rewrite of every
 * component — and it means the two sources can be compared field by field, which
 * is how parity gets *proved* rather than assumed. Richer columns we now own
 * (title class, body type, engine cc) get surfaced later, once search is trusted.
 *
 * Pure and database-free so it can be tested without a connection.
 */
import { photoUrlForSize } from "./photoSize";
import type { VehicleListItem } from "../api/types";

const KM_PER_MILE = 1.609344;

/**
 * How close to its sale a lot may be and still be described as buyable outright.
 *
 * The auctions withdraw Buy Now when the lot reaches the block, and our row is a
 * nightly snapshot. Measured 2026-08-12 against Apibara, on lots this mirror
 * called Buy Now: 0 of 5 still had the offer once their sale time had passed,
 * 3 of 5 six minutes out, 20 of 20 from two hours out. Two hours is the nearest
 * margin the measurement supports.
 *
 * Exported because `postgresSource` filters on the same number: a "Buy Now"
 * search that hides a lot and a card that prints its price anyway would be the
 * same claim made twice, differently.
 */
export const BUY_NOW_MARGIN_HOURS = 2;

/** The columns this mapper needs. A structural type rather than an import from
 * the schema, so the pure model layer stays independent of Drizzle. */
export interface MirrorLotRow {
  platform: string;
  auctionName: string;
  lotNumber: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  series: string | null;
  vehicleType: string | null;
  bodyStyle: string | null;
  color: string | null;
  engineType: string | null;
  transmission: string | null;
  fuel: string | null;
  drive: string | null;
  odometer: number | null;
  odometerUnit: string | null;
  primaryDamage: string | null;
  secondaryDamage: string | null;
  hasKeys: boolean | null;
  highlights: string | null;
  docType: string | null;
  sellerName: string | null;
  locationRaw: string | null;
  currentBidCents: number | null;
  buyNowCents: number | null;
  currencyCode: string | null;
  saleDate: Date | null;
}

export interface MirrorImageRow {
  sourceUrl: string;
  kind: string;
  position: number;
}

/**
 * A displayable title. The aggregator supplied one ("2020 BMW 750 XI"); we hold
 * the parts, so it is rebuilt from them. Missing pieces are dropped rather than
 * rendered as gaps or the string "null".
 */
export function mirrorLotTitle(row: MirrorLotRow): string {
  return [row.year, row.make, row.model].filter((p) => p !== null && p !== "").join(" ") || row.lotNumber;
}

/**
 * Both odometer units, from the one number the vendor sends.
 *
 * ONLY converts when the unit is established. `odometerUnit` is an inference
 * from the auction's region, not data, so when it is null both figures stay null
 * — a mileage shown under the wrong unit is out by 1.6x, and "not reported" is
 * the honest answer. The aggregator returned mi AND km, so this is the one place
 * the local source knows strictly less than the old one.
 */
export function mirrorOdometer(row: MirrorLotRow): { mi: number | null; km: number | null } {
  if (row.odometer === null || row.odometerUnit === null) return { mi: null, km: null };
  if (row.odometerUnit === "mi") {
    return { mi: row.odometer, km: Math.round(row.odometer * KM_PER_MILE) };
  }
  if (row.odometerUnit === "km") {
    return { mi: Math.round(row.odometer / KM_PER_MILE), km: row.odometer };
  }
  return { mi: null, km: null };
}

/**
 * Prices, in dollars, ONLY when the currency is one we can treat as dollars.
 *
 * The vendor stamps IAAI Canada lots with `BRL`, so a stored cents figure is not
 * automatically USD. Dividing an unknown currency by 100 and labelling it `$`
 * would be the same class of error as the post that once advertised a 2022 BMW
 * landed in Klaipėda for €1,656 — a confident number that was never true.
 * Suppressing the price loses a cell; asserting it loses trust.
 */
export function mirrorPricing(
  row: MirrorLotRow,
  /** Injected so the rule is testable at a fixed instant rather than only on
   *  the day someone runs the suite. */
  now: Date = new Date()
): {
  current_bid_usd: number | null;
  buy_now_usd: number | null;
} {
  const trustworthy = row.currencyCode === null || row.currencyCode === "USD";
  if (!trustworthy) return { current_bid_usd: null, buy_now_usd: null };

  // A buy-now price we can no longer promise is not a price. See
  // BUY_NOW_MARGIN_HOURS: the offer is pulled as the lot reaches the block, and
  // a mirrored row cannot know it has happened. The bid stays — it is a fact
  // about the auction, not an offer being made to the visitor.
  const offerStillOpen =
    row.saleDate !== null &&
    row.saleDate.getTime() >= now.getTime() + BUY_NOW_MARGIN_HOURS * 3_600_000;

  return {
    current_bid_usd: row.currentBidCents === null ? null : row.currentBidCents / 100,
    buy_now_usd: row.buyNowCents === null || !offerStillOpen ? null : row.buyNowCents / 100,
  };
}

export function mirrorRowToVehicleListItem(
  row: MirrorLotRow,
  images: MirrorImageRow[] = [],
  now: Date = new Date()
): VehicleListItem {
  const odometer = mirrorOdometer(row);
  const pricing = mirrorPricing(row, now);
  // Raw CDN URLs, deliberately: the proxy wrap (`withProxiedMedia`) happens at
  // the render site, AFTER `photoUrlForSize` — a wrapped URL is one the size
  // rewrite no longer recognises. It also keeps the favourites and bid-request
  // snapshots storing the CDN's own URL rather than our route's.
  const thumbs = images
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((i) => i.sourceUrl);

  return {
    platform: row.platform as VehicleListItem["platform"],
    lot_number: row.lotNumber,
    vin: row.vin ?? "",
    title: mirrorLotTitle(row),
    year: row.year ?? 0,
    make: row.make ?? "",
    model: row.model ?? "",
    type: row.vehicleType,

    // `state` is deliberately omitted rather than guessed. The aggregator's list
    // responses batch-stamp it and routinely called a long-sold lot live; we know
    // the real sale instant instead, so callers compare that to the clock.
    auction: {
      auction_at: row.saleDate?.toISOString() ?? null,
      full_date: row.saleDate?.toISOString() ?? null,
    },

    pricing: {
      current_bid_usd: pricing.current_bid_usd,
      buy_now_usd: pricing.buy_now_usd,
    },

    location: { display: row.locationRaw ?? undefined },
    seller: row.sellerName ? { name: row.sellerName } : undefined,

    condition: {
      primary_damage: row.primaryDamage,
      secondary_damage: row.secondaryDamage,
      has_key: row.hasKeys,
      run_condition: row.highlights ? { value: row.highlights, label: row.highlights } : undefined,
    },

    odometer,

    vehicle_specs: {
      exterior_color: row.color ?? undefined,
      engine: row.engineType ? { raw: row.engineType } : undefined,
      transmission: row.transmission ?? undefined,
      fuel_type: row.fuel ?? undefined,
      drive_type: row.drive ?? undefined,
      body_style: row.bodyStyle,
    },

    sale_document: row.docType ? { name: row.docType } : undefined,

    media: {
      thumbs_count: thumbs.length,
      // ⚠️ `thumbs` IS WHAT THE CARDS DRAW, so it asks for the card variant.
      // Measured 2026-08-20: a search page of twenty cards was loading twenty
      // 276 KB `_hrs` files — 5.5 MB of photographs to fill boxes 400px wide.
      thumbs: thumbs.map((url) => photoUrlForSize(url, "card")),
      // Every slot held the SAME url, so a 64px thumbnail and the full-screen
      // photo were the identical download. Each now asks for what it will draw.
      items: thumbs.map((url) => ({
        type: "image",
        thumb: photoUrlForSize(url, "thumb"),
        large: photoUrlForSize(url, "card"),
        full: photoUrlForSize(url, "full"),
      })),
    },
  };
}
