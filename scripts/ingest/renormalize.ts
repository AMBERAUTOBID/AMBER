/**
 * Recomputes the normalised filter columns from raw values already in the
 * database. Makes NO vendor API calls.
 *
 * THIS IS WHY THE RAW COLUMNS EXIST. Every classification the filter panel uses
 * is derived, and derived values get corrected — a title keyword we mapped
 * wrongly, a drivetrain spelling we had not seen, a body style the auctions
 * introduce next month. Without this, each correction would mean another
 * ~2,950-request sweep and hours of waiting; with it, a fix is a few minutes over
 * rows we already own.
 *
 * It also repairs the ordinary case of columns added after rows were ingested:
 * 4,634 rows predated migration 0009 and had raw values with no classification.
 *
 * The TypeScript normalisers are the single source of truth. The temptation is to
 * express this as one clever UPDATE with SQL CASE expressions, which would be
 * faster and would immediately become a second implementation drifting away from
 * the tested one.
 *
 * Run:
 *   export DATABASE_URL_MIRROR_UNPOOLED=...
 *   npx tsx scripts/ingest/renormalize.ts          # only rows missing a class
 *   RENORMALIZE_ALL=1 npx tsx scripts/ingest/renormalize.ts   # every row
 *
 * NOTE the default scope tests `vehicle_class`, `body_type` and `title_class`
 * only. A newly ADDED classification — the damage columns in 0011, for instance —
 * leaves those three populated, so the default run skips exactly the rows that
 * need it. **After adding a column, run with RENORMALIZE_ALL=1.**
 */
import { neon } from "@neondatabase/serverless";
import {
  isEnhanced,
  normalizeBodyType,
  normalizeCondition,
  normalizeCylinders,
  normalizeDamage,
  normalizeDrive,
  normalizeFuel,
  normalizeTitle,
  normalizeVehicleClass,
  parseEngineCc,
} from "../../src/modules/inventory/model/lotNormalize";

const PRODUCTION_ENDPOINT = "ep-gentle-meadow-astnmx3w";
const url = process.env.DATABASE_URL_MIRROR_UNPOOLED ?? process.env.DATABASE_URL_MIRROR;
const ALL = process.env.RENORMALIZE_ALL === "1";
const BATCH = 200;

if (!url) {
  console.error("DATABASE_URL_MIRROR_UNPOOLED is not set. Refusing to fall back to DATABASE_URL.");
  process.exit(1);
}
if (url.includes(PRODUCTION_ENDPOINT)) {
  console.error(`ABORT: production endpoint ${PRODUCTION_ENDPOINT}.`);
  process.exit(1);
}

const sql = neon(url);

async function raw<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const out = (await sql.query(text, params)) as unknown;
  return (Array.isArray(out) ? out : ((out as { rows?: T[] }).rows ?? [])) as T[];
}

interface SourceRow {
  id: string;
  vehicle_type: string | null;
  body_style: string | null;
  fuel: string | null;
  drive: string | null;
  doc_type: string | null;
  highlights: string | null;
  engine_type: string | null;
  cylinders: string | null;
  primary_damage: string | null;
  secondary_damage: string | null;
}

async function main() {
  console.log(`target : ${/@([^/]+)/.exec(url!)?.[1]}`);
  console.log(`scope  : ${ALL ? "every row" : "rows with no classification yet"}\n`);

  const scope = ALL ? "" : "where vehicle_class is null and body_type is null and title_class is null";
  const [{ n: pending }] = await raw<{ n: number }>(
    `select count(*)::int as n from auction_lots ${scope}`
  );
  console.log(`${pending.toLocaleString()} rows to process\n`);
  if (pending === 0) return;

  let processed = 0;
  let lastId = "00000000-0000-0000-0000-000000000000";

  // Keyset pagination on id rather than OFFSET: the UPDATE changes the very
  // columns `scope` filters on, so an offset walk would skip rows as the result
  // set shrinks underneath it.
  for (;;) {
    const rows = await raw<SourceRow>(
      `select id, vehicle_type, body_style, fuel, drive, doc_type, highlights, engine_type, cylinders,
              primary_damage, secondary_damage
       from auction_lots
       where id > $1 ${ALL ? "" : "and vehicle_class is null and body_type is null and title_class is null"}
       order by id
       limit ${BATCH}`,
      [lastId]
    );
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1].id;

    // One statement per batch. Postgres needs the VALUES columns typed, hence
    // the explicit casts in the SET clause.
    const params: unknown[] = [];
    const tuples = rows.map((r) => {
      const base = params.length;
      params.push(
        r.id,
        normalizeVehicleClass(r.vehicle_type),
        normalizeBodyType(r.body_style),
        normalizeFuel(r.fuel),
        normalizeDrive(r.drive),
        normalizeTitle(r.doc_type),
        normalizeCondition(r.highlights),
        isEnhanced(r.highlights),
        parseEngineCc(r.engine_type),
        normalizeCylinders(r.cylinders),
        normalizeDamage(r.primary_damage),
        normalizeDamage(r.secondary_damage)
      );
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12})`;
    });

    await raw(
      `update auction_lots as t set
         vehicle_class          = v.vehicle_class::text,
         body_type              = v.body_type::text,
         fuel_class             = v.fuel_class::text,
         drive_class            = v.drive_class::text,
         title_class            = v.title_class::text,
         condition_class        = v.condition_class::text,
         is_enhanced            = v.is_enhanced::boolean,
         engine_cc              = v.engine_cc::integer,
         cylinder_count         = v.cylinder_count::integer,
         primary_damage_class   = v.primary_damage_class::text,
         secondary_damage_class = v.secondary_damage_class::text,
         updated_at             = now()
       from (values ${tuples.join(",")}) as v(
         id, vehicle_class, body_type, fuel_class, drive_class,
         title_class, condition_class, is_enhanced, engine_cc, cylinder_count,
         primary_damage_class, secondary_damage_class
       )
       where t.id = v.id::uuid`,
      params
    );

    processed += rows.length;
    if (processed % (BATCH * 5) === 0 || rows.length < BATCH) {
      console.log(`  ${processed.toLocaleString()} / ${pending.toLocaleString()}`);
    }
  }

  console.log(`\ndone: ${processed.toLocaleString()} rows reclassified`);
  const [after] = await raw<Record<string, number>>(
    `select
       count(*) filter (where vehicle_class is not null)::int as vehicle_class,
       count(*) filter (where title_class is not null)::int as title_class,
       count(*) filter (where engine_cc is not null)::int as engine_cc,
       count(*) filter (where primary_damage_class is not null)::int as primary_damage_class,
       count(*)::int as total
     from auction_lots`
  );
  console.log(
    `coverage now: vehicle_class ${((after.vehicle_class / after.total) * 100).toFixed(1)}%, ` +
      `title_class ${((after.title_class / after.total) * 100).toFixed(1)}%, ` +
      `engine_cc ${((after.engine_cc / after.total) * 100).toFixed(1)}%, ` +
      `primary_damage_class ${((after.primary_damage_class / after.total) * 100).toFixed(1)}%`
  );
}

main().catch((e) => {
  console.error("renormalize failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
