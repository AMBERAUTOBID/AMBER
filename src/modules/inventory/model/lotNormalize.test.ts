import { describe, expect, it } from "vitest";
import {
  isEnhanced,
  normalizeBodyType,
  normalizeCondition,
  normalizeCylinders,
  normalizeDrive,
  normalizeFuel,
  normalizeTitle,
  normalizeVehicleClass,
  parseEngineCc,
} from "./lotNormalize";

/**
 * Every input string below was READ OFF REAL MIRRORED ROWS, not invented. That is
 * the point: the auctions use two vocabularies for every field and neither is
 * internally consistent, so a normaliser tested against tidy made-up values would
 * pass while shipping filter options that return nothing.
 *
 * The counts quoted in comments come from a 4,883-lot sample spanning the whole
 * catalogue.
 */
describe("normalizeFuel", () => {
  it("folds both auctions' spellings", () => {
    // Copart shouts, IAAI does not.
    expect(normalizeFuel("GAS")).toBe("gasoline"); // 2122 lots
    expect(normalizeFuel("Gasoline")).toBe("gasoline"); // 1726
    expect(normalizeFuel("Gas")).toBe("gasoline"); // 9
    expect(normalizeFuel("DIESEL")).toBe("diesel");
    expect(normalizeFuel("Diesel")).toBe("diesel");
    expect(normalizeFuel("ELECTRIC")).toBe("electric");
    expect(normalizeFuel("Electric")).toBe("electric");
  });

  it("reads a hybrid as a hybrid, not as electric or petrol", () => {
    // "ELECTRIC AND GAS HYBRID" contains ELECTRIC and GAS as well — 91 lots would
    // be misfiled if the order of tests were wrong.
    expect(normalizeFuel("ELECTRIC AND GAS HYBRID")).toBe("hybrid");
    expect(normalizeFuel("Hybrid")).toBe("hybrid");
  });

  it("folds flex-fuel variants", () => {
    expect(normalizeFuel("FLEXIBLE")).toBe("flex"); // 181
    expect(normalizeFuel("Flexible Fuel")).toBe("flex"); // 152
    expect(normalizeFuel("FLEXIBLE FUEL")).toBe("flex");
  });

  it("returns null rather than a default bucket", () => {
    expect(normalizeFuel(null)).toBeNull();
    expect(normalizeFuel("")).toBeNull();
    expect(normalizeFuel("   ")).toBeNull();
    expect(normalizeFuel("something new")).toBeNull();
  });
});

describe("normalizeDrive", () => {
  it("folds the three spellings of each layout", () => {
    expect(normalizeDrive("FRONT WHEEL DRIVE")).toBe("fwd"); // 1082
    expect(normalizeDrive("Front Wheel Drive")).toBe("fwd"); // 1055
    expect(normalizeDrive("Front-wheel Drive")).toBe("fwd"); // 35
    expect(normalizeDrive("ALL WHEEL DRIVE")).toBe("awd"); // 652
    expect(normalizeDrive("All-Wheel Drive")).toBe("awd"); // 487
    expect(normalizeDrive("All wheel drive")).toBe("awd"); // 22
    expect(normalizeDrive("REAR WHEEL DRIVE")).toBe("rwd");
    expect(normalizeDrive("Rear Wheel Drive")).toBe("rwd");
  });

  it("treats a 4x4 as four-wheel drive even when it also names an axle", () => {
    // 252 + 65 lots read "4X4 W/REAR WHEEL DRV" and "4X4 W/FRONT WHL DRV";
    // matching FRONT or REAR first would file four-wheel-drive trucks as 2WD.
    expect(normalizeDrive("4X4 W/REAR WHEEL DRV")).toBe("4wd");
    expect(normalizeDrive("4X4 W/FRONT WHL DRV")).toBe("4wd");
    expect(normalizeDrive("Four Wheel Drive")).toBe("4wd"); // 344
    expect(normalizeDrive("FOUR BY FOUR")).toBe("4wd"); // 38
  });

  it("does not guess which axle a 4x2 drives", () => {
    // "4X2 Drive" (111 lots) means two driven wheels without saying which.
    expect(normalizeDrive("4X2 Drive")).toBe("2wd");
  });

  it("returns null for the unrecognised", () => {
    expect(normalizeDrive(null)).toBeNull();
    expect(normalizeDrive("Unknown")).toBeNull();
  });
});

