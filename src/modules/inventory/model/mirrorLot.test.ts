import { describe, expect, it } from "vitest";
import {
  mirrorLotTitle,
  mirrorOdometer,
  mirrorPricing,
  mirrorRowToVehicleListItem,
  type MirrorLotRow,
} from "./mirrorLot";

/**
 * A fixed instant, a day before the fixture's sale.
 *
 * Passed explicitly wherever pricing is involved: buy-now is suppressed as the
 * sale approaches, so a test relying on the wall clock would pass today and
 * start failing on 2026-08-13 with nothing in the code having changed.
 */
const NOW = new Date("2026-08-12T12:00:00Z");

/** A US Copart lot, the ordinary case. */
function row(overrides: Partial<MirrorLotRow> = {}): MirrorLotRow {
  return {
    platform: "copart",
    auctionName: "COPART",
    lotNumber: "60011246",
    vin: "1FMCU9G95EUB82591",
    year: 2014,
    make: "FORD",
    model: "ESCAPE",
    series: null,
    vehicleType: "AUTOMOBILE",
    bodyStyle: "4DR SPORT UTILITY",
    color: "WHITE",
    engineType: "2.0L 4",
    transmission: "AUTOMATIC",
    fuel: "GAS",
    drive: "4X4 W/FRONT WHL DRV",
    odometer: 191428,
    odometerUnit: "mi",
    primaryDamage: "MINOR DENT/SCRATCHES",
    secondaryDamage: "REAR END",
    hasKeys: true,
    highlights: "RUNS AND DRIVES",
    docType: "MI - DEALER ONLY CLEAN TITLE",
    sellerName: null,
    locationRaw: "MI - WAYLAND",
    currentBidCents: 50_000,
    buyNowCents: 145_500,
    currencyCode: "USD",
    saleDate: new Date("2026-08-13T15:00:00Z"),
    ...overrides,
  };
}

describe("mirrorLotTitle", () => {
  it("rebuilds the title the aggregator used to supply", () => {
    expect(mirrorLotTitle(row())).toBe("2014 FORD ESCAPE");
  });

  it("drops missing parts instead of rendering gaps", () => {
    expect(mirrorLotTitle(row({ model: null }))).toBe("2014 FORD");
    expect(mirrorLotTitle(row({ year: null, make: null, model: null }))).toBe("60011246");
  });
});

describe("mirrorOdometer", () => {
  it("supplies both units when the unit is known", () => {
    // The aggregator returned mi AND km; the UI reads both, so both are derived.
    expect(mirrorOdometer(row())).toEqual({ mi: 191428, km: 308074 });
    expect(mirrorOdometer(row({ odometer: 100000, odometerUnit: "km" }))).toEqual({
      mi: 62137,
      km: 100000,
    });
  });

  it("reports nothing when the unit is only an inference we could not make", () => {
    // The vendor sends no unit. Guessing is a 1.6x error on mileage, and
    // "not reported" is the honest answer a card already knows how to render.
    expect(mirrorOdometer(row({ odometerUnit: null }))).toEqual({ mi: null, km: null });
    expect(mirrorOdometer(row({ odometer: null }))).toEqual({ mi: null, km: null });
  });

  it("keeps a genuine zero reading", () => {
    // 0 miles on a trailer is a real value, distinct from a missing one.
    expect(mirrorOdometer(row({ odometer: 0 }))).toEqual({ mi: 0, km: 0 });
  });
});

