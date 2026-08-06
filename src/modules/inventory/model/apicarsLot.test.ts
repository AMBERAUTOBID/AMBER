import { describe, expect, it } from "vitest";
import {
  extractImageKey,
  inferOdometerUnit,
  mapApicarsLot,
  parseEpochMs,
  parseIntFlag,
  parseNaiveTimestamp,
  parseYesNo,
  platformFromAuctionName,
  saleHasPassed,
  toCents,
} from "./apicarsLot";

/**
 * The two fixtures below are REAL payloads, captured from the live API on
 * 2026-08-06 and edited only to shorten the nested taxonomy objects.
 *
 * That matters: mapping bugs here get multiplied by ~141k rows, and every type
 * surprise this file defends against was found by dumping an actual lot rather
 * than by reading the vendor's field list — which would have produced an integer
 * `cylinders`, a boolean `car_keys`, a boolean `is_insurance`, a string
 * `lot_number` and a two-value `auction_name`, all wrong.
 */
const IAAI_CANADA_F350 = {
  id: 513338819,
  auction_name: "IAAI CANADA",
  body_style: "Crew Cab",
  car_keys: "no",
  color: "Black",
  cylinders: "8 Cyl",
  doc_type: "Repairable (AB)",
  drive: "Four Wheel Drive",
  engine_type: null,
  est_retail_value: 25123,
  fuel: "Diesel",
  highlights: "Stationary",
  location: "Edmonton (Alberta)",
  lot_number: 12583764,
  make: "FORD",
  model: "F-350",
  odometer: 484007,
  primary_damage: "Bio Hazard",
  secondary_damage: "Theft",
  seller: null,
  series: "LARIAT/XL/XLT",
  transmission: "Automatic",
  vehicle_type: "Light Truck",
  vin: "1FTWW33P26ED16790",
  year: 2006,
  is_insurance: 1,
  currency_code_id: 7,
  created_at: "2026-05-01 05:47:49",
  damage_photos: [],
  car_info: {
    make_id: 11,
    model_id: 235,
    series_id: 39185,
    vehicle_type_id: 3,
    body_class_id: 6,
    vehicle_type: "TRUCK ",
    body_class: "Pickup",
    make: { id: 11, make: "FORD" },
    model: { id: 235, model: "F-350" },
    series: { id: 39185, series: "LARIAT/XL/XLT" },
  },
  car_photo: {
    photo: [
      "https://vis.iaai.com/resizer?imageKeys=82979493~SID~B1~S0~I1~RW2576~H1932~TH0&width=845&height=633",
    ],
  },
  sales_history_last: null,
  sales_history: [],
  active_bidding: [
    { id: 2764041994, auction: 11, sale_date: "1777906800000", current_bid: null },
  ],
  buy_now_car: null,
  currency: { id: 7, name: "Brazilian Real", char_code: "BRL", iso_code: 986 },
};

/** The sparse case: most spec fields null, and the top-level model disagrees
 * with the nested taxonomy ("CARGO" vs "RENEGADE"). */
const SPARSE_TRAILER = {
  id: 513338769,
  auction_name: "IAAI CANADA",
  body_style: null,
  car_keys: "no",
  cylinders: null,
  doc_type: "None (AB)",
  drive: null,
  engine_type: null,
  est_retail_value: 17680,
  lot_number: 12594378,
  make: "FOREST RIVER",
  model: "CARGO",
  odometer: 0,
  series: null,
  vehicle_type: "Recreational/ Miscellaneous",
  vin: "5NH4REX29BA004327",
  year: 2011,
  is_insurance: 1,
  created_at: "2026-05-01 05:47:49",
  damage_photos: [],
  car_info: { make: { make: "FOREST RIVER" }, model: { model: "RENEGADE" } },
  car_photo: { photo: [] },
  active_bidding: [{ sale_date: "1777906800000", current_bid: null }],
  buy_now_car: null,
};

function mapped(raw: unknown) {
  const r = mapApicarsLot(raw);
  if (!r.ok) throw new Error(`expected mapping to succeed, got: ${r.reason}`);
  return r;
}

