/**
 * Dumps the distinct values of a mirrored column, with counts.
 *
 * This is how a filter's options get decided. Building a dropdown from assumed
 * values is how you ship an option that returns zero results — and we already
 * know this vendor sends `"TRUCK "` with a trailing space, `AUTOMOBILE` from
 * Copart but `Automobile` from IAAI, and four different spellings of "SUV".
 * Every filter vocabulary should be read off real rows here first.
 *
 * Usage:
 *   npx tsx scripts/ingest/values.ts engine_type
 *   npx tsx scripts/ingest/values.ts doc_type 40
 */
import { neon } from "@neondatabase/serverless";

const PRODUCTION_ENDPOINT = "ep-gentle-meadow-astnmx3w";
const url = process.env.DATABASE_URL_MIRROR ?? process.env.DATABASE_URL_MIRROR_UNPOOLED;

const column = process.argv[2];
const limit = Number(process.argv[3] ?? 30);

if (!url) {
  console.error("DATABASE_URL_MIRROR is not set.");
  process.exit(1);
}
if (url.includes(PRODUCTION_ENDPOINT)) {
  console.error(`ABORT: production endpoint ${PRODUCTION_ENDPOINT}.`);
  process.exit(1);
}
// Interpolated into SQL, so constrain it to an identifier shape rather than
// trusting argv.
if (!column || !/^[a-z_][a-z0-9_]*$/.test(column)) {
  console.error("Pass a snake_case column name, e.g. engine_type");
  process.exit(1);
}

const sql = neon(url);

async function raw<T = Record<string, unknown>>(text: string): Promise<T[]> {
  const out = (await sql.query(text)) as unknown;
  return (Array.isArray(out) ? out : ((out as { rows?: T[] }).rows ?? [])) as T[];
}

async function main() {
  const rows = await raw<{ v: string | null; n: number; platforms: string }>(
    `select "${column}"::text as v, count(*)::int as n,
            string_agg(distinct platform, '/' order by platform) as platforms
     from auction_lots
     group by 1
     order by n desc
     limit ${limit}`
  );
  const [{ n: total }] = await raw<{ n: number }>(`select count(*)::int as n from auction_lots`);
  const [{ n: distinct }] = await raw<{ n: number }>(
    `select count(distinct "${column}")::int as n from auction_lots`
  );

  console.log(`${column}: ${distinct} distinct values across ${total} lots\n`);
  for (const r of rows) {
    const label = r.v === null ? "(null)" : JSON.stringify(r.v);
    console.log(
      `  ${String(r.n).padStart(6)}  ${String(r.platforms).padEnd(12)} ${label}`
    );
  }
  if (distinct > limit) console.log(`\n  … ${distinct - limit} more (raise the limit argument)`);
}

main().catch((e) => {
  console.error("failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
