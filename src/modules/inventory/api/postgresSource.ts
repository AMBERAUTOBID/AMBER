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
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { auctionDb, schema } from "@/shared/db/client";
import { apibaraSource } from "./apibaraSource";
import type { AuctionSource, SearchFacets } from "./source";
import type { VehicleDetailResponse, VehicleSearchParams, VehicleSearchResponse } from "./types";
import { mirrorRowToVehicleListItem, type MirrorImageRow } from "../model/mirrorLot";
import { ODOMETER_BAND_SQL, ODOMETER_BAND_ORDER } from "../model/odometerBands";

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

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

/** The cutoff changes only when a sweep finishes, i.e. at most daily, so a short
 * cache turns a per-search round trip into roughly nothing. */
const CUTOFF_TTL_MS = 60_000;
let cutoffCache: { value: Date | null; at: number } | null = null;

/**
 * The instant a lot must have been seen at or after to still count as active.
 *
 * DERIVED FROM THE RUN LOG RATHER THAN MATERIALISED INTO A `gone` COLUMN, on
 * purpose. A marking job is a second thing that can fail silently — and a
 * silently failed sweep already "looks like a healthy site with stale data".
 * Reading the run log at query time means search can never disagree with the
 * sweep history: no job to run, no drift, nothing to repair after an outage.
 *
 * Returns null — meaning "exclude nothing" — until enough completed sweeps
 * exist to justify a conclusion. Only a run with `isPartial = false` AND a
 * `finishedAt` may be used: a run that hit its page cap or died saw a slice of
 * the catalogue, and treating its blind spot as absence would empty the search.
 */
async function activeSetCutoff(): Promise<Date | null> {
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
  const value = runs.length >= SWEEPS_BEFORE_GONE ? runs[SWEEPS_BEFORE_GONE - 1].startedAt : null;
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
  activeSince?: Date | null,
  fuzzy = false
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
  if (activeSince) conditions.push(gte(t.lastSeenAt, activeSince));
  //
  // Only lots that can still be bid on. ~11% of what the vendor calls "active"
  // has a sale date already in the past — the same stale-lot artifact visible on
  // both competitors' sites. We hold a real sale instant, so we can simply not
  // show them. Reachable later through the Archived view.
  conditions.push(gte(t.saleDate, sql`now()`));
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
  if (params.make) conditions.push(ilike(t.make, params.make));
  if (params.model) conditions.push(ilike(t.model, `%${params.model}%`));

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

  // Buy Now means "has a buy-now price", which is what the competitor's toggle
  // does and what a visitor expects. Backed by a partial index on exactly these
  // rows, so it narrows ~150k to ~49k without a full scan.
  if (params.lot_status === "Buy Now") conditions.push(isNotNull(t.buyNowCents));

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
  const bandExpr = sql.raw(ODOMETER_BAND_SQL);

  const result = await auctionDb().execute(sql`
    select ${columns}, ${bandExpr} as odometer_band, count(*)::int as n
    from auction_lots
    where ${where}
    group by grouping sets (${sets}, (${bandExpr}))
  `);
  const rows = (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as Array<
    Record<string, unknown>
  >;

  const out: SearchFacets = {};
  for (const d of dimensions) out[d.key] = [];
  out.odometer = [];
  for (const row of rows) {
    // The odometer band is checked first and separately: it is an expression,
    // not one of the `dimensions` columns, so the loop below would never see it.
    const band = row.odometer_band;
    if (band !== null && band !== undefined) {
      out.odometer.push({ value: String(band), count: Number(row.n) });
      continue;
    }
    for (const d of dimensions) {
      const v = row[d.column];
      if (v === null || v === undefined) continue;
      out[d.key].push({ value: String(v), count: Number(row.n) });
      break; // exactly one dimension is non-null per row
    }
  }
  for (const d of dimensions) out[d.key].sort((a, b) => b.count - a.count);
  out.odometer.sort(
    (a, b) => (ODOMETER_BAND_ORDER.get(a.value) ?? 0) - (ODOMETER_BAND_ORDER.get(b.value) ?? 0)
  );
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
async function getFacets(
  params: VehicleSearchParams,
  typeValues?: string[]
): Promise<SearchFacets> {
  const activeSince = await activeSetCutoff();
  const facets = await facetCounts(buildWhere(params, typeValues, activeSince), FACET_DIMENSIONS);

  const filtered = FACET_DIMENSIONS.filter(
    (d) => params[d.param] !== undefined && params[d.param] !== ""
  );
  await Promise.all(
    filtered.map(async (d) => {
      const without: VehicleSearchParams = { ...params, [d.param]: undefined };
      const recounted = await facetCounts(buildWhere(without, typeValues, activeSince), [d]);
      facets[d.key] = recounted[d.key];
    })
  );

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
  const activeSince = await activeSetCutoff();

  const fetchPage = async (fuzzy: boolean) => {
    const where = buildWhere(params, typeValues, activeSince, fuzzy);
    const pageRows = await auctionDb()
      .select()
      .from(t)
      .where(where)
      // Soonest sale first: the lots a client can still act on, in the order the
      // deadline arrives.
      .orderBy(asc(t.saleDate), asc(t.id))
      .limit(perPage)
      .offset(offset);
    // The result counter the aggregator's API structurally cannot provide — its
    // `meta` carries no total at all, which is why "Search Results (256,934)" was
    // impossible before owning the rows.
    const [{ total: n }] = await auctionDb().select({ total: count() }).from(t).where(where);
    return { pageRows, n };
  };

  let { pageRows: rows, n: total } = await fetchPage(false);

  // A typed make is the one thing full-text cannot rescue: it matches whole
  // lexemes, so "mercedez" is simply absent from every document however the
  // document is built. Retry with trigram similarity — but ONLY on a genuinely
  // empty result, so the ordinary path stays one round trip and precise queries
  // are never quietly widened into something the visitor did not ask for.
  if (total === 0 && params.s && params.s.trim().length > 0) {
    ({ pageRows: rows, n: total } = await fetchPage(true));
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
  // No mirrored equivalent worth substituting: comparable sales in our own table
  // are overwhelmingly failed bids (2,423 of 2,440 read "Not sold"), so a
  // fallback here would compute a price band from almost nothing. Better to show
  // no comparables than a confident wrong range.
  getRelatedVehicles: apibaraSource.getRelatedVehicles,
  // The one capability Apibara structurally cannot offer: its `filters` field is
  // an echo of the request and its `meta` has no total, so "Salvage (43,636)"
  // only became possible by owning the rows.
  getFacets,
};
