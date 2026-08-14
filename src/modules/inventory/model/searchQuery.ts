/**
 * Shared, isomorphic helpers for turning user input (the hero/search widget)
 * into Apibara search filters. Kept separate from src/modules/inventory/api (which
 * is server-only and holds the API key) so SearchWidget.tsx can import this
 * safely as a client component.
 */

import { MAKES_BY_CATEGORY, MODELS_BY_CATEGORY, MIN_YEAR, MAX_YEAR } from "./vehicleData";

// The "More" category's picker is an equipment type (Trailer, Boat, ATV...),
// not a brand - map it to Apibara's real `type` filter values (confirmed via
// GET /vehicles/filters; exact strings differ slightly, e.g. "Mobile Home"
// vs "MOTOR HOME").
export const MORE_TYPE_TO_APIBARA_TYPE: Record<string, string> = {
  Trailer: "TRAILERS",
  Boat: "BOAT",
  ATV: "ATV",
  Bus: "BUS",
  "Industrial Equipment": "INDUSTRIAL EQUIPMENT",
  "Jet Ski": "JET SKI",
  "Mobile Home": "MOTOR HOME",
  Other: "OTHER",
};

/**
 * Automobile/Truck/Motorcycle share real make names (Honda and BMW both make
 * cars AND motorcycles; Ford/Chevrolet/GMC/Toyota/Nissan/Jeep make both cars
 * AND trucks) - a `make`-only filter can't tell them apart, which is exactly
 * what caused "Motorcycle > Honda" to return Civics and Ridgelines instead of
 * bikes. Apibara's `type` param only accepts one value per request (no OR),
 * so a category maps to a *group* of type values that get queried in
 * parallel and merged - confirmed live that each of these values is real and
 * populated (e.g. Freightliner lots split across both "TRUCK" and "HEAVY
 * DUTY TRUCKS").
 */
export const CATEGORY_TYPE_GROUPS: Record<"automobile" | "truck" | "motorcycle", string[]> = {
  automobile: ["AUTOMOBILE", "SEDAN", "COUPE", "SUV", "VAN"],
  truck: ["PICKUP", "TRUCK", "HEAVY DUTY TRUCKS", "MEDIUM DUTY/BOX TRUCKS"],
  motorcycle: ["MOTORCYCLE", "DIRT BIKE"],
};

/**
 * Brand nicknames and spellings that never appear in MAKES_BY_CATEGORY but are
 * what people actually type. Punctuation variants ("Mercedes Benz", "Rolls
 * Royce", "Harley Davidson") do NOT belong here — tokenisation already strips
 * punctuation, so those match the canonical name for free.
 *
 * Deliberately excluded: "range rover", which is a Land Rover *model*. Aliasing
 * it to the make would consume the words before the model matcher sees them,
 * turning "Range Rover Sport" into make="Land Rover" model="Sport".
 */
const MAKE_ALIASES: Record<string, string> = {
  chevy: "Chevrolet",
  chev: "Chevrolet",
  vw: "Volkswagen",
  mercedes: "Mercedes-Benz",
  merc: "Mercedes-Benz",
  benz: "Mercedes-Benz",
  bimmer: "BMW",
  beemer: "BMW",
  rolls: "Rolls-Royce",
  royce: "Rolls-Royce",
  harley: "Harley-Davidson",
  alfa: "Alfa Romeo",
  subie: "Subaru",
  caddy: "Cadillac",
};

/**
 * Body-style words mapped to Apibara `type` values. These turn queries that
 * name no brand at all ("minivan", "suv", "pickup") from a guaranteed-empty
 * keyword search into a real filter.
 *
 * Only applied when no model was resolved — `type` is a broadening signal, not
 * an extra narrowing one. Combining it with a model risks an empty result when
 * Apibara happens to classify that model under a different type than the word
 * the user typed (a Ram ProMaster is a van by body but may be typed "TRUCK").
 */
