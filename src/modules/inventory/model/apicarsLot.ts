/**
 * Turning one apicars.auction lot into rows for `auction_lots` /
 * `auction_lot_images`.
 *
 * Pure and I/O-free on purpose: this is the part of ingest most likely to be
 * subtly wrong, and it is far cheaper to test against captured payloads than to
 * discover a mis-parsed field after 141k rows have been written.
 *
 * EVERY READ IS DEFENSIVE. This is untrusted third-party data whose documented
 * shapes have already proven wrong more than once — `lot_number` arrives as a
 * number, `cylinders` as `"8 Cyl"`, `car_keys` as the string `"no"`,
 * `is_insurance` as `1`, and `auction_name` as `"IAAI CANADA"` rather than the
 * two-value field the docs imply. Nothing here may throw on a surprise; a lot
 * that cannot be understood is skipped with a reason, because one malformed row
 * must never abort a sweep of thousands.
 */
import {
  isEnhanced,
  normalizeBodyType,
  normalizeCondition,
  normalizeCylinders,
  normalizeDamage,
  normalizeDrive,
  normalizeFuel,
  normalizeTitle,
  normalizeVehicleClass,
  parseEngineCc,
} from "./lotNormalize";

/** What we managed to make of a lot, or why we gave up on it. */
export type MappedLot =
  | { ok: true; lot: AuctionLotRow; images: AuctionLotImageRow[]; salesHistory: AuctionSalesHistoryRow[] }
  | { ok: false; reason: string };

export interface AuctionLotRow {
  platform: "copart" | "iaai";
  auctionName: string;
  lotNumber: string;
  vin: string | null;
  vendorLotId: number | null;
  vehicleType: string | null;
  bodyStyle: string | null;
  carInfoVehicleType: string | null;
  carInfoBodyClass: string | null;
  vehicleTypeId: number | null;
  bodyClassId: number | null;
  year: number | null;
  make: string | null;
  model: string | null;
  series: string | null;
  makeId: number | null;
  modelId: number | null;
  seriesId: number | null;
  color: string | null;
  cylinders: string | null;
  engineType: string | null;
  fuel: string | null;
  transmission: string | null;
  drive: string | null;
  odometer: number | null;
  odometerUnit: "mi" | "km" | null;
  odometerBrand: string | null;
  primaryDamage: string | null;
  secondaryDamage: string | null;
  docType: string | null;
  hasKeys: boolean | null;
  highlights: string | null;
  sellerName: string | null;
  isInsurance: boolean | null;
  locationRaw: string | null;
  currentBidCents: number | null;
  buyNowCents: number | null;
  estRetailCents: number | null;
  currencyCode: string | null;
  currencyCodeId: number | null;
  saleDate: Date | null;
  vendorCreatedAt: Date | null;

  // ── normalised for filtering; raw equivalents above are never overwritten ──
  vehicleClass: string | null;
  bodyType: string | null;
  fuelClass: string | null;
  driveClass: string | null;
  titleClass: string | null;
  conditionClass: string | null;
  isEnhanced: boolean;
  engineCc: number | null;
  cylinderCount: number | null;
  primaryDamageClass: string | null;
  secondaryDamageClass: string | null;
}

export interface AuctionLotImageRow {
  kind: "photo" | "damage";
  position: number;
  sourceUrl: string;
  imageKey: string | null;
}

/**
 * A past appearance of this vehicle at auction.
 *
 * `soldPriceCents` is populated ONLY when the lot actually sold. The vendor sends
 * `purchase_price` alongside `sold: 0` and `sale_status: "Not sold"` — that
 * figure is a bid that failed to meet reserve, not a sale. Recording it as a sale
 * price would poison every comparable estimate built on this table, which is the
 * documented failure of the previous data source where a third of entries were
 * meaningless zeros dragging averages down.
 */
export interface AuctionSalesHistoryRow {
  /** The vendor's stable id for this entry, and the only safe dedupe key. */
  vendorEntryId: number;
  soldPriceCents: number | null;
  saleStatus: string | null;
  soldAt: Date | null;
  raw: unknown;
}

// ── primitive readers ────────────────────────────────────────────────────────

