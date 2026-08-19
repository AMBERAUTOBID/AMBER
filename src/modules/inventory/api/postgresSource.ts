/**
 * `AuctionSource` backed by our own mirror of the catalogue.
 *
 * Reached ONLY when `SEARCH_SOURCE=postgres`. Production sets no such variable
 * and `getAuctionSource()` returns Apibara for anything absent or unrecognised,
 * so nothing here can be reached by a production request.
 *
 * SEARCH IS LOCAL; DETAIL STAYS LIVE. `getVehicleDetail` and `getRelatedVehicles`
 * delegate to the Apibara source, deliberately and not as a stopgap:
 *
 *  - The vehicle page renders `sale_document.export` and `.registration` — whether
 *    the paperwork allows shipping the car out of the US and re-registering it,
 *    which is the pair of facts a European buyer needs before bidding. Our vendor
 *    supplies NO equivalent field, so serving detail from the mirror would
 *    silently delete that line.
 *  - A mirrored row is as fresh as the last sweep; a bid is not. Detail is where
 *    a number gets acted on, so it comes from upstream at read time.
 *
 * What the mirror buys, none of which the aggregator's search API can do: a real
 * result count, one query instead of a five-request category fan-out, filters on
 * columns the search API never accepted, and immunity to vendor downtime.
 */
