/**
 * Folds the auctions' raw vocabularies into the small sets a filter panel can
 * actually offer.
 *
 * WHY THIS EXISTS, measured over 4,883 mirrored lots: Copart and IAAI describe
 * the same facts in different words, and neither is internally consistent.
 * `fuel` alone arrives as GAS / Gasoline / Gas, `drive` as FRONT WHEEL DRIVE /
 * Front Wheel Drive / Front-wheel Drive, `cylinders` as "4" or "4 Cyl", and
 * `doc_type` has **415 distinct values**. Offering those raw would give a
 * visitor six spellings of "SUV" and a dropdown nobody can use.
 *
 * TWO RULES THROUGHOUT:
 *
 * 1. The raw string is never discarded — it stays in its own column, and the
 *    lot page shows it. These functions produce a *filterable* classification,
 *    not a replacement for what the auction said. A wrong mapping is then
 *    fixable by re-running over stored rows, with no re-fetch.
 * 2. Unrecognised input returns null, never a default bucket. Null means "we
 *    could not classify this", which a filter renders as absent rather than as
 *    a confident wrong answer. Silently bucketing the unknown is how 128,000
 *    lots would end up mislabelled "Other".
 *
 * Ordering inside each function is deliberate and load-bearing — several raw
 * values contain more than one keyword, and the more specific test has to run
 * first. Those cases are commented where they occur.
 */

function upper(v: string | null | undefined): string | null {
  const t = v?.trim().toUpperCase();
  return t && t.length > 0 ? t : null;
}

// ── fuel ─────────────────────────────────────────────────────────────────────

export type FuelClass = "gasoline" | "diesel" | "electric" | "hybrid" | "flex" | "other";

export function normalizeFuel(raw: string | null | undefined): FuelClass | null {
  const s = upper(raw);
  if (!s) return null;
  // "ELECTRIC AND GAS HYBRID" contains ELECTRIC *and* GAS *and* HYBRID, so the
  // hybrid test must come before either of the others.
  if (s.includes("HYBRID")) return "hybrid";
  if (s.includes("FLEX")) return "flex";
  if (s.includes("DIESEL")) return "diesel";
  if (s.includes("ELECTRIC")) return "electric";
  if (s.includes("GAS") || s.includes("PETROL")) return "gasoline";
  if (s.includes("OTHER") || s.includes("UNKNOWN")) return "other";
  return null;
}

// ── drivetrain ───────────────────────────────────────────────────────────────

export type DriveClass = "fwd" | "rwd" | "awd" | "4wd" | "2wd";

export function normalizeDrive(raw: string | null | undefined): DriveClass | null {
  const s = upper(raw);
  if (!s) return null;
  // "4X4 W/REAR WHEEL DRV" and "4X4 W/FRONT WHL DRV" both name a second axle
  // layout, so 4x4 has to win over the FRONT/REAR tests below.
  if (s.includes("4X4") || s.includes("FOUR WHEEL") || s.includes("FOUR BY FOUR") || s.includes("4WD")) {
    return "4wd";
  }
  if (s.includes("ALL WHEEL") || s.includes("ALL-WHEEL") || s.includes("AWD")) return "awd";
  // 4X2 means two driven wheels without saying which axle — deliberately its
  // own value rather than a guess at FWD or RWD.
  if (s.includes("4X2") || s.includes("2WD")) return "2wd";
  if (s.includes("FRONT")) return "fwd";
  if (s.includes("REAR")) return "rwd";
  return null;
}

// ── engine ───────────────────────────────────────────────────────────────────

/** Plausible range for anything sold at these auctions: a 50cc scooter to a
 * 20-litre industrial engine. Outside it, the number is a data error rather than
 * a displacement, and a filter must not offer it. */
const MIN_CC = 50;
const MAX_CC = 20_000;

