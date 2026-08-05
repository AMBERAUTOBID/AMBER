/**
 * Pure readers over an Apibara lot payload — no fetching, no framework.
 *
 * Split out from the HTTP client so the Telegram bot can reuse any of this
 * without dragging in Next's caching layer, and so it stays unit-testable.
 *
 * The recurring rule here: a field the source didn't populate must come back
 * as `null` so the caller can omit the row entirely. Never a `0`, never a
 * dash — either would state something the auction house never claimed.
 */
import { isUsaBuiltVin } from "@/modules/pricing/model/costEstimate";
import type {
  IaaiValuation,
  LotDeepSpecs,
  LotMediaExtras,
  SoldPriceStats,
  VehicleListItem,
} from "./types";

/**
 * Two comparables can't describe a market. A single $50 scrap sale rendered
 * as "lowest / average / highest = $50" reads like a valuation and would
 * badly mislead someone deciding what to bid, so the stats are withheld
 * below this many real sales rather than shown with a caveat.
 */
export const MIN_COMPARABLE_SAMPLE = 3;

/** Computed from real comparable past sales — Apibara has no single "market
 * value range" field, unlike the repair-cost/ACV numbers below which do come
 * straight from the source. */
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

/**
 * Pulls the extra spec rows out of the undocumented raw pass-through. Returns
 * null when there's nothing there at all, which is the normal case for every
 * Copart lot — callers should skip the whole section rather than render empty
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
 * Whether the car was built in the USA — decides if the 2026 EU-US trade
 * deal's 0% duty applies (see PORT_CUSTOMS in the pricing module). Returns
 * null when neither the payload nor the VIN can say, so callers can fall back
 * to the conservative "assume duty applies" rather than silently claiming a
 * waiver.
 *
 * A country stated by the auction house wins over the VIN: it's the field a
 * customs officer would be shown, and on the rare lot where the two disagree
 * the stated one is what the paperwork will have to match.
 */
export function isUsaManufactured(vehicle: VehicleListItem): boolean | null {
  const origin =
    rawStr(vehicle.details?.vehicle_description, "ManufacturedIn") ??
    rawStr(vehicle.details?.attributes, "CountryOfOrigin");
  if (origin) return /^(usa|united states)/i.test(origin);
  return isUsaBuiltVin(vehicle.vin);
}
