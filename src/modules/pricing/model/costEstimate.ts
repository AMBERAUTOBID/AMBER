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
 *
 * The plan table is the ONE import here, and it is data only — `plans.ts` has
 * no imports of its own, so this file stays free of `next/*` and keeps working
 * under the bot's plain `tsx` runtime. See `brokerageFeeUsd` for why the fee
 * has to come from there rather than being written down again.
 */
// Relative, not `@/` — the bot runs this file under plain `tsx`, where the
// tsconfig path alias is not resolved. Every other import in this file is
// relative for the same reason; keep it that way.
import { PLANS, type PlanKey } from "../../plans/model/plans";
import { localTransportRateUsd, type AuctionNetwork } from "./localTransportRates";

export type CoreVehicleKind = "car" | "suv" | "motorcycle";

// Illustrative shipping base rates (USD) - same estimate model used
// site-wide, not a live freight-rate feed.
export const CORE_VEHICLE_BASE_SHIPPING: Record<CoreVehicleKind, number> = {
  car: 950,
  suv: 1250,
  motorcycle: 500,
};

/**
 * Maps an auction listing's body-style string onto the three kinds the
 * shipping table prices. Auction feeds spell the same category several ways
 * ("SUV", "SPORT UTILITY", "CROSSOVER"), and Copart often sends nothing at
 * all - "car" is the safe default since it's the cheapest of the three to
 * ship and won't overstate a quote.
 */
export function inferCoreVehicleKind(bodyStyle?: string | null): CoreVehicleKind {
  const body = bodyStyle?.toUpperCase() ?? "";
  if (body.includes("SUV") || body.includes("SPORT UTILITY") || body.includes("CROSSOVER")) {
    return "suv";
  }
  if (body.includes("MOTORCYCLE") || body.includes("MOPED") || body.includes("SCOOTER")) {
    return "motorcycle";
  }
  return "car";
}

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

/**
 * Country of assembly read off the VIN's first character (the first digit of
 * the World Manufacturer Identifier). 1, 4 and 5 are the United States; every
 * other assigned code is somewhere else.
 *
 * Lives here rather than with the lot-payload readers because origin is a
 * pricing input — it decides whether the 0% duty above applies — and both the
 * lot pages and the standalone calculator need it. Copart sends no country
 * field at all, so without this roughly half the inventory is quoted with a
 * 10% duty it doesn't owe.
 *
 * Returns null rather than false for anything that isn't a well-formed modern
 * VIN: pre-1981 cars use shorter formats whose first character carries no
 * country meaning, and guessing "not American" there would reintroduce the
 * same overcharge from the other direction.
 */
export function isUsaBuiltVin(vin: string | null | undefined): boolean | null {
  const trimmed = vin?.trim().toUpperCase();
  // I, O and Q are excluded from the VIN alphabet precisely so they can't be
  // confused with 1 and 0, so their presence means this isn't a real VIN.
  if (!trimmed || trimmed.length !== 17 || /[IOQ]/.test(trimmed)) return null;
  const wmiCountry = trimmed[0];
  if (!/[A-HJ-NPR-Z0-9]/.test(wmiCountry)) return null;
  return wmiCountry === "1" || wmiCountry === "4" || wmiCountry === "5";
}

export const TRUCKING_FLAT_USD = 450;
export const USD_TO_EUR = 0.92;

/**
 * The brokerage fee, in dollars, for the plan the reader is actually on.
 *
 * ⚠️ THIS USED TO BE `export const BROKERAGE_FEE_USD = 350` AND IT WAS WRONG IN
 * TWO SEPARATE WAYS AT ONCE.
 *
 * First, it was a flat number, so every Silver/Gold/Platinum client — the
 * people who froze $1,500 or more precisely to get the reduced rate — was shown
 * a landed cost built on the rate they do not pay. The one figure the deposit
 * buys was the one figure the calculator ignored.
 *
 * Second, it was a SECOND COPY of a number that already lives in
 * `plans.ts` as `feesPerVehicleUsdCents`. They are one commercial figure: the
 * card calls it a service fee and the calculator calls it a brokerage fee, but
 * a client pays it once. Two unlinked constants meant `/plans` could advertise
 * one price while the calculator added another, with nothing erroring and no
 * test failing — and `/plans` is indexed, so that is a published contradiction.
 *
 * Reading it from the plan table removes both faults together, and makes the
 * fee change of 2026-08-14 ($350/$200 → $400/$350) a one-line edit there.
 *
 * **`null` means "nobody is signed in", and it resolves to Bronze deliberately.**
 * A visitor with no account would pay the no-deposit rate if they bought today,
 * so that is the honest quote — and quoting the cheaper one to someone not
 * entitled to it understates a price, which is the worse of the two mistakes.
 * The Telegram bot passes nothing and therefore quotes the same public rate.
 */
export function brokerageFeeUsd(planKey: PlanKey | null | undefined): number {
  const plan = PLANS[planKey ?? "bronze"];
  return (plan.feesPerVehicleUsdCents[0] ?? 0) / 100;
}