/**
 * Engine displacement in cubic centimetres.
 *
 * Integer cc rather than fractional litres, for the same reason money is stored
 * in cents: 2.0 is not exactly representable and a range filter that compares
 * floats will drop boundary matches.
 *
 * Handles both observed formats — Copart's `"2.0L 4"` and IAAI's
 * `"2.0L I-4 DOHC, VVT, 147HP"` — because both put the litre figure first.
 * There are 694 distinct values of this field, which is exactly why the filter
 * has to be a numeric range and not a dropdown.
 */
export function parseEngineCc(raw: string | null | undefined): number | null {
  const s = upper(raw);
  if (!s) return null;

  const litres = /(\d+(?:\.\d+)?)\s*L(?![A-Z])/.exec(s);
  if (litres) {
    const cc = Math.round(Number(litres[1]) * 1000);
    if (cc >= MIN_CC && cc <= MAX_CC) return cc;
  }

  const cc = /(\d{2,5})\s*CC/.exec(s);
  if (cc) {
    const n = Number(cc[1]);
    if (n >= MIN_CC && n <= MAX_CC) return n;
  }

  return null;
}

/** `"4"` from Copart, `"4 Cyl"` from IAAI. Zero is the auctions' way of saying
 * "not recorded" and must not become a selectable "0 cylinders". */
export function normalizeCylinders(raw: string | null | undefined): number | null {
  const s = upper(raw);
  if (!s) return null;
  const m = /(\d{1,2})/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n <= 16 ? n : null;
}

// ── title / paperwork ────────────────────────────────────────────────────────

export type TitleClass = "clean" | "salvage" | "rebuildable" | "non_repairable" | "no_title" | "other";

/**
 * The six buckets, chosen with the user 2026-08-06 and deliberately keeping
 * **Rebuildable separate from Salvage** — it changes what a client may legally
 * do with the car after import, which is a money question, not a cosmetic one.
 *
 * Two raw formats, 415 values between them:
 *   Copart  "FL - CERT OF TITLE SLVG REBUILDABLE", "TX - CERTIFICATE OF TITLE"
 *   IAAI    "Clear (Texas)", "Salvage (Pennsylvania)", "None (ON)"
 *
 * This classifies paperwork, so when in doubt it returns `other` or null rather
 * than guessing `clean` — telling a buyer a salvage car has a clean title is the
 * worst possible failure here.
 */
export function normalizeTitle(raw: string | null | undefined): TitleClass | null {
  const s = upper(raw);
  if (!s) return null;

  // Most restrictive first: a car that may never be road-registered.
  //
  // One regex rather than a list of spellings, because listing them missed a real
  // one. "AZ - CERT OF TITLE- NON REPAIR" (no -ABLE) fell through every variant
  // and then matched "CERT OF TITLE", so a NON-REPAIRABLE car was classified as a
  // CLEAN title — the single worst mistake this function can make. Apibara
  // independently reports registration=false for that exact lot.
  // Covers NONREPAIR, NON REPAIR, NON-REPAIR and their -ABLE forms.
  if (/NON[\s-]?REPAIR/.test(s)) return "non_repairable";
  if (s.includes("DESTRUCTION") || s.includes("JUNK") || s.includes("SCRAP") || s.includes("PARTS ONLY")) {
    return "non_repairable";
  }

  // A dealer-only restriction is not a statement about damage, and it is not a
  // clean title a private client can act on — so it is checked BEFORE "CLEAN"
  // would otherwise match "DEALER ONLY CLEAN TITLE".
  if (s.includes("DEALER ONLY")) return "other";

  // "CERT OF TITLE SLVG REBUILDABLE" contains SLVG too; rebuildable is the more
  // specific and more useful answer, so it wins.
  if (s.includes("REBUILDABLE") || s.includes("REBUILT") || s.includes("RESTORABLE")) {
    return "rebuildable";
  }
  // SALV covers the abbreviation seen in real values such as
  // "CA - DIS/DLR/EXP LIEN PAPERS-SALV", which previously fell through to "other".
  if (s.includes("SALVAGE") || s.includes("SLVG") || s.includes("SALV")) return "salvage";

  if (s.startsWith("NONE") || s.includes("NO TITLE") || s.includes("BILL OF SALE")) return "no_title";

  if (s.includes("CLEAR") || s.includes("CLEAN")) return "clean";
  // Copart words a clean title as "CERTIFICATE OF TITLE" with no qualifier —
  // reachable only after every salvage test above has failed.
  if (s.includes("CERTIFICATE OF TITLE") || s.includes("CERT OF TITLE")) return "clean";

  return "other";
}