describe("parseEngineCc", () => {
  it("reads litres from both auctions' formats", () => {
    // 694 distinct values of this field, which is why the filter is a range.
    expect(parseEngineCc("2.0L 4")).toBe(2000); // Copart, 417 lots
    expect(parseEngineCc("2.0L I-4 DOHC, VVT, 147HP")).toBe(2000); // IAAI, 46
    expect(parseEngineCc("3.5L 6")).toBe(3500);
    expect(parseEngineCc("5.3L 8")).toBe(5300);
    expect(parseEngineCc("1.4L 4")).toBe(1400);
  });

  it("uses integer cc so a range filter never loses a boundary match", () => {
    // 2.0 is not exactly representable as a float; 2000 is exact.
    expect(parseEngineCc("2.0L 4")).toBe(2000);
    expect(Number.isInteger(parseEngineCc("2.4L 4"))).toBe(true);
  });

  it("accepts a cc figure when that is what is given", () => {
    expect(parseEngineCc("1600CC")).toBe(1600);
    expect(parseEngineCc("125 cc")).toBe(125);
  });

  it("rejects implausible displacements instead of offering them as options", () => {
    expect(parseEngineCc("0.0L")).toBeNull();
    expect(parseEngineCc("999L V8")).toBeNull();
    expect(parseEngineCc(null)).toBeNull();
    expect(parseEngineCc("V8")).toBeNull();
  });

  it("does not mistake a trim letter for a litre marker", () => {
    // "LARIAT" and "LX" must not read as a displacement.
    expect(parseEngineCc("LARIAT")).toBeNull();
    expect(parseEngineCc("2 LX")).toBeNull();
  });
});

describe("normalizeCylinders", () => {
  it("reads both formats", () => {
    expect(normalizeCylinders("4")).toBe(4); // Copart, 1339
    expect(normalizeCylinders("4 Cyl")).toBe(4); // IAAI, 1204
    expect(normalizeCylinders("8 Cyl")).toBe(8);
    expect(normalizeCylinders("10")).toBe(10);
  });

  it("treats the auctions' zero as not recorded", () => {
    // 11 lots literally say "0"; a "0 cylinders" filter option is nonsense.
    expect(normalizeCylinders("0")).toBeNull();
    expect(normalizeCylinders(null)).toBeNull();
    expect(normalizeCylinders("N/A")).toBeNull();
  });
});

describe("normalizeTitle", () => {
  it("classifies IAAI's bracketed format", () => {
    expect(normalizeTitle("Clear (Texas)")).toBe("clean"); // 129
    expect(normalizeTitle("Salvage (Pennsylvania)")).toBe("salvage"); // 117
    expect(normalizeTitle("None (ON)")).toBe("no_title"); // 72
    expect(normalizeTitle("None (AB)")).toBe("no_title");
  });

  it("classifies Copart's state-prefixed format", () => {
    expect(normalizeTitle("OH - CERT OF TITLE-SALVAGE")).toBe("salvage"); // 115
    expect(normalizeTitle("PA - CERTIFICATE OF SALVAGE")).toBe("salvage"); // 112
    expect(normalizeTitle("TX - SALVAGE VEHICLE TITLE")).toBe("salvage");
    // A clean title, worded with no qualifier at all.
    expect(normalizeTitle("TX - CERTIFICATE OF TITLE")).toBe("clean"); // 68
    expect(normalizeTitle("FL - CERTIFICATE OF TITLE")).toBe("clean"); // 74
  });

  it("keeps rebuildable distinct from plain salvage", () => {
    // The user's explicit decision: it changes what the client may legally do
    // with the car after import. Note the raw value contains SLVG too, so the
    // rebuildable test has to win.
    expect(normalizeTitle("FL - CERT OF TITLE SLVG REBUILDABLE")).toBe("rebuildable"); // 173
  });

  it("does not call a dealer-only title clean", () => {
    // Contains the word CLEAN, but a private client cannot act on it.
    expect(normalizeTitle("MI - DEALER ONLY CLEAN TITLE")).toBe("other");
  });

  it("puts the never-road-legal in its own bucket", () => {
    expect(normalizeTitle("NON REPAIRABLE")).toBe("non_repairable");
    expect(normalizeTitle("FL - NON-REPAIRABLE")).toBe("non_repairable");
    expect(normalizeTitle("CERT OF DESTRUCTION")).toBe("non_repairable");
    expect(normalizeTitle("JUNK TITLE")).toBe("non_repairable");
  });

  it("catches NON REPAIR even without the -ABLE suffix", () => {
    // Regression. These are real values, and the first three previously fell
    // through to "clean" because they also contain "CERT OF TITLE" — a
    // non-repairable car presented as having a clean title. Apibara independently
    // reports registration=false for the AZ lot.
    expect(normalizeTitle("AZ - CERT OF TITLE- NON REPAIR")).toBe("non_repairable");
    expect(normalizeTitle("CERT OF TITLE-NONREPAIR")).toBe("non_repairable");
    expect(normalizeTitle("CO - NON-REPAIRABLE CERT OF TITLE")).toBe("non_repairable");
    expect(normalizeTitle("AL - CERT OF TITLE-PARTS ONLY SALVG")).toBe("non_repairable");
  });

  it("recognises the SALV abbreviation", () => {
    // Real value that previously landed in "other".
    expect(normalizeTitle("CA - DIS/DLR/EXP LIEN PAPERS-SALV")).toBe("salvage");
  });

  it("never guesses clean for something it does not recognise", () => {
    // Mislabelling a salvage car as clean is the worst failure available here,
    // so the fallback is "other", never "clean".
    expect(normalizeTitle("SOME UNSEEN WORDING")).toBe("other");
    expect(normalizeTitle(null)).toBeNull();
  });
});

