/**
 * Tests for the landed-cost model.
 *
 * This is the code in the repo most worth testing: it is arithmetic that gets
 * published. The same functions price the website calculator, the per-lot
 * panel, and the Telegram bot's captions — and the bot's numbers go out to a
 * channel where a wrong figure can't be quietly corrected afterwards.
 *
 * Two kinds of assertion here, and the distinction matters:
 *
 *   RULES     — things that must be true because of a tax regime or a
 *               business decision. If one of these fails, something is wrong.
 *   BASELINES — the exact output of the current model at fixed inputs. These
 *               are meant to fail when a rate changes. A failure is a prompt
 *               to confirm the change was intended and that already-published
 *               Telegram captions have been considered, not a bug report.
 */
import { describe, expect, it } from "vitest";
import {
  auctionFeesUsd,
  customsBreakdown,
  estimateLandedCost,
  estimateVehicleCost,
  inferCoreVehicleKind,
  isUsaBuiltVin,
  normalizeApibaraLocation,
  brokerageFeeUsd,
  CORE_VEHICLE_BASE_SHIPPING,
  CUSTOMS_CLEARANCE_FEE_USD,
  PORT_CUSTOMS,
  PORT_MULTIPLIER,
  SERVICE_FEE_HAZMAT_USD,
  SERVICE_FEE_OVERSIZE_USD,
  TITLE_FEE_USD,
  TRUCKING_FLAT_USD,
  USD_TO_EUR,
} from "./costEstimate";

const KLAIPEDA = "Klaipėda, Lithuania";
const ROTTERDAM = "Rotterdam, Netherlands";
const POTI = "Poti, Georgia";

describe("auctionFeesUsd", () => {
  it("charges 10% of the lot price", () => {
    expect(auctionFeesUsd(10_000)).toBe(1_000);
  });

  it("applies a $200 floor on cheap lots", () => {
    // RULE: a $300 lot must not be quoted $30 of auction fees. The auction
    // houses' own minimums are why the floor exists.
    expect(auctionFeesUsd(300)).toBe(200);
    expect(auctionFeesUsd(0)).toBe(200);
  });

  it("switches from the floor to the percentage at $2,000", () => {
    expect(auctionFeesUsd(2_000)).toBe(200);
    expect(auctionFeesUsd(2_001)).toBeCloseTo(200.1, 5);
  });
});

describe("customsBreakdown", () => {
  it("waives duty on US-built cars into the EU", () => {
    // RULE: the 2026 EU-US "Turnberry" deal dropped the EU's passenger-car
    // import duty to 0% specifically for US-manufactured vehicles.
    for (const port of [KLAIPEDA, ROTTERDAM]) {
      const { dutyUsd } = customsBreakdown({
        lotPriceUsd: 10_000,
        shippingUsd: 1_000,
        destinationPort: port,
        usaMade: true,
      });
      expect(dutyUsd).toBe(0);
    }
  });

  it("still charges duty on non-US cars into the EU", () => {
    const { dutyUsd } = customsBreakdown({
      lotPriceUsd: 10_000,
      shippingUsd: 1_000,
      destinationPort: KLAIPEDA,
      usaMade: false,
    });
    // 10% of (lot + shipping)
    expect(dutyUsd).toBe(1_100);
  });

  it("does NOT waive duty into Georgia even for US-built cars", () => {
    // RULE: Georgia is not part of the EU-US deal. Its 5% duty applies
    // regardless of origin. Getting this wrong under-quotes every Poti buyer.
    const { dutyUsd } = customsBreakdown({
      lotPriceUsd: 10_000,
      shippingUsd: 1_000,
      destinationPort: POTI,
      usaMade: true,
    });
    expect(dutyUsd).toBeCloseTo(550, 6);
  });

  it("charges VAT on the duty-inclusive value, not the bare lot price", () => {
    // RULE: VAT base = lot + shipping + duty. Charging it on the lot price
    // alone would under-collect on every non-US car.
    const { dutyUsd, vatUsd } = customsBreakdown({
      lotPriceUsd: 10_000,
      shippingUsd: 1_000,
      destinationPort: KLAIPEDA,
      usaMade: false,
    });
    expect(vatUsd).toBeCloseTo((11_000 + dutyUsd) * 0.21, 6);
  });

  it("falls back to the Klaipėda customs model for an unknown port", () => {
    // Quote-only destinations have no customs model yet; falling back to a
    // real EU one is safer than returning zero duty and VAT.
    const unknown = customsBreakdown({
      lotPriceUsd: 5_000,
      shippingUsd: 800,
      destinationPort: "Nowhere, Atlantis",
      usaMade: false,
    });
    const klaipeda = customsBreakdown({
      lotPriceUsd: 5_000,
      shippingUsd: 800,
      destinationPort: KLAIPEDA,
      usaMade: false,
    });
    expect(unknown).toEqual(klaipeda);
  });

  it("keeps a VAT rate on file for every port that has a multiplier", () => {
    // Guards against adding a priced destination without its tax model, which
    // would silently fall back to Lithuanian rates.
    for (const port of Object.keys(PORT_MULTIPLIER)) {
      expect(PORT_CUSTOMS[port], `no customs model for ${port}`).toBeDefined();
    }
  });
});