// ── run condition ────────────────────────────────────────────────────────────

export type ConditionClass = "run_and_drive" | "starts" | "stationary";

/**
 * Run condition, from a field the auctions OVERLOAD.
 *
 * `highlights` carries one value per lot, and that value is sometimes a run
 * condition (RUNS AND DRIVES / Starts / Stationary) and sometimes Copart's
 * "ENHANCED VEHICLES" — which is **not a run condition at all**. Per Copart's
 * own terminology, enhanced means the seller permitted *cosmetic* cleaning or
 * parts removal; it does not guarantee the work was done and is explicitly
 * separate from Run and Drive or engine-start status.
 *
 * So for the ~16% of lots marked enhanced, the run condition is genuinely
 * UNKNOWN and this returns null. Folding them into `run_and_drive` would tell a
 * client the car starts on no evidence; folding them into `stationary` would say
 * the opposite, equally baselessly. Whether the car runs is exactly the fact a
 * bidder needs, so inventing it is worse than admitting we don't know — the lot
 * page still shows the raw string, and `isEnhanced` keeps the real information.
 */
export function normalizeCondition(raw: string | null | undefined): ConditionClass | null {
  const s = upper(raw);
  if (!s) return null;
  // Checked first: an enhanced lot must not fall through to the START test below
  // on the strength of some unrelated substring.
  if (s.includes("ENHANCED")) return null;
  if (s.includes("RUN") && s.includes("DRIV")) return "run_and_drive";
  if (s.includes("START")) return "starts";
  if (s.includes("STATIONARY")) return "stationary";
  return null;
}

/**
 * Whether the seller allowed cosmetic preparation — cleaning, protective covers,
 * removal of visibly broken parts.
 *
 * Kept as its own fact rather than a run condition, because that is what it is.
 * It says nothing about whether the car drives, and per Copart it is not even a
 * promise the cleaning happened — only that the lot qualified for it. Useful to
 * show; must never be presented as a condition guarantee.
 */
export function isEnhanced(raw: string | null | undefined): boolean {
  return upper(raw)?.includes("ENHANCED") ?? false;
}

// ── category and body ────────────────────────────────────────────────────────

export type VehicleClass =
  | "automobile"
  | "motorcycle"
  | "truck"
  | "trailer"
  | "boat"
  | "jet_ski"
  | "atv"
  | "bus"
  | "rv"
  | "equipment"
  | "other";

/**
 * The top-level category tabs. Driven by `vehicle_type`, which measured 99.9%
 * populated — NOT by `car_info.vehicle_type`, whose API filter matched only 9.3%
 * of the catalogue and would have hidden most of the inventory.
 *
 * Copart shouts (`AUTOMOBILE`, `MEDIUM DUTY/BOX TRUCKS`) and IAAI does not
 * (`Automobile`, `Light Truck`), so case folding is the whole point.
 *
 * WIDENED FROM FOUR BUCKETS TO ELEVEN, 2026-08-08, for two measured reasons.
 *
 * First, four buckets were losing inventory outright: `SEDAN`, `PICKUP`,
 * `COUPE`, `VAN`, `MOTOR HOME`, `PERSONAL WATERCRAFT`, `JET SKI` and
 * `SNOWMOBILE` all fell through to null, so **575 searchable lots had no
 * category at all** and could not be reached by browsing.
 *
 * Second, the old `other` bucket was hiding categories a buyer shops for by
 * name: 1,257 trailers, 685 RVs, 546 pieces of equipment, 347 buses and 320
 * boats and jet skis were one undifferentiated pile. The requirement was always
 * that search reach everything Copart and IAAI list, not just cars.
 *
 * The eleven match what bidauto.online offers, because their list maps cleanly
 * onto values our own `vehicle_type` already carries — both sides are reading
 * the same auctions.
 */
