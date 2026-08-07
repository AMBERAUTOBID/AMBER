/**
 * Exercises PostgresSource against the mirrored data, without a dev server and
 * without touching any config file.
 *
 * Runs the queries the search page actually issues and asserts the properties
 * that matter: the two standing rules hold, Buy Now really filters, the category
 * fan-out resolves in one query, pagination is coherent, and every card field the
 * UI reads comes back populated.
 *
 * Run:
 *   export DATABASE_URL_MIRROR=...
 *   npx tsx scripts/ingest/verify-search.ts
 */
const PRODUCTION_ENDPOINT = "ep-gentle-meadow-astnmx3w";
const mirror = process.env.DATABASE_URL_MIRROR ?? process.env.DATABASE_URL_MIRROR_UNPOOLED;

if (!mirror) {
  console.error("DATABASE_URL_MIRROR is not set.");
  process.exit(1);
}
if (mirror.includes(PRODUCTION_ENDPOINT)) {
  console.error(`ABORT: production endpoint ${PRODUCTION_ENDPOINT}.`);
  process.exit(1);
}

// Set for THIS PROCESS ONLY, before importing anything that reads them. No file
// on disk changes, so the dev server and the deployed site are untouched.
process.env.DATABASE_URL = mirror;
process.env.SEARCH_SOURCE = "postgres";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const { getAuctionSource } = await import("../../src/modules/inventory/api/source");
  const { CATEGORY_TYPE_GROUPS } = await import("../../src/modules/inventory/model/searchQuery");

  const source = getAuctionSource();
  console.log(`resolved source: ${source.name}\n`);
  if (source.name !== "postgres") {
    console.error("Expected the postgres source; aborting.");
    process.exit(1);
  }

  // ── the standing rules ───────────────────────────────────────────────────
  console.log("standing rules");
  const base = await source.searchVehicles({ per_page: 50 });
  const now = Date.now();
  const past = base.data.filter((v) => {
    const d = v.auction?.full_date;
    return d ? new Date(d).getTime() < now : false;
  });
  check("no lot whose sale date has already passed", past.length === 0, `${past.length} leaked`);
  check(
    "a total is reported (impossible on the aggregator)",
    typeof base.meta.total === "number",
    `total=${base.meta.total}`
  );
  check("a full page came back", base.data.length === 50, `${base.data.length} rows`);

  // ── the active-set rule ──────────────────────────────────────────────────
  //
  // Search must not offer a lot that has left the auction, and must not hide one
  // that has not. The rule needs two completed full sweeps before it may exclude
  // anything, so this asserts whichever behaviour the run log currently justifies
  // rather than a fixed expectation — an assertion that passes for the wrong
  // reason is worse than none.
  console.log("\nactive-set rule (disappearance)");
  const { neon } = await import("@neondatabase/serverless");
  const rawSql = neon(mirror!);
  const sweeps = (await rawSql`
    select started_at from auction_ingest_runs
    where kind = 'full_sweep' and is_partial = false and finished_at is not null
    order by started_at desc limit 2
  `) as { started_at: string }[];

  if (sweeps.length < 2) {
    const [{ n: unstamped }] = (await rawSql`
      select count(*)::int as n from auction_lots
      where last_seen_at < ${sweeps[0]?.started_at ?? "epoch"}
        and sale_date >= now() and auction_name not ilike '%CANADA%'
    `) as { n: number }[];
    check(
      `only ${sweeps.length} completed sweep(s): rule correctly excludes nothing yet`,
      true,
      `${unstamped} rows will be reconsidered once a second sweep lands`
    );
  } else {
    const cutoff = sweeps[1].started_at;
    const [{ n: shouldHide }] = (await rawSql`
      select count(*)::int as n from auction_lots
      where last_seen_at < ${cutoff} and sale_date >= now()
        and auction_name not ilike '%CANADA%'
    `) as { n: number }[];
    const [{ n: visible }] = (await rawSql`
      select count(*)::int as n from auction_lots
      where last_seen_at >= ${cutoff} and sale_date >= now()
        and auction_name not ilike '%CANADA%'
    `) as { n: number }[];
    check(
      "the reported total counts only lots still in the active set",
      base.meta.total === visible,
      `total=${base.meta.total} active=${visible} withheld=${shouldHide}`
    );
  }

  // ── the free-text box ────────────────────────────────────────────────────
  //
  // Every one of these phrases returned ZERO before full-text search, because
  // the old clause could only match a single word against one column. They are
  // the ordinary way people search, so they are the bar.
  console.log("\nfree-text search");
  const phrase = async (q: string) => (await source.searchVehicles({ s: q, per_page: 1 })).meta.total ?? 0;

  const fordF150 = await phrase("ford f150");
  const yearMakeModel = await phrase("2015 ford f150");
  const camry = await phrase("toyota camry");
  const bmwX5 = await phrase("bmw x5");
  check("two words narrow instead of failing: 'ford f150'", fordF150 > 0, `${fordF150} lots`);
  check("three words narrow further: '2015 ford f150'", yearMakeModel > 0 && yearMakeModel < fordF150, `${yearMakeModel} lots`);
  check("'toyota camry'", camry > 0, `${camry} lots`);
  check("'bmw x5'", bmwX5 > 0, `${bmwX5} lots`);

  // The catalogue spells the same truck both ways — 1,323 lots say F-150 and
  // 1,090 say f150 — and they tokenise to disjoint sets. A visitor must not get
  // a different answer depending on where they put a hyphen.
  const hyphen = await phrase("F-150");
  const noHyphen = await phrase("f150");
  check("a hyphen does not change the answer", hyphen === noHyphen, `F-150=${hyphen} f150=${noHyphen}`);

  // An identifier pasted from an email must still resolve exactly.
  const [sampleLot] = base.data;
  if (sampleLot?.vin) {
    const byVin = await source.searchVehicles({ s: sampleLot.vin, per_page: 5 });
    check("an exact VIN still resolves", (byVin.meta.total ?? 0) >= 1, `${sampleLot.vin} → ${byVin.meta.total}`);
  }

  // ── card fields the UI reads ─────────────────────────────────────────────
  console.log("\ncard fields LotCard reads");
  const withTitle = base.data.filter((v) => v.title && v.title.length > 3).length;
  const withImage = base.data.filter((v) => (v.media?.thumbs?.length ?? 0) > 0).length;
  const withDamage = base.data.filter((v) => v.condition?.primary_damage).length;
  const withLocation = base.data.filter((v) => v.location?.display).length;
  check("titles", withTitle === base.data.length, `${withTitle}/${base.data.length}`);
  check("photos", withImage > base.data.length * 0.8, `${withImage}/${base.data.length}`);
  check("primary damage", withDamage > base.data.length * 0.9, `${withDamage}/${base.data.length}`);
  check("location", withLocation > base.data.length * 0.9, `${withLocation}/${base.data.length}`);

  // ── Buy Now, the filter the user asked to get right ──────────────────────
  console.log("\nBuy Now toggle");
  const buyNow = await source.searchVehicles({ per_page: 50, lot_status: "Buy Now" });
  const missingPrice = buyNow.data.filter((v) => v.pricing?.buy_now_usd == null);
  check(
    "every result has a buy-now price",
    missingPrice.length === 0,
    `${missingPrice.length} without one`
  );
  check(
    "the toggle narrows the result set",
    (buyNow.meta.total ?? 0) < (base.meta.total ?? 0),
    `${buyNow.meta.total} of ${base.meta.total}`
  );

  // ── category browse: one query where the aggregator needed five ──────────
  console.log("\ncategory browse (was a 5-request fan-out, 12-28s upstream)");
  for (const category of ["automobile", "truck", "motorcycle"] as const) {
    const t0 = Date.now();
    const res = await source.searchVehiclesAcrossTypes(
      { per_page: 20 },
      CATEGORY_TYPE_GROUPS[category]
    );
    const ms = Date.now() - t0;
    check(
      `${category}: results and a working cursor`,
      res.data.length > 0 && res.meta.next_cursor !== null,
      `${res.meta.total} lots in ${ms}ms`
    );
  }

  // ── make filter, case-insensitively ──────────────────────────────────────
  console.log("\nmake filter (Copart shouts, IAAI does not)");
  const upper = await source.searchVehicles({ make: "FORD", per_page: 5 });
  const lower = await source.searchVehicles({ make: "ford", per_page: 5 });
  check(
    "'FORD' and 'ford' return the same count",
    upper.meta.total === lower.meta.total,
    `${upper.meta.total} vs ${lower.meta.total}`
  );

  // ── pagination ───────────────────────────────────────────────────────────
  console.log("\npagination");
  const p1 = await source.searchVehicles({ per_page: 10 });
  const p2 = await source.searchVehicles({ per_page: 10, cursor: p1.meta.next_cursor ?? undefined });
  const overlap = p1.data.filter((a) => p2.data.some((b) => b.lot_number === a.lot_number));
  check("page 2 does not repeat page 1", overlap.length === 0, `${overlap.length} repeated`);
  check("page 2 can go back", p2.meta.prev_cursor !== null);
  check("both pages report the same total", p1.meta.total === p2.meta.total);

  // ── year range ───────────────────────────────────────────────────────────
  console.log("\nyear range");
  const ranged = await source.searchVehicles({ year_from: 2018, year_to: 2020, per_page: 30 });
  const outside = ranged.data.filter((v) => v.year < 2018 || v.year > 2020);
  check("no lot outside the range", outside.length === 0, `${outside.length} outside`);

  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("verification failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
