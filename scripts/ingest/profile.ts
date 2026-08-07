/**
 * Reports what the mirrored data actually looks like.
 *
 * This is the tool that replaces paying the vendor per question. Working out
 * "how well populated is body_style?" through the API cost real requests and a
 * wasted loop; over local rows it is one GROUP BY and free. Every coverage
 * question about the catalogue should be answered here from now on.
 *
 * Read-only, but still refuses the production endpoint — there is no reason to
 * point it at the live database and every reason not to make that easy.
 */
import { neon } from "@neondatabase/serverless";

const PRODUCTION_ENDPOINT = "ep-gentle-meadow-astnmx3w";
const url = process.env.DATABASE_URL_MIRROR ?? process.env.DATABASE_URL_MIRROR_UNPOOLED;

if (!url) {
  console.error("DATABASE_URL_MIRROR is not set.");
  process.exit(1);
}
if (url.includes(PRODUCTION_ENDPOINT)) {
  console.error(`ABORT: production endpoint ${PRODUCTION_ENDPOINT}.`);
  process.exit(1);
}

const sql = neon(url);

/** The driver only accepts a plain string through `sql.query`; the tagged form
 * cannot express a dynamic column list. Normalises both possible return shapes. */
async function raw<T = Record<string, unknown>>(text: string): Promise<T[]> {
  const out = (await sql.query(text)) as unknown;
  return (Array.isArray(out) ? out : ((out as { rows?: T[] }).rows ?? [])) as T[];
}

/** Percentage of rows where a column is non-null — the number that decides
 * whether a filter built on it would work or quietly hide inventory. */
async function coverage(total: number, columns: string[]) {
  const parts = columns.map((c) => `count("${c}") as "${c}"`).join(", ");
  const [row] = await raw(`select ${parts} from auction_lots`);
  const scored = columns
    .map((c) => ({ column: c, n: Number(row[c]), pct: (Number(row[c]) / total) * 100 }))
    .sort((a, b) => b.pct - a.pct);
  for (const s of scored) {
    const bar = "█".repeat(Math.round(s.pct / 5)).padEnd(20, "·");
    console.log(`  ${s.column.padEnd(24)} ${bar} ${s.pct.toFixed(1).padStart(5)}%  (${s.n})`);
  }
}

async function distribution(label: string, column: string, limit = 8) {
  const rows = await raw<{ v: string; n: number }>(
    `select coalesce("${column}", '(null)') as v, count(*)::int as n
     from auction_lots group by 1 order by n desc limit ${limit}`
  );
  console.log(`\n${label}`);
  for (const r of rows) console.log(`  ${String(r.v).padEnd(34)} ${r.n}`);
}