export function normalizeVehicleClass(raw: string | null | undefined): VehicleClass | null {
  const s = upper(raw);
  if (!s) return null;

  if (s.includes("MOTORCYCLE") || s.includes("MOPED") || s.includes("SCOOTER")) return "motorcycle";

  // Before the mobile-home tests: SNOWMOBILE contains MOBILE and would otherwise
  // be filed as a motorhome.
  if (s.includes("SNOWMOBILE") || s.includes("ATV") || s.includes("UTV") || s.includes("OFF ROAD")) {
    return "atv";
  }

  // Before boat: a jet ski is a boat by any keyword test, and buyers shop for
  // the two separately.
  if (s.includes("JET SKI") || s.includes("WATERCRAFT")) return "jet_ski";
  if (s.includes("BOAT") || s.includes("PONTOON") || s.includes("MARINE")) return "boat";

  // Before RV: a TRAVEL TRAILER is towed, which is what decides how it ships and
  // what a buyer needs to move it.
  if (s.includes("TRAILER")) return "trailer";
  if (s.includes("MOTOR HOME") || s.includes("MOTORHOME") || s.includes("RECREATIONAL VEHICLE") || s === "RV") {
    return "rv";
  }

  if (s.includes("BUS")) return "bus";

  // Before equipment, because HEAVY DUTY TRUCKS contains HEAVY and would
  // otherwise land with the diggers.
  if (s.includes("TRUCK") || s.includes("TRACTOR")) return "truck";

  if (
    s.includes("EQUIPMENT") ||
    s.includes("INDUSTRIAL") ||
    s.includes("CONSTRUCTION") ||
    s.includes("AGRICULTURE") ||
    s.includes("FARM")
  ) {
    return "equipment";
  }

  // The body-style words appear as top-level types on ~350 lots. They were
  // returning NULL and vanishing from category browsing entirely; the matching
  // `bodyType` on those rows already reads sedan/coupe/van, so filing them as
  // automobiles is what the rest of the row already says.
  if (
    s.includes("AUTOMOBILE") ||
    s.includes("PASSENGER CAR") ||
    s.includes("MPV") ||
    s === "SUV" ||
    s === "SEDAN" ||
    s === "COUPE" ||
    s === "VAN" ||
    s === "PICKUP" ||
    s === "HATCHBACK" ||
    s === "WAGON" ||
    s === "CONVERTIBLE"
  ) {
    return "automobile";
  }

  // Recognised, but genuinely none of the above.
  if (s.includes("INCOMPLETE") || s.includes("LOW SPEED") || s.includes("MISCELLANEOUS") || s === "OTHER") {
    return "other";
  }
  return null;
}

export type BodyType =
  | "sedan"
  | "suv"
  | "pickup"
  | "coupe"
  | "hatchback"
  | "van"
  | "wagon"
  | "convertible"
  | "truck"
  | "motorcycle";

/**
 * Body Type, folded from a badly fragmented field: `Sport Utility`,
 * `SPORT UTILITY VEHICLE`, `4DR SPORT UTILITY`, `SUV` and the literally
 * truncated `Sport Utility Vehicl` are all one thing, and `Sedan` / `SEDAN` /
 * `SEDAN 4DR` another.
 */
