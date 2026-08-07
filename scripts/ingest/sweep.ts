/**
 * Sweeps apicars.auction's active lots into our own `auction_lots` mirror.
 *
 * Run:
 *   export APICARS_API_TOKEN=... DATABASE_URL_MIRROR_UNPOOLED=...
 *   npx tsx scripts/ingest/sweep.ts            # capped partial sweep
 *   INGEST_MAX_PAGES=2839 npx tsx scripts/ingest/sweep.ts   # full catalogue
 *
 * DELIBERATELY READS `DATABASE_URL_MIRROR_UNPOOLED`, NOT `DATABASE_URL`. The app
 * client resolves DATABASE_URL, which points at production; this worker cannot
 * reach it even if the variable is present, and it aborts outright on the
 * production endpoint. Writing 141k rows into the live database by way of a
 * forgotten env override is the exact accident worth engineering against.
 *
 * Why a full sweep rather than a delta: the vendor's `updated_at_from` is
 * silently ignored (measured — it returns 200 and changes nothing), so a full
 * pass is the only way to observe price and status changes. `created_at_from`
 * does work and is the basis of the separate, cheap incremental for new arrivals.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, getTableColumns, inArray, sql } from "drizzle-orm";
import * as schema from "../../src/shared/db/schema";
import {
  mapApicarsLot,
  type AuctionLotImageRow,
  type AuctionSalesHistoryRow,
} from "../../src/modules/inventory/model/apicarsLot";

/** One mapped lot with everything derived from it, as buffered before a write. */
type Pending = {
  lot: Record<string, unknown>;
  images: AuctionLotImageRow[];
  salesHistory: AuctionSalesHistoryRow[];
};

const PRODUCTION_ENDPOINT = "ep-gentle-meadow-astnmx3w";

/** Measured hard ceiling — asking for more returns 422 "must not be greater
 * than 50". Never raise this hoping for a bigger page. */
const PER_PAGE = 50;

/** Default cap keeps a development run cheap and bounded: 300 pages ≈ 15,000
 * lots ≈ $3 at $0.01/request. A full catalogue is ~2,942 pages. */
const MAX_PAGES = Number(process.env.INGEST_MAX_PAGES ?? 300);

/**
 * Spread a capped run across the whole catalogue instead of taking the first N
 * pages consecutively.
 *
 * MEASURED, AND IT MATTERS: the first two pages returned 100 lots that were
 * ALL "IAAI CANADA", all stamped currency BRL, all with sale dates already in
 * the past, and all with no bid or buy-now price. The endpoint returns a stable
 * order, so consecutive early pages are one homogeneous block. A 300-page
 * consecutive run would have mirrored 15,000 near-identical stale Canadian lots
 * and told us almost nothing about the catalogue — and search built against it
 * would look fine on data that represents 0.5% of reality.
 *
 * Striding costs exactly the same number of requests for a sample that spans
 * everything. Set INGEST_STRIDE=0 for a genuinely consecutive full sweep.
 */
const SPREAD = process.env.INGEST_STRIDE !== "0";

/** Rows per database round trip. The HTTP driver costs one request per
 * statement, so batching is the difference between ~150 round trips and 15,000. */
const DB_BATCH = 100;

/** PAYG allows 5 req/s; pacing at ~2.5 leaves headroom and stays polite. */
const REQUEST_SPACING_MS = 400;

const token = process.env.APICARS_API_TOKEN;
const dbUrl = process.env.DATABASE_URL_MIRROR_UNPOOLED ?? process.env.DATABASE_URL_MIRROR;

if (!token) {
  console.error("APICARS_API_TOKEN is not set.");
  process.exit(1);
}
if (!dbUrl) {
  console.error("DATABASE_URL_MIRROR_UNPOOLED is not set. Refusing to fall back to DATABASE_URL.");
  process.exit(1);
}
if (dbUrl.includes(PRODUCTION_ENDPOINT)) {
  console.error(`ABORT: target is the production endpoint ${PRODUCTION_ENDPOINT}.`);
  process.exit(1);
}