import {
  and,
  asc,
  between,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { auctionDb, schema } from "@/shared/db/client";
import { apibaraSource } from "./apibaraSource";
import type { AuctionSource, SearchFacets } from "./source";
import type {
  RelatedVehiclesResponse,
  VehicleDetailResponse,
  VehicleListItem,
  VehicleSearchParams,
  VehicleSearchResponse,
} from "./types";
import { isStillUpcoming } from "../model/relatedLots";
import { shouldRescueMisspelling } from "../model/searchQuery";
import {
  mirrorRowToVehicleListItem,
  BUY_NOW_MARGIN_HOURS,
  type MirrorImageRow,
} from "../model/mirrorLot";
// The one number deciding whether a lot can still be bid on. Imported so the
// order of the search and the behaviour of the button can never drift apart;
// `bidWindow` has no imports of its own, so this stays safe for `scripts/`.
import { TOO_LATE_WITHIN_HOURS } from "@/modules/bids/model/bidWindow";
import {
  buildModelTree,
  canonicalKey,
  mergeMakeSpellings,
  modelsForLabel,
  type ModelGroup,
} from "../model/modelTree";

import { flattenModelTree } from "../model/modelFacets";

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

/**
 * The explicit sort orders a visitor can pick, keyed by the URL's `sort` value.
 *
 * ⚠️ AN EXPLICIT SORT REPLACES THE THREE-SEGMENT ORDERING, deliberately. The
 * segments exist to put biddable lots ahead of imminent and relisted ones when
 * nobody has expressed a preference; somebody who asked for "cheapest first"
 * means cheapest across everything, and a $250 relisted lot hidden behind three
 * segments of dearer biddable ones would read as the sort being broken.
 *
 * ⚠️ `nullif(..., 0)` ON PRICE, NOT JUST NULLS LAST. Lots with no bids yet
 * arrive as 0 rather than null — `formatPrice` treats them the same way — so
 * "cheapest first" without it would open with pages of $0 cars that are not
 * actually offers. Zero and null both mean "bidding has not started" and both
 * belong at the end, whichever direction the sort runs.
 *
 * `asc(t.id)` everywhere as the tie-break: dozens of lots share a year or a
 * price, and without a unique key the offset pagination can repeat or skip rows
 * across page boundaries.
 *
 * An unknown value falls through to the default ordering rather than erroring —
 * a hand-edited URL should degrade, not break.
 */
const EXPLICIT_SORTS: Record<string, (t: typeof schema.auctionLots) => ReturnType<typeof sql>[]> = {
  price_asc: (t) => [sql`nullif(${t.currentBidCents}, 0) asc nulls last`, sql`${t.id} asc`],
  price_desc: (t) => [sql`nullif(${t.currentBidCents}, 0) desc nulls last`, sql`${t.id} asc`],
  year_desc: (t) => [sql`${t.year} desc nulls last`, sql`${t.id} asc`],
  year_asc: (t) => [sql`${t.year} asc nulls last`, sql`${t.id} asc`],
  // `nullif` here too, found by running the sort rather than reading the
  // column: the first page of "lowest mileage" was entirely 0-mile lots, and a
  // 1997 Porsche does not have 0 miles — the auctions write 0 where the reading
  // was not taken. A real digital odometer can read 0 on a new car, but a
  // visitor asking for the lowest mileage means the lowest READ mileage.
  odo_asc: (t) => [sql`nullif(${t.odometer}, 0) asc nulls last`, sql`${t.id} asc`],
};

/**
 * Cursor is an opaque offset, base64'd only so callers cannot come to depend on
 * its contents. Keyset paging would be faster, but the sort key is `saleDate`,
 * which is not unique — dozens of lots share a sale time, so a keyset walk would
 * skip or repeat rows across page boundaries. An offset over an indexed, filtered
 * set is correct, and at ~150k rows it is not the bottleneck.
 */
function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const n = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

/**
 * How many consecutive completed full sweeps must fail to see a lot before
 * search stops showing it.
 *
 * NOT ONE — and this is the measurement that decides it. The full sweep of
 * 2026-08-07 recorded 144,350 lot observations but only 132,620 distinct lots:
 * 8.1% of its reads were of a lot it had already seen. That is the vendor's
 * pagination window shifting underneath a four-hour walk, and a window that
 * shifts one way also shifts the other — a lot can move from an unread page to
 * an already-read one and be missed without ever leaving the auction.
 *
 * So a single miss is not evidence of absence. Requiring two costs a day of
 * latency on a genuinely sold car; requiring one would quietly delete live
 * inventory from our own search, which is the worse failure.
 */
const SWEEPS_BEFORE_GONE = 2;

/** The cutoffs change only when a sweep finishes, i.e. at most daily, so a short
 * cache turns a per-search round trip into roughly nothing. */
const CUTOFF_TTL_MS = 60_000;
let cutoffCache: { value: ActiveSet; at: number } | null = null;

/**
 * The two instants that decide whether a lot is still on offer. Either may be
 * null, which always means "do not exclude on this ground".
 */
export interface ActiveSet {
  /** A lot must have been seen at or after this to count as active at all —
   *  the start of the SWEEPS_BEFORE_GONE'th most recent completed sweep. */
  seenSince: Date | null;
  /** The start of the MOST RECENT completed sweep. A lot whose sale date has
   *  already passed has to clear this higher bar; see `buildWhere`. */
  lastSweepStart: Date | null;
}

/**
 * The instants a lot must have been seen at or after to still count as active.
 *
 * DERIVED FROM THE RUN LOG RATHER THAN MATERIALISED INTO A `gone` COLUMN, on
 * purpose. A marking job is a second thing that can fail silently — and a
 * silently failed sweep already "looks like a healthy site with stale data".
 * Reading the run log at query time means search can never disagree with the
 * sweep history: no job to run, no drift, nothing to repair after an outage.
 *
 * Returns nulls — meaning "exclude nothing" — until enough completed sweeps
 * exist to justify a conclusion. Only a run with `isPartial = false` AND a
 * `finishedAt` may be used: a run that hit its page cap or died saw a slice of
 * the catalogue, and treating its blind spot as absence would empty the search.
 */
async function activeSet(): Promise<ActiveSet> {
  const now = Date.now();
  if (cutoffCache && now - cutoffCache.at < CUTOFF_TTL_MS) return cutoffCache.value;

  const runs = await auctionDb()
    .select({ startedAt: schema.auctionIngestRuns.startedAt })
    .from(schema.auctionIngestRuns)
    .where(
      and(
        eq(schema.auctionIngestRuns.kind, "full_sweep"),
        eq(schema.auctionIngestRuns.isPartial, false),
        isNotNull(schema.auctionIngestRuns.finishedAt)
      )
    )
    .orderBy(desc(schema.auctionIngestRuns.startedAt))
    .limit(SWEEPS_BEFORE_GONE);

  // Fewer completed sweeps than the rule needs: show everything. Being too
  // permissive shows a stale lot; being too strict hides a real one.
  const value: ActiveSet = {
    seenSince: runs.length >= SWEEPS_BEFORE_GONE ? runs[SWEEPS_BEFORE_GONE - 1].startedAt : null,
    lastSweepStart: runs[0]?.startedAt ?? null,
  };
  cutoffCache = { value, at: now };
  return value;
}

/** Exposed so a test can force the next call to re-read, and so the ingest
 * tooling can invalidate after a sweep completes in the same process. */
export function resetActiveSetCutoffCache(): void {
  cutoffCache = null;
}

/**
 * A comma-separated multi-select value, e.g. `fuel=gasoline,diesel`.
 *
 * Lower-cased because the class columns hold lower-case values, and empty
 * segments are dropped so a trailing comma is harmless. Returns undefined for an
 * empty list, which callers read as "filter not set".
 *
 * Unrecognised values are deliberately KEPT: `inArray` simply matches nothing,
 * so `fuel=banana` yields zero results. That is honest. Filtering the unknown
 * value out instead would silently ignore what the visitor asked for and show
 * them petrol cars.
 */
function multi(v: string | number | boolean | undefined): string[] | undefined {
  if (typeof v !== "string") return undefined;
  const parts = v
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts : undefined;
}

/** The same, for the numeric multi-selects — cylinder counts. Non-numeric
 * segments are dropped here rather than kept, because there is no integer to
 * compare them against. */
function multiInt(v: string | number | boolean | undefined): number[] | undefined {
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const parts = String(v)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  return parts.length > 0 ? parts : undefined;
}

/** A date bound from the query string. Invalid input returns undefined so the
 * filter is skipped — a typo in a URL must not throw and blank the search page. */
function parseInstant(v: string | number | boolean | undefined): Date | undefined {
  if (typeof v !== "string" || v.trim().length === 0) return undefined;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? undefined : new Date(ms);
}

/**
 * Translates the aggregator's `type` vocabulary into our normalised columns.
 *
 * The search page's category picker still speaks in Apibara type strings
 * (`CATEGORY_TYPE_GROUPS`), because that page must keep working against Apibara.
 * Rather than fork the page, the local source accepts the same input and answers
 * it better: what took a five-request fan-out and merge upstream is one `OR` here.
 */
function typeGroupCondition(typeValues: string[]) {
  const classes = new Set<string>();
  const bodies = new Set<string>();

  for (const raw of typeValues) {
    const t = raw.trim().toUpperCase();
    if (t === "AUTOMOBILE") classes.add("automobile");
    else if (t === "MOTORCYCLE" || t === "DIRT BIKE") classes.add("motorcycle");
    else if (t.includes("TRUCK")) classes.add("truck");
    // The eight values behind the "More" category in the picker
    // (MORE_TYPE_TO_APIBARA_TYPE). Until vehicleClass was widened past four
    // buckets there was nothing to map these onto, so every one of them fell
    // through and the function returned undefined — which applied NO filter at
    // all and answered "browse boats" with the entire catalogue.
    else if (t === "TRAILERS" || t === "TRAILER") classes.add("trailer");
    else if (t === "BOAT") classes.add("boat");
    else if (t === "JET SKI") classes.add("jet_ski");
    else if (t === "ATV") classes.add("atv");
    else if (t === "BUS") classes.add("bus");
    else if (t === "INDUSTRIAL EQUIPMENT") classes.add("equipment");
    else if (t === "MOTOR HOME") classes.add("rv");
    else if (t === "OTHER") classes.add("other");
    else if (t === "PICKUP") bodies.add("pickup");
    else if (t === "SEDAN") bodies.add("sedan");
    else if (t === "COUPE") bodies.add("coupe");
    else if (t === "SUV") bodies.add("suv");
    else if (t === "VAN") bodies.add("van");
  }

  const parts = [];
  if (classes.size > 0) parts.push(inArray(schema.auctionLots.vehicleClass, [...classes]));
  if (bodies.size > 0) parts.push(inArray(schema.auctionLots.bodyType, [...bodies]));
  if (parts.length > 0) return or(...parts);

  // A category we were ASKED for but cannot map must match nothing, never
  // everything. Returning undefined here drops the condition, and the visitor
  // who clicked "Boat" would be shown 117,747 lots of which almost none are
  // boats — the loudest possible way to be wrong.
  return typeValues.length > 0 ? sql`false` : undefined;
}

function buildWhere(
  params: VehicleSearchParams,
  typeValues?: string[],
  active?: ActiveSet,
  fuzzy = false,
  /**
   * The exact model strings a picked label stands for, resolved upstream by
   * `resolveModels` because it needs a query and this function is pure.
   *
   * Two things it fixes that a substring match cannot. The auctions spell one
   * car two ways — `F-150` 1,543 lots and `F150` 1,342 — so `ilike '%F-150%'`
   * finds barely half of them. And picking a family is meant to include its
   * trims: "3 Series" should return the 328i and the 330i, which share no
   * substring with it at all.
   */
  modelValues?: string[],
  /** Every spelling of the picked make, resolved by `resolveMakes`. */
  makeValues?: string[]
) {
  const t = schema.auctionLots;
  const conditions = [];

  // ── the three standing rules, decided with the user ──────────────────────
  //
  // A lot missed by the last SWEEPS_BEFORE_GONE completed full sweeps has left
  // the auction and must not be offered. Measured before building this: 2,027
  // rows survived the 2026-08-07 sweep unstamped, of which 823 were still
  // future-dated and therefore visible — 0.70% of everything a visitor sees.
  // Small, but it is inventory we would be advertising and cannot sell.
  if (active?.seenSince) conditions.push(gte(t.lastSeenAt, active.seenSince));
  //
  // WHETHER A LOT IS STILL ON OFFER IS DECIDED BY THE VENDOR'S LIST, NOT BY ITS
  // SALE DATE. An unsold lot is re-run in the next weekly auction — Copart does
  // it free for three further sales — and the vendor OVERWRITES the date on the
  // same record rather than appending, so between sweeps our row simply reads a
  // week behind. `sale_date >= now()` used to sit here as a membership test and
  // it was throwing that inventory away: measured 2026-08-12, 41,546 lots with a
  // passed sale date were stamped by the most recent completed sweep — 29% of
  // the catalogue, live cars the vendor was still listing and no visitor could
  // see. Sale date now drives ORDER and DISPLAY only (see `runSearch`).
  //
  // The one thing a passed date does change is the standard of evidence. A
  // future-dated lot gets the benefit of the two-sweep rule, because a single
  // miss is usually pagination drift; a lot whose sale time is behind us has to
  // have been seen by the LATEST completed sweep, because "it ended and left" is
  // now the likelier explanation for absence. That withheld 2,239 rows on the
  // day it was written, and it is what keeps a stalled sweep from leaving a
  // catalogue of dead auctions on the site — the old date filter used to do that
  // job by accident.
  if (active?.lastSweepStart) {
    conditions.push(or(gte(t.saleDate, sql`now()`), gte(t.lastSeenAt, active.lastSweepStart))!);
  }
  //
  // Canadian lots are withheld until their units and currency are verified: the
  // vendor stamps IAAI Canada with `BRL`, and their odometer unit is our
  // inference rather than data. Roughly 2.7% of inventory, against the risk of a
  // wrong landed cost or a mileage out by 1.6x.
  conditions.push(sql`${t.auctionName} not ilike '%CANADA%'`);

  // Accepts a list as well as a single value: the header toggles send one, the
  // facet panel toggles a comma-separated set, and both must mean the same
  // thing. `eq` against "copart,iaai" would have matched nothing at all.
  const platformValues = multi(params.platform);
  if (platformValues) {
    // The column is an enum, so unlike the free-text class columns the invalid
    // values cannot simply be handed to `inArray`. Same rule though: if nothing
    // the visitor asked for is a real platform, match nothing rather than
    // quietly dropping their filter.
    const valid = platformValues.filter((p): p is "copart" | "iaai" => p === "copart" || p === "iaai");
    conditions.push(valid.length > 0 ? inArray(t.platform, valid) : sql`false`);
  }

  // ILIKE because Copart shouts and IAAI does not: "FORD" and "Ford" are the same
  // make and a visitor should not have to know which auction listed the car.
  if (makeValues && makeValues.length > 0) conditions.push(inArray(t.make, makeValues));
  else if (params.make) conditions.push(ilike(t.make, params.make));
  if (modelValues && modelValues.length > 0) conditions.push(inArray(t.model, modelValues));
  // The old behaviour, kept for a model that is not in the tree: a link shared
  // before this existed, or a make the visitor never picked. Narrowing it to
  // nothing instead would break URLs that used to work.
  else if (params.model) conditions.push(ilike(t.model, `%${params.model}%`));

  if (typeValues && typeValues.length > 0) {
    const cond = typeGroupCondition(typeValues);
    if (cond) conditions.push(cond);
  } else if (params.type) {
    const cond = typeGroupCondition([params.type]);
    if (cond) conditions.push(cond);
  }

  if (params.year_from !== undefined) conditions.push(gte(t.year, params.year_from));
  if (params.year_to !== undefined) conditions.push(lte(t.year, params.year_to));
  if (params.odometer_from !== undefined) conditions.push(gte(t.odometer, params.odometer_from));
  if (params.odometer_to !== undefined) conditions.push(lte(t.odometer, params.odometer_to));
  if (params.engine_from !== undefined) conditions.push(gte(t.engineCc, params.engine_from));
  if (params.engine_to !== undefined) conditions.push(lte(t.engineCc, params.engine_to));

  // Money arrives in whole units and is stored in cents. Two separate ranges
  // rather than one "price" — see the note on VehicleSearchParams: a lot with no
  // bid is excluded when a bid range is set, because an unknown price cannot be
  // claimed to fall inside it.
  if (params.price_min !== undefined) conditions.push(gte(t.currentBidCents, params.price_min * 100));
  if (params.price_max !== undefined) conditions.push(lte(t.currentBidCents, params.price_max * 100));
  if (params.buy_now_min !== undefined) conditions.push(gte(t.buyNowCents, params.buy_now_min * 100));
  if (params.buy_now_max !== undefined) conditions.push(lte(t.buyNowCents, params.buy_now_max * 100));
  // Estimated retail value — 88.0% populated against 34.6% for a bid, which is
  // why this is the range the widget exposes. See VehicleSearchParams.
  if (params.retail_min !== undefined) conditions.push(gte(t.estRetailCents, params.retail_min * 100));
  if (params.retail_max !== undefined) conditions.push(lte(t.estRetailCents, params.retail_max * 100));

  // Auction date. Parsed defensively: a malformed value must narrow nothing
  // rather than throw and take the whole search page down.
  const saleFrom = parseInstant(params.sale_date_from);
  const saleTo = parseInstant(params.sale_date_to);
  if (saleFrom) conditions.push(gte(t.saleDate, saleFrom));
  if (saleTo) conditions.push(lte(t.saleDate, saleTo));

  // ── the categorical filters ──────────────────────────────────────────────
  //
  // Every one of these reads a NORMALISED class column, never the raw string.
  // That is the whole point of the normalisers: filtering on raw `color` would
  // mean `WHITE` and `White` are different options over 30,716 lots.
  const vehicleClass = multi(params.vehicle_class);
  if (vehicleClass) conditions.push(inArray(t.vehicleClass, vehicleClass));
  const fuel = multi(params.fuel);
  if (fuel) conditions.push(inArray(t.fuelClass, fuel));
  const drive = multi(params.drive);
  if (drive) conditions.push(inArray(t.driveClass, drive));
  const bodyType = multi(params.body_type);
  if (bodyType) conditions.push(inArray(t.bodyType, bodyType));
  const title = multi(params.title);
  if (title) conditions.push(inArray(t.titleClass, title));
  const color = multi(params.color);
  if (color) conditions.push(inArray(t.colorClass, color));
  const transmission = multi(params.transmission);
  if (transmission) conditions.push(inArray(t.transmissionClass, transmission));
  const damage = multi(params.damage);
  if (damage) conditions.push(inArray(t.primaryDamageClass, damage));
  const secondaryDamage = multi(params.secondary_damage);
  if (secondaryDamage) conditions.push(inArray(t.secondaryDamageClass, secondaryDamage));
  const runCond = multi(params.run_cond);
  if (runCond) conditions.push(inArray(t.conditionClass, runCond));

  const cylinders = multiInt(params.cylinders);
  if (cylinders) conditions.push(inArray(t.cylinderCount, cylinders));

  // `is_insurance` carries seller TYPE, not a seller name — the name field was
  // null on every lot sampled. 62.9% populated, so either choice narrows hard
  // and the 37% we cannot classify are excluded rather than guessed at.
  if (params.seller === "insurance") conditions.push(eq(t.isInsurance, true));
  if (params.seller === "non_insurance") conditions.push(eq(t.isInsurance, false));

  if (params.keys === "yes") conditions.push(eq(t.hasKeys, true));
  if (params.keys === "no") conditions.push(eq(t.hasKeys, false));

  // Only ever used to narrow TO enhanced lots. `enhanced=false` would otherwise
  // read as "not cosmetically prepared", which the flag does not establish —
  // its absence means unknown, not no.
  if (params.enhanced === true) conditions.push(eq(t.isEnhanced, true));

  /**
   * Buy Now means "there is a price you can pay right now to take the car".
   * Backed by a partial index on exactly these rows, so it narrows ~143k to
   * ~49k without a full scan.
   *
   * THE PRICE IS NOT ENOUGH; THE OFFER HAS TO STILL BE OPEN. A buy-now price is
   * a live offer with an expiry, and our row is a nightly snapshot. Measured
   * 2026-08-12 against Apibara, on lots our mirror called Buy Now:
   *
   *   | stored sale time | offer still there |
   *   |---|---|
   *   | already passed, 0-3 h ago | 0 of 5 |
   *   | ~6 minutes away          | 3 of 5 |
   *   | 2 h to 3 days away       | 20 of 20 |
   *
   * The offer is pulled when the lot goes to the block, which is exactly when a
   * visitor clicking a "Buy Now" result lands on a page with no buy-now price —
   * the fault reported against lot 51211316, opened 18 minutes before its sale.
   * Two hours is the nearest margin the measurement actually supports; 30
   * minutes would cost only 82 lots more but sits in a window nothing was
   * sampled in.
   *
   * WHAT THIS COSTS, and it is a real cost: a relisted lot gets its offer BACK
   * at the new date (8 of 8 sampled, one at a changed price), and until the next
   * sweep refreshes its date it looks past-dated and is withheld here — 2,160
   * lots, 4.4% of the Buy Now set. Withholding an offer that stands is the
   * cheaper error than advertising one that has been withdrawn. The permanent
   * fix is refreshing the buy-now set on its own schedule (~919 pages, ~7 min,
   * and unmetered on the current vendor plan), not a wider margin here.
   */
  if (params.lot_status === "Buy Now") {
    conditions.push(isNotNull(t.buyNowCents));
    // `sql.raw` because an interval literal cannot be parameterised; the value
    // is a number constant from the model layer, not input. Shared with
    // `mirrorPricing` so the filter and the card cannot disagree about which
    // offers are still open.
    conditions.push(gte(t.saleDate, sql.raw(`now() + interval '${BUY_NOW_MARGIN_HOURS} hours'`)));
  }

  // `s` is the free-text box.
  //
  // WHAT THIS REPLACED, measured against the full mirror: the old clause was
  // `vin = term OR lot_number = term OR make ILIKE %term% OR model ILIKE %term%`,
  // which meant a single word worked and a phrase did not. `ford` returned
  // 14,660 lots; `ford f150`, `toyota camry`, `bmw x5` and `honda civic 2018`
  // each returned ZERO, because no single column contains both words.
  //
  // `plainto_tsquery` ANDs the terms, so "2015 ford f150" is year AND make AND
  // model — narrowing, which is what a second word is for.
  //
  // THE QUERY IS PUNCTUATION-STRIPPED to match the stripped copy carried in
  // `search_tsv`. Both spellings of the same truck are real here — 1,323 lots
  // say `F-150` and 1,090 say `f150` — and they tokenise to disjoint sets, so
  // without this a visitor finds one group or the other depending on where they
  // put a hyphen. Spaces are preserved; only within-word punctuation goes, or
  // "F-150" would split into two useless tokens.
  //
  // Exact VIN and lot number stay as their own alternatives: they are what a
  // client pastes from an email, and equality on an indexed column beats making
  // them compete for relevance with 134,647 other documents.
  if (params.s) {
    const term = params.s.trim();
    if (term.length > 0) {
      conditions.push(
        fuzzy
          ? // The misspelling fallback, on pg_trgm's word_similarity: how well the
            // typed word matches the best-matching word inside the column. Whole-
            // string similarity would be dragged down by text the visitor never
            // typed — "MERCEDES-BENZ" against "mercedez".
            //
            // THE 0.5 IS MEASURED, NOT GUESSED. Scored against the real make
            // vocabulary, the worst genuine typo and the best gibberish sit far
            // apart, and 0.5 is the midpoint of that gap:
            //   porshe 0.571 · mitsubischi 0.667 · volkswagon 0.727 · mercedez 0.778
            //   notacar 0.375 · asdfghjkl 0.200 · qwertyuiop 0.182 · zzzzqqqq 0.143
            // pg_trgm's own `<%` operator would be index-backed but is pinned to
            // the 0.6 session default, which lands above `porshe` and below
            // nothing useful — it silently drops one of the commonest misspellings
            // of a brand this business cares about.
            //
            // The explicit call cannot use a trigram index, so this is a scan:
            // ~900 ms over 134,647 rows. Acceptable because it runs ONLY after an
            // exact search found nothing, where the alternative is an empty page.
            // Revisit if the accumulating archive makes the scan slow — with a
            // measurement, not a guess.
            or(
              sql`word_similarity(${term}, coalesce(${t.make}, '')) > 0.5`,
              sql`word_similarity(${term}, coalesce(${t.model}, '')) > 0.5`
            )!
          : or(
              eq(t.vin, term.toUpperCase()),
              eq(t.lotNumber, term),
              sql`${t.searchTsv} @@ plainto_tsquery('simple', regexp_replace(${term}, '[^a-zA-Z0-9 ]', '', 'g'))`
            )!
      );
    }
  }

  return and(...conditions);
}

async function searchVehicles(params: VehicleSearchParams): Promise<VehicleSearchResponse> {
  return runSearch(params);
}

/**
 * Each facet dimension: the response key, its normalised column, and the search
 * param that filters it.
 *
 * Every column here is a CLASS column, never a raw one. Counting raw `color`
 * would report `WHITE` 15,413 and `White` 15,303 as two separate options over
 * the same 30,716 cars — the exact bug the normalisers exist to prevent, and the
 * reason facets waited until they were in place.
 */
const FACET_DIMENSIONS = [
  { key: "fuel", column: "fuel_class", param: "fuel" },
  { key: "drive", column: "drive_class", param: "drive" },
  { key: "body_type", column: "body_type", param: "body_type" },
  { key: "title", column: "title_class", param: "title" },
  { key: "color", column: "color_class", param: "color" },
  { key: "transmission", column: "transmission_class", param: "transmission" },
  { key: "damage", column: "primary_damage_class", param: "damage" },
  { key: "secondary_damage", column: "secondary_damage_class", param: "secondary_damage" },
  { key: "run_cond", column: "condition_class", param: "run_cond" },
  { key: "cylinders", column: "cylinder_count", param: "cylinders" },
  { key: "vehicle_class", column: "vehicle_class", param: "vehicle_class" },
  { key: "platform", column: "platform", param: "platform" },
] as const;

/**
 * One scan, every dimension, via GROUPING SETS.
 *
 * The obvious alternative — a UNION ALL of ten GROUP BY queries — reads more
 * simply and scans the table ten times. Over 117,747 rows on a 0.25 CU compute
 * that difference is the whole cost of the feature.
 *
 * Rows whose grouped value is NULL are dropped rather than reported. That is
 * both what we want (a filter should not offer "unknown" as an option) and what
 * makes the parsing safe: within a grouping set every OTHER dimension column is
 * NULL by definition, so exactly one non-null column identifies the row.
 */
async function facetCounts(
  where: ReturnType<typeof buildWhere>,
  dimensions: ReadonlyArray<{ key: string; column: string }>
): Promise<SearchFacets> {
  const columns = sql.raw(dimensions.map((d) => `"${d.column}"`).join(", "));
  const sets = sql.raw(dimensions.map((d) => `("${d.column}")`).join(", "));

  // ⚠️ NO ODOMETER BAND SET ANY MORE. A `case` expression counting five mileage
  // bands rode along in these grouping sets for as long as the panel had fixed
  // bands to render; the bands became a slider on 2026-08-18 and the histogram
  // drawn from the counts was cut on the owner's call the day after — at which
  // point this query was computing a CASE over every matching row for a value
  // nothing read. The definitions live on in `odometerBands.ts` should a chart
  // ever return.
  const result = await auctionDb().execute(sql`
    select ${columns}, count(*)::int as n
    from auction_lots
    where ${where}
    group by grouping sets (${sets})
  `);
  const rows = (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as Array<
    Record<string, unknown>
  >;

  const out: SearchFacets = {};
  for (const d of dimensions) out[d.key] = [];
  for (const row of rows) {
    for (const d of dimensions) {
      const v = row[d.column];
      if (v === null || v === undefined) continue;
      out[d.key].push({ value: String(v), count: Number(row.n) });
      break; // exactly one dimension is non-null per row
    }
  }
  for (const d of dimensions) out[d.key].sort((a, b) => b.count - a.count);
  return out;
}

/**
 * Facet counts for the current search.
 *
 * A dimension the visitor has ALREADY filtered is recounted with its own filter
 * removed. Without that, selecting `fuel=diesel` would make the fuel facet
 * report only diesel and there would be no way to discover how many petrol cars
 * the rest of the filters allow — the multi-select would be a one-way door.
 *
 * Costs one query plus one per actively-filtered dimension. Visitors rarely set
 * more than a few, so this is typically two or three round trips rather than the
 * thirteen a naive exclude-everything implementation would need.
 */
/**
 * Turns the label a visitor picked into the raw strings it covers.
 *
 * The URL carries the readable label — `model=3+Series` — and this is where it
 * becomes `('3 SERIES','328I','330I',…)`. Needs the make: the same label means
 * different cars under different marques, and the tree is built per make.
 */
async function resolveModels(params: VehicleSearchParams): Promise<string[] | undefined> {
  if (!params.model || !params.make) return undefined;
  const tree = await getModelTree(params.make);
  const models = modelsForLabel(tree, params.model);
  return models.length > 0 ? models : undefined;
}

/**
 * One grouped scan over a RAW column — `make` or `model`.
 *
 * Separate from `facetCounts` and its GROUPING SETS because these two are the
 * only dimensions whose raw values need merging before they can be shown, and
 * the merge is different for each: makes go through `mergeMakeSpellings`, models
 * through `buildModelTree`. Folding them into that query would mean the parsing
 * loop there — which relies on "exactly one column is non-null per row" — had to
 * grow a special case for each, and the sort at the end would be wrong for both.
 */
async function rawColumnCounts(
  where: ReturnType<typeof buildWhere>,
  column: "make" | "model"
): Promise<Array<{ value: string; count: number }>> {
  const t = schema.auctionLots;
  const col = column === "make" ? t.make : t.model;
  const rows = await auctionDb()
    .select({ value: col, count: count() })
    .from(t)
    .where(and(where, isNotNull(col)))
    .groupBy(col);
  return rows
    .filter((r): r is { value: string; count: number } => r.value !== null)
    .map((r) => ({ value: r.value, count: Number(r.count) }));
}

/**
 * The make list, and — once a make is chosen — that make's models, both counted
 * under everything else the visitor has narrowed by.
 *
 * COUNTED HERE RATHER THAN READ FROM `/api/catalog`, which already serves the
 * same two lists to the search widget. The widget is a place to START a search
 * and its counts describe the whole catalogue, which is right for it. This panel
 * promises something stricter — every number beside an option is what clicking
 * it returns — and a visitor who has already ticked "front damage" is owed the
 * 300 front-damaged BMWs, not the 4,120 BMWs. Reading the catalogue route here
 * would put a number on screen that disagrees with the page it leads to, which
 * is the one thing this panel has never done.
 *
 * MAKES ARE COUNTED WITH THE MAKE **AND MODEL** FILTERS LIFTED. Left in, the
 * list holds exactly one entry — the make already chosen — and there is no way
 * to switch marque without clearing first. Models are counted with only the
 * model filter lifted, since a model list is meaningless outside its make.
 *
 * Costs one extra scan, or two once a make is picked. Run alongside the main
 * facet query rather than after it, so the wall clock is the slowest of them
 * rather than the sum.
 */
async function makeModelFacets(
  params: VehicleSearchParams,
  typeValues: string[] | undefined,
  active: Awaited<ReturnType<typeof activeSet>>,
  makes: string[] | undefined
): Promise<SearchFacets> {
  const out: SearchFacets = {};

  const makeRows = await rawColumnCounts(
    buildWhere({ ...params, make: undefined, model: undefined }, typeValues, active, false),
    "make"
  );
  out.make = mergeMakeSpellings(
    makeRows.map((r) => ({ make: r.value, count: r.count }))
  ).map((m) => ({ value: m.label, count: m.count }));

  if (!params.make) return out;

  const modelRows = await rawColumnCounts(
    buildWhere({ ...params, model: undefined }, typeValues, active, false, undefined, makes),
    "model"
  );
  out.model = flattenModelTree(
    buildModelTree(modelRows.map((r) => ({ model: r.value, count: r.count })))
  );
  return out;
}

/**
 * Sixty seconds of memory for one search's facet counts.
 *
 * ⚠️ WHY THIS IS SAFE WHERE A LONGER CACHE WOULD NOT BE. The counts are
 * promises about what clicking an option returns, and the underlying rows move
 * once a night when a sweep lands — not between two page views of the same
 * search. What actually varies second-to-second is the VISITOR's activity:
 * paging, toggling a filter off and back, pressing the back button — every one
 * of which re-ran three-to-five GROUPING SETS scans over 134k rows to
 * recompute numbers that had not changed. Sixty seconds is long enough to make
 * that whole loop free and short enough that even a mid-day partial ingest is
 * only ever a minute stale.
 *
 * The key deliberately drops `cursor`, `per_page` and `sort`: facets describe
 * the filtered SET, and none of those change what is in it — without this,
 * every page of the same search would be its own cache miss, which is the
 * commonest case the cache exists for.
 */
const FACET_TTL_MS = 60_000;
const FACET_CACHE_MAX = 200;
const facetCache = new Map<string, { value: SearchFacets; at: number }>();

function facetCacheKey(params: VehicleSearchParams, typeValues?: string[]): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured away on purpose
  const { cursor: _c, per_page: _p, sort: _s, ...rest } = params;
  // Sorted keys so `{make,fuel}` and `{fuel,make}` are one entry.
  const entries = Object.entries(rest)
    .filter(([, v]) => v !== undefined && v !== "")
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify([entries, typeValues ?? null]);
}

async function getFacets(
  params: VehicleSearchParams,
  typeValues?: string[]
): Promise<SearchFacets> {
  const key = facetCacheKey(params, typeValues);
  const hit = facetCache.get(key);
  if (hit && Date.now() - hit.at < FACET_TTL_MS) return hit.value;

  const active = await activeSet();
  const [models, makes] = await Promise.all([resolveModels(params), resolveMakes(params.make)]);
  const [facets, makeModel] = await Promise.all([
    facetCounts(buildWhere(params, typeValues, active, false, models, makes), FACET_DIMENSIONS),
    makeModelFacets(params, typeValues, active, makes),
  ]);
  Object.assign(facets, makeModel);

  const filtered = FACET_DIMENSIONS.filter(
    (d) => params[d.param] !== undefined && params[d.param] !== ""
  );
  await Promise.all(
    filtered.map(async (d) => {
      const without: VehicleSearchParams = { ...params, [d.param]: undefined };
      const recounted = await facetCounts(
        buildWhere(without, typeValues, active, false, models, makes),
        [d]
      );
      facets[d.key] = recounted[d.key];
    })
  );

  // A bound, not an LRU: 200 distinct searches a minute is already far beyond
  // this site's traffic, and evicting the oldest insertion is one line where a
  // recency list is a data structure. Map iteration order is insertion order.
  if (facetCache.size >= FACET_CACHE_MAX) {
    const oldest = facetCache.keys().next().value;
    if (oldest !== undefined) facetCache.delete(oldest);
  }
  facetCache.set(key, { value: facets, at: Date.now() });

  return facets;
}

/**
 * One query, not a fan-out.
 *
 * Apibara accepts a single `type` per request, so a category browse there costs
 * one upstream call per type and measured 12–28 seconds of server time. Here the
 * same question is an `IN`, and pagination survives — the fan-out had to return
 * null cursors because there was no coherent cursor across merged streams.
 */
async function searchVehiclesAcrossTypes(
  params: VehicleSearchParams,
  typeValues: string[]
): Promise<VehicleSearchResponse> {
  return runSearch(params, typeValues);
}

async function runSearch(
  params: VehicleSearchParams,
  typeValues?: string[]
): Promise<VehicleSearchResponse> {
  const t = schema.auctionLots;
  const perPage = Math.min(Math.max(params.per_page ?? DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
  const offset = decodeCursor(params.cursor);
  // Resolved once per search and reused by both the page query and the count, so
  // the two can never disagree about what "active" means.
  const active = await activeSet();
  const [modelValues, makeValues] = await Promise.all([
    resolveModels(params),
    resolveMakes(params.make),
  ]);

  /**
   * The page, read as three segments in order, each of them index-ordered:
   *
   *   1. biddable — selling far enough ahead that a client can still instruct
   *                 us to bid. Soonest first.
   *   2. imminent — a genuine live auction, but already inside the bid cutoff.
   *   3. relisted — stored sale date has passed; the vendor re-runs these.
   *
   * ── WHY THE FIRST SEGMENT EXISTS — measured 2026-08-14 ──────────────────
   * US auctions run in daily blocks, so at any moment thousands of lots share
   * a single sale instant: 7,691 lots were selling within four hours and every
   * one of them at exactly 16:30Z. Ordered by deadline alone they filled the
   * first 153 pages, and `bidWindow` refuses all of them — so "Bid for me" was
   * unreachable by browsing, on the default search and on `make=BMW` and
   * `make=TOYOTA` alike (0 of 50 eligible on page one of each).
   *
   * **Splitting them out costs nothing in ordering quality**, which is the
   * point: a sort by deadline cannot discriminate inside a block that shares
   * one deadline, so those 153 pages were already arbitrary. Segment 2 stays
   * ahead of segment 3 because an imminent lot is still a real auction a
   * visitor can act on by phone, where a relisted lot's date is merely stale.
   *
   * ⚠️ The cutoff is IMPORTED, never restated. If search used its own `4` the
   * two could be moved apart, and the page would then order lots by a rule the
   * button no longer applies — the failure that has already cost this project
   * once, with `$350` written in two unlinked places.
   *
   * WHY NOT ONE QUERY. The obvious spelling is
   * `order by (case when sale_date >= now() then 0 else 1 end), sale_date` — and
   * it costs, measured on the mirror: 10.8 ms becomes 288 ms on page one and
   * 476 ms deep, because the CASE is not something `auction_lots_sale_date_idx`
   * can be walked in. Each segment on its own IS index order, so the sort
   * disappears and the boundary arithmetic below is what pays for it: one extra
   * count per segment a page runs entirely past, and nothing otherwise.
   */
  // Minutes rather than hours so a fractional threshold survives, and written
  // raw because it is our own compile-time constant — never visitor input.
  const cutoff = sql`now() + make_interval(mins => ${sql.raw(String(Math.round(TOO_LATE_WITHIN_HOURS * 60)))})`;

  const fetchPage = async (fuzzy: boolean) => {
    const where = buildWhere(params, typeValues, active, fuzzy, modelValues, makeValues);
    const biddable = and(where, gte(t.saleDate, cutoff))!;
    const imminent = and(where, gte(t.saleDate, sql`now()`), lt(t.saleDate, cutoff))!;
    const relisted = and(where, or(lt(t.saleDate, sql`now()`), isNull(t.saleDate)))!;

    const segment = (condition: typeof biddable, limit: number, from: number) =>
      auctionDb()
        .select()
        .from(t)
        .where(condition)
        // Soonest sale first, within every segment. Even in the relisted tail
        // the stored date is the right key — relisting moves a lot by exactly
        // one week, so the order of the old dates is the order of the new ones.
        .orderBy(asc(t.saleDate), asc(t.id))
        .limit(limit)
        .offset(from);

    const sizeOf = async (condition: typeof biddable) =>
      (await auctionDb().select({ total: count() }).from(t).where(condition))[0].total;

    /**
     * The slice `[offset, offset + perPage)` of the three segments concatenated.
     *
     * A segment's size is asked for only when it cannot be deduced: a page that
     * fills inside one segment asks nothing at all, and a short-but-non-empty
     * page reveals where that segment ended for free. Only a page landing
     * wholly beyond a segment pays for a count — the deep-paging case.
     */
    const collect = async (conditions: (typeof biddable)[]) => {
      // The DB row, not the display shape: `mirrorRowToVehicleListItem` and the
      // image lookup both need `id`, which MirrorLotRow deliberately lacks.
      const rows: (typeof t.$inferSelect)[] = [];
      let consumed = 0; // combined size of the segments already walked past
      for (const condition of conditions) {
        const want = perPage - rows.length;
        if (want <= 0) break;
        const from = Math.max(0, offset + rows.length - consumed);
        const got = await segment(condition, want, from);
        rows.push(...got);
        if (got.length === want) break;
        consumed += got.length > 0 || from === 0 ? from + got.length : await sizeOf(condition);
      }
      return rows;
    };

    // An explicit sort is one ordered scan over the whole filtered set — see
    // EXPLICIT_SORTS for why it bypasses the segments on purpose.
    const explicitSort = params.sort ? EXPLICIT_SORTS[params.sort] : undefined;

    // Independent questions, so they go together rather than one after the
    // other. The count spans ALL THREE segments — it is the number the page
    // prints, and the aggregator's API structurally cannot provide it: its
    // `meta` carries no total, which is why "Search Results (256,934)" was
    // impossible before owning the rows.
    const [pageRows, [{ total: n }]] = await Promise.all([
      explicitSort
        ? auctionDb()
            .select()
            .from(t)
            .where(where)
            .orderBy(...explicitSort(t))
            .limit(perPage)
            .offset(offset)
        : collect([biddable, imminent, relisted]),
      auctionDb().select({ total: count() }).from(t).where(where),
    ]);

    return { pageRows, n };
  };

  let { pageRows: rows, n: total } = await fetchPage(false);

  // A typed make is the one thing full-text cannot rescue: it matches whole
  // lexemes, so "mercedez" is simply absent from every document however the
  // document is built. Retry with trigram similarity.
  //
  // ⚠️ THE TRIGGER WAS "EXACTLY ZERO RESULTS", AND A SINGLE ROW DEFEATED IT.
  // The auction lists lot 59193196 with make `VOLKSWAGON`, so that misspelling
  // found one car — non-empty, so the rescue never ran — and the visitor got
  // **1 car instead of 2,789** on a page that looked like it had worked. One
  // typo in the vendor's own data switched off typo rescue for a whole marque.
  // `shouldRescueMisspelling` carries the replacement rule and the measurement
  // behind its threshold; a VIN or lot number can never reach it.
  if (params.s && shouldRescueMisspelling(params.s, total)) {
    const rescued = await fetchPage(true);
    // ONLY IF IT FINDS MORE. The exact clause searches the whole `search_tsv`,
    // trim names included, while the fallback compares against `make` and
    // `model` alone — so on a word like "wolfsburg" it legitimately finds
    // fewer. Rescue may add cars; it must never take any away.
    if (rescued.n > total) ({ pageRows: rows, n: total } = rescued);
  }

  const images =
    rows.length === 0
      ? []
      : await auctionDb()
          .select({
            lotId: schema.auctionLotImages.lotId,
            sourceUrl: schema.auctionLotImages.sourceUrl,
            kind: schema.auctionLotImages.kind,
            position: schema.auctionLotImages.position,
          })
          .from(schema.auctionLotImages)
          .where(
            inArray(
              schema.auctionLotImages.lotId,
              rows.map((r) => r.id)
            )
          );

  const imagesByLot = new Map<string, MirrorImageRow[]>();
  for (const img of images) {
    const list = imagesByLot.get(img.lotId) ?? [];
    list.push({ sourceUrl: img.sourceUrl, kind: img.kind, position: img.position });
    imagesByLot.set(img.lotId, list);
  }

  return {
    ok: true,
    data: rows.map((row) => mirrorRowToVehicleListItem(row, imagesByLot.get(row.id) ?? [])),
    meta: {
      prev_cursor: offset > 0 ? encodeCursor(Math.max(0, offset - perPage)) : null,
      next_cursor: offset + rows.length < total ? encodeCursor(offset + perPage) : null,
      per_page: perPage,
      total,
    },
  };
}

/**
 * The make and model lists the search box offers — READ OFF THE CATALOGUE, not
 * typed by hand.
 *
 * The hand-typed list this replaces offered 14 BMW models where our own rows
 * hold 171, and ~60 makes against 1,316. It could also offer a model no lot
 * has, which returns an empty page and reads as a broken search.
 *
 * COUNTED THROUGH `buildWhere`, deliberately. A number beside an option is a
 * promise about what clicking it returns, so it has to be counted under exactly
 * the rules search itself applies — the two-sweep active set, the extra bar for
 * a passed sale date, and the Canadian exclusion. Counting the raw table would
 * overstate every option by whatever those rules withhold.
 *
 * Cached for an hour: the underlying numbers move once a night.
 */
const CATALOGUE_TTL_MS = 60 * 60 * 1000;
const catalogueCache = new Map<string, { value: unknown; at: number }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = catalogueCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < CATALOGUE_TTL_MS) return hit.value as T;
  const value = await load();
  catalogueCache.set(key, { value, at: now });
  return value;
}

/** Exposed so a test or the ingest tooling can force the next read to re-query. */
export function resetCatalogueCache(): void {
  catalogueCache.clear();
  // The facet counts describe the same rows, so a caller invalidating one
  // after an ingest means both.
  facetCache.clear();
}

export interface MakeCount {
  make: string;
  count: number;
}

/**
 * Every make with at least one lot a visitor could reach, ALPHABETICALLY.
 *
 * The owner's call, and the right one: a make is something you already know the
 * name of before you open the list, so the only question the order has to
 * answer is "where would I look for it". Inventory order answers a question
 * nobody asked and moves the entries around every night. The counts are still
 * returned — the widget uses them for the five-lot floor, and the list shows
 * them in brackets.
 *
 * The tail is genuine vendor debris — `8LBE`, `2005`, `17 1/2`, `ACUR` — one
 * lot each. It is returned rather than filtered because the picker, not the
 * database, is where the decision belongs: the widget shows makes from five
 * lots up and keeps a "show all" for the rest, so no car is unreachable.
 */
async function listMakes(vehicleClasses?: string[]): Promise<MakeCount[]> {
  const key = `makes:${vehicleClasses?.slice().sort().join(",") ?? "all"}`;
  return cached(key, async () => {
    const t = schema.auctionLots;
    const active = await activeSet();
    const where = and(
      buildWhere({}, undefined, active),
      isNotNull(t.make),
      vehicleClasses && vehicleClasses.length > 0
        ? inArray(t.vehicleClass, vehicleClasses)
        : undefined
    );
    const rows = await auctionDb()
      .select({ make: t.make, count: count() })
      .from(t)
      .where(where)
      .groupBy(t.make)
      .orderBy(desc(count()));
    // Merged, so "MERCEDES BENZ" and "MERCEDES-BENZ" are one row that finds
    // both — see `mergeMakeSpellings`.
    return mergeMakeSpellings(
      rows
        .filter((r): r is { make: string; count: number } => r.make !== null)
        .map((r) => ({ make: r.make, count: Number(r.count) }))
    ).map((m) => ({ make: m.label, count: m.count }));
  });
}

/**
 * The raw spellings behind a picked make label.
 *
 * Resolved against the WHOLE catalogue rather than the category the visitor was
 * browsing: a shared link carries the make and nothing about which tab produced
 * it, and a make means the same thing under any of them.
 */
async function resolveMakes(make: string | undefined): Promise<string[] | undefined> {
  if (!make) return undefined;
  const wanted = canonicalKey(make);
  if (wanted.length === 0) return undefined;
  const spellings = await cached("makeSpellings", async () => {
    const t = schema.auctionLots;
    const active = await activeSet();
    const rows = await auctionDb()
      .select({ make: t.make, count: count() })
      .from(t)
      .where(and(buildWhere({}, undefined, active), isNotNull(t.make)))
      .groupBy(t.make);
    return mergeMakeSpellings(
      rows
        .filter((r): r is { make: string; count: number } => r.make !== null)
        .map((r) => ({ make: r.make, count: Number(r.count) }))
    );
  });
  const hit = spellings.find((s) => canonicalKey(s.label) === wanted);
  return hit ? hit.makes : undefined;
}

/**
 * One make's models, grouped into families by `modelTree`.
 *
 * Matched case-insensitively because Copart shouts and IAAI does not, and the
 * make arrives from a URL a person may have typed.
 */
async function getModelTree(make: string, vehicleClasses?: string[]): Promise<ModelGroup[]> {
  const trimmed = make.trim();
  if (trimmed.length === 0) return [];
  const scope = vehicleClasses?.slice().sort().join(",") ?? "all";
  return cached(`models:${canonicalKey(trimmed)}:${scope}`, async () => {
    const t = schema.auctionLots;
    const active = await activeSet();
    // Every spelling of the marque, so a Mercedes tree is not missing the 43
    // lots filed under "MERCEDES BENZ". Falls back to a case-insensitive match
    // on what was asked for when the label is not one we know.
    const spellings = await resolveMakes(trimmed);
    const rows = await auctionDb()
      .select({ model: t.model, count: count() })
      .from(t)
      .where(
        and(
          buildWhere({}, undefined, active),
          spellings ? inArray(t.make, spellings) : ilike(t.make, trimmed),
          isNotNull(t.model),
          // SCOPED TO THE TAB THE VISITOR IS ON. Several marques build more
          // than one kind of vehicle, and BMW is the worst of them: without
          // this, choosing BMW under "Automobile" offered C650, F 900, G310 and
          // S 1000 — scooters and motorcycles — in among the 3 Series.
          vehicleClasses && vehicleClasses.length > 0
            ? inArray(t.vehicleClass, vehicleClasses)
            : undefined
        )
      )
      .groupBy(t.model);
    return buildModelTree(
      rows
        .filter((r): r is { model: string; count: number } => r.model !== null)
        .map((r) => ({ model: r.model, count: Number(r.count) }))
    );
  });
}

/** What the vehicle page shows under "similar lots in upcoming auctions". */
const RELATED_UPCOMING_LIMIT = 6;

/**
 * Similar lots that are genuinely still going to auction, from our own rows.
 *
 * WHY THIS EXISTS RATHER THAN A FILTER. The aggregator's `related.upcoming` is
 * not a slightly dirty list — measured 2026-08-12 across three seed lots, **36
 * of 36** entries were finished and sold, dated February and March. Filtering it
 * is still done (see `isStillUpcoming`, and it stays as the backstop), but on
 * that evidence filtering alone deletes the section rather than fixing it.
 *
 * We can answer the question properly because we own the rows: 7 upcoming
 * 2018 Audi A3s, 18 Q7s, 2 e-trons at the time of writing, and the ladder below
 * fills the rest of the row from the same marque.
 *
 * `sale_date > now()` decides membership here, which is deliberately STRICTER
 * than search. Search had to stop using that test — it hid 41,546 relisted lots
 * whose stored date had passed. But a relisted lot's date is stale by
 * definition, and a block headed "upcoming auctions" cannot show a car whose
 * only known sale time is in the past. Search says "this lot exists"; this block
 * says "this lot sells on a date I can print".
 *
 * ⚠️ THE RELEVANCE LADDER IS THREE QUERIES, AND WRITING IT AS ONE COSTS 1.3
 * SECONDS. The obvious spelling —
 * `order by (model = seed) desc, abs(year - seed), sale_date` — cannot be walked
 * in any index, so Postgres reads every upcoming lot of that marque and sorts
 * them to take six. EXPLAIN ANALYZE, measured on the live mirror:
 *
 * | seed | one query | as tiers |
 * |---|---|---|
 * | 2018 Toyota Camry | **1,335 ms** (10,045 rows sorted) | **1.2 ms** |
 * | 2018 Audi A3 | 101 ms | 2.6 ms |
 * | 2020 BMW 330i | 28 ms | 4.4 ms |
 *
 * Each tier orders by `sale_date` alone, which `auction_lots_sale_date_idx`
 * walks, stopping after six rows instead of scanning the marque. This runs on
 * EVERY vehicle page view against a 0.25 CU compute that the nightly sweep
 * saturates for hours, so the difference is not academic. The first tier filled
 * all six on every seed tested; the rest are there for a rare model.
 *
 * Tiers, in order, all within the same marque: the same model · the same
 * `vehicle_class` within three model years · the same class at any age. Scoped
 * to `vehicle_class` for the reason the model tree is — without it a BMW car
 * page offers scooters.
 */
async function similarUpcomingFromMirror(
  seed: typeof schema.auctionLots.$inferSelect
): Promise<VehicleListItem[]> {
  const t = schema.auctionLots;
  if (!seed.make) return [];

  const sameClass = seed.vehicleClass ? eq(t.vehicleClass, seed.vehicleClass) : undefined;
  const base = and(
    eq(t.make, seed.make),
    sql`${t.saleDate} > now()`,
    ne(t.id, seed.id),
    // Not just a different row — a different CAR. The same vehicle relisted
    // under a second lot number is not a "similar lot", it is this one.
    seed.vin ? or(isNull(t.vin), ne(t.vin, seed.vin)) : undefined
  );

  const tiers = [
    seed.model ? eq(t.model, seed.model) : undefined,
    seed.year ? and(sameClass, between(t.year, seed.year - 3, seed.year + 3)) : undefined,
    sameClass,
  ];

  // Keyed by id so a lot matched by two tiers is shown once. Insertion order is
  // the ladder, which is what makes the first cards the most relevant ones.
  const picked = new Map<string, typeof seed>();
  for (const tier of tiers) {
    if (picked.size >= RELATED_UPCOMING_LIMIT) break;
    if (!tier) continue;
    const found = await auctionDb()
      .select()
      .from(t)
      .where(and(base, tier))
      .orderBy(asc(t.saleDate))
      .limit(RELATED_UPCOMING_LIMIT);
    for (const row of found) if (!picked.has(row.id)) picked.set(row.id, row);
  }

  const rows = [...picked.values()].slice(0, RELATED_UPCOMING_LIMIT);
  if (rows.length === 0) return [];

  const images = await auctionDb()
    .select({
      lotId: schema.auctionLotImages.lotId,
      sourceUrl: schema.auctionLotImages.sourceUrl,
      kind: schema.auctionLotImages.kind,
      position: schema.auctionLotImages.position,
    })
    .from(schema.auctionLotImages)
    .where(
      inArray(
        schema.auctionLotImages.lotId,
        rows.map((r) => r.id)
      )
    );

  const imagesByLot = new Map<string, MirrorImageRow[]>();
  for (const img of images) {
    const list = imagesByLot.get(img.lotId) ?? [];
    list.push({ sourceUrl: img.sourceUrl, kind: img.kind, position: img.position });
    imagesByLot.set(img.lotId, list);
  }

  return rows.map((row) => mirrorRowToVehicleListItem(row, imagesByLot.get(row.id) ?? []));
}

/**
 * Comparable sales from upstream; similar upcoming lots from us.
 *
 * The split is not tidiness, it is what each side can actually answer. Sold
 * comparables have to stay upstream because our own sale history is
 * overwhelmingly failed bids — 2,423 of 2,440 rows read "Not sold" — so a price
 * band computed from it would be confident and wrong. Upcoming lots have to come
 * from us because upstream's list of them contains no upcoming lots.
 *
 * Both are asked at once, and each covers for the other: if upstream is down the
 * block still shows real upcoming cars, and if the seed lot is not in our mirror
 * the aggregator's list is used with the finished lots filtered out.
 */
async function getRelatedVehicles(vinOrLot: string): Promise<RelatedVehiclesResponse> {
  const t = schema.auctionLots;
  const term = vinOrLot.trim();

  const [upstream, seed] = await Promise.all([
    apibaraSource.getRelatedVehicles(term).catch(() => null),
    auctionDb()
      .select()
      .from(t)
      .where(or(eq(t.vin, term.toUpperCase()), eq(t.lotNumber, term)))
      .limit(1)
      .then((rows) => rows[0] ?? null)
      .catch(() => null),
  ]);

  const mine = seed ? await similarUpcomingFromMirror(seed).catch(() => []) : [];

  if (!upstream) {
    // Nothing from either side is not an empty answer, it is a failure — and
    // the page draws the distinction: it catches this and renders no block at
    // all, rather than a heading over nothing.
    if (mine.length === 0) throw new Error(`No related lots for ${term}`);
    return {
      ok: true,
      data: {
        source: mirrorRowToVehicleListItem(seed!, []),
        past: [],
        upcoming: mine,
      },
    };
  }

  return {
    ok: true,
    data: {
      ...upstream.data,
      upcoming: mine.length > 0 ? mine : upstream.data.upcoming.filter((v) => isStillUpcoming(v)),
    },
  };
}

/**
 * Detail from upstream, falling back to the mirror only when upstream fails.
 *
 * Upstream is tried FIRST and always: it holds the live bid and the export /
 * re-registration flags, and apicars.auction supplies neither — verified against
 * their OpenAPI spec and a full payload dump. Measured further: those flags are
 * NOT derivable from the document string we do hold, because one document type
 * yields different flags on different lots.
 *
 * The fallback exists because of what started this project. On 2026-08-06 the
 * aggregator returned HTTP 500 for over 75 minutes; search now survives that, and
 * without this a lot page still would not. Serving a mirrored row keeps the page
 * useful — make, model, damage, photos, paperwork wording — and stamps
 * `mirror_as_of` so the page states its age rather than passing a stale bid off as
 * current. A wrong bid is worse than an admitted gap.
 *
 * Note what the fallback CANNOT restore: export/registration, odometer brand,
 * country of origin, the IAAI deep specs and valuation. Those rows simply do not
 * render. That is the honest degradation, not a silent substitution.
 */
async function getVehicleDetailWithFallback(vinOrLot: string): Promise<VehicleDetailResponse> {
  try {
    return await apibaraSource.getVehicleDetail(vinOrLot);
  } catch (upstreamError) {
    const t = schema.auctionLots;
    const term = vinOrLot.trim();
    const [row] = await auctionDb()
      .select()
      .from(t)
      // Resolves either identifier, matching upstream's behaviour: salvage rows
      // sometimes arrive with no VIN, so the lot number has to work too.
      .where(or(eq(t.vin, term.toUpperCase()), eq(t.lotNumber, term)))
      .limit(1);

    if (!row) throw upstreamError;

    const images = await auctionDb()
      .select({
        sourceUrl: schema.auctionLotImages.sourceUrl,
        kind: schema.auctionLotImages.kind,
        position: schema.auctionLotImages.position,
      })
      .from(schema.auctionLotImages)
      .where(eq(schema.auctionLotImages.lotId, row.id));

    console.warn(
      `[inventory] serving ${term} from the mirror; upstream failed: ` +
        (upstreamError instanceof Error ? upstreamError.message : String(upstreamError))
    );

    return {
      ok: true,
      data: {
        ...mirrorRowToVehicleListItem(row, images),
        mirror_as_of: row.lastSeenAt.toISOString(),
      },
    };
  }
}

export const postgresSource: AuctionSource = {
  name: "postgres",
  searchVehicles,
  searchVehiclesAcrossTypes,
  getVehicleDetail: getVehicleDetailWithFallback,
  // Comparable SALES stay upstream — our own history is 2,423 "Not sold" out of
  // 2,440, so a price band from it would be confident and wrong. Upcoming lots
  // are ours, because upstream's were 36 of 36 already sold.
  getRelatedVehicles,
  // The one capability Apibara structurally cannot offer: its `filters` field is
  // an echo of the request and its `meta` has no total, so "Salvage (43,636)"
  // only became possible by owning the rows.
  getFacets,
};

/**
 * The catalogue vocabulary, for the search box.
 *
 * Exported directly rather than through `AuctionSource`: Apibara has no
 * equivalent — `/vehicles/filters` came back empty for BMW and JEEP — so
 * putting it on the interface would be describing a capability one source
 * cannot have. The route that serves these degrades to the hand-written list
 * when the tables are empty, which is what keeps the Apibara-only build
 * shippable.
 */
export { listMakes, getModelTree };
