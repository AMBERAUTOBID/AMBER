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

export type VehicleClass = "automobile" | "motorcycle" | "truck" | "other";

/**
 * The top-level category tabs. Driven by `vehicle_type`, which measured 99.9%
 * populated — NOT by `car_info.vehicle_type`, whose API filter matched only 9.3%
 * of the catalogue and would have hidden most of the inventory.
 *
 * Copart shouts (`AUTOMOBILE`, `MEDIUM DUTY/BOX TRUCKS`) and IAAI does not
 * (`Automobile`, `Light Truck`), so case folding is the whole point.
 */
export function normalizeVehicleClass(raw: string | null | undefined): VehicleClass | null {
  const s = upper(raw);
  if (!s) return null;
  if (s.includes("MOTORCYCLE") || s.includes("MOPED") || s.includes("SCOOTER")) return "motorcycle";
  if (s.includes("TRUCK") || s.includes("TRACTOR")) return "truck";
  if (s.includes("AUTOMOBILE") || s === "SUV" || s.includes("PASSENGER CAR") || s.includes("MPV")) {
    return "automobile";
  }
  // Trailers, buses, industrial equipment, recreational and incomplete vehicles.
  // The user's requirement is that these stay searchable, so they get a real
  // bucket rather than being dropped.
  if (
    s.includes("TRAILER") ||
    s.includes("BUS") ||
    s.includes("INDUSTRIAL") ||
    s.includes("EQUIPMENT") ||
    s.includes("RECREATION") ||
    s.includes("INCOMPLETE") ||
    s.includes("LOW SPEED") ||
    s.includes("OFF ROAD") ||
    s.includes("BOAT") ||
    s.includes("ATV")
  ) {
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
