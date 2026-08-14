import { describe, expect, it } from "vitest";
import { ownSaleInstant } from "./saleInstant";
import type { VehicleListItem } from "../api/types";

const NOW = new Date("2026-08-13T12:00:00.000Z");
const SOON = "2026-08-14T01:00:00.000Z";

function lot(auction: VehicleListItem["auction"]): VehicleListItem {
  return {
    platform: "copart",
    lot_number: "1",
    vin: "1HGBH41JXMN109186",
    title: "t",
    year: 2020,
    make: "m",
    model: "m",
    auction,
  } as VehicleListItem;
}

describe("ownSaleInstant", () => {
  it("accepts a mirrored row: a real date, and no batch-stamped fields", () => {
    expect(ownSaleInstant(lot({ full_date: SOON, auction_at: SOON }), NOW)).toBe(SOON);
  });

  it("refuses a row carrying `state` — the aggregator stamps it per page", () => {
    expect(ownSaleInstant(lot({ full_date: SOON, state: "open" }), NOW)).toBeNull();
  });

  it("refuses a row carrying `diff_minutes`, for the same reason", () => {
    // The measured case: a lot sold 147 days earlier still arrived with a
    // positive, page-wide diff_minutes.
    expect(ownSaleInstant(lot({ full_date: SOON, diff_minutes: 480 }), NOW)).toBeNull();
  });

  it("refuses a sale that has already run", () => {
    expect(ownSaleInstant(lot({ full_date: "2026-08-01T00:00:00.000Z" }), NOW)).toBeNull();
  });

  it("refuses a missing or unreadable date rather than guessing", () => {
    expect(ownSaleInstant(lot({ full_date: null, auction_at: null }), NOW)).toBeNull();
    expect(ownSaleInstant(lot({ full_date: "whenever" }), NOW)).toBeNull();
    expect(ownSaleInstant(lot(undefined), NOW)).toBeNull();
  });

  it("falls back to auction_at when full_date is absent", () => {
    expect(ownSaleInstant(lot({ auction_at: SOON }), NOW)).toBe(SOON);
  });
});
