import { describe, expect, it } from "vitest";
import {
  buildOrderSnapshot,
  manualOrderSnapshot,
  orderTitle,
  type LotLike,
} from "./orderSnapshot";

/** Shaped like a real Apibara detail response, trimmed to what the mapper reads. */
const LOT: LotLike = {
  platform: "iaai",
  lot_number: "45016890",
  vin: "5UXCR6C55KL000000",
  year: 2014,
  make: "BMW",
  model: "X5",
  location: { display: "TX - Dallas" },
  condition: { has_key: true, primary_damage: "FRONT END", secondary_damage: "Side" },
  odometer: { mi: 156580, km: 251991 },
  vehicle_specs: { exterior_color: "WHITE" },
  sale_document: { name: "Salvage Certificate (TX)" },
  auction: { last_sold_day: "2026-07-31", full_date: "2026-07-31T14:00:00-05:00" },
};

describe("buildOrderSnapshot", () => {
  it("copies what a case file has to keep after the lot disappears", () => {
    const s = buildOrderSnapshot(LOT)!;
    expect(s).toMatchObject({
      platform: "iaai",
      lotNumber: "45016890",
      vin: "5UXCR6C55KL000000",
      year: 2014,
      make: "BMW",
      model: "X5",
      color: "WHITE",
      auctionName: "TX - Dallas",
      primaryDamage: "FRONT END",
      secondaryDamage: "Side",
      hasKeys: true,
      docType: "Salvage Certificate (TX)",
    });
  });

  it("keeps the whole payload, because nobody can re-fetch it later", () => {
    expect(buildOrderSnapshot(LOT)!.lotSnapshot).toBe(LOT);
  });

  it("folds the title through the SAME mapping search uses", () => {
    // Not a second copy of the rules. The six buckets were decided with the
    // owner, and rebuildable staying out of salvage changes what a client may
    // legally do with the car after import.
    expect(buildOrderSnapshot(LOT)!.titleClass).toBe("salvage");
    expect(
      buildOrderSnapshot({ ...LOT, sale_document: { name: "Certificate of Title" } })!.titleClass
    ).toBe("clean");
    expect(
      buildOrderSnapshot({ ...LOT, sale_document: { name: "CERT OF TITLE SLVG REBUILDABLE" } })!
        .titleClass
    ).toBe("rebuildable");
  });

  it("inherits a known gap in that mapping rather than papering over it", () => {
    // ⚠️ FOUND 2026-08-09 while writing these tests. `"Repairable (AB)"` is a
    // real Alberta title value — the schema's own `docType` comment cites it —
    // and it means the car may be repaired and re-registered, i.e. exactly
    // what `rebuildable` describes. But `normalizeTitle` matches REBUILDABLE /
    // REBUILT / RESTORABLE, and REPAIRABLE is none of those, so it lands in
    // `other`.
    //
    // Deliberately NOT fixed here. That function is inventory's, it is shared
    // with search, and changing it would mean renormalising `title_class`
    // across ~135k mirror rows — a decision for the owner and for whoever owns
    // the sweep, not a side effect of building case files. It matters more
    // here than in search, because search excludes Canada and case files do
    // not. This test pins the CURRENT behaviour so the day it changes is a
    // visible, deliberate change rather than a surprise.
    expect(
      buildOrderSnapshot({ ...LOT, sale_document: { name: "Repairable (AB)" } })!.titleClass
    ).toBe("other");
  });

  it("leaves the title class null rather than guessing at a blank document", () => {
    const s = buildOrderSnapshot({ ...LOT, sale_document: null })!;
    expect(s.docType).toBeNull();
    expect(s.titleClass).toBeNull();
  });

  it("refuses only when identity is missing — platform or lot number", () => {
    // Without these the file can never be looked up again by anyone, us
    // included. Everything else is allowed to be blank.
    expect(buildOrderSnapshot({ ...LOT, lot_number: null })).toBeNull();
    expect(buildOrderSnapshot({ ...LOT, lot_number: "   " })).toBeNull();
    expect(buildOrderSnapshot({ ...LOT, platform: "carvana" })).toBeNull();
    expect(buildOrderSnapshot(null)).toBeNull();
    expect(buildOrderSnapshot(undefined)).toBeNull();
  });

  it("degrades every non-identity field to null instead of inventing one", () => {
    const s = buildOrderSnapshot({ platform: "copart", lot_number: "1" })!;
    expect(s).toMatchObject({
      vin: null,
      year: null,
      make: null,
      model: null,
      color: null,
      odometer: null,
      odometerUnit: null,
      titleClass: null,
      hasKeys: null,
      soldAt: null,
    });
  });

  describe("odometer", () => {
    it("prefers the auction's own miles", () => {
      const s = buildOrderSnapshot(LOT)!;
      expect(s.odometer).toBe(156580);
      expect(s.odometerUnit).toBe("mi");
    });

    it("KEEPS A ZERO READING — it is a real figure, not a missing one", () => {
      // Nearly 8,000 lots in the mirror read exactly 0. A truthiness check
      // would report "unknown" about a number the auction stated plainly.
      const s = buildOrderSnapshot({ ...LOT, odometer: { mi: 0, km: 0 } })!;
      expect(s.odometer).toBe(0);
      expect(s.odometerUnit).toBe("mi");
    });

    it("falls back to kilometres rather than converting them", () => {
      // A converted figure is our arithmetic presented as the auction's record.
      const s = buildOrderSnapshot({ ...LOT, odometer: { mi: null, km: 251991 } })!;
      expect(s.odometer).toBe(251991);
      expect(s.odometerUnit).toBe("km");
    });

    it("reports nothing when the auction reported nothing", () => {
      const s = buildOrderSnapshot({ ...LOT, odometer: null })!;
      expect(s.odometer).toBeNull();
      expect(s.odometerUnit).toBeNull();
    });

    it("ignores a negative reading, which is not a mileage", () => {
      const s = buildOrderSnapshot({ ...LOT, odometer: { mi: -5, km: -8 } })!;
      expect(s.odometer).toBeNull();
    });
  });

  describe("sold date", () => {
    it("takes the sale day the auction stated", () => {
      expect(buildOrderSnapshot(LOT)!.soldAt?.toISOString().slice(0, 10)).toBe("2026-07-31");
    });

    it("falls back to the scheduled date when there is no sale day", () => {
      const s = buildOrderSnapshot({ ...LOT, auction: { full_date: "2026-08-01T10:00:00Z" } })!;
      expect(s.soldAt?.toISOString()).toBe("2026-08-01T10:00:00.000Z");
    });

    it("is null for an unparseable date, never today as a stand-in", () => {
      const s = buildOrderSnapshot({ ...LOT, auction: { last_sold_day: "soon" } })!;
      expect(s.soldAt).toBeNull();
    });
  });

  it("trims the whitespace an auction string arrives with", () => {
    const s = buildOrderSnapshot({ ...LOT, make: "  BMW  ", vin: " ABC " })!;
    expect(s.make).toBe("BMW");
    expect(s.vin).toBe("ABC");
  });
});