describe("inferCoreVehicleKind", () => {
  it("maps the many spellings of an SUV onto one kind", () => {
    for (const body of ["SUV", "Sport Utility", "CROSSOVER", "suv 4dr"]) {
      expect(inferCoreVehicleKind(body)).toBe("suv");
    }
  });

  it("recognises two-wheelers", () => {
    for (const body of ["MOTORCYCLE", "Moped", "scooter"]) {
      expect(inferCoreVehicleKind(body)).toBe("motorcycle");
    }
  });

  it("defaults to car when the feed says nothing", () => {
    // RULE: car is the cheapest of the three to ship, so defaulting to it
    // cannot overstate a quote. Copart often sends no body style at all.
    expect(inferCoreVehicleKind(null)).toBe("car");
    expect(inferCoreVehicleKind(undefined)).toBe("car");
    expect(inferCoreVehicleKind("")).toBe("car");
    expect(CORE_VEHICLE_BASE_SHIPPING.car).toBeLessThanOrEqual(
      CORE_VEHICLE_BASE_SHIPPING.suv
    );
  });
});

describe("normalizeApibaraLocation", () => {
  it('rewrites "City (ST)" into the "City, ST" the rate tables key on', () => {
    // Without this every bot estimate silently misses the real per-branch
    // trucking rate and falls back to the flat placeholder.
    expect(normalizeApibaraLocation("Honolulu (HI)")).toBe("Honolulu, HI");
    expect(normalizeApibaraLocation("York Haven (PA)")).toBe("York Haven, PA");
  });

  it("leaves an already-normal location untouched", () => {
    expect(normalizeApibaraLocation("Honolulu, HI")).toBe("Honolulu, HI");
    expect(normalizeApibaraLocation("Somewhere")).toBe("Somewhere");
  });
});