const BODY_KEYWORD_TO_TYPE: Record<string, string> = {
  "industrial equipment": "INDUSTRIAL EQUIPMENT",
  "mobile home": "MOTOR HOME",
  "jet ski": "JET SKI",
  "dirt bike": "DIRT BIKE",
  jetski: "JET SKI",
  motorhome: "MOTOR HOME",
  forklift: "INDUSTRIAL EQUIPMENT",
  minivan: "VAN",
  crossover: "SUV",
  motorcycle: "MOTORCYCLE",
  motorbike: "MOTORCYCLE",
  pickup: "PICKUP",
  trailer: "TRAILERS",
  sedan: "SEDAN",
  saloon: "SEDAN",
  coupe: "COUPE",
  truck: "TRUCK",
  suv: "SUV",
  van: "VAN",
  atv: "ATV",
  quad: "ATV",
  boat: "BOAT",
  bus: "BUS",
  bike: "MOTORCYCLE",
};

/**
 * Words that carry shopping intent rather than identifying a vehicle. Without
 * this, "Honda cheap car" would pass model="cheap car" to Apibara and return
 * nothing.
 */
const FILLER_WORDS = new Set([
  "a", "an", "the", "and", "or", "with", "for", "from", "in", "of", "to", "my",
  "car", "cars", "vehicle", "vehicles", "auto", "autos", "lot", "lots",
  "cheap", "cheapest", "best", "good", "nice", "clean", "low", "high", "big", "small",
  "sale", "sell", "selling", "buy", "buying", "bid", "bidding", "auction", "auctions",
  "under", "over", "below", "above", "max", "min", "budget", "price", "priced",
  "used", "second", "hand", "new", "salvage", "damaged", "repairable", "rebuilt",
  "title", "titled", "runs", "running", "drives", "driving", "starts",
  "miles", "mile", "mileage", "km", "kms", "kilometers", "odometer",
  "usd", "eur", "dollar", "dollars", "euro", "euros",
  "please", "want", "need", "looking", "find", "show", "me", "any", "some",
]);

/** Splits on every run of non-alphanumerics, so "Mercedes-Benz", "Mercedes
 * Benz" and "mercedes_benz" all tokenise identically. */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Same split on the untouched string, so token i of one lines up with token i
 * of the other and a matched span can be reported back in its original case. */
function tokenizePreservingCase(s: string): string[] {
  return s.split(/[^A-Za-z0-9]+/).filter(Boolean);
}

/**
 * Index of `needle` as a run of whole tokens inside `hay`, or -1.
 *
 * Whole tokens is the entire point: the previous implementation used
 * String.includes, so "Mercedes" matched the Lexus model "ES" (merced-ES) and
 * "cheap car under 5000" matched the Fiat "500".
 */