async function main() {
  const [{ n: total }] = (await sql`select count(*)::int as n from auction_lots`) as { n: number }[];
  const [{ n: images }] = (await sql`select count(*)::int as n from auction_lot_images`) as { n: number }[];
  console.log(`auction_lots       : ${total.toLocaleString()} rows`);
  console.log(`auction_lot_images : ${images.toLocaleString()} rows`);

  if (total === 0) {
    console.log("\nNothing ingested yet.");
    return;
  }

  // THE question that was unanswerable without local data: which classification
  // signal is actually usable for a category filter? Anything sparse here would
  // hide inventory if used as a display default.
  console.log(`\nclassification coverage (which taxonomy can drive a filter?)`);
  await coverage(total, [
    "body_style",
    "vehicle_type",
    "car_info_vehicle_type",
    "car_info_body_class",
    "make",
    "model",
  ]);

  console.log(`\nfilter-panel field coverage`);
  await coverage(total, [
    "odometer",
    "primary_damage",
    "secondary_damage",
    "doc_type",
    "color",
    "transmission",
    "drive",
    "fuel",
    "cylinders",
    "engine_type",
    "has_keys",
    "highlights",
    "seller_name",
    "is_insurance",
    "est_retail_cents",
    "current_bid_cents",
    "buy_now_cents",
    "sale_date",
    "vin",
  ]);

  await distribution("platform", "platform");
  await distribution("auction_name (regions in the catalogue)", "auction_name");
  // Anything other than USD/CAD here is a vendor data bug we must not price on.
  await distribution("currency_code (NEVER assume USD)", "currency_code");
  await distribution("odometer_unit (inferred, unverified)", "odometer_unit");
  await distribution("vehicle_type", "vehicle_type");
  await distribution("body_style", "body_style", 12);

  // The stale-active-lot problem, now measurable because saleDate is a real
  // instant rather than a status field the vendor batch-stamps.
  const [stale] = (await sql`
    select
      count(*) filter (where sale_date is null)::int as unknown_date,
      count(*) filter (where sale_date < now())::int as already_passed,
      count(*) filter (where sale_date >= now())::int as upcoming
    from auction_lots
  `) as { unknown_date: number; already_passed: number; upcoming: number }[];
  console.log(`\nsale timing among lots the vendor calls ACTIVE`);
  console.log(`  upcoming        ${stale.upcoming}`);
  console.log(`  already passed  ${stale.already_passed}  <- vendor still lists these as active`);
  console.log(`  no sale date    ${stale.unknown_date}`);

  console.log(`\nnormalised filter columns (what the panel would actually offer)`);
  await coverage(total, [
    "vehicle_class",
    "body_type",
    "fuel_class",
    "drive_class",
    "title_class",
    "condition_class",
    "engine_cc",
    "cylinder_count",
  ]);

  await distribution("vehicle_class (category tabs)", "vehicle_class");
  await distribution("body_type", "body_type", 12);
  await distribution("fuel_class", "fuel_class");
  await distribution("drive_class", "drive_class");
  await distribution("title_class", "title_class");
  await distribution("condition_class", "condition_class");

  // Buy Now was 0% until the mapper stopped reading an object as a number.
  const [bn] = (await sql`
    select count(*) filter (where buy_now_cents is not null)::int as with_price,
           min(buy_now_cents) filter (where buy_now_cents is not null)::int as lo,
           max(buy_now_cents) filter (where buy_now_cents is not null)::int as hi,
           count(*) filter (where is_enhanced)::int as enhanced
    from auction_lots
  `) as { with_price: number; lo: number; hi: number; enhanced: number }[];
  console.log(`\nBuy Now`);
  console.log(`  lots with a buy-now price  ${bn.with_price} of ${total} (${((bn.with_price / total) * 100).toFixed(1)}%)`);
  if (bn.with_price > 0) {
    console.log(`  price range                $${(bn.lo / 100).toLocaleString()} – $${(bn.hi / 100).toLocaleString()}`);
  }
  console.log(`  cosmetically "enhanced"    ${bn.enhanced} (run condition unknown, not a guarantee)`);

  // Sale history: the asset that cannot be backfilled later.
  const [sh] = (await sql`
    select count(*)::int as rows,
           count(distinct (platform, lot_number))::int as lots,
           count(*) filter (where sold_price_cents is not null)::int as real_sales,
           count(*) filter (where sold_price_cents is null)::int as no_sale
    from auction_sales_history
  `) as { rows: number; lots: number; real_sales: number; no_sale: number }[];
  console.log(`\nauction_sales_history`);
  console.log(`  entries                    ${sh.rows} across ${sh.lots} lots`);
  console.log(`  actual sales (price kept)  ${sh.real_sales}`);
  console.log(`  did not sell (price NULL)  ${sh.no_sale}  <- a bid that missed reserve, never averaged in`);
  const statuses = (await sql`
    select coalesce(sale_status, '(null)') as v, count(*)::int as n
    from auction_sales_history group by 1 order by n desc limit 6
  `) as { v: string; n: number }[];
  for (const s of statuses) console.log(`    ${String(s.v).padEnd(24)} ${s.n}`);

  // IDENTITY INTEGRITY. auction_lots is keyed on (platform, lot_number), but
  // platform is DERIVED from auction_name — so "IAAI" and "IAAI CANADA" both
  // collapse to `iaai`. If a US and a Canadian lot ever share a lot number they
  // are two different vehicles competing for one row, and the upsert would
  // silently overwrite one with the other. Checked here because silent
  // corruption is worse than a failed insert.
  const collisions = (await sql`
    select platform, lot_number, count(distinct auction_name)::int as auctions,
           string_agg(distinct auction_name, ' + ') as names
    from auction_lots
    group by platform, lot_number
    having count(distinct auction_name) > 1
    limit 10
  `) as Record<string, unknown>[];
  const [{ n: distinctByPlatform }] = (await sql`
    select count(*)::int as n from (select distinct platform, lot_number from auction_lots) x
  `) as { n: number }[];
  const [{ n: distinctByAuction }] = (await sql`
    select count(*)::int as n from (select distinct auction_name, lot_number from auction_lots) x
  `) as { n: number }[];
  console.log(`\nidentity integrity`);
  console.log(`  distinct (platform, lot_number)     ${distinctByPlatform}`);
  console.log(`  distinct (auction_name, lot_number) ${distinctByAuction}`);
  console.log(
    collisions.length === 0
      ? `  no lot number shared across regions of one platform — current key holds`
      : `  ⚠️ ${collisions.length}+ lot numbers shared across regions — KEY IS UNSAFE`
  );
  for (const c of collisions) console.log(`    ${c.platform} ${c.lot_number}: ${c.names}`);

  const runs = (await sql`
    select kind, started_at, finished_at, is_partial, pages_fetched, lots_seen, lots_written, lots_skipped, note
    from auction_ingest_runs order by started_at desc limit 5
  `) as Record<string, unknown>[];
  console.log(`\nrecent ingest runs`);
  for (const r of runs) {
    console.log(
      // Truncated deliberately: a failed-query note can hold an entire 100-row
      // INSERT and its parameters, which made this report 74KB of noise.
      `  ${r.kind} partial=${r.is_partial} pages=${r.pages_fetched} seen=${r.lots_seen} ` +
        `written=${r.lots_written} skipped=${r.lots_skipped}` +
        (r.note ? ` — ${String(r.note).slice(0, 160)}${String(r.note).length > 160 ? "…" : ""}` : "")
    );
  }
}

main().catch((e) => {
  console.error("profile failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