/**
 * Line items that only the per-lot vehicle-page calculator itemises. They're
 * deliberately NOT folded into estimateVehicleCost() below, because that
 * function's output is already live in the Telegram bot's captions - adding
 * charges there would silently change numbers readers have been quoted.
 *
 * PLACEHOLDER AMOUNTS: these are round illustrative figures, not confirmed
 * SmartAutoBid pricing. Replace them with the real tariff once it exists;
 * every surface that shows them is labelled as an estimate.
 */
export const TITLE_FEE_USD = 20;
export const CUSTOMS_CLEARANCE_FEE_USD = 250;
export const SERVICE_FEE_HAZMAT_USD = 200;
export const SERVICE_FEE_OVERSIZE_USD = 200;

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
  /** Whose rate to quote. Omitted / null = nobody signed in = the Bronze rate. */
  planKey?: PlanKey | null;
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
  const { vehicleKind, lotPriceUsd, pickupLocation, auctionNetwork, destinationPort, usaMade, planKey } =
    input;
  const brokerage = brokerageFeeUsd(planKey);
  const fees = auctionFeesUsd(lotPriceUsd);
  const trucking = localTransportRateUsd(pickupLocation, auctionNetwork, vehicleKind, TRUCKING_FLAT_USD);
  const shipping = CORE_VEHICLE_BASE_SHIPPING[vehicleKind] * (PORT_MULTIPLIER[destinationPort] ?? 1);
  const { dutyUsd, vatUsd } = customsBreakdown({
    lotPriceUsd,
    shippingUsd: shipping,
    destinationPort,
    usaMade,
  });
  const totalUsd = lotPriceUsd + fees + brokerage + trucking + shipping + dutyUsd + vatUsd;

  return {
    lotPriceUsd,
    auctionFeesUsd: fees,
    brokerageFeeUsd: brokerage,
    truckingUsd: trucking,
    shippingUsd: shipping,
    dutyUsd,
    vatUsd,
    totalUsd,
    totalEur: totalUsd * USD_TO_EUR,
  };
}

export interface LandedCostInput {
  vehicleKind: CoreVehicleKind;
  /** The bid the buyer is modelling - not necessarily the lot's current bid. */
  lotPriceUsd: number;
  pickupLocation: string;
  auctionNetwork: AuctionNetwork;
  destinationPort: string;
  usaMade: boolean;
  /** Whose rate to quote. Omitted / null = nobody signed in = the Bronze rate. */
  planKey?: PlanKey | null;
  hazmat?: boolean;
  oversize?: boolean;
}

/**
 * Same underlying model as estimateVehicleCost(), but itemised and split the
 * way a buyer actually pays: one bill settled in the USA before the car
 * sails, a second one due at the destination port. Keeping the split explicit
 * matters because the destination half is the part that varies by country and
 * catches people out.
 */
export interface LandedCostResult {
  /** Paid to the US side before the vehicle ships. */
  usSide: {
    lotPriceUsd: number;
    auctionFeesUsd: number;
    titleFeeUsd: number;
    brokerageFeeUsd: number;
    oceanFreightUsd: number;
    truckingUsd: number;
    optionalServicesUsd: number;
    subtotalUsd: number;
  };
  /** Due on arrival at the destination port. */
  destinationSide: {
    vatUsd: number;
    dutyUsd: number;
    clearanceUsd: number;
    subtotalUsd: number;
  };
  totalUsd: number;
  totalEur: number;
}

export function estimateLandedCost(input: LandedCostInput): LandedCostResult {
  const {
    vehicleKind,
    lotPriceUsd,
    pickupLocation,
    auctionNetwork,
    destinationPort,
    usaMade,
    hazmat = false,
    oversize = false,
    planKey,
  } = input;
  const brokerage = brokerageFeeUsd(planKey);

  const oceanFreightUsd =
    CORE_VEHICLE_BASE_SHIPPING[vehicleKind] * (PORT_MULTIPLIER[destinationPort] ?? 1);
  const truckingUsd = localTransportRateUsd(
    pickupLocation,
    auctionNetwork,
    vehicleKind,
    TRUCKING_FLAT_USD
  );
  const optionalServicesUsd =
    (hazmat ? SERVICE_FEE_HAZMAT_USD : 0) + (oversize ? SERVICE_FEE_OVERSIZE_USD : 0);
  const auctionFees = auctionFeesUsd(lotPriceUsd);

  const usSubtotal =
    lotPriceUsd +
    auctionFees +
    TITLE_FEE_USD +
    brokerage +
    oceanFreightUsd +
    truckingUsd +
    optionalServicesUsd;

  const { dutyUsd, vatUsd } = customsBreakdown({
    lotPriceUsd,
    shippingUsd: oceanFreightUsd,
    destinationPort,
    usaMade,
  });
  const destinationSubtotal = dutyUsd + vatUsd + CUSTOMS_CLEARANCE_FEE_USD;
  const totalUsd = usSubtotal + destinationSubtotal;

  return {
    usSide: {
      lotPriceUsd,
      auctionFeesUsd: auctionFees,
      titleFeeUsd: TITLE_FEE_USD,
      brokerageFeeUsd: brokerage,
      oceanFreightUsd,
      truckingUsd,
      optionalServicesUsd,
      subtotalUsd: usSubtotal,
    },
    destinationSide: {
      vatUsd,
      dutyUsd,
      clearanceUsd: CUSTOMS_CLEARANCE_FEE_USD,
      subtotalUsd: destinationSubtotal,
    },
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