function indexOfTokenRun(hay: string[], needle: string[]): number {
  if (needle.length === 0 || needle.length > hay.length) return -1;
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

interface Candidate<T> {
  tokens: string[];
  /** The candidate with its punctuation removed ("CR-V" -> "crv"), so a user
   * who types "CRV" as one word still matches. */
  compact: string;
  value: T;
}

function candidate<T>(name: string, value: T): Candidate<T> {
  const tokens = tokenize(name);
  return { tokens, compact: tokens.join(""), value };
}

/** Longest first, so "Land Rover" wins over "Land" and "Range Rover Sport"
 * wins over "Range Rover". */
function byLengthDesc<T>(a: Candidate<T>, b: Candidate<T>): number {
  return b.tokens.length - a.tokens.length || b.compact.length - a.compact.length;
}

interface Match<T> {
  value: T;
  start: number;
  length: number;
}

function findCandidate<T>(hay: string[], candidates: Candidate<T>[]): Match<T> | null {
  for (const c of candidates) {
    const at = indexOfTokenRun(hay, c.tokens);
    if (at !== -1) return { value: c.value, start: at, length: c.tokens.length };
    // Single-token fallback: "CRV" typed for "CR-V", "MX5" for "MX-5".
    if (c.tokens.length > 1) {
      const compactAt = hay.indexOf(c.compact);
      if (compactAt !== -1) return { value: c.value, start: compactAt, length: 1 };
    }
  }
  return null;
}

/**
 * Real brands only. MAKES_BY_CATEGORY.more holds equipment *types* (Boat,
 * Trailer, Jet Ski...) rather than manufacturers, and flattening it in here
 * meant "jet ski" resolved to make="Jet Ski" — a value Apibara's `make` param
 * can never match. Those words are handled by BODY_KEYWORD_TO_TYPE instead.
 */
const ALL_MAKES = Array.from(
  new Set([
    ...MAKES_BY_CATEGORY.automobile,
    ...MAKES_BY_CATEGORY.truck,
    ...MAKES_BY_CATEGORY.motorcycle,
  ])
);

const MAKE_CANDIDATES: Candidate<string>[] = [
  ...ALL_MAKES.map((make) => candidate(make, make)),
  ...Object.entries(MAKE_ALIASES).map(([alias, make]) => candidate(alias, make)),
].sort(byLengthDesc);

/** make -> its models across every category, since a free-text query carries
 * no category (Ford means Mustang *and* F-150 here). */
const MODELS_BY_MAKE = new Map<string, Candidate<string>[]>();
for (const modelsByMake of Object.values(MODELS_BY_CATEGORY)) {
  for (const [make, models] of Object.entries(modelsByMake)) {
    const list = MODELS_BY_MAKE.get(make) ?? [];
    list.push(...models.map((model) => candidate(model, model)));
    MODELS_BY_MAKE.set(make, list);
  }
}
for (const list of MODELS_BY_MAKE.values()) list.sort(byLengthDesc);

/** Every make/model pair, for queries that name a model but no brand
 * ("Civic", "Range Rover Sport"). */
const MAKE_MODEL_CANDIDATES: Candidate<{ make: string; model: string }>[] = Object.values(
  MODELS_BY_CATEGORY
)
  .flatMap((modelsByMake) =>
    Object.entries(modelsByMake).flatMap(([make, models]) =>
      models.map((model) => candidate(model, { make, model }))
    )
  )
  .sort(byLengthDesc);

const BODY_CANDIDATES: Candidate<string>[] = Object.entries(BODY_KEYWORD_TO_TYPE)
  .map(([word, type]) => candidate(word, type))
  .sort(byLengthDesc);

export interface ParsedQuery {
  make?: string;
  model?: string;
  type?: string;
  /** Apibara's strict keyword param — VIN, lot number or exact title only. */
  s?: string;
  yearFrom?: number;
  yearTo?: number;
}

function isLotIdentifier(term: string): boolean {
  // A VIN is 17 characters and the standard excludes I, O and Q so they can't
  // be confused with 1 and 0.
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(term) || /^\d{6,}$/.test(term);
}

/**
 * Apibara's `s` param only matches VIN/lot number/exact title, not a fuzzy
 * "Honda Civic"-style query (confirmed live: "Range Rover Sport" via `s`
 * returned zero results, while make="Land Rover"&model="Range Rover Sport"
 * returned real lots). So free text has to be split into make/model/type
 * filters using our own lists, and `s` is reserved for the identifier case
 * plus a last-resort fallback.
 *
 * Order matters. The make is resolved BEFORE the model so that a query naming
 * both can never have the model override the brand — the old model-first pass
 * turned "Mercedes C300" into make="Chrysler" (its "300"). The model is then
 * looked up only among that make's own models.
 */
export function parseFreeTextQuery(q: string): ParsedQuery {
  const trimmed = q.trim();
  if (!trimmed) return {};

  if (isLotIdentifier(trimmed)) return { s: trimmed };

  let tokens = tokenize(trimmed);
  let original = tokenizePreservingCase(trimmed);
  if (tokens.length === 0) return {};

  const result: ParsedQuery = {};

  /** Drops a matched span from both token arrays so it can't be re-read as
   * something else (a matched make must not survive into the model). */
  function consume(start: number, length: number) {
    tokens = [...tokens.slice(0, start), ...tokens.slice(start + length)];
    original = [...original.slice(0, start), ...original.slice(start + length)];
  }

  // A bare four-digit year. Model names with digits are safe: they're either
  // shorter ("500", "300") or carry letters in the same token ("2500HD"), and
  // the range check rules out "Ram 1500".
  const yearAt = tokens.findIndex((tok) => {
    if (!/^\d{4}$/.test(tok)) return false;
    const n = Number(tok);
    return n >= MIN_YEAR && n <= MAX_YEAR;
  });
  if (yearAt !== -1) {
    const year = Number(tokens[yearAt]);
    result.yearFrom = year;
    result.yearTo = year;
    consume(yearAt, 1);
  }

  const makeMatch = findCandidate(tokens, MAKE_CANDIDATES);
  if (makeMatch) {
    result.make = makeMatch.value;
    consume(makeMatch.start, makeMatch.length);

    const modelMatch = findCandidate(tokens, MODELS_BY_MAKE.get(result.make) ?? []);
    if (modelMatch) {
      result.model = modelMatch.value;
      consume(modelMatch.start, modelMatch.length);
    }
  } else {
    const pairMatch = findCandidate(tokens, MAKE_MODEL_CANDIDATES);
    if (pairMatch) {
      result.make = pairMatch.value.make;
      result.model = pairMatch.value.model;
      consume(pairMatch.start, pairMatch.length);
    }
  }

  // Body style, only as a substitute for a model (see BODY_KEYWORD_TO_TYPE).
  if (!result.model) {
    const bodyMatch = findCandidate(tokens, BODY_CANDIDATES);
    if (bodyMatch) {
      result.type = bodyMatch.value;
      consume(bodyMatch.start, bodyMatch.length);
    }
  }

  const leftover = original.filter((_, i) => !FILLER_WORDS.has(tokens[i]));

  // A make with unrecognised words after it is almost always a trim we don't
  // list ("Mercedes C300"), so pass them through as the model rather than
  // discarding what the user asked for.
  if (result.make && !result.model && leftover.length > 0) {
    result.model = leftover.join(" ");
  }

  // Nothing identifiable at all. `s` won't fuzzy-match, but it's the only
  // remaining chance of an exact title hit and it beats searching for nothing.
  if (!result.make && !result.model && !result.type) {
    // A budget ("under 5000") loses its keyword and leaves a bare number
    // behind. Searching `s` for it is guaranteed to miss, and there is no
    // price filter wired up to honour it, so return an unfiltered browse
    // rather than a confidently empty result page.
    const meaningful = leftover.filter((tok) => !/^\d+$/.test(tok));
    if (meaningful.length === 0) return result;
    result.s = meaningful.join(" ");
  }

  return result;
}

/**
 * Below this many exact hits, a single made-up-looking word is treated as a
 * misspelling worth rescuing rather than as a genuinely rare car.
 *
 * MEASURED, NOT GUESSED, against the whole mirror on 2026-08-14. The catalogue
 * holds **1,570 distinct make strings, and only 89 of them carry 25 lots or
 * more**. The other 1,481 are fragments and vendor typos — `PORS`, `NISS`,
 * `ICRP`, `VOLKSWAGON`. So 25 is where the real marques separate from the
 * noise: a visitor typing a make that exists gets thousands of rows, and
 * anything landing under this bar means we probably failed to understand the
 * word rather than that the car is scarce.
 */
export const MISSPELLING_RESCUE_BELOW = 25;

/**
 * Should a search that already returned something still try the typo fallback?
 *
 * ⚠️ THE OLD ANSWER WAS "ONLY WHEN IT RETURNED NOTHING", AND ONE ROW BROKE IT.
 * The auction itself lists lot 59193196 with make `VOLKSWAGON`, so searching
 * that misspelling found exactly one car — non-empty, so the rescue never ran —
 * and the visitor was shown **1 car instead of 2,789**, on a page that looked
 * like a working search. A single misspelled row in the vendor's own data
 * disabled typo rescue for an entire marque.
 *
 * The conditions are each doing a specific job:
 *
 *  - **A single word.** The fallback scores `word_similarity` of the whole term
 *    against `make` and `model`, so it can only rescue one word. "ford f150"
 *    scores poorly against either column and there is nothing to gain.
 *  - **Letters only, four or more.** This is what keeps a PRECISE query
 *    precise: VINs, lot numbers and years all carry digits, so none of them can
 *    reach here. An exact VIN returning one row stays one row — the property
 *    the original `=== 0` test was really protecting.
 *  - **Under the measured bar**, so the fallback's ~900 ms scan stays rare.
 *
 * Zero still qualifies, so every case the old rule caught is still caught.
 *
 * ⚠️ The caller must also keep the fallback's result ONLY IF IT FINDS MORE.
 * The exact clause searches the whole `search_tsv` — trim names included —
 * while the fallback looks at `make` and `model` alone, so for a word like a
 * trim ("wolfsburg") the fallback can legitimately find FEWER. Typo rescue may
 * only ever add cars, never take them away.
 */
export function shouldRescueMisspelling(term: string | undefined, exactCount: number): boolean {
  const trimmed = term?.trim() ?? "";
  if (trimmed.length === 0) return false;
  if (exactCount >= MISSPELLING_RESCUE_BELOW) return false;
  return /^[\p{L}]{4,}$/u.test(trimmed);
}
