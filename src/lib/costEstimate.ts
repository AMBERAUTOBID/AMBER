/**
 * Shared cost-estimate math, extracted out of CostCalculator.tsx so both the
 * website calculator and the Telegram bot (scripts/telegram-bot) compute the
 * same auction-fee/trucking/shipping/duty/VAT breakdown from one source of
 * truth instead of two formulas quietly drifting apart over time.
 *
 * CostCalculator.tsx still owns its own extended VEHICLE_BASE_SHIPPING table
 * (it covers boats, ATVs, etc. that the bot never deals with) and calls the
 * lower-level pieces here (auctionFeesUsd/customsBreakdown) directly. The
 * bot only ever deals with car/suv/motorcycle auction listings, so it uses
 * estimateVehicleCost() for the full breakdown in one call.
 */
import { localTransportRateUsd, type AuctionNetwork } from "./localTransportRates";

export type CoreVehicleKind = "car" | "suv" | "motorcycle";

// Illustrative shipping base rates (USD) - same estimate model used
// site-wide, not a live freight-rate feed.
export const CORE_VEHICLE_BASE_SHIPPING: Record<CoreVehicleKind, number> = {
  car: 950,
  suv: 1250,
  motorcycle: 500,
};

export const PORT_MULTIPLIER: Record<string, number> = {
  "Klaipėda, Lithuania": 1,
  "Poti, Georgia": 1.35,
  "Rotterdam, Netherlands": 0.95,
};

// Customs model per destination. Klaipėda/Rotterdam are EU: the 2026 EU-US
// "Turnberry" trade deal dropped the EU's passenger-car import duty from 10%
// to 0% specifically for US-manufactured vehicles. Georgia is not part of
// that deal - its 5% customs duty applies regardless of origin, and Georgia
// also levies a separate per-cm³ engine-size excise tax not modeled here.
export const PORT_CUSTOMS: Record<string, { vat: number; duty: number; dutyWaivedForUsaMade: boolean }> = {
  "Klaipėda, Lithuania": { vat: 0.21, duty: 0.1, dutyWaivedForUsaMade: true },
  "Rotterdam, Netherlands": { vat: 0.21, duty: 0.1, dutyWaivedForUsaMade: true },
  "Poti, Georgia": { vat: 0.18, duty: 0.05, dutyWaivedForUsaMade: false },
};

export const TRUCKING_FLAT_USD = 450;
export const BROKERAGE_FEE_USD = 350;
export const USD_TO_EUR = 0.92;

export function auctionFeesUsd(lotPriceUsd: number): number {
  return Math.max(200, lotPriceUsd * 0.1);
}

export function customsBreakdown(params: {
  lotPriceUsd: number;
  shippingUsd: number;
  destinationPort: string;
  usaMade: boolean;
}): { dutyUsd: number; vatUsd: number } {
  const customsInfo = PORT_CUSTOMS[params.destinationPort] ?? PORT_CUSTOMS["Klaipėda, Lithuania"];
  const dutyBase = params.lotPriceUsd + params.shippingUsd;
  const dutyRate = customsInfo.dutyWaivedForUsaMade && params.usaMade ? 0 : customsInfo.duty;
  const dutyUsd = dutyBase * dutyRate;
  const vatUsd = (dutyBase + dutyUsd) * customsInfo.vat;
  return { dutyUsd, vatUsd };
}

export interface VehicleCostEstimateInput {
  vehicleKind: CoreVehicleKind;
  lotPriceUsd: number;
  pickupLocation: string;
  auctionNetwork: AuctionNetwork;
  destinationPort: string;
  usaMade: boolean;
}

export interface VehicleCostEstimateResult {
  lotPriceUsd: number;
  auctionFeesUsd: number;
  brokerageFeeUsd: number;
  truckingUsd: number;
  shippingUsd: number;
  dutyUsd: number;
  vatUsd: number;
  totalUsd: number;
  totalEur: number;
}

export function estimateVehicleCost(input: VehicleCostEstimateInput): VehicleCostEstimateResult {
  const { vehicleKind, lotPriceUsd, pickupLocation, auctionNetwork, destinationPort, usaMade } = input;
  const fees = auctionFeesUsd(lotPriceUsd);
  const trucking = localTransportRateUsd(pickupLocation, auctionNetwork, vehicleKind, TRUCKING_FLAT_USD);
  const shipping = CORE_VEHICLE_BASE_SHIPPING[vehicleKind] * (PORT_MULTIPLIER[destinationPort] ?? 1);
  const { dutyUsd, vatUsd } = customsBreakdown({
    lotPriceUsd,
    shippingUsd: shipping,
    destinationPort,
    usaMade,
  });
  const totalUsd = lotPriceUsd + fees + BROKERAGE_FEE_USD + trucking + shipping + dutyUsd + vatUsd;

  return {
    lotPriceUsd,
    auctionFeesUsd: fees,
    brokerageFeeUsd: BROKERAGE_FEE_USD,
    truckingUsd: trucking,
    shippingUsd: shipping,
    dutyUsd,
    vatUsd,
    totalUsd,
    totalEur: totalUsd * USD_TO_EUR,
  };
}

/**
 * Apibara's `location.display` comes back as "City (ST)" (e.g.
 * "Honolulu (HI)"), while PICKUP_LOCATIONS/localTransportRates key on
 * "City, ST" (e.g. "Honolulu, HI"). Without this, every bot cost estimate
 * would silently miss the real per-branch rate and fall back to the flat
 * TRUCKING_FLAT_USD - not wrong, just less accurate than it could be.
 */
export function normalizeApibaraLocation(display: string): string {
  const match = display.match(/^(.+?)\s*\(([A-Z]{2})\)$/);
  if (!match) return display;
  return `${match[1].trim()}, ${match[2]}`;
}

export type { AuctionNetwork };