describe("normalizeCondition and isEnhanced", () => {
  it("folds the run-condition spellings", () => {
    expect(normalizeCondition("RUNS AND DRIVES")).toBe("run_and_drive"); // 1647
    expect(normalizeCondition("Run & Drive")).toBe("run_and_drive"); // 1424
    expect(normalizeCondition("Stationary")).toBe("stationary"); // 636
    expect(normalizeCondition("ENGINE START PROGRAM")).toBe("starts"); // 171
    expect(normalizeCondition("Starts")).toBe("starts");
    expect(normalizeCondition("STARTS")).toBe("starts");
  });

  it("refuses to infer a run condition from ENHANCED VEHICLES", () => {
    // 779 lots (16%). Per Copart, "enhanced" means the seller permitted cosmetic
    // cleaning or parts removal; it is explicitly separate from Run and Drive or
    // engine-start status, and is not even a promise the work was done. Claiming
    // either way would tell a bidder something unevidenced about whether the car
    // starts, so the run condition is null and the fact is recorded separately.
    expect(normalizeCondition("ENHANCED VEHICLES")).toBeNull();
    expect(isEnhanced("ENHANCED VEHICLES")).toBe(true);
    expect(isEnhanced("RUNS AND DRIVES")).toBe(false);
    expect(isEnhanced(null)).toBe(false);
  });

  it("returns null when nothing was reported", () => {
    expect(normalizeCondition(null)).toBeNull(); // 128 lots
  });
});

describe("normalizeVehicleClass", () => {
  it("folds Copart's shouting and IAAI's title case into one set", () => {
    expect(normalizeVehicleClass("AUTOMOBILE")).toBe("automobile"); // 4430
    expect(normalizeVehicleClass("Automobile")).toBe("automobile"); // 72
    expect(normalizeVehicleClass("SUV")).toBe("automobile"); // 35
    expect(normalizeVehicleClass("MOTORCYCLE")).toBe("motorcycle"); // 49
    expect(normalizeVehicleClass("Light Truck")).toBe("truck"); // 40
    expect(normalizeVehicleClass("MEDIUM DUTY/BOX TRUCKS")).toBe("truck"); // 85
    expect(normalizeVehicleClass("TRUCK")).toBe("truck");
  });

  it("keeps non-car inventory searchable rather than dropping it", () => {
    // The user's requirement is explicitly "any vehicle from IAAI and Copart",
    // so these need a real bucket, not a silent exclusion.
    expect(normalizeVehicleClass("INDUSTRIAL EQUIPMENT")).toBe("other"); // 26
    expect(normalizeVehicleClass("BUS")).toBe("other");
    expect(normalizeVehicleClass("TRAILER")).toBe("other");
    expect(normalizeVehicleClass("Recreational/ Miscellaneous")).toBe("other");
    expect(normalizeVehicleClass("LOW SPEED VEHICLE (LSV)")).toBe("other");
  });

  it("handles the trailing space in the vendor's own vocabulary", () => {
    expect(normalizeVehicleClass("TRUCK ")).toBe("truck");
  });
});

describe("normalizeBodyType", () => {
  it("folds four spellings of SUV into one", () => {
    expect(normalizeBodyType("Sport Utility")).toBe("suv"); // 821
    expect(normalizeBodyType("SPORT UTILITY VEHICLE")).toBe("suv"); // 467
    expect(normalizeBodyType("4DR SPORT UTILITY")).toBe("suv"); // 399
    expect(normalizeBodyType("SUV")).toBe("suv"); // 114
    // Truncated in the source data, not by us.
    expect(normalizeBodyType("Sport Utility Vehicl")).toBe("suv"); // 36
  });

  it("folds three spellings of sedan", () => {
    expect(normalizeBodyType("Sedan")).toBe("sedan"); // 675
    expect(normalizeBodyType("SEDAN")).toBe("sedan"); // 421
    expect(normalizeBodyType("SEDAN 4DR")).toBe("sedan"); // 325
  });

  it("reads cab styles as pickups", () => {
    expect(normalizeBodyType("PICKUP")).toBe("pickup"); // 133
    expect(normalizeBodyType("Crew Cab")).toBe("pickup"); // 123
  });

  it("handles the rest of the observed set", () => {
    expect(normalizeBodyType("Hatchback")).toBe("hatchback");
    expect(normalizeBodyType("COUPE")).toBe("coupe");
    expect(normalizeBodyType("Extended Cargo Van")).toBe("van");
    expect(normalizeBodyType("Wagon 4 Dr.")).toBe("wagon");
    expect(normalizeBodyType("Convertible")).toBe("convertible");
  });

  it("returns null for N/A and the unrecognised", () => {
    expect(normalizeBodyType("N/A")).toBeNull();
    expect(normalizeBodyType(null)).toBeNull();
    expect(normalizeBodyType("Utility")).toBeNull();
  });
});