const db = drizzle(neon(dbUrl), { schema });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Page {
  status: number;
  lots: unknown[];
  totalPages: number | null;
  total: number | null;
}

async function fetchPage(page: number, attempt = 1): Promise<Page> {
  const res = await fetch("https://apicars.auction/api/v2/get-active-lots", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ per_page: PER_PAGE, page }),
  });

  // A rate limit or a blip should cost a pause, not the whole sweep.
  if ((res.status === 429 || res.status >= 500) && attempt <= 3) {
    const wait = attempt * 2000;
    console.log(`  page ${page}: ${res.status}, retrying in ${wait}ms (attempt ${attempt})`);
    await sleep(wait);
    return fetchPage(page, attempt + 1);
  }

  if (res.status !== 200) return { status: res.status, lots: [], totalPages: null, total: null };

  // Read defensively rather than asserting a shape onto untrusted JSON.
  const j = (await res.json()) as { result?: unknown; pagination?: Record<string, unknown> };
  const meta = j?.pagination ?? {};
  return {
    status: 200,
    lots: Array.isArray(j?.result) ? j.result : [],
    totalPages: typeof meta.total_pages === "number" ? meta.total_pages : null,
    total: typeof meta.total === "number" ? meta.total : null,
  };
}

/**
 * Every column is overwritten from the incoming row except the identity and
 * `firstSeenAt` — a lot we have seen before keeps the date we first saw it,
 * which is the only way to tell a genuinely new listing from a relisted one.
 */
const UPSERT_SET = (() => {
  const set: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(getTableColumns(schema.auctionLots))) {
    if (key === "id" || key === "platform" || key === "lotNumber" || key === "firstSeenAt") continue;
    set[key] = sql.raw(`excluded."${col.name}"`);
  }
  return set;
})();

/**
 * Drizzle's error message is the entire failed statement — with a 100-row batch
 * that is ~90k tokens of parameters and buries the one line that matters. The
 * actual Postgres complaint lives on `.cause`.
 */
function describeError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const cause = (e as { cause?: unknown }).cause;
  const causeMsg = cause instanceof Error ? cause.message : cause ? String(cause) : null;
  const head = e.message.length > 200 ? `${e.message.slice(0, 200)}…` : e.message;
  return causeMsg ? `${causeMsg} [while: ${head}]` : head;
}

/** Row-level failures, so one unmappable value cannot kill a 2,942-page sweep. */
const writeFailures = new Map<string, number>();

async function flushBatch(
  buffer: Pending[],
  seenAt: Date
): Promise<number> {
  if (buffer.length === 0) return 0;

  const written = await db
    .insert(schema.auctionLots)
    .values(buffer.map((b) => ({ ...b.lot, lastSeenAt: seenAt, updatedAt: seenAt })) as never)
    .onConflictDoUpdate({
      target: [schema.auctionLots.platform, schema.auctionLots.lotNumber],
      set: UPSERT_SET as never,
    })
    .returning({
      id: schema.auctionLots.id,
      platform: schema.auctionLots.platform,
      lotNumber: schema.auctionLots.lotNumber,
    });

  // Photos are replaced wholesale rather than diffed: the vendor re-orders and
  // re-keys them, and a lot's gallery is small enough that rewriting it is
  // cheaper than working out what changed.
  const idFor = new Map(written.map((w) => [`${w.platform}:${w.lotNumber}`, w.id]));
  const imageRows = buffer.flatMap((b) => {
    const id = idFor.get(`${b.lot.platform}:${b.lot.lotNumber}`);
    return id ? b.images.map((img) => ({ ...img, lotId: id })) : [];
  });

  const ids = written.map((w) => w.id);
  if (ids.length > 0) {
    await db.delete(schema.auctionLotImages).where(inArray(schema.auctionLotImages.lotId, ids));
  }
  if (imageRows.length > 0) {
    await db.insert(schema.auctionLotImages).values(imageRows);
  }

  // Sale history is append-only and NOT foreign-keyed to the lot: a past sale
  // outlives the listing, and cascading a delisted lot's removal would destroy
  // the very record we are accumulating. Keyed on the vendor's own entry id, so
  // re-observing the same sale on tomorrow's sweep is a no-op.
  const historyRows = buffer.flatMap((b) =>
    b.salesHistory.map((h) => ({
      vendorEntryId: h.vendorEntryId,
      platform: b.lot.platform as "copart" | "iaai",
      lotNumber: b.lot.lotNumber as string,
      vin: (b.lot.vin as string | null) ?? null,
      year: (b.lot.year as number | null) ?? null,
      make: (b.lot.make as string | null) ?? null,
      model: (b.lot.model as string | null) ?? null,
      soldPriceCents: h.soldPriceCents,
      currencyCode: (b.lot.currencyCode as string | null) ?? null,
      soldAt: h.soldAt,
      saleStatus: h.saleStatus,
      raw: h.raw,
    }))
  );
  if (historyRows.length > 0) {
    await db
      .insert(schema.auctionSalesHistory)
      .values(historyRows)
      .onConflictDoNothing({ target: schema.auctionSalesHistory.vendorEntryId });
  }

  return written.length;
}

