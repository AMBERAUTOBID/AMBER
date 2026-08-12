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
 *   npx tsx --env-file=.env.local scripts/ingest/verify-search.ts
 */
import { auctionDbUrl, AUCTION_DB_URL_MISSING } from "./auctionDbUrl";

const PRODUCTION_ENDPOINT = "ep-gentle-meadow-astnmx3w";
// Resolved through the shared helper rather than by reading one variable name:
// the app reads `DATABASE_URL_AUCTION` through `auctionDb()`, and a script that
// picked the older `DATABASE_URL_MIRROR` would verify one database while the
// source under test queried another — the checks would pass about the wrong data.
const mirror = auctionDbUrl({ unpooled: false });

if (!mirror) {
  console.error(AUCTION_DB_URL_MISSING);
  process.exit(1);
}
if (mirror.includes(PRODUCTION_ENDPOINT)) {
  console.error(`ABORT: production endpoint ${PRODUCTION_ENDPOINT}.`);
  process.exit(1);
}

// Set for THIS PROCESS ONLY, before importing anything that reads them. No file
// on disk changes, so the dev server and the deployed site are untouched.
process.env.DATABASE_URL_AUCTION = mirror;
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
  const saleTime = (v: (typeof base.data)[number]) => {
    const d = v.auction?.full_date;
    return d ? new Date(d).getTime() : null;
  };
  // A PASSED SALE DATE IS NOT A REASON TO HIDE A LOT — an unsold car is re-run a
  // week later and the vendor overwrites the date on the same record, so between
  // sweeps a live lot reads as yesterday's. What page one must guarantee is
  // ORDER: the lots a client can still act on come first, soonest deadline
  // first. This replaced "no lot whose sale date has already passed", which was
  // hiding 41,546 cars the vendor was still listing.
  const outOfOrder = base.data.filter((v, i) => {
    if (i === 0) return false;
    const prev = saleTime(base.data[i - 1]);
    const cur = saleTime(v);
    if (prev === null || cur === null) return false;
    // Upcoming before relisted; within a group, ascending.
    const rank = (ms: number) => (ms >= now ? 0 : 1);
    return rank(prev) > rank(cur) || (rank(prev) === rank(cur) && prev > cur);
  });
  check("page one is soonest-first, relisted lots last", outOfOrder.length === 0, `${outOfOrder.length} out of order`);
  check(
    "page one is all upcoming lots",
    base.data.every((v) => (saleTime(v) ?? 0) >= now),
    `${base.data.filter((v) => (saleTime(v) ?? 0) < now).length} relisted on page one`
  );
  check(
    "a total is reported (impossible on the aggregator)",
    typeof base.meta.total === "number",
    `total=${base.meta.total}`
  );
  check("a full page came back", base.data.length === 50, `${base.data.length} rows`);

  // ── the active-set rule ──────────────────────────────────────────────────
  //
  // Search must not offer a lot that has left the auction, and must not hide one
  // that has not. Two bars, because a passed sale date changes the standard of
  // evidence rather than the verdict: an upcoming lot survives being missed by
  // one sweep (that is usually pagination drift), a lot whose sale time has gone
  // by has to have been seen by the most recent completed sweep.
  //
  // The rule needs two completed full sweeps before it may exclude anything on
  // the first ground, so this asserts whichever behaviour the run log currently
  // justifies rather than a fixed expectation — an assertion that passes for the
  // wrong reason is worse than none.
  console.log("\nactive-set rule (disappearance)");
  const { neon } = await import("@neondatabase/serverless");
  const rawSql = neon(mirror!);
  const sweeps = (await rawSql`
    select started_at from auction_ingest_runs
    where kind = 'full_sweep' and is_partial = false and finished_at is not null
    order by started_at desc limit 2
  `) as { started_at: string }[];

  if (sweeps.length === 0) {
    check("no completed sweep yet: the rule correctly excludes nothing", true);
  } else {
    const latest = sweeps[0].started_at;
    // With only one completed sweep the two-sweep bar is not yet in force, and
    // the query below says so by comparing against `epoch`.
    const seenSince = sweeps[1]?.started_at ?? new Date(0).toISOString();
    const [{ n: visible }] = (await rawSql`
      select count(*)::int as n from auction_lots
      where last_seen_at >= ${seenSince}
        and (sale_date >= now() or last_seen_at >= ${latest})
        and auction_name not ilike '%CANADA%'
    `) as { n: number }[];
    const [{ n: relisted }] = (await rawSql`
      select count(*)::int as n from auction_lots
      where last_seen_at >= ${latest} and sale_date < now()
        and auction_name not ilike '%CANADA%'
    `) as { n: number }[];
    const [{ n: withheld }] = (await rawSql`
      select count(*)::int as n from auction_lots
      where sale_date < now() and last_seen_at < ${latest}
        and auction_name not ilike '%CANADA%'
    `) as { n: number }[];
    check(
      "the reported total counts every lot still in the active set",
      base.meta.total === visible,
      `total=${base.meta.total} active=${visible} (of which relisted ${relisted}) withheld=${withheld}`
    );
    check(
      "relisted lots are actually being offered",
      relisted === 0 || (base.meta.total ?? 0) > visible - relisted,
      `${relisted} lots with a passed sale date are still on the vendor's list`
    );

    // ── the segment boundary ───────────────────────────────────────────────
    //
    // The page is read as two index-ordered segments stitched together, so the
    // page that straddles the join is where a repeat or a hole would appear.
    // The cursor is an opaque base64 offset; constructing one here is reaching
    // into the source's private encoding on purpose — no other page can be
    // reached without paging thousands of times.
    if (relisted > 0) {
      const [{ n: upcoming }] = (await rawSql`
        select count(*)::int as n from auction_lots
        where last_seen_at >= ${seenSince} and sale_date >= now()
          and auction_name not ilike '%CANADA%'
      `) as { n: number }[];
      const at = (offset: number) => Buffer.from(String(offset), "utf8").toString("base64url");
      const straddle = await source.searchVehicles({ per_page: 10, cursor: at(upcoming - 5) });
      const after = await source.searchVehicles({ per_page: 10, cursor: at(upcoming + 5) });
      const ahead = straddle.data.filter((v) => (saleTime(v) ?? 0) >= now).length;
      // Roughly five and five, not exactly: ~30,000 lots cross into the past
      // every day, so the boundary can move by one or two between the count
      // above and the query below. What must hold exactly is that the page is
      // full and that the two groups do not interleave.
      check(
        "the page across the boundary is upcoming then relisted, no interleaving",
        straddle.data.length === 10 &&
          ahead >= 3 &&
          ahead <= 7 &&
          straddle.data.slice(0, ahead).every((v) => (saleTime(v) ?? 0) >= now),
        `${straddle.data.length} rows, ${ahead} upcoming`
      );
      const repeated = straddle.data.filter((a) => after.data.some((b) => b.lot_number === a.lot_number));
      check("the next page repeats none of it", repeated.length === 0, `${repeated.length} repeated`);
    }
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

  // ── the misspelling fallback ─────────────────────────────────────────────
  //
  // The audience is Lithuanian and Russian speakers typing German, Japanese and
  // American brand names, so this is not an edge case. Each typo must find the
  // same lots as the correct spelling.
  console.log("\nmisspelled makes (trigram fallback)");
  for (const [typo, correct] of [
    ["mercedez", "mercedes"],
    ["porshe", "porsche"],
    ["volkswagon", "volkswagen"],
    ["hyundae", "hyundai"],
  ] as const) {
    const t = await phrase(typo);
    const c = await phrase(correct);
    // AT LEAST what the correct spelling finds, not exactly. Trigram matching on
    // the make column also catches the auctions' own abbreviations — lot
    // 44485133 is listed as make "PORS", model "COMP", which no `porsche`
    // lexeme can reach — so the fallback legitimately returns a superset. The
    // upper bound is what keeps the similarity threshold from drifting down
    // into gibberish.
    check(
      `'${typo}' finds at least what '${correct}' finds`,
      t >= c && c > 0 && t < c * 1.2,
      `${t} vs ${c}`
    );
  }

  // The fallback must not rescue gibberish — that would advertise cars we do not
  // have. This is the check that stops the similarity threshold drifting down.
  console.log("\ngibberish must stay empty");
  for (const junk of ["zzzzqqqq", "asdfghjkl", "qwertyuiop"]) {
    const n = await phrase(junk);
    check(`'${junk}' returns nothing`, n === 0, `${n} rows`);
  }

  // ── the filter panel ─────────────────────────────────────────────────────
  //
  // Each of these reads a NORMALISED class column. Filtering on the raw values
  // would offer WHITE and White as two options over the same 30,716 cars.
  console.log("\nfilters");
  const filtered = async (p: Record<string, unknown>) =>
    (await source.searchVehicles({ per_page: 1, ...p })).meta.total ?? 0;
  const catalogue = base.meta.total ?? 0;

  for (const [label, p] of [
    ["fuel=diesel", { fuel: "diesel" }],
    ["drive=4wd", { drive: "4wd" }],
    ["body_type=suv", { body_type: "suv" }],
    ["title=clean", { title: "clean" }],
    ["color=white", { color: "white" }],
    ["transmission=manual", { transmission: "manual" }],
    ["damage=normal_wear", { damage: "normal_wear" }],
    ["run_cond=run_and_drive", { run_cond: "run_and_drive" }],
    ["cylinders=4", { cylinders: "4" }],
    ["seller=insurance", { seller: "insurance" }],
    ["keys=no", { keys: "no" }],
    ["enhanced", { enhanced: true }],
    ["engine 1500-2500cc", { engine_from: 1500, engine_to: 2500 }],
    ["buy_now under $3000", { buy_now_max: 3000 }],
  ] as Array<[string, Record<string, unknown>]>) {
    const n = await filtered(p);
    check(label, n > 0 && n < catalogue, `${n.toLocaleString()} of ${catalogue.toLocaleString()}`);
  }

  // Multi-select must widen within a dimension and narrow across dimensions.
  const diesel = await filtered({ fuel: "diesel" });
  const dieselOrPetrol = await filtered({ fuel: "gasoline,diesel" });
  check("comma-separated values widen within a dimension", dieselOrPetrol > diesel, `${dieselOrPetrol} > ${diesel}`);
  const narrowed = await filtered({ fuel: "diesel", drive: "4wd", title: "clean" });
  check("combining dimensions narrows", narrowed < diesel, `${narrowed} < ${diesel}`);

  // An unrecognised value must return nothing rather than be ignored — showing
  // petrol cars for fuel=banana would be a filter that silently does not apply.
  check("an unknown value returns nothing", (await filtered({ fuel: "banana" })) === 0);
  // A malformed date must be skipped, not throw and blank the page.
  check("a malformed date is ignored", (await filtered({ sale_date_from: "not-a-date" })) === catalogue);

  // ── facet counts ─────────────────────────────────────────────────────────
  //
  // The number beside each option, which the aggregator structurally cannot
  // provide: its `filters` response is an echo of the request.
  console.log("\nfacet counts");
  if (!source.getFacets) {
    check("source exposes getFacets", false);
  } else {
    const facets = await source.getFacets({});
    check("every dimension returns options", Object.values(facets).every((o) => o.length > 0), `${Object.keys(facets).length} dimensions`);

    // A dimension summing above the catalogue means a lot was counted twice —
    // the failure mode of misreading a GROUPING SETS result.
    const overcounted = Object.entries(facets).filter(
      ([, opts]) => opts.reduce((a, o) => a + o.count, 0) > catalogue
    );
    check("no dimension double-counts", overcounted.length === 0, overcounted.map(([d]) => d).join(", "));

    // The count beside an option must be what selecting it actually returns,
    // or the panel is lying about inventory.
    for (const dim of ["fuel", "title", "color"] as const) {
      const top = facets[dim]?.[0];
      if (!top) continue;
      const actual = await filtered({ [dim]: top.value });
      check(`${dim}=${top.value} count matches the search`, actual === top.count, `facet ${top.count} vs search ${actual}`);
    }

    // With a fuel chosen, the fuel facet must still offer the others — else the
    // multi-select is a one-way door out of which a visitor cannot click.
    const withDiesel = await source.getFacets({ fuel: "diesel" });
    check("a selected dimension still offers its alternatives", (withDiesel.fuel?.length ?? 0) > 1, `${withDiesel.fuel?.length} fuels still listed`);
    const all4wd = facets.drive?.find((o) => o.value === "4wd")?.count ?? 0;
    const diesel4wd = withDiesel.drive?.find((o) => o.value === "4wd")?.count ?? 0;
    check("unselected dimensions reflect the selection", diesel4wd < all4wd, `4wd ${all4wd} -> ${diesel4wd}`);
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
  // A price is not an open offer. The auctions withdraw Buy Now when the lot
  // reaches the block — measured: 0 of 5 lots kept it once their sale time had
  // passed, 20 of 20 kept it two hours out — so a result whose sale is imminent
  // sends the visitor to a page with no buy-now price, which is the fault this
  // check exists to catch.
  const twoHoursOut = Date.now() + 2 * 60 * 60 * 1000;
  const tooLate = buyNow.data.filter((v) => {
    const d = v.auction?.full_date;
    return d ? new Date(d).getTime() < twoHoursOut : true;
  });
  check(
    "no result whose sale starts within two hours",
    tooLate.length === 0,
    `${tooLate.length} of ${buyNow.data.length} too close to the sale`
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
