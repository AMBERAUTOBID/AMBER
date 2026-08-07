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
import { and, asc, count, eq, gte, ilike, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
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

function buildWhere(params: VehicleSearchParams, typeValues?: string[]) {
  const t = schema.auctionLots;
  const conditions = [];

  // ── the two standing rules, decided with the user ────────────────────────
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

  // `s` is the free-text box. Identifiers resolve exactly; anything else falls
  // back to make/model matching. Real full-text (tsvector + pg_trgm, so "2015
  // f150 xlt" and a misspelled "mercedez" both work) is the next step and is the
  // reason the raw columns exist to index.
  if (params.s) {
    const term = params.s.trim();
    if (term.length > 0) {
      conditions.push(
        or(
          eq(t.vin, term.toUpperCase()),
          eq(t.lotNumber, term),
          ilike(t.make, `%${term}%`),
          ilike(t.model, `%${term}%`)
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
  const where = buildWhere(params, typeValues);

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