/**
 * Batch write with a row-by-row fallback.
 *
 * A nightly sweep of 2,942 pages must not die because one lot carries a value
 * Postgres rejects — an odometer that overflows int4, a retail price that
 * overflows once multiplied to cents, whatever the vendor sends next. On a batch
 * failure each row is retried alone: the good ones land, the bad one is counted
 * with its reason, and the sweep continues. That reason is the signal that the
 * vendor changed shape.
 *
 * Also de-duplicates by identity first. Postgres refuses an ON CONFLICT DO
 * UPDATE that would touch the same row twice in one statement ("cannot affect
 * row a second time"), and the catalogue churns between page requests, so the
 * same lot genuinely can appear on two pages of one run.
 */
async function flush(
  buffer: Pending[],
  seenAt: Date
): Promise<number> {
  const byIdentity = new Map<string, Pending>();
  for (const entry of buffer) {
    byIdentity.set(`${entry.lot.platform}:${entry.lot.lotNumber}`, entry);
  }
  const deduped = [...byIdentity.values()];

  try {
    return await flushBatch(deduped, seenAt);
  } catch (e) {
    console.log(`  batch of ${deduped.length} failed, retrying row by row — ${describeError(e)}`);
    let ok = 0;
    for (const row of deduped) {
      try {
        ok += await flushBatch([row], seenAt);
      } catch (rowError) {
        const reason = describeError(rowError);
        writeFailures.set(reason, (writeFailures.get(reason) ?? 0) + 1);
      }
    }
    return ok;
  }
}

