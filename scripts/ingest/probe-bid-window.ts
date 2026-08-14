/**
 * Why is "Bid for me" invisible on every lot reached from /search?
 *
 * The button is hidden by `saleClosed` on the vehicle page:
 *
 *   isUpcoming  = diff_minutes !== null ? diff_minutes > 0 : state === "open"
 *   saleClosed  = auction.state === "finished" || !isUpcoming
 *
 * Both inputs come from APIBARA'S DETAIL endpoint, not from our mirror. So the
 * question is not "is our search wrong" but "do our own rows and the vendor's
 * detail record disagree about the same lot, and in which direction".
 *
 * Three candidate causes were on the table and this separates them:
 *
 *   A) the relisting change of 2026-08-12 — search deliberately admits lots
 *      whose stored sale_date has passed, because the vendor re-runs unsold
 *      lots a week later on the same record. If that is it, our rows are
 *      past-dated and Apibara's detail should say open with a NEW date.
 *   B) the wrong-lot bug — believed fixed in 45c7f00 (links carry the lot
 *      number, not the VIN). If it were still live we would ask for one lot
 *      and be handed another.
 *   C) a stale mirror — if no sweep has completed recently every row is
 *      past-dated and the whole catalogue reads as finished. That is an
 *      operations fault, not a code fault, and it looks identical from a
 *      browser.
 *
 * Phase A is free: it reads our own rows only.
 * Phase B calls Apibara and therefore SPENDS QUOTA (30,000/month), one request
 * per lot. It is off unless PROBE_APIBARA=1, and PROBE_N caps it (default 8).
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/ingest/probe-bid-window.ts
 *   PROBE_APIBARA=1 npx tsx --env-file=.env.local scripts/ingest/probe-bid-window.ts
 */
import { auctionDbUrl, AUCTION_DB_URL_MISSING } from "./auctionDbUrl";

const PRODUCTION_ENDPOINT = "ep-gentle-meadow-astnmx3w";
const mirror = auctionDbUrl({ unpooled: false });

if (!mirror) {
  console.error(AUCTION_DB_URL_MISSING);
  process.exit(1);
}
if (mirror.includes(PRODUCTION_ENDPOINT)) {
  console.error(`ABORT: production endpoint ${PRODUCTION_ENDPOINT}.`);
  process.exit(1);
}

// This process only. Nothing on disk changes, so the dev server and the
// deployed site are untouched.
process.env.DATABASE_URL_AUCTION = mirror;
process.env.DATABASE_URL = mirror;
process.env.SEARCH_SOURCE = "postgres";

const PROBE_N = Number(process.env.PROBE_N ?? 8);

