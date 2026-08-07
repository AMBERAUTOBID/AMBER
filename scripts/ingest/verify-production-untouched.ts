/**
 * Proves a mirror migration did not reach production.
 *
 * The entire safety story of this migration is that the mirror endpoint and the
 * production endpoint are different strings in different variables. That is a
 * claim, and one typo in a `DATABASE_URL=` override would falsify it silently —
 * `drizzle-kit migrate` reports success either way. So it gets checked after
 * every DDL rather than assumed.
 *
 * Strictly read-only: counts tables and migration rows, writes nothing.
 *
 * Run:
 *   export DATABASE_URL=$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-)
 *   npx tsx scripts/ingest/verify-production-untouched.ts
 */
import { neon } from "@neondatabase/serverless";

const PRODUCTION_ENDPOINT = "ep-gentle-meadow-astnmx3w";
/** What production is expected to hold: the application's own tables, and none
 * of the mirror's. Update deliberately when production legitimately gains one. */
const EXPECTED_TABLES = 8;
const EXPECTED_MIGRATIONS = 7;

const url = process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
// Inverted against every other script here: this is the one that MUST be aimed
// at production, because pointing it anywhere else would prove nothing.
if (!url.includes(PRODUCTION_ENDPOINT)) {
  console.error(`ABORT: DATABASE_URL is not production (${PRODUCTION_ENDPOINT}). Nothing to verify.`);
  process.exit(1);
}

const sql = neon(url);

async function main() {
  console.log(`target host : ${/@([^/]+)/.exec(url!)?.[1]}`);

  const tables = (await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `) as { table_name: string }[];

  const auction = tables.map((t) => t.table_name).filter((n) => n.startsWith("auction_"));
  const [{ n: migrations }] = (await sql`
    select count(*)::int as n from drizzle.__drizzle_migrations
  `) as { n: number }[];

  console.log(`public tables (${tables.length}): ${tables.map((t) => t.table_name).join(", ")}`);
  console.log(`drizzle migrations applied: ${migrations}`);

  const problems: string[] = [];
  if (auction.length > 0) problems.push(`auction_* tables present: ${auction.join(", ")}`);
  if (tables.length !== EXPECTED_TABLES) {
    problems.push(`expected ${EXPECTED_TABLES} tables, found ${tables.length}`);
  }
  if (migrations !== EXPECTED_MIGRATIONS) {
    problems.push(`expected ${EXPECTED_MIGRATIONS} migrations, found ${migrations}`);
  }

  if (problems.length === 0) {
    console.log(`\n✅ PRODUCTION UNTOUCHED — ${EXPECTED_TABLES} tables, ${EXPECTED_MIGRATIONS} migrations, no auction_* tables.`);
    return;
  }
  console.error(`\n❌ PRODUCTION HAS CHANGED:`);
  for (const p of problems) console.error(`   ${p}`);
  process.exit(1);
}

main().catch((e) => {
  console.error("verify failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