export function normalizeBodyType(raw: string | null | undefined): BodyType | null {
  const s = upper(raw);
  if (!s) return null;
  // "SPORT UTILITY VEHICL" appears truncated in the source data, so match on the
  // stem rather than the full phrase.
  if (s.includes("SPORT UTILITY") || s === "SUV" || s.includes("UTILITY VEHICL")) return "suv";
  if (s.includes("CONVERTIBLE") || s.includes("ROADSTER")) return "convertible";
  if (s.includes("HATCHBACK") || s.includes("LIFTBACK")) return "hatchback";
  if (s.includes("WAGON")) return "wagon";
  if (s.includes("VAN")) return "van";
  // Cab styles are how the auctions describe pickups.
  if (s.includes("PICKUP") || s.includes("CREW CAB") || s.includes("EXT CAB") || s.includes("CAB")) {
    return "pickup";
  }
  if (s.includes("COUPE")) return "coupe";
  if (s.includes("SEDAN")) return "sedan";
  if (s.includes("MOTORCYCLE") || s.includes("SCOOTER")) return "motorcycle";
  if (s.includes("TRUCK")) return "truck";
  return null;
}

// ── colour ───────────────────────────────────────────────────────────────────

export type ColorClass =
  | "white"
  | "black"
  | "gray"
  | "silver"
  | "blue"
  | "red"
  | "green"
  | "brown"
  | "beige"
  | "gold"
  | "burgundy"
  | "yellow"
  | "orange"
  | "purple"
  | "teal"
  | "pink"
  | "other";

/**
 * Paint colour, folded from 58 distinct raw values over 134,647 lots.
 *
 * Same duplicate-options problem as damage, and just as large: `WHITE` (15,413)
 * and `White` (15,303) are one colour, as are `BLACK` (12,927) and `Black`
 * (15,262). Three traps beyond simple case:
 *
 *  - **`Grey` and `Gray` both occur.** British and American spelling in the same
 *    catalogue, 114 lots on the British one.
 *  - **`SILVE` is truncated `SILVER`** in the source data, the same corruption
 *    that produced `Sport Utility Vehicl` in body style. Matched on the stem.
 *  - **`BURN` (212 lots) IS NOT A COLOUR.** It is a burned car, described in the
 *    colour field. It returns null — we do not know the paint, and saying
 *    "other" would imply we had an answer. The damage columns already carry the
 *    fact that it burned.
 *
 * Shades fold into their parent — `Dark Blue`, `Light Blue` and `Navy` are all
 * `blue` — for the same reason damage corners fold into sides: somebody
 * filtering for a blue car wants all of them.
 */
export function normalizeColor(raw: string | null | undefined): ColorClass | null {
  const s = upper(raw);
  if (!s) return null;

  // `- Unknown -`, `- N/A -`, `UNKNOWN - NOT OK FOR INV.`
  if (s.includes("UNKNOWN") || s.includes("N/A")) return null;
  // See the note above: a burned car, not a paint colour.
  if (s === "BURN") return null;
  // Genuine answers meaning "more than one".
  if (s.includes("TWO TONE") || s.includes("MULTI")) return "other";

  if (s.includes("WHITE")) return "white";
  if (s.includes("BLACK")) return "black";
  // Stem, so the truncated `SILVE` lands with `SILVER`.
  if (s.includes("SILVE")) return "silver";
  // Charcoal and pewter are both greys by any useful definition.
  if (s.includes("GRAY") || s.includes("GREY") || s.includes("CHARCOAL") || s.includes("PEWTER")) {
    return "gray";
  }
  if (s.includes("BLUE") || s.includes("NAVY")) return "blue";
  // Before red: burgundy and maroon are their own bucket at ~3,000 lots, and
  // neither string contains RED, so the order is for the reader, not the parser.
  if (s.includes("BURGUNDY") || s.includes("MAROON")) return "burgundy";
  if (s.includes("RED") || s.includes("CRIMSON")) return "red";
  if (s.includes("GREEN")) return "green";
  if (s.includes("TURQUOISE") || s.includes("TEAL")) return "teal";
  if (s.includes("BROWN")) return "brown";
  // The pale neutrals, which no buyer distinguishes on a filter.
  if (s.includes("TAN") || s.includes("BEIGE") || s.includes("CREAM") || s.includes("CHAMPAGNE")) {
    return "beige";
  }
  if (s.includes("GOLD")) return "gold";
  if (s.includes("YELLOW")) return "yellow";
  if (s.includes("ORANGE")) return "orange";
  if (s.includes("PURPLE")) return "purple";
  if (s.includes("PINK")) return "pink";
  return null;
}