function obj(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Trims, and treats "" as absent. Whitespace is the only normalisation applied
 * to vendor strings — their vehicle type is literally `"TRUCK "` — because a
 * value stored close to verbatim can be re-normalised later without re-fetching
 * 141k rows. */
export function text(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  // Numbers appear where strings are documented (`lot_number`), so accept them
  // rather than dropping the field.
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * Reads a field that the vendor sends EITHER as a bare string or as a nested
 * object under its own name — `car_info.make` is `{id, make}` while other
 * fields in the same object are plain strings, and which is which is not
 * documented. Guessing wrong silently yields null, which is exactly how
 * `car_info_vehicle_type` and `car_info_body_class` came back 0% populated on a
 * first ingest of 100 lots.
 */
export function textOrNested(v: unknown, key: string): string | null {
  return text(v) ?? text(obj(v)[key]);
}

export function int(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : null;
  if (typeof v === "string") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

/**
 * Whole currency units to minor units. `est_retail_value: 25123` means 25,123 —
 * not 251.23 — so the conversion multiplies.
 *
 * Returns null for 0 as well as for absent, because **every money field on this
 * vendor uses 0 and null interchangeably to mean "no amount recorded"**, and a
 * displayed $0 states a price nobody has offered. That exact confusion once
 * produced a post advertising a 2022 BMW landed in Klaipėda for €1,656.
 */
export function toCents(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/**
 * `sales_history[].sale_date` is epoch SECONDS as a bare number, while
 * `active_bidding[0].sale_date` is epoch MILLISECONDS inside a string and
 * `buy_now_car.sale_date` is `"20260813"`. Three encodings in one payload, so the
 * unit is never inferred from context — each call site says which it expects.
 */
export function parseEpochSeconds(v: unknown): Date | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n * 1000);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `active_bidding[0].sale_date` is epoch milliseconds inside a string. */
export function parseEpochMs(v: unknown): Date | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The vendor's `created_at` is `"2026-05-01 05:47:49"` — no timezone, no `T`.
 *
 * Read as UTC, deliberately and with the assumption recorded here rather than
 * left implicit. It is only ever used for "has this lot been in the catalogue
 * long?", never shown to a visitor and never used for an auction countdown, so
 * being a few hours out is harmless. An auction time read from the wrong zone
 * would NOT be harmless, which is why `saleDate` comes from a real instant
 * instead.
 */
export function parseNaiveTimestamp(v: unknown): Date | null {
  const s = text(v);
  if (!s) return null;
  const d = new Date(s.replace(" ", "T") + (/[Z+]|-\d\d:\d\d$/.test(s) ? "" : "Z"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `car_keys` is the string `"no"`. Null means unknown — NOT "no keys". */
export function parseYesNo(v: unknown): boolean | null {
  const s = text(v)?.toLowerCase();
  if (s === "yes" || s === "true" || s === "1") return true;
  if (s === "no" || s === "false" || s === "0") return false;
  return null;
}

/** `is_insurance` is `1`, not `true`. */
export function parseIntFlag(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  const n = int(v);
  if (n === 1) return true;
  if (n === 0) return false;
  return null;
}

// ── auction identity ─────────────────────────────────────────────────────────

/**
 * `auction_name` is not the two-value field the docs suggest — `"IAAI CANADA"`
 * is real, and the vendor also carries Emirates Auction, which we do not mirror.
 *
 * Returns null for anything that is not Copart or IAAI, and the caller skips
 * that lot: `platform` is NOT NULL, and guessing here would file a Dubai lot
 * under Copart.
 */
export function platformFromAuctionName(auctionName: string | null): "copart" | "iaai" | null {
  const n = auctionName?.toUpperCase() ?? "";
  if (n.includes("COPART")) return "copart";
  if (n.includes("IAAI") || n.includes("IAA ")) return "iaai";
  return null;
}

/**
 * INFERENCE, NOT DATA. The payload has no unit on `odometer`, and the catalogue
 * spans US, Canadian and Finnish branches. A 2006 F-350 reading 484,007 is
 * plausible as kilometres and absurd as miles.
 *
 * Canadian and Finnish branches list kilometres, US branches list miles. Null
 * for anything unrecognised, and null must render as a bare number with no unit
 * rather than defaulting to one.
 *
 * ⚠️ UNVERIFIED against a lot whose true odometer we can independently check.
 * Worth confirming, because the previous aggregator returned `odometer: {mi,
 * km}` with both units and this vendor returns one bare number — a genuine
 * regression risk in the migration.
 */
export function inferOdometerUnit(auctionName: string | null): "mi" | "km" | null {
  const n = auctionName?.toUpperCase() ?? "";
  if (!n) return null;
  if (n.includes("CANADA") || n.includes("FINLAND")) return "km";
  if (n.includes("COPART") || n.includes("IAAI")) return "mi";
  return null;
}

/**
 * Pulls the `imageKeys` value out of a CDN URL.
 *
 * The vendor passes photo URLs straight through to `vis.iaai.com` /
 * `cs.copart.com` rather than re-hosting, so every image on our site breaks the
 * day either adds a referer check. Holding the key lets our own proxy request
 * any size later; when no key is present the full URL is proxied instead.
 */
export function extractImageKey(url: string): string | null {
  const m = /[?&]imageKeys=([^&]+)/.exec(url);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

// ── the mapping ──────────────────────────────────────────────────────────────

/**
 * A lot's identity is `(platform, lotNumber)`. Both are required; anything else
 * missing is tolerable, because a lot with no colour is still worth showing and
 * a sweep that rejected rows for cosmetic gaps would mirror a fraction of the
 * catalogue.
 */
export function mapApicarsLot(raw: unknown): MappedLot {
  const r = obj(raw);

  const auctionName = text(r.auction_name);
  if (!auctionName) return { ok: false, reason: "no auction_name" };

  const platform = platformFromAuctionName(auctionName);
  if (!platform) return { ok: false, reason: `unsupported auction "${auctionName}"` };

  const lotNumber = text(r.lot_number);
  if (!lotNumber) return { ok: false, reason: "no lot_number" };

  const carInfo = obj(r.car_info);
  // car_info nests full objects: { make: { make: "FORD" }, ... }
  const carInfoMake = obj(carInfo.make);
  const carInfoModel = obj(carInfo.model);
  const carInfoSeries = obj(carInfo.series);

  // An array, and the first entry is the live one. current_bid is frequently
  // null before bidding opens — see toCents on why that stays null.
  const bidding = obj(arr(r.active_bidding)[0]);
  const currency = obj(r.currency);

  const lot: AuctionLotRow = {
    platform,
    auctionName,
    lotNumber,
    vin: text(r.vin),
    vendorLotId: int(r.id),

    // Both taxonomies, because neither is trustworthy alone: the top-level
    // field gives "Light Truck", car_info gives a 9-value uppercase set whose
    // API filter matched only 9.3% of the catalogue. Which one is usable is a
    // question for a GROUP BY once this is local, not a guess now.
    vehicleType: text(r.vehicle_type),
    bodyStyle: text(r.body_style),
    carInfoVehicleType: textOrNested(carInfo.vehicle_type, "vehicle_type"),
    carInfoBodyClass: textOrNested(carInfo.body_class, "body_class"),
    vehicleTypeId: int(carInfo.vehicle_type_id),
    bodyClassId: int(carInfo.body_class_id),

    year: int(r.year),
    // Prefer the top-level display string, fall back to the canonical taxonomy.
    make: text(r.make) ?? text(carInfoMake.make),
    model: text(r.model) ?? text(carInfoModel.model),
    series: text(r.series) ?? text(carInfoSeries.series),
    makeId: int(carInfo.make_id),
    modelId: int(carInfo.model_id),
    seriesId: int(carInfo.series_id),

    color: text(r.color),
    cylinders: text(r.cylinders),
    engineType: text(r.engine_type),
    fuel: text(r.fuel),
    transmission: text(r.transmission),
    drive: text(r.drive),
    odometer: int(r.odometer),
    odometerUnit: inferOdometerUnit(auctionName),
    odometerBrand: null, // no source field found yet

    primaryDamage: text(r.primary_damage),
    secondaryDamage: text(r.secondary_damage),
    docType: text(r.doc_type),
    hasKeys: parseYesNo(r.car_keys),
    highlights: text(r.highlights),

    sellerName: text(r.seller),
    isInsurance: parseIntFlag(r.is_insurance),
    locationRaw: text(r.location),

    currentBidCents: toCents(bidding.current_bid),
    // `buy_now_car` is an OBJECT — `{all_lots_id, auction_name, sale_date,
    // purchase_price}` — not a number. Reading it as one returned null for every
    // lot, which made buy_now_cents 0% populated across 4,883 mirrored rows and
    // looked like the endpoint simply had no Buy Now data. It has ~49,400 of
    // them, and `is_buy_now: 1` narrows to exactly that set.
    buyNowCents: toCents(obj(r.buy_now_car).purchase_price),
    estRetailCents: toCents(r.est_retail_value),
    // Stored with the amounts and never assumed: a Canadian lot has been seen
    // stamped "BRL". A cost estimate must refuse to run on an unexpected
    // currency rather than treat the number as dollars.
    currencyCode: text(currency.char_code),
    currencyCodeId: int(r.currency_code_id),

    saleDate: parseEpochMs(bidding.sale_date),
    vendorCreatedAt: parseNaiveTimestamp(r.created_at),

    // Derived from the raw values just above. Kept in their own columns so a
    // corrected mapping is a local re-run over stored rows, never a re-fetch.
    vehicleClass: normalizeVehicleClass(text(r.vehicle_type)),
    bodyType: normalizeBodyType(text(r.body_style)),
    fuelClass: normalizeFuel(text(r.fuel)),
    driveClass: normalizeDrive(text(r.drive)),
    titleClass: normalizeTitle(text(r.doc_type)),
    conditionClass: normalizeCondition(text(r.highlights)),
    isEnhanced: isEnhanced(text(r.highlights)),
    engineCc: parseEngineCc(text(r.engine_type)),
    cylinderCount: normalizeCylinders(text(r.cylinders)),
    // Both damage fields share one vocabulary, so one function classifies both.
    primaryDamageClass: normalizeDamage(text(r.primary_damage)),
    secondaryDamageClass: normalizeDamage(text(r.secondary_damage)),
  };

  const images: AuctionLotImageRow[] = [];
  for (const url of arr(obj(r.car_photo).photo)) {
    const u = text(url);
    if (u) images.push({ kind: "photo", position: images.length, sourceUrl: u, imageKey: extractImageKey(u) });
  }
  let damageAt = 0;
  for (const entry of arr(r.damage_photos)) {
    // Shape unconfirmed — every sampled lot had an empty array — so accept
    // either a bare URL or an object holding one.
    const u = text(entry) ?? text(obj(entry).photo) ?? text(obj(entry).url);
    if (u) images.push({ kind: "damage", position: damageAt++, sourceUrl: u, imageKey: extractImageKey(u) });
  }

  return { ok: true, lot, images, salesHistory: mapSalesHistory(r.sales_history) };
}

/**
 * Past auction appearances for a lot.
 *
 * Worth collecting from the first sweep: ~45% of lots carry entries, and this is
 * the one asset that cannot be bought back later — a sale that happened while we
 * were not looking is gone. It also fixes the comparables problem inherited from
 * the previous source, which matched on make/model alone and so handed a 2010
 * base model and a 2020 top trim the identical twelve sales.
 *
 * THE TRAP: `purchase_price` is populated even when nothing sold. A real entry
 * read `{purchase_price: 600, sale_status: "Not sold", sold: 0}` — that 600 is a
 * bid that failed to meet reserve. Only `sold` truthy yields a price; everything
 * else keeps its status for context with a null price, so an average over this
 * table can never quietly include failed bids.
 */
export function mapSalesHistory(raw: unknown): AuctionSalesHistoryRow[] {
  const rows: AuctionSalesHistoryRow[] = [];
  for (const entry of arr(raw)) {
    const e = obj(entry);
    // No stable id means no safe way to avoid re-inserting this entry on every
    // sweep, so it is dropped rather than allowed to accumulate duplicates.
    const vendorEntryId = int(e.id);
    if (vendorEntryId === null) continue;

    const didSell = parseIntFlag(e.sold) === true;
    rows.push({
      vendorEntryId,
      soldPriceCents: didSell ? toCents(e.purchase_price) : null,
      saleStatus: text(e.sale_status),
      // Epoch SECONDS here, unlike active_bidding's milliseconds-in-a-string.
      soldAt: parseEpochSeconds(e.sale_date),
      raw: entry,
    });
  }
  return rows;
}

/**
 * Whether a lot's sale has already happened.
 *
 * NOT cosmetic. The vendor returns lots from `get-active-lots` whose sale date
 * passed months ago — a sampled "active" lot was scheduled for 2026-05-04 and
 * came back on 2026-08-06. The previous aggregator had the same defect, and so
 * does at least one competitor's site, which simultaneously showed a lot as sold
 * and as still running.
 *
 * Owning the rows is what finally makes this fixable: `saleDate` is a real
 * instant, so ended lots can be identified with a comparison instead of trusted
 * from a status field the vendor batch-stamps.
 */
export function saleHasPassed(saleDate: Date | null, now: Date): boolean {
  return saleDate !== null && saleDate.getTime() < now.getTime();
}