async function main() {
  console.log(`target   : ${/@([^/]+)/.exec(dbUrl!)?.[1]}`);
  console.log(`page cap : ${MAX_PAGES} pages x ${PER_PAGE} = up to ${MAX_PAGES * PER_PAGE} lots`);
  console.log(`estimate : ~$${(MAX_PAGES * 0.01).toFixed(2)} at $0.01/request\n`);

  const [run] = await db
    .insert(schema.auctionIngestRuns)
    // isPartial defaults to true and is only cleared on reaching the last page —
    // a crash mid-run must leave the safe value in place, because treating an
    // incomplete sweep as authoritative would mark most live lots as gone.
    .values({ kind: "full_sweep" })
    .returning({ id: schema.auctionIngestRuns.id });

  const seenAt = new Date();
  let pagesFetched = 0;
  let lotsSeen = 0;
  let lotsWritten = 0;
  let lotsSkipped = 0;
  let withSalesHistory = 0;
  let reachedEnd = false;
  let note: string | null = null;
  let totalPages: number | null = null;
  const skipReasons = new Map<string, number>();

  let buffer: Pending[] = [];

  // Stride is learned from page 1's reported total, not assumed up front.
  let stride = 1;

  try {
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = 1 + i * stride;
      if (totalPages !== null && page > totalPages) {
        // Walking consecutively and past the last page means we saw everything;
        // walking with a stride means we deliberately saw only a sample.
        reachedEnd = stride === 1;
        break;
      }

      const res = await fetchPage(page);
      if (res.status !== 200) {
        note = `stopped at page ${page}: HTTP ${res.status}`;
        break;
      }

      pagesFetched++;
      if (totalPages === null && res.totalPages !== null) {
        totalPages = res.totalPages;
        if (SPREAD && totalPages > MAX_PAGES) {
          stride = Math.floor(totalPages / MAX_PAGES);
          console.log(
            `  catalogue is ${totalPages} pages; sampling every ${stride}th page so the\n` +
              `  ${MAX_PAGES}-page budget spans the whole catalogue instead of one block\n`
          );
        }
      }
      if (res.lots.length === 0) {
        reachedEnd = stride === 1;
        break;
      }

      for (const raw of res.lots) {
        lotsSeen++;
        // Measured as empty on every sampled lot; counted so we find out if it
        // is ever populated before writing extraction code for it.
        if (Array.isArray((raw as Record<string, unknown>)?.sales_history) &&
            ((raw as Record<string, unknown>).sales_history as unknown[]).length > 0) {
          withSalesHistory++;
        }

        const m = mapApicarsLot(raw);
        if (!m.ok) {
          lotsSkipped++;
          skipReasons.set(m.reason, (skipReasons.get(m.reason) ?? 0) + 1);
          continue;
        }
        buffer.push({
          lot: m.lot as unknown as Record<string, unknown>,
          images: m.images,
          salesHistory: m.salesHistory,
        });
      }

      if (buffer.length >= DB_BATCH) {
        lotsWritten += await flush(buffer, seenAt);
        buffer = [];
      }

      if (i % 20 === 0 || i === MAX_PAGES - 1) {
        console.log(
          `  page ${page}${totalPages ? `/${totalPages}` : ""} — seen ${lotsSeen}, written ${lotsWritten}, skipped ${lotsSkipped}`
        );
      }

      // Only a consecutive walk that reaches the final page has actually seen
      // the whole catalogue. A strided sample landing on the last page has not,
      // and must never be allowed to claim completeness — that flag is what
      // decides whether unseen lots get marked as gone.
      if (totalPages !== null && page >= totalPages && stride === 1) {
        reachedEnd = true;
        break;
      }

      await sleep(REQUEST_SPACING_MS);
    }

    lotsWritten += await flush(buffer, seenAt);
  } catch (e) {
    note = `failed: ${describeError(e)}`;
    console.error(`\n${note}`);
  }

  const complete = reachedEnd && note === null;
  if (!complete && note === null) {
    note = `page cap (${MAX_PAGES}) reached before the end of the catalogue`;
  }

  await db
    .update(schema.auctionIngestRuns)
    .set({
      finishedAt: new Date(),
      isPartial: !complete,
      pagesFetched,
      lotsSeen,
      lotsWritten,
      lotsSkipped,
      note,
    })
    .where(eq(schema.auctionIngestRuns.id, run.id));

  console.log(`\n──────── run ${run.id} ────────`);
  console.log(`pages fetched : ${pagesFetched}${totalPages ? ` of ${totalPages}` : ""}`);
  console.log(`lots seen     : ${lotsSeen}`);
  console.log(`lots written  : ${lotsWritten}`);
  console.log(`lots skipped  : ${lotsSkipped}`);
  for (const [reason, n] of [...skipReasons].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${n} x ${reason}`);
  }
  console.log(`sales_history : ${withSalesHistory} lots carried entries`);
  if (writeFailures.size > 0) {
    console.log(`row write failures:`);
    for (const [reason, n] of [...writeFailures].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${n} x ${reason}`);
    }
  }
  console.log(`isPartial     : ${!complete}${complete ? "" : "  <- cannot be used to mark lots as gone"}`);
  if (note) console.log(`note          : ${note}`);
}

main().catch((e) => {
  console.error("sweep aborted:", e instanceof Error ? e.message : e);
  process.exit(1);
});