// ── transmission ─────────────────────────────────────────────────────────────

export type TransmissionClass = "automatic" | "manual";

/**
 * Two buckets, because that is the question a buyer asks.
 *
 * `Automatic` (66,425) and `AUTOMATIC` (59,178) are the same gearbox and were
 * about to appear as two filter options over 125,000 lots.
 *
 * CVT counts as automatic: there is no clutch pedal, which is what the filter
 * means. `BOTH AUTOMATED MANUAL` deliberately does NOT — an automated manual
 * sits between the two and calling it either would be a guess, so those 5 lots
 * return null and stay unfiltered rather than wrongly filed.
 */
export function normalizeTransmission(raw: string | null | undefined): TransmissionClass | null {
  const s = upper(raw);
  if (!s) return null;
  if (s.includes("UNKNOWN") || s === "NONE" || s.includes("N/A")) return null;
  // Checked before both AUTOMATIC and MANUAL, since it contains one and means
  // neither.
  if (s.includes("AUTOMATED MANUAL")) return null;
  // `ECVT AUTOMATIC` and `Automatic Transmission` both land here.
  if (s.includes("AUTOMATIC") || s.includes("CVT")) return "automatic";
  if (s.includes("MANUAL")) return "manual";
  return null;
}

// ── damage ───────────────────────────────────────────────────────────────────

export type DamageClass =
  // Condition rather than a location — the two "barely damaged" buckets, and the
  // ones most buyers actually filter for.
  | "normal_wear"
  | "minor_dent"
  // Where it is.
  | "front"
  | "rear"
  | "front_and_rear"
  | "side"
  | "all_over"
  | "roof"
  | "undercarriage"
  | "glass"
  | "interior"
  // What is wrong.
  | "mechanical"
  | "electrical"
  | "hail"
  | "water"
  | "storm"
  | "burn"
  | "rollover"
  | "frame"
  | "stripped"
  | "vandalism"
  | "theft"
  | "biohazard"
  // Why it is at auction, which is not the same question — see below.
  | "repossession"
  | "vin_issue"
  | "repair"
  | "other";

/**
 * Punctuation and spacing are not stable across the two auctions: the same
 * concept arrives as `BIOHAZARD/CHEMICAL` and `Bio Hazard`, `UNDERCARRIAGE` and
 * `Under Carriage`, `ROLLOVER` and `Roll Over`. Collapsing to letters and digits
 * turns each of those pairs into one token instead of a special case each.
 */
function squash(s: string): string {
  return s.replace(/[^A-Z0-9]/g, "");
}

/**
 * Primary and secondary damage, folded from 77 and 75 distinct raw values
 * measured over 134,647 mirrored lots. Both fields share one vocabulary, so
 * they share one function.
 *
 * This is the gap that made the filter panel unbuildable: `FRONT END` (26,246
 * lots) and `Front End` (18,092) are the same thing, as are `NORMAL WEAR` and
 * `Normal Wear & Tear`. Offered raw, the dropdown shows every option twice.
 *
 * TWO JUDGEMENT CALLS WORTH KNOWING, both deliberate:
 *
 * 1. **Corners are folded into sides.** `Right Front`, `Left Front` and `Front`
 *    all become `front`. Somebody filtering for front-end damage wants all of
 *    them; reproducing the auctions' twenty corner combinations would be a
 *    faithful and useless filter.
 * 2. **Some values are not damage at all.** `Charity`, `Cash For Clunkers`,
 *    `Repossession` and `Damage History` say why the car is at auction, not what
 *    is broken. `Repossession` earns its own bucket on volume (524 lots); the
 *    rest become `other` — recognised, but with no honest damage bucket to put
 *    them in.
 *
 * `None` and `Unknown` return null, not a bucket: they are the auctions saying
 * they have nothing to record, and a filter should treat such a lot as
 * unclassified rather than offer "Unknown" as though it described the car.
 *
 * Ordering is load-bearing throughout — `Engine Burn` contains ENGINE, `Front
 * Window` contains FRONT, `Storm Damage` contains DAMAGE. Each such case is
 * commented where it occurs.
 */
