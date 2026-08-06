/**
 * The lot → saved row mapping.
 *
 * Worth testing properly because it is where the project's two most expensive
 * data lessons meet, and both of them fail *silently*:
 *
 * 1. A Copart lot commonly has no current bid before bidding opens. Treating
 *    that absence as zero is the exact mistake that once published a real
 *    Telegram post advertising a 2022 BMW landed in Klaipėda for €1,656.
 * 2. Apibara's own pre-formatted date string has an undocumented timezone
 *    (read as UTC+3 in testing, possibly Moscow), so only the ISO instant may
 *    be parsed.
 *
 * Nothing here needs a network or a database — the mapping is pure, which is
 * why it was split from the fetching.
 */
import { describe, expect, it } from "vitest";
import { snapshotFromLot } from "./snapshot";
import type { VehicleListItem } from "@/modules/inventory/api/types";

function lot(overrides: Partial<VehicleListItem> = {}): VehicleListItem {
  return {
    platform: "copart",
    lot_number: "12345678",
    vin: "1HGCM82633A004352",
    title: "2015 HONDA ACCORD SPORT",
    year: 2015,
    make: "HONDA",
    model: "ACCORD",
    ...overrides,
  } as VehicleListItem;
}

describe("identity", () => {
  it("keeps platform, lot number and VIN", () => {
    const s = snapshotFromLot(lot())!;
    expect(s).toMatchObject({
      platform: "copart",
      lotNumber: "12345678",
      vin: "1HGCM82633A004352",
    });
  });

  it("refuses a lot with no lot number — there'd be nothing to refresh against", () => {
    expect(snapshotFromLot(lot({ lot_number: "" }))).toBeNull();
  });

  it("accepts a missing VIN, which salvage rows sometimes have", () => {
    expect(snapshotFromLot(lot({ vin: "" }))!.vin).toBeNull();
  });
});

describe("price: absent must never become zero", () => {
  it("reads the current bid", () => {
    const s = snapshotFromLot(lot({ pricing: { current_bid_usd: 4250 } }))!;
    expect(s.priceUsdCents).toBe(425000);
  });

  it("prefers the current bid over Buy Now when a lot has both", () => {
    const s = snapshotFromLot(
      lot({ pricing: { current_bid_usd: 4250, buy_now_usd: 9000 } })
    )!;
    expect(s.priceUsdCents).toBe(425000);
  });

  it("falls back to Buy Now when there is no bid", () => {
    const s = snapshotFromLot(lot({ pricing: { buy_now_usd: 9000 } }))!;
    expect(s.priceUsdCents).toBe(900000);
  });

  /** The €1,656 BMW. A null bid means "bidding hasn't opened", not "free". */
  it("stores null for a Copart lot with no bid yet", () => {
    const s = snapshotFromLot(lot({ pricing: { current_bid_usd: null } }))!;
    expect(s.priceUsdCents).toBeNull();
  });

  it("stores null when the price is literally zero", () => {
    const s = snapshotFromLot(lot({ pricing: { current_bid_usd: 0 } }))!;
    expect(s.priceUsdCents).toBeNull();
  });

  it("stores null when pricing is absent entirely", () => {
    expect(snapshotFromLot(lot())!.priceUsdCents).toBeNull();
  });

  it("ignores a non-finite price rather than storing NaN cents", () => {
    const s = snapshotFromLot(
      lot({ pricing: { current_bid_usd: Number.NaN } })
    )!;
    expect(s.priceUsdCents).toBeNull();
  });

  it("rounds to whole cents", () => {
    const s = snapshotFromLot(lot({ pricing: { current_bid_usd: 1234.567 } }))!;
    expect(Number.isInteger(s.priceUsdCents)).toBe(true);
  });
});

describe("auction date: only the ISO instant is trusted", () => {
  it("reads full_date, which carries an offset", () => {
    const s = snapshotFromLot(
      lot({ auction: { full_date: "2026-09-01T14:30:00+00:00" } })
    )!;
    expect(s.auctionAt?.toISOString()).toBe("2026-09-01T14:30:00.000Z");
  });

  it("falls back to auction_at", () => {
    const s = snapshotFromLot(lot({ auction: { auction_at: "2026-09-01T14:30:00Z" } }))!;
    expect(s.auctionAt?.toISOString()).toBe("2026-09-01T14:30:00.000Z");
  });

  /** Its timezone is undocumented — parsing it would invent a time. */
  it("ignores the pre-formatted string, which has no reliable timezone", () => {
    const s = snapshotFromLot(
      lot({ auction: { formatted: "09/01/2026 2:30 PM" } })
    )!;
    expect(s.auctionAt).toBeNull();
  });

  it("stores null rather than an Invalid Date when the value is junk", () => {
    const s = snapshotFromLot(lot({ auction: { full_date: "not a date" } }))!;
    expect(s.auctionAt).toBeNull();
  });
});

describe("display fields degrade rather than fabricate", () => {
  it("falls back to a lot reference when the title is empty", () => {
    const s = snapshotFromLot(lot({ title: "  " }))!;
    expect(s.title).toBe("COPART 12345678");
  });

  it("takes the first thumbnail", () => {
    const s = snapshotFromLot(lot({ media: { thumbs: ["a.jpg", "b.jpg"] } }))!;
    expect(s.imageUrl).toBe("a.jpg");
  });

  it("accepts having no photo", () => {
    expect(snapshotFromLot(lot({ media: {} }))!.imageUrl).toBeNull();
  });

  it("drops a zero year, which is how an unknown one arrives", () => {
    expect(snapshotFromLot(lot({ year: 0 }))!.year).toBeNull();
  });
});