describe("mirrorPricing", () => {
  it("converts cents to dollars for a trustworthy currency", () => {
    expect(mirrorPricing(row(), NOW)).toEqual({ current_bid_usd: 500, buy_now_usd: 1455 });
  });

  it("refuses to present an unknown currency as dollars", () => {
    // The vendor stamps IAAI Canada lots "BRL". Dividing by 100 and printing a $
    // would be the same class of error as the post that advertised a 2022 BMW
    // landed in Klaipėda for €1,656.
    expect(mirrorPricing(row({ currencyCode: "BRL" }), NOW)).toEqual({
      current_bid_usd: null,
      buy_now_usd: null,
    });
    expect(mirrorPricing(row({ currencyCode: "CAD" }), NOW)).toEqual({
      current_bid_usd: null,
      buy_now_usd: null,
    });
  });

  it("keeps an absent price absent rather than zero", () => {
    // Copart lots commonly have no bid before bidding opens; $0 would state a
    // price nobody has offered.
    expect(mirrorPricing(row({ currentBidCents: null }), NOW).current_bid_usd).toBeNull();
    expect(mirrorPricing(row({ buyNowCents: null }), NOW).buy_now_usd).toBeNull();
  });

  // The auctions withdraw Buy Now when the lot reaches the block. Measured on
  // real lots: gone on 5 of 5 whose sale time had passed, still there on 20 of
  // 20 from two hours out. A mirrored row cannot see the withdrawal, so the
  // price is suppressed rather than promised — the visitor who clicks lands on
  // a page served live from upstream, which will not show one either.
  it("stops offering buy-now as the sale arrives", () => {
    const sale = new Date("2026-08-13T15:00:00Z");
    const at = (hoursBefore: number) =>
      mirrorPricing(row(), new Date(sale.getTime() - hoursBefore * 3_600_000));

    expect(at(3).buy_now_usd).toBe(1455);
    expect(at(2).buy_now_usd).toBe(1455); // exactly on the margin still counts
    expect(at(1).buy_now_usd).toBeNull();
    expect(at(0).buy_now_usd).toBeNull();
    expect(at(-5).buy_now_usd).toBeNull(); // sale already over
  });

  it("keeps the bid when it suppresses the buy-now price", () => {
    // The bid is a fact about the auction, not an offer being made to the
    // visitor, so nothing about it expires.
    const late = mirrorPricing(row(), new Date("2026-08-13T14:30:00Z"));
    expect(late.current_bid_usd).toBe(500);
    expect(late.buy_now_usd).toBeNull();
  });

  it("suppresses buy-now on a lot with no sale date at all", () => {
    // Nothing to check the offer against, so it cannot be promised.
    expect(mirrorPricing(row({ saleDate: null }), NOW).buy_now_usd).toBeNull();
  });
});

describe("mirrorRowToVehicleListItem", () => {
  it("produces the shape the existing UI already reads", () => {
    // LotCard reads platform, title, vin, pricing, location.display,
    // condition.primary_damage, odometer.mi and media — so the switch of source
    // has to leave every one of those populated.
    const lot = mirrorRowToVehicleListItem(
      row(),
      [
        { sourceUrl: "https://cdn/b.jpg", kind: "photo", position: 1 },
        { sourceUrl: "https://cdn/a.jpg", kind: "photo", position: 0 },
      ],
      NOW
    );

    expect(lot.platform).toBe("copart");
    expect(lot.title).toBe("2014 FORD ESCAPE");
    expect(lot.vin).toBe("1FMCU9G95EUB82591");
    expect(lot.lot_number).toBe("60011246");
    expect(lot.location?.display).toBe("MI - WAYLAND");
    expect(lot.condition?.primary_damage).toBe("MINOR DENT/SCRATCHES");
    expect(lot.condition?.has_key).toBe(true);
    expect(lot.odometer?.mi).toBe(191428);
    expect(lot.pricing?.buy_now_usd).toBe(1455);
    expect(lot.vehicle_specs?.exterior_color).toBe("WHITE");
    expect(lot.auction?.full_date).toBe("2026-08-13T15:00:00.000Z");
  });

  it("orders photos by position, not by the order rows came back", () => {
    const lot = mirrorRowToVehicleListItem(row(), [
      { sourceUrl: "https://cdn/second.jpg", kind: "photo", position: 1 },
      { sourceUrl: "https://cdn/first.jpg", kind: "photo", position: 0 },
    ]);
    expect(lot.media?.thumbs).toEqual(["https://cdn/first.jpg", "https://cdn/second.jpg"]);
    expect(lot.media?.thumbs_count).toBe(2);
  });

  it("survives a lot with almost nothing recorded", () => {
    const sparse = mirrorRowToVehicleListItem(
      row({
        vin: null,
        year: null,
        make: null,
        model: null,
        odometer: null,
        odometerUnit: null,
        currentBidCents: null,
        buyNowCents: null,
        locationRaw: null,
        primaryDamage: null,
        color: null,
      })
    );
    expect(sparse.vin).toBe("");
    expect(sparse.title).toBe("60011246");
    expect(sparse.media?.thumbs).toEqual([]);
    expect(sparse.odometer?.mi).toBeNull();
  });

  it("does not claim an auction state", () => {
    // The aggregator batch-stamps `state` on list responses and routinely called a
    // long-sold lot live. We hold the real sale instant instead, so callers compare
    // it to the clock rather than trusting a label.
    const lot = mirrorRowToVehicleListItem(row());
    expect(lot.auction?.state).toBeUndefined();
  });
});