describe("estimateVehicleCost", () => {
  const input = {
    vehicleKind: "car" as const,
    lotPriceUsd: 10_000,
    pickupLocation: "Nowhere, ZZ",
    auctionNetwork: "copart" as const,
    destinationPort: KLAIPEDA,
    usaMade: true,
  };

  it("produces the expected line items for a US-built car into Klaipėda", () => {
    // BASELINE. This function feeds Telegram captions that are already
    // public; if this test fails, published numbers have moved.
    const result = estimateVehicleCost(input);

    expect(result.lotPriceUsd).toBe(10_000);
    expect(result.auctionFeesUsd).toBe(1_000);
    expect(result.brokerageFeeUsd).toBe(brokerageFeeUsd(null));
    expect(result.truckingUsd).toBe(TRUCKING_FLAT_USD);
    expect(result.shippingUsd).toBe(950);
    expect(result.dutyUsd).toBe(0);
    expect(result.vatUsd).toBeCloseTo(2_299.5, 6); // 21% of (10,000 + 950)
    // 10,000 lot + 1,000 fees + brokerage + 450 trucking + 950 freight
    // + 0 duty + 2,299.50 VAT.
    //
    // The brokerage term is read from the plan table rather than written here,
    // and that is the point: this baseline exists to catch numbers moving by
    // ACCIDENT. The fee moving on purpose — $350 → $400 for the no-deposit
    // rate on 2026-08-14 — is a decision recorded in `plans.ts`, and a test
    // that restated the figure would fail for the one reason that is not a
    // regression while still missing a drift in any other term.
    const expectedTotal = 10_000 + 1_000 + brokerageFeeUsd(null) + 450 + 950 + 2_299.5;
    expect(result.totalUsd).toBeCloseTo(expectedTotal, 6);
    expect(result.totalEur).toBeCloseTo(expectedTotal * USD_TO_EUR, 6);
  });

  it("quotes a deposit tier the reduced rate, not the public one", () => {
    // The fault this guards: the calculator was plan-blind, so everyone who had
    // frozen $1,500+ to get the reduced fee was shown a landed cost built on
    // the rate they do not pay — on every car they looked at.
    const publicQuote = estimateVehicleCost(input);
    const silverQuote = estimateVehicleCost({ ...input, planKey: "silver" });

    expect(silverQuote.brokerageFeeUsd).toBe(brokerageFeeUsd("silver"));
    expect(silverQuote.brokerageFeeUsd).toBeLessThan(publicQuote.brokerageFeeUsd);
    expect(publicQuote.totalUsd - silverQuote.totalUsd).toBeCloseTo(
      publicQuote.brokerageFeeUsd - silverQuote.brokerageFeeUsd,
      6
    );
  });

  it("totals exactly the sum of its own line items", () => {
    // RULE: the breakdown shown to a customer must add up to the total shown
    // underneath it.
    const r = estimateVehicleCost({ ...input, usaMade: false, vehicleKind: "suv" });
    expect(r.totalUsd).toBeCloseTo(
      r.lotPriceUsd +
        r.auctionFeesUsd +
        r.brokerageFeeUsd +
        r.truckingUsd +
        r.shippingUsd +
        r.dutyUsd +
        r.vatUsd,
      6
    );
  });

  it("uses the real per-branch trucking rate when the location is known", () => {
    const known = estimateVehicleCost({ ...input, pickupLocation: "York Haven, PA" });
    expect(known.truckingUsd).toBe(300);
    expect(known.truckingUsd).not.toBe(TRUCKING_FLAT_USD);
  });

  it("scales ocean freight by the destination multiplier", () => {
    const toPoti = estimateVehicleCost({ ...input, destinationPort: POTI });
    expect(toPoti.shippingUsd).toBeCloseTo(950 * PORT_MULTIPLIER[POTI], 6);
  });
});

describe("estimateLandedCost", () => {
  const input = {
    vehicleKind: "car" as const,
    lotPriceUsd: 10_000,
    pickupLocation: "Nowhere, ZZ",
    auctionNetwork: "copart" as const,
    destinationPort: KLAIPEDA,
    usaMade: true,
  };

  it("puts every charge on exactly one side of the split", () => {
    // RULE: the whole point of the two-column layout is that a buyer can see
    // what they pay before the car sails and what waits at the far end. A
    // charge appearing in neither subtotal would silently vanish.
    const r = estimateLandedCost(input);

    expect(r.usSide.subtotalUsd).toBeCloseTo(
      r.usSide.lotPriceUsd +
        r.usSide.auctionFeesUsd +
        r.usSide.titleFeeUsd +
        r.usSide.brokerageFeeUsd +
        r.usSide.oceanFreightUsd +
        r.usSide.truckingUsd +
        r.usSide.optionalServicesUsd,
      6
    );
    expect(r.destinationSide.subtotalUsd).toBeCloseTo(
      r.destinationSide.dutyUsd + r.destinationSide.vatUsd + r.destinationSide.clearanceUsd,
      6
    );
    expect(r.totalUsd).toBeCloseTo(r.usSide.subtotalUsd + r.destinationSide.subtotalUsd, 6);
  });

  it("keeps duty and VAT on the destination side", () => {
    // RULE: import taxes are the charge that catches buyers out, so they must
    // never be folded into the US-side figure.
    const r = estimateLandedCost({ ...input, usaMade: false });
    expect(r.destinationSide.dutyUsd).toBeGreaterThan(0);
    expect(r.destinationSide.vatUsd).toBeGreaterThan(0);
    expect(r.destinationSide.clearanceUsd).toBe(CUSTOMS_CLEARANCE_FEE_USD);
  });

  it("adds optional service fees only when the toggle is on", () => {
    const plain = estimateLandedCost(input);
    const hazmat = estimateLandedCost({ ...input, hazmat: true });
    const both = estimateLandedCost({ ...input, hazmat: true, oversize: true });

    expect(plain.usSide.optionalServicesUsd).toBe(0);
    expect(hazmat.usSide.optionalServicesUsd).toBe(SERVICE_FEE_HAZMAT_USD);
    expect(both.usSide.optionalServicesUsd).toBe(
      SERVICE_FEE_HAZMAT_USD + SERVICE_FEE_OVERSIZE_USD
    );
    expect(both.totalUsd - plain.totalUsd).toBeCloseTo(
      SERVICE_FEE_HAZMAT_USD + SERVICE_FEE_OVERSIZE_USD,
      6
    );
  });

  it("differs from estimateVehicleCost by exactly the fees it adds", () => {
    // RULE: the two functions are deliberately separate — estimateVehicleCost
    // must NOT pick up the vehicle page's extra fees, because its output is
    // already live in published Telegram captions. This pins that gap.
    const landed = estimateLandedCost(input);
    const published = estimateVehicleCost(input);
    expect(landed.totalUsd - published.totalUsd).toBeCloseTo(
      TITLE_FEE_USD + CUSTOMS_CLEARANCE_FEE_USD,
      6
    );
  });

  it("models the buyer's bid, not the lot's current price", () => {
    const low = estimateLandedCost({ ...input, lotPriceUsd: 5_000 });
    const high = estimateLandedCost({ ...input, lotPriceUsd: 20_000 });
    expect(high.totalUsd).toBeGreaterThan(low.totalUsd);
  });
});

