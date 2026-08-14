import { describe, expect, it } from "vitest";
import { isStillUpcoming } from "./relatedLots";
import type { VehicleListItem } from "../api/types";

const NOW = new Date("2026-08-12T12:00:00Z");

function lot(auction: VehicleListItem["auction"]): VehicleListItem {
  return {
    platform: "copart",
    lot_number: "59726116",
    vin: "WAUAUGFF0J1031237",
    title: "2018 AUDI A3 PREMIUM",
    year: 2018,
    make: "AUDI",
    model: "A3",
    auction,
  };
}

describe("isStillUpcoming", () => {
  it("keeps a lot selling tomorrow", () => {
    expect(
      isStillUpcoming(lot({ full_date: "2026-08-13T17:00:00+00:00", state: "open" }), NOW)
    ).toBe(true);
  });

  it("drops the shape the aggregator actually returned — all 36 measured entries looked like this", () => {
    expect(
      isStillUpcoming(
        lot({
          full_date: "2026-02-20T13:00:00+00:00",
          state: "finished",
          diff_minutes: -249593,
          last_sold_status: "Sold",
        }),
        NOW
      )
    ).toBe(false);
  });

  it("drops a finished lot even when the date and countdown are missing", () => {
    expect(isStillUpcoming(lot({ state: "finished" }), NOW)).toBe(false);
  });

  it("drops a lot whose countdown has run out, whatever the state says", () => {
    expect(
      isStillUpcoming(
        lot({ full_date: "2026-09-01T00:00:00+00:00", state: "open", diff_minutes: -5 }),
        NOW
      )
    ).toBe(false);
  });

  it("keeps a mirrored row, which carries a real sale instant and no state at all", () => {
    expect(isStillUpcoming(lot({ auction_at: "2026-08-20T17:00:00.000Z" }), NOW)).toBe(true);
  });

  it("drops a mirrored row whose sale has passed — relisted lots keep a stale date", () => {
    expect(isStillUpcoming(lot({ auction_at: "2026-08-05T17:00:00.000Z" }), NOW)).toBe(false);
  });

  it("drops a lot with no auction block, and one with no date it can check", () => {
    expect(isStillUpcoming(lot(undefined), NOW)).toBe(false);
    expect(isStillUpcoming(lot({ state: "open" }), NOW)).toBe(false);
    expect(isStillUpcoming(lot({ full_date: "not a date", state: "open" }), NOW)).toBe(false);
  });

  it("treats the sale instant itself as past — a lot on the block is not upcoming", () => {
    expect(isStillUpcoming(lot({ full_date: NOW.toISOString(), state: "open" }), NOW)).toBe(false);
  });

  // The vendor's live state is not always spelled "open". All 8 lots probed on
  // 2026-08-14 came back `state: "live"`, and the vehicle page used to decide
  // this with `state === "open"` — an allowlist of one, which read every such
  // lot as closed and hid the "Bid for me" button on cars still selling. Only
  // "finished" may close a lot; no other spelling is evidence either way.
  it("keeps a lot the vendor calls 'live' rather than 'open'", () => {
    expect(
      isStillUpcoming(
        lot({ full_date: "2026-08-14T16:30:00+00:00", state: "live", diff_minutes: 6 }),
        NOW
      )
    ).toBe(true);
  });

  it("keeps a 'live' lot that arrives without a countdown at all", () => {
    expect(isStillUpcoming(lot({ full_date: "2026-08-13T17:00:00+00:00", state: "live" }), NOW)).toBe(
      true
    );
  });
});