describe("mapApicarsLot", () => {
  it("maps a real lot without losing or inventing anything", () => {
    const { lot } = mapped(IAAI_CANADA_F350);
    expect(lot.platform).toBe("iaai");
    expect(lot.auctionName).toBe("IAAI CANADA");
    // Arrives as a JSON number; must become the auction's own reference string.
    expect(lot.lotNumber).toBe("12583764");
    expect(lot.vin).toBe("1FTWW33P26ED16790");
    expect(lot.vendorLotId).toBe(513338819);
    expect(lot.year).toBe(2006);
    expect(lot.make).toBe("FORD");
    expect(lot.model).toBe("F-350");
  });

  it("keeps cylinders as the vendor's string rather than forcing a number", () => {
    // "8 Cyl" would silently become null or 8 under an integer column; the
    // numeric form stays derivable from this without re-fetching.
    expect(mapped(IAAI_CANADA_F350).lot.cylinders).toBe("8 Cyl");
  });

  it("reads the string flags the vendor actually sends", () => {
    const { lot } = mapped(IAAI_CANADA_F350);
    expect(lot.hasKeys).toBe(false); // from "no", not false
    expect(lot.isInsurance).toBe(true); // from 1, not true
  });

  it("captures the claimed currency instead of assuming USD", () => {
    // A Canadian lot stamped Brazilian Real. Nonsense, but it must be recorded
    // rather than silently treated as dollars — downstream has to be able to
    // refuse to quote.
    const { lot } = mapped(IAAI_CANADA_F350);
    expect(lot.currencyCode).toBe("BRL");
    expect(lot.currencyCodeId).toBe(7);
  });

  it("never turns an absent bid into zero", () => {
    // current_bid: null before bidding opens. A $0 would state a price nobody
    // has offered — the €1,656 BMW failure.
    expect(mapped(IAAI_CANADA_F350).lot.currentBidCents).toBeNull();
    expect(mapped(IAAI_CANADA_F350).lot.buyNowCents).toBeNull();
  });

  it("converts whole currency units to minor units", () => {
    // 25123 means 25,123 — not 251.23.
    expect(mapped(IAAI_CANADA_F350).lot.estRetailCents).toBe(2_512_300);
  });

  it("parses the sale date out of a stringified epoch inside an array", () => {
    expect(mapped(IAAI_CANADA_F350).lot.saleDate?.toISOString()).toBe("2026-05-04T15:00:00.000Z");
  });

  it("reads the vendor's timezone-less created_at as UTC", () => {
    expect(mapped(IAAI_CANADA_F350).lot.vendorCreatedAt?.toISOString()).toBe(
      "2026-05-01T05:47:49.000Z"
    );
  });

  it("keeps both type taxonomies, trailing space and all", () => {
    const { lot } = mapped(IAAI_CANADA_F350);
    expect(lot.vehicleType).toBe("Light Truck"); // top-level
    expect(lot.carInfoVehicleType).toBe("TRUCK"); // car_info, whitespace trimmed
    expect(lot.carInfoBodyClass).toBe("Pickup");
    expect(lot.bodyStyle).toBe("Crew Cab");
    expect(lot.vehicleTypeId).toBe(3);
    expect(lot.bodyClassId).toBe(6);
  });

  it("infers km for Canadian branches and records nothing it can't infer", () => {
    // No unit is sent. 484,007 is plausible as km and absurd as miles.
    expect(mapped(IAAI_CANADA_F350).lot.odometerUnit).toBe("km");
    expect(mapped(IAAI_CANADA_F350).lot.odometer).toBe(484007);
  });

  it("extracts the CDN image key so photos can be proxied later", () => {
    const { images } = mapped(IAAI_CANADA_F350);
    expect(images).toHaveLength(1);
    expect(images[0].kind).toBe("photo");
    expect(images[0].imageKey).toBe("82979493~SID~B1~S0~I1~RW2576~H1932~TH0");
  });

  it("prefers the top-level make/model over the nested taxonomy when they disagree", () => {
    // Real disagreement: top-level "CARGO", car_info "RENEGADE". The top-level
    // string is what the auction itself displays.
    expect(mapped(SPARSE_TRAILER).lot.model).toBe("CARGO");
  });

  it("maps a sparse lot rather than rejecting it for cosmetic gaps", () => {
    const { lot, images } = mapped(SPARSE_TRAILER);
    expect(lot.bodyStyle).toBeNull();
    expect(lot.cylinders).toBeNull();
    expect(lot.drive).toBeNull();
    expect(images).toHaveLength(0);
    // odometer 0 is a real reading for a trailer, distinct from a missing one.
    expect(lot.odometer).toBe(0);
  });

  it("skips auctions we do not mirror instead of filing them under a guess", () => {
    const r = mapApicarsLot({ ...IAAI_CANADA_F350, auction_name: "EMIRATES AUCTION" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("unsupported auction");
  });

  it("skips a lot with no usable identity", () => {
    expect(mapApicarsLot({ ...IAAI_CANADA_F350, lot_number: null }).ok).toBe(false);
    expect(mapApicarsLot({ ...IAAI_CANADA_F350, auction_name: null }).ok).toBe(false);
  });

  it("never throws on malformed input", () => {
    // One bad row must not abort a sweep of thousands.
    for (const junk of [null, undefined, 42, "nope", [], {}, { auction_name: {} }]) {
      expect(() => mapApicarsLot(junk)).not.toThrow();
      expect(mapApicarsLot(junk).ok).toBe(false);
    }
  });
});

describe("field readers", () => {
  it("treats zero and negative money as no amount recorded", () => {
    expect(toCents(0)).toBeNull();
    expect(toCents(-5)).toBeNull();
    expect(toCents(null)).toBeNull();
    expect(toCents(12.5)).toBe(1250);
  });

  it("resolves the platform from every observed auction spelling", () => {
    expect(platformFromAuctionName("COPART")).toBe("copart");
    expect(platformFromAuctionName("COPART CANADA")).toBe("copart");
    expect(platformFromAuctionName("IAAI")).toBe("iaai");
    expect(platformFromAuctionName("IAAI CANADA")).toBe("iaai");
    expect(platformFromAuctionName("EMIRATES AUCTION")).toBeNull();
    expect(platformFromAuctionName(null)).toBeNull();
  });

  it("only claims an odometer unit it can justify", () => {
    expect(inferOdometerUnit("COPART")).toBe("mi");
    expect(inferOdometerUnit("IAAI CANADA")).toBe("km");
    expect(inferOdometerUnit("SOMETHING ELSE")).toBeNull();
    expect(inferOdometerUnit(null)).toBeNull();
  });

  it("distinguishes unknown from no", () => {
    expect(parseYesNo("no")).toBe(false);
    expect(parseYesNo("yes")).toBe(true);
    expect(parseYesNo(null)).toBeNull(); // unknown, NOT "no keys"
    expect(parseYesNo("maybe")).toBeNull();
  });

  it("reads numeric flags", () => {
    expect(parseIntFlag(1)).toBe(true);
    expect(parseIntFlag(0)).toBe(false);
    expect(parseIntFlag(null)).toBeNull();
  });

  it("rejects nonsense timestamps rather than producing Invalid Date", () => {
    expect(parseEpochMs("0")).toBeNull();
    expect(parseEpochMs("not-a-number")).toBeNull();
    expect(parseNaiveTimestamp("")).toBeNull();
    expect(parseNaiveTimestamp("garbage")).toBeNull();
  });

  it("returns null when a URL carries no image key", () => {
    expect(extractImageKey("https://cs.copart.com/v1/AUTH_x/lpp/0725/abc_ful.jpg")).toBeNull();
  });
});

describe("saleHasPassed", () => {
  it("identifies lots the vendor still calls active after their sale date", () => {
    // The measured case: a lot returned by get-active-lots on 2026-08-06 whose
    // sale was scheduled for 2026-05-04. Owning saleDate is what makes this
    // detectable instead of trusting a batch-stamped status field.
    const now = new Date("2026-08-06T00:00:00Z");
    expect(saleHasPassed(new Date("2026-05-04T15:00:00Z"), now)).toBe(true);
    expect(saleHasPassed(new Date("2026-09-01T00:00:00Z"), now)).toBe(false);
    expect(saleHasPassed(null, now)).toBe(false); // unknown is not "passed"
  });
});
