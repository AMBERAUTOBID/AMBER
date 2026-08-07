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
import { db, schema } from "@/shared/db/client";
import { apibaraSource } from "./apibaraSource";
import type { AuctionSource } from "./source";
import type { VehicleDetailResponse, VehicleSearchParams, VehicleSearchResponse } from "./types";
import { mirrorRowToVehicleListItem, type MirrorImageRow } from "../model/mirrorLot";

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

  const runs = await db()
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
    else if (t === "PICKUP") bodies.add("pickup");
    else if (t === "SEDAN") bodies.add("sedan");
    else if (t === "COUPE") bodies.add("coupe");
    else if (t === "SUV") bodies.add("suv");
    else if (t === "VAN") bodies.add("van");
  }

  const parts = [];
  if (classes.size > 0) parts.push(inArray(schema.auctionLots.vehicleClass, [...classes]));
  if (bodies.size > 0) parts.push(inArray(schema.auctionLots.bodyType, [...bodies]));
  return parts.length > 0 ? or(...parts) : undefined;
}

function buildWhere(
  params: VehicleSearchParams,
  typeValues?: string[],
  activeSince?: Date | null
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

  if (params.platform) conditions.push(eq(t.platform, params.platform));

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
        or(
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
  const where = buildWhere(params, typeValues, activeSince);

  const rows = await db()
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
  const [{ total }] = await db().select({ total: count() }).from(t).where(where);

  const images =
    rows.length === 0
      ? []
      : await db()
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
    const [row] = await db()
      .select()
      .from(t)
      // Resolves either identifier, matching upstream's behaviour: salvage rows
      // sometimes arrive with no VIN, so the lot number has to work too.
      .where(or(eq(t.vin, term.toUpperCase()), eq(t.lotNumber, term)))
      .limit(1);

    if (!row) throw upstreamError;

    const images = await db()
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
};
