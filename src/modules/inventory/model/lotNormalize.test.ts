import { describe, expect, it } from "vitest";
import {
  isEnhanced,
  normalizeBodyType,
  normalizeCondition,
  normalizeColor,
  normalizeCylinders,
  normalizeDamage,
  normalizeDrive,
  normalizeFuel,
  normalizeTitle,
  normalizeTransmission,
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

/**
 * The complete colour vocabulary — all 58 distinct `color` values over 134,647
 * mirrored rows, read with scripts/ingest/values.ts. Same exhaustive-by-
 * construction rule as the damage table below.
 */
const COLOR_VOCABULARY: Array<[string, ReturnType<typeof normalizeColor>]> = [
  ["WHITE", "white"], // 15413
  ["White", "white"], // 15303 — the same colour, twice in the filter
  ["Black", "black"], // 15262
  ["BLACK", "black"], // 12927
  ["Gray", "gray"], // 11879
  ["GRAY", "gray"], // 8697
  ["Grey", "gray"], // 114 — British spelling, in the same catalogue
  ["CHARCOAL", "gray"], // 1451
  ["Pewter", "gray"], // 71
  ["Silver", "silver"], // 8169
  ["SILVER", "silver"], // 7577
  ["SILVE", "silver"], // 2 — truncated in the source data
  ["BLUE", "blue"], // 6290
  ["Blue", "blue"], // 6127
  ["Dark Blue", "blue"], // 637
  ["Light Blue", "blue"], // 525
  ["Navy", "blue"], // 126
  ["Red", "red"], // 5080
  ["RED", "red"], // 3886
  ["Candy Apple Red", "red"], // 3
  ["CRIMSON", "red"], // 2
  ["Green", "green"], // 1287
  ["GREEN", "green"], // 997
  ["BURGUNDY", "burgundy"], // 1008
  ["Burgundy", "burgundy"], // 814
  ["Maroon", "burgundy"], // 680
  ["MAROON", "burgundy"], // 497
  ["Brown", "brown"], // 880
  ["BROWN", "brown"], // 559
  ["Dark Brown", "brown"], // 43
  ["TAN", "beige"], // 687
  ["Tan", "beige"], // 426
  ["Beige", "beige"], // 498
  ["BEIGE", "beige"], // 444
  ["Cream", "beige"], // 157
  ["CREAM", "beige"], // 155
  ["Champagne", "beige"], // 201
  ["Gold", "gold"], // 750
  ["GOLD", "gold"], // 490
  ["YELLOW", "yellow"], // 603
  ["Yellow", "yellow"], // 191
  ["Orange", "orange"], // 400
  ["ORANGE", "orange"], // 361
  ["Purple", "purple"], // 181
  ["PURPLE", "purple"], // 115
  ["TEAL", "teal"], // 134
  ["Teal", "teal"], // 103
  ["TURQUOISE", "teal"], // 79
  ["Turquoise", "teal"], // 42
  ["Pink", "pink"], // 20
  ["PINK", "pink"], // 11
  ["TWO TONE", "other"], // 430 — a real answer meaning "more than one"
  ["Multi", "other"], // 1
  ["BURN", null], // 212 — a burned car, NOT a paint colour
  ["- Unknown -", null], // 15
  ["- N/A -", null], // 8
  ["UNKNOWN - NOT OK FOR INV.", null], // 8
  ["Unknown", null], // 3
];

describe("normalizeColor", () => {
  it("classifies every colour measured in the catalogue", () => {
    for (const [raw, expected] of COLOR_VOCABULARY) {
      expect(normalizeColor(raw), `${raw} should map to ${expected}`).toBe(expected);
    }
  });

  it("covers the whole measured vocabulary exactly once", () => {
    const raws = COLOR_VOCABULARY.map(([raw]) => raw);
    expect(new Set(raws).size, "a value is listed twice").toBe(raws.length);
    expect(raws.length).toBe(58);
  });

  it("folds case, spelling and truncation", () => {
    // 30,716 lots were about to show as two separate "white" options.
    expect(normalizeColor("WHITE")).toBe(normalizeColor("White"));
    // British and American spelling, both real here.
    expect(normalizeColor("Grey")).toBe(normalizeColor("Gray"));
    // The source truncates, exactly as it does with "Sport Utility Vehicl".
    expect(normalizeColor("SILVE")).toBe(normalizeColor("SILVER"));
  });

  it("refuses to read a burned car as a paint colour", () => {
    // Copart puts BURN in the colour field on 212 lots. We do not know the
    // paint, and "other" would imply we did. The damage columns already record
    // that it burned.
    expect(normalizeColor("BURN")).toBeNull();
  });

  it("returns null rather than a default bucket", () => {
    expect(normalizeColor(null)).toBeNull();
    expect(normalizeColor("")).toBeNull();
    expect(normalizeColor("Aubergine")).toBeNull();
  });
});

describe("normalizeTransmission", () => {
  it("folds the two spellings that would have split 125,000 lots", () => {
    expect(normalizeTransmission("Automatic")).toBe("automatic"); // 66425
    expect(normalizeTransmission("AUTOMATIC")).toBe("automatic"); // 59178
    expect(normalizeTransmission("Automatic Transmission")).toBe("automatic"); // 1
    expect(normalizeTransmission("ECVT AUTOMATIC")).toBe("automatic"); // 13
    expect(normalizeTransmission("MANUAL")).toBe("manual"); // 1920
    expect(normalizeTransmission("Manual")).toBe("manual"); // 1478
  });

  it("counts a CVT as automatic, because there is no clutch pedal", () => {
    expect(normalizeTransmission("CVT")).toBe("automatic"); // 38
  });

  it("refuses to file an automated manual as either", () => {
    // It sits between the two and calling it either would be a guess. 5 lots.
    expect(normalizeTransmission("BOTH AUTOMATED MANUAL")).toBeNull();
  });

  it("returns null for the auctions' non-answers", () => {
    expect(normalizeTransmission("Unknown")).toBeNull(); // 1908
    expect(normalizeTransmission("UNKNOWN")).toBeNull(); // 127
    expect(normalizeTransmission("NONE")).toBeNull(); // 190
    expect(normalizeTransmission(null)).toBeNull();
  });
});

/**
 * EXHAUSTIVE BY CONSTRUCTION. The table below is the complete union of every
 * distinct `primary_damage` (77) and `secondary_damage` (75) value in the mirror
 * as of 2026-08-07, read straight off 134,647 rows with scripts/ingest/values.ts
 * — not a selection, and not invented.
 *
 * That matters because damage is the field where the two vocabularies collide
 * hardest: `FRONT END` (26,246 lots) and `Front End` (18,092) are the same
 * concept, and shipping them unfolded would show a visitor every option twice.
 * If the vendor introduces a 78th value, it maps to null and this table is how
 * we notice.
 */
const DAMAGE_VOCABULARY: Array<[string, ReturnType<typeof normalizeDamage>]> = [
  // ── location, and the corner variants folded into it ──
  ["FRONT END", "front"], // 26246
  ["Front End", "front"], // 18092 — same concept, other auction
  ["Front", "front"], // 1719
  ["Right Front", "front"], // 3077
  ["Left Front", "front"], // 3041
  ["REAR END", "rear"], // 7680
  ["Rear", "rear"], // 5137
  ["Left Rear", "rear"], // 1388
  ["Right Rear", "rear"], // 999
  ["Front & Rear", "front_and_rear"], // 2286 — names both ends
  ["SIDE", "side"], // 7221
  ["Left Side", "side"], // 4094
  ["Right Side", "side"], // 3806
  ["Left & Right Side", "side"], // 948
  ["ALL OVER", "all_over"], // 1225
  ["All Over", "all_over"], // 884
  ["TOP/ROOF", "roof"], // 531
  ["Roof", "roof"], // 382
  ["Roof Damage", "roof"], // 14
  ["UNDERCARRIAGE", "undercarriage"], // 714
  ["Undercarriage", "undercarriage"], // 280
  ["Under Carriage", "undercarriage"], // 10 — spacing drift, same thing
  ["Front Window", "glass"], // 8
  ["Rear Window", "glass"], // 1
  ["Interior Damage", "interior"], // 7

  // ── condition ──
  ["Normal Wear & Tear", "normal_wear"], // 17893
  ["NORMAL WEAR", "normal_wear"], // 2708
  ["MINOR DENT/SCRATCHES", "minor_dent"], // 7739

  // ── cause ──
  ["MECHANICAL", "mechanical"], // 3958
  ["Mechanical", "mechanical"], // 252
  ["Possible Mech.", "mechanical"], // 28 — abbreviated
  ["Engine Damage", "mechanical"], // 185
  ["Engine", "mechanical"], // 4
  ["Transmission Damage", "mechanical"], // 79
  ["Suspension", "mechanical"], // 124
  ["Steering Column", "mechanical"], // 5 (secondary only)
  ["Electrical", "electrical"], // 121
  ["Hail", "hail"], // 1883
  ["HAIL", "hail"], // 1174
  ["WATER/FLOOD", "water"], // 1105 — carries both words
  ["Flood", "water"], // 649
  ["Water", "water"], // 158
  ["Fresh Water", "water"], // 146
  ["Salt Water", "water"], // 13
  ["Storm Damage", "storm"], // 148
  ["BURN", "burn"], // 559
  ["Total Burn", "burn"], // 330
  ["Engine Burn", "burn"], // 185
  ["BURN - ENGINE", "burn"], // 174
  ["Interior Burn", "burn"], // 108
  ["Exterior Burn", "burn"], // 102
  ["BURN - INTERIOR", "burn"], // 79
  ["Interior Fire", "burn"], // 21
  ["Engine Fire", "burn"], // 20
  ["ROLLOVER", "rollover"], // 902
  ["Rollover", "rollover"], // 712
  ["Roll Over", "rollover"], // 72 — spacing drift
  ["FRAME DAMAGE", "frame"], // 73
  ["Frame", "frame"], // 43
  ["Structural", "frame"], // 14 (secondary only)
  ["STRIPPED", "stripped"], // 226
  ["Strip", "stripped"], // 36
  ["VANDALISM", "vandalism"], // 578
  ["Vandalized", "vandalism"], // 109
  ["Theft", "theft"], // 588
  ["Biohazard", "biohazard"], // 297
  ["Bio Hazard", "biohazard"], // 31 — spacing drift
  ["BIOHAZARD/CHEMICAL", "biohazard"], // 30

  // ── not damage: why the car is at auction ──
  ["Repossession", "repossession"], // 236 + 288
  ["PARTIAL REPAIR", "repair"], // 16
  ["REJECTED REPAIR", "repair"], // 7
  ["MISSING/ALTERED VIN", "vin_issue"], // 13
  ["REPLACED VIN", "vin_issue"], // 6
  ["DAMAGE HISTORY", "other"], // 49
  ["Charity", "other"], // 40
  ["Cash For Clunkers", "other"], // 3

  // ── the auctions saying they have nothing ──
  ["Unknown", null], // 800
  ["UNKNOWN", null], // 22
  ["None", null], // 744 secondary, 22 primary
];

describe("normalizeDamage", () => {
  it("classifies every value measured in the catalogue", () => {
    for (const [raw, expected] of DAMAGE_VOCABULARY) {
      expect(normalizeDamage(raw), `${raw} should map to ${expected}`).toBe(expected);
    }
  });

  it("covers the whole measured vocabulary exactly once", () => {
    // 77 distinct primary values and 75 secondary, overlapping in all but two
    // (`Structural` and `Steering Column` appear only as a secondary damage).
    // The union is therefore 79, and pinning it is what makes a dropped row
    // during a future edit fail loudly instead of quietly reducing coverage.
    const raws = DAMAGE_VOCABULARY.map(([raw]) => raw);
    expect(new Set(raws).size, "a value is listed twice").toBe(raws.length);
    expect(raws.length).toBe(79);
  });

  it("folds the two auctions' spellings of the same concept", () => {
    // The bug this whole function exists to fix — these four were showing as
    // four separate filter options over 45,000 lots.
    expect(normalizeDamage("FRONT END")).toBe(normalizeDamage("Front End"));
    expect(normalizeDamage("NORMAL WEAR")).toBe(normalizeDamage("Normal Wear & Tear"));
    expect(normalizeDamage("ROLLOVER")).toBe(normalizeDamage("Roll Over"));
    expect(normalizeDamage("UNDERCARRIAGE")).toBe(normalizeDamage("Under Carriage"));
    expect(normalizeDamage("Biohazard")).toBe(normalizeDamage("Bio Hazard"));
  });

  it("reads fire as fire, whatever burned", () => {
    // Each of these contains a component or location word that a later test
    // would otherwise capture — the ordering trap this field is full of.
    expect(normalizeDamage("Engine Burn")).toBe("burn");
    expect(normalizeDamage("BURN - ENGINE")).toBe("burn");
    expect(normalizeDamage("Interior Fire")).toBe("burn");
    expect(normalizeDamage("BURN - INTERIOR")).toBe("burn");
  });

  it("reads a broken window as glass, not as a front or rear collision", () => {
    expect(normalizeDamage("Front Window")).toBe("glass");
    expect(normalizeDamage("Rear Window")).toBe("glass");
  });

  it("keeps a car damaged at both ends out of the single-end buckets", () => {
    expect(normalizeDamage("Front & Rear")).toBe("front_and_rear");
  });

  it("does not let a substring invent a VIN problem", () => {
    // Squashing punctuation would make DRIVING contain VIN, which is why the VIN
    // test runs on word boundaries against the spaced string.
    expect(normalizeDamage("MISSING/ALTERED VIN")).toBe("vin_issue");
    expect(normalizeDamage("Driving")).toBeNull();
  });

  it("returns null rather than a default bucket", () => {
    expect(normalizeDamage(null)).toBeNull();
    expect(normalizeDamage(undefined)).toBeNull();
    expect(normalizeDamage("")).toBeNull();
    expect(normalizeDamage("   ")).toBeNull();
    // A value the vendor has not sent yet must show up as unclassified rather
    // than be quietly filed under "other".
    expect(normalizeDamage("Meteor Strike")).toBeNull();
  });
});