/**
 * RULES. Origin decides whether the 0% duty applies, so a wrong answer here
 * moves a real quote by thousands of euros in either direction — hence the
 * emphasis on "unknown" staying unknown rather than defaulting either way.
 */
describe("isUsaBuiltVin", () => {
  it("reads 1, 4 and 5 as United States assembly", () => {
    expect(isUsaBuiltVin("1FTZR15V3XTA88607")).toBe(true);
    expect(isUsaBuiltVin("4T1BF1FK5CU513879")).toBe(true);
    expect(isUsaBuiltVin("5UXCW2C09N9M57894")).toBe(true);
  });

  it("reads other assigned country codes as not United States", () => {
    expect(isUsaBuiltVin("2HGFC2F59KH542891")).toBe(false); // Canada
    expect(isUsaBuiltVin("3VWDX7AJ5DM123456")).toBe(false); // Mexico
    expect(isUsaBuiltVin("JTJBC1BA5A2013390")).toBe(false); // Japan
    expect(isUsaBuiltVin("WBA3A5C51DF123456")).toBe(false); // Germany
    expect(isUsaBuiltVin("KMHD35LH5FU123456")).toBe(false); // South Korea
  });

  it("is case- and whitespace-insensitive", () => {
    expect(isUsaBuiltVin("  1ftzr15v3xta88607  ")).toBe(true);
  });

  it("returns null for anything that isn't a well-formed modern VIN", () => {
    expect(isUsaBuiltVin(null)).toBeNull();
    expect(isUsaBuiltVin(undefined)).toBeNull();
    expect(isUsaBuiltVin("")).toBeNull();
    expect(isUsaBuiltVin("   ")).toBeNull();
    // Pre-1981 short format: the leading digit carries no country meaning, so
    // calling it "not American" would wrongly add 10% duty to a US classic.
    expect(isUsaBuiltVin("1234567890")).toBeNull();
    expect(isUsaBuiltVin("1FTZR15V3XTA886071")).toBeNull();
  });

  it("rejects VINs containing I, O or Q, which the VIN alphabet excludes", () => {
    expect(isUsaBuiltVin("1FTZR15V3XTA8860O")).toBeNull();
    expect(isUsaBuiltVin("1FTZRI5V3XTA88607")).toBeNull();
    expect(isUsaBuiltVin("1FTZRQ5V3XTA88607")).toBeNull();
  });

  it("feeds the duty waiver: the same lot costs less once the VIN says US-built", () => {
    const base = {
      vehicleKind: "suv" as const,
      lotPriceUsd: 29_650,
      pickupLocation: "Sayreville, NJ",
      auctionNetwork: "copart" as const,
      destinationPort: "Klaipėda, Lithuania",
    };
    const withVin = estimateLandedCost({
      ...base,
      usaMade: isUsaBuiltVin("5UXCW2C09N9M57894") ?? false,
    });
    const without = estimateLandedCost({ ...base, usaMade: false });
    expect(withVin.destinationSide.dutyUsd).toBe(0);
    expect(without.destinationSide.dutyUsd).toBeGreaterThan(0);
    expect(withVin.totalEur).toBeLessThan(without.totalEur);
  });
});