export function normalizeDamage(raw: string | null | undefined): DamageClass | null {
  const s = upper(raw);
  if (!s) return null;
  const q = squash(s);

  if (q === "NONE" || q === "UNKNOWN") return null;

  // Fire first. `BURN - ENGINE`, `Engine Burn`, `Interior Fire`, `Exterior Burn`
  // and `Total Burn` all carry a component or location word that the tests
  // further down would otherwise capture.
  if (q.includes("BURN") || q.includes("FIRE")) return "burn";

  // `WATER/FLOOD` carries both words; `Salt Water` and `Fresh Water` only one.
  if (q.includes("FLOOD") || q.includes("WATER")) return "water";
  if (q.includes("STORM")) return "storm";
  if (q.includes("HAIL")) return "hail";
  // Squashing is what makes `Roll Over` and `ROLLOVER` one test.
  if (q.includes("ROLLOVER")) return "rollover";
  if (q.includes("VANDAL")) return "vandalism";
  if (q.includes("THEFT")) return "theft";
  if (q.includes("BIOHAZARD") || q.includes("CHEMICAL")) return "biohazard";

  // Matched on the spaced string with word boundaries, NOT the squashed one:
  // squashing would make an innocent future value like "DRIVING" contain VIN.
  if (/\bVIN\b/.test(s)) return "vin_issue";

  if (q.includes("REPAIR")) return "repair";
  if (q.includes("REPOSSESS")) return "repossession";

  // Recognised, but describing the sale rather than the car. See note 2 above.
  if (q.includes("CHARITY") || q.includes("CLUNKER") || q.includes("DAMAGEHISTORY")) {
    return "other";
  }

  if (q.includes("STRIP")) return "stripped";
  if (q.includes("FRAME") || q.includes("STRUCTURAL")) return "frame";

  // `Normal Wear & Tear` (17,893) and `NORMAL WEAR` (2,708) mean essentially
  // undamaged. Kept apart from `minor_dent` because "nothing wrong with it" and
  // "it has dents" are different answers to the only question a buyer is asking.
  if (q.includes("WEAR")) return "normal_wear";
  if (q.includes("DENT") || q.includes("SCRATCH")) return "minor_dent";

  // Glass before the front/rear tests: `Front Window` and `Rear Window` are
  // broken glass, not a front-end or rear-end collision.
  if (q.includes("WINDOW") || q.includes("WINDSHIELD") || q.includes("GLASS")) return "glass";

  // `TOP/ROOF` also contains ROOF, so there is no need for a TOP test that would
  // one day capture something like STOPPED.
  if (q.includes("ROOF")) return "roof";
  if (q.includes("UNDERCARRIAGE")) return "undercarriage";
  if (q.includes("ALLOVER")) return "all_over";

  // After fire, so `Engine Burn` is a burn. `Possible Mech.` is why this matches
  // the stem rather than the whole word.
  if (
    q.includes("MECH") ||
    q.includes("ENGINE") ||
    q.includes("TRANSMISSION") ||
    q.includes("SUSPENSION") ||
    q.includes("STEERING")
  ) {
    return "mechanical";
  }
  if (q.includes("ELECTRIC")) return "electrical";
  // After fire, so `Interior Burn` is a burn.
  if (q.includes("INTERIOR")) return "interior";

  // `Front & Rear` names both ends, so it has to be tested before either alone.
  const front = q.includes("FRONT");
  const rear = q.includes("REAR");
  if (front && rear) return "front_and_rear";
  if (front) return "front";
  if (rear) return "rear";
  // `Left & Right Side` and `Left Side` fold together — see judgement call 1.
  if (q.includes("SIDE")) return "side";

  return null;
}