function hours(ms: number): string {
  const h = ms / 3_600_000;
  return `${h >= 0 ? "+" : ""}${h.toFixed(1)}h`;
}

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const { getAuctionSource } = await import("../../src/modules/inventory/api/source");
  const sql = neon(mirror!);

  const source = getAuctionSource();
  if (source.name !== "postgres") {
    console.error(`Expected the postgres source, got ${source.name}; aborting.`);
    process.exit(1);
  }

  // ── PHASE A1 — is the mirror even fresh? (cause C) ───────────────────────
  console.log("── mirror freshness ─────────────────────────────────────────");
  const sweeps = (await sql`
    select started_at, finished_at, lots_written, is_partial
    from auction_ingest_runs
    where kind = 'full_sweep'
    order by started_at desc limit 3
  `) as { started_at: string; finished_at: string | null; lots_written: number | null; is_partial: boolean }[];
  for (const s of sweeps) {
    const age = s.finished_at ? (Date.now() - new Date(s.finished_at).getTime()) / 3_600_000 : null;
    console.log(
      `  started ${s.started_at}  finished ${s.finished_at ?? "STILL OPEN"}` +
        `  wrote ${s.lots_written ?? "?"}  partial=${s.is_partial}` +
        (age === null ? "" : `  (${age.toFixed(1)}h ago)`)
    );
  }

  const [counts] = (await sql`
    select
      count(*)                                          as total,
      count(*) filter (where sale_date >= now())        as upcoming,
      count(*) filter (where sale_date <  now())        as past,
      count(*) filter (where sale_date is null)         as undated,
      max(last_seen_at)                                 as last_seen
    from auction_lots
  `) as { total: number; upcoming: number; past: number; undated: number; last_seen: string }[];
  console.log(
    `\n  rows ${counts.total}  |  upcoming ${counts.upcoming}  |  past ${counts.past}` +
      `  |  undated ${counts.undated}\n  newest last_seen_at ${counts.last_seen}`
  );

  // ── PHASE A2 — what does page one of /search ACTUALLY hand a visitor? ────
  // The same call the search page makes, so this is what the owner clicked.
  console.log("\n── /search page 1, as the page issues it ────────────────────");
  const page = await source.searchVehicles({ per_page: 50 });
  const now = Date.now();

  const rows = page.data.slice(0, Math.max(PROBE_N, 16)).map((v) => {
    const iso = v.auction?.full_date ?? null;
    const ms = iso ? new Date(iso).getTime() : null;
    return {
      lot: v.lot_number,
      platform: v.platform,
      vin: v.vin,
      iso,
      ms,
      upcoming: ms === null ? null : ms >= now,
    };
  });

  console.log(`  total=${page.meta.total}  returned=${page.data.length}\n`);
  console.log("   #  lot        platform  our sale_date              ours says");
  for (const [i, r] of rows.entries()) {
    console.log(
      `  ${String(i + 1).padStart(2)}  ${String(r.lot).padEnd(10)} ${String(r.platform).padEnd(9)}` +
        ` ${String(r.iso ?? "—").padEnd(25)} ` +
        (r.upcoming === null ? "no date" : r.upcoming ? `UPCOMING ${hours(r.ms! - now)}` : `past ${hours(r.ms! - now)}`)
    );
  }

  const pastOnPageOne = rows.filter((r) => r.upcoming === false).length;
  console.log(
    `\n  ${pastOnPageOne} of the first ${rows.length} carry a PAST sale_date in our own rows.`
  );
  console.log(
    pastOnPageOne === 0
      ? "  → Cause C (stale mirror) is ruled out for page one: these are genuinely upcoming lots."
      : "  → Our own rows already call these past. Consistent with cause A or C."
  );

  if (process.env.PROBE_APIBARA !== "1") {
    console.log(
      "\n── phase B skipped ─────────────────────────────────────────────\n" +
        "  Set PROBE_APIBARA=1 to ask Apibara's DETAIL endpoint about the lots\n" +
        `  above. Costs ${Math.min(PROBE_N, rows.length)} requests of the 30,000/month quota.`
    );
    return;
  }

  // ── PHASE B — what does the vehicle page's own source say? (costs quota) ─
  //
  // Deliberately asked by LOT NUMBER, exactly as LotCard now links, so a
  // mismatch between the lot asked for and the lot returned would expose
  // cause B rather than hiding it.
  console.log("\n── Apibara detail, by lot number (SPENDING QUOTA) ───────────");
  const { getVehicleDetail } = await import("../../src/modules/inventory/api/client");

  const targets = rows.slice(0, PROBE_N);
  console.log(
    "  asked      got        state      diff_min   full_date                 saleClosed  vin match"
  );

  let closedCount = 0;
  let wrongLot = 0;

  for (const r of targets) {
    try {
      // `.data` — the response envelope is { ok, data }, exactly as the page
      // unwraps it at page.tsx:112. Reading the envelope itself yields undefined
      // for every field and makes a healthy lot look both closed and wrong.
      const { data: d } = await getVehicleDetail(String(r.lot));
      const diff = d.auction?.diff_minutes ?? null;
      const state = d.auction?.state ?? null;
      // EXACTLY the page's own expressions — not a paraphrase of them.
      const isUpcoming = diff !== null ? diff > 0 : state === "open";
      const saleClosed = state === "finished" || !isUpcoming;
      if (saleClosed) closedCount++;
      const sameLot = String(d.lot_number) === String(r.lot);
      const sameVin = d.vin === r.vin;
      if (!sameLot || !sameVin) wrongLot++;

      console.log(
        `  ${String(r.lot).padEnd(10)} ${String(d.lot_number).padEnd(10)}` +
          ` ${String(state ?? "—").padEnd(10)} ${String(diff ?? "—").padStart(8)}  ` +
          ` ${String(d.auction?.full_date ?? "—").padEnd(24)} ${saleClosed ? "CLOSED    " : "open      "}` +
          ` ${sameVin ? "yes" : `NO (${d.vin})`}`
      );
    } catch (e) {
      console.log(`  ${String(r.lot).padEnd(10)} ERROR: ${(e as Error).message}`);
    }
  }

  console.log(
    `\n  ${closedCount} of ${targets.length} would hide the button.` +
      `  ${wrongLot} returned a different lot or VIN than asked for.`
  );
  console.log(
    wrongLot > 0
      ? "  → Cause B is ALIVE: the vendor hands back a different record than the one asked for."
      : "  → Cause B ruled out: every request came back as the lot we asked for."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