describe("manualOrderSnapshot", () => {
  it("lets an admin open a file the auction lookup could not fill", () => {
    const s = manualOrderSnapshot({
      platform: "copart",
      lotNumber: " 12345 ",
      year: 2019,
      make: "Toyota",
    });
    expect(s.lotNumber).toBe("12345");
    expect(s.make).toBe("Toyota");
    expect(s.platform).toBe("copart");
  });

  it("records NULL rather than an empty payload", () => {
    // `{}` would read as "we captured the lot and it was empty", which is a
    // different and false statement from "we never captured one".
    expect(manualOrderSnapshot({ platform: "iaai", lotNumber: "1" }).lotSnapshot).toBeNull();
  });
});

describe("orderTitle", () => {
  it("reads as a car", () => {
    expect(orderTitle({ year: 2014, make: "BMW", model: "X5" })).toBe("2014 BMW X5");
  });

  it("drops what is missing instead of printing gaps", () => {
    expect(orderTitle({ year: null, make: "BMW", model: "X5" })).toBe("BMW X5");
    expect(orderTitle({ year: 2014, make: null, model: null })).toBe("2014");
  });

  it("falls back to something honest rather than an empty heading", () => {
    expect(orderTitle({ year: null, make: null, model: null })).toBe("—");
  });
});
