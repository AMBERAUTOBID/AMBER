/**
 * Refuse-to-run guard, executed before any migration touches a database.
 *
 * A forgotten env override would silently target production, so this does not
 * rely on remembering: it asserts the endpoint is NOT main's, then reports what
 * is actually there.
 *
 * Also verifies the prediction that decided the branch type — "Branch data and
 * schema" should have carried Drizzle's applied-migration rows, so 0007/0008
 * apply cleanly on top. If that table is empty, `drizzle-kit migrate` would try
 * to re-run 0000 and fail on an existing `users` table.
 */
import { neon } from "@neondatabase/serverless";
import { auctionDbUrl, AUCTION_DB_URL_MISSING } from "./auctionDbUrl";

const MAIN_ENDPOINT = "ep-gentle-meadow-astnmx3w"; // production — must never match

const url = auctionDbUrl({ unpooled: false });
if (!url) {
  console.error(AUCTION_DB_URL_MISSING);
  process.exit(1);
}

if (url.includes(MAIN_ENDPOINT)) {
  console.error(`ABORT: target contains the production endpoint ${MAIN_ENDPOINT}.`);
  process.exit(1);
}

const host = /@([^/]+)/.exec(url)?.[1] ?? "unknown";
console.log(`target host : ${host}`);
console.log(`production  : ${MAIN_ENDPOINT} (not matched — safe)\n`);

const sql = neon(url);

async function main() {
  const who = await sql`select current_database() as db, current_user as usr`;
  console.log(`database    : ${who[0].db} as ${who[0].usr}\n`);

  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `;
  console.log(`public tables (${tables.length}):`);
  for (const t of tables) console.log(`  ${t.table_name}`);

  // The prediction under test.
  try {
    const applied = await sql`
      select count(*)::int as n, max(created_at) as latest
      from drizzle.__drizzle_migrations
    `;
    console.log(
      `\ndrizzle migration history: ${applied[0].n} rows applied` +
        (applied[0].n > 0 ? " — 0007/0008 will apply on top, as predicted" : " — EMPTY, would re-run 0000 and fail")
    );
  } catch (e) {
    console.log(`\ncould not read drizzle.__drizzle_migrations: ${e instanceof Error ? e.message : e}`);
  }

  const mirrorTables = tables.map((t) => t.table_name).filter((n) => String(n).startsWith("auction_"));
  console.log(
    mirrorTables.length === 0
      ? "\nauction_* tables: none yet (expected before migrating)"
      : `\nauction_* tables already present: ${mirrorTables.join(", ")}`
  );
}

main().catch((e) => {
  console.error("preflight failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
